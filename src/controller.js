import { defaultState, validateSettings, validateVehicle, applyOutcome, safeOutcome, resultFingerprint } from './domain.js';
import { localDateKey } from './scheduler.js';
import { diagnostic, ERROR_MESSAGES } from './errors.js';

const identity = v => `${v.type}:${v.plate}`;

/** Service-worker-owned state. All durable claims are serialized before network activity. */
export function createController({ store, source, notifier = async () => {}, clock = Date.now, idFactory = () => crypto.randomUUID(), version = 'unknown' }) {
  let state;
  let initialization;
  let mutations = Promise.resolve();
  let generation = 0;
  const flights = new Map();
  const copy = value => structuredClone(value);

  async function initialize() {
    if (!initialization) initialization = (async () => {
      const loaded = await store.read();
      if (loaded) validateStoredState(loaded);
      const base = loaded ?? defaultState();
      const now = clock();
      const budgets = { ...(base.budgets ?? {}) };
      let errors = (base.errors ?? []).map(error => diagnostic(error, version));
      const vehicles = base.vehicles.map(vehicle => {
        const key = identity(vehicle);
        if (!budgets[key] && vehicle.lastAttemptAt != null) {
          budgets[key] = { day: localDateKey(vehicle.lastAttemptAt), count: 1, lastAttemptAt: vehicle.lastAttemptAt, successDay: vehicle.lastSuccessAt != null ? localDateKey(vehicle.lastSuccessAt) : null };
        }
        if (vehicle.status !== 'checking') return vehicle;
        const error = diagnostic({ code: 'INTERRUPTED', step: 'recovery', at: now, durationMs: now - (vehicle.lastAttemptAt ?? now) }, version);
        errors = [...errors, error].slice(-20);
        return { ...vehicle, status: 'error', message: ERROR_MESSAGES.INTERRUPTED, lastError: error };
      });
      state = { ...defaultState(), vehicles, settings: validateSettings(base.settings), budgets, errors, notificationError: base.notificationError ?? null };
      await store.write(state);
      return copy(state);
    })();
    await initialization;
    return copy(state);
  }

  async function transaction(update) {
    await initialize();
    const work = mutations.then(async () => {
      const next = update(state);
      await store.write(next);
      state = next;
      return copy(state);
    });
    mutations = work.catch(() => {});
    return work;
  }
  async function getState() { await initialize(); await mutations; return copy(state); }

  async function saveVehicle(input) {
    return transaction(current => {
      if (input?.id && !current.vehicles.some(v => v.id === input.id)) throw new Error('Không tìm thấy phương tiện.');
      const valid = validateVehicle(input, current.vehicles);
      const old = current.vehicles.find(v => v.id === valid.id);
      const same = old && identity(old) === identity(valid);
      const vehicle = { ...(same ? old : { id: old?.id ?? idFactory(), status: 'never', lastAttemptAt: null, lastSuccessAt: null, lastResult: null, history: [] }), ...valid };
      return { ...current, vehicles: old ? current.vehicles.map(v => v.id === old.id ? vehicle : v) : [...current.vehicles, vehicle] };
    });
  }
  async function deleteVehicle(id) {
    return transaction(current => {
      if (!current.vehicles.some(v => v.id === id)) throw new Error('Không tìm thấy phương tiện.');
      return { ...current, vehicles: current.vehicles.filter(v => v.id !== id) };
    });
  }
  async function saveSettings(input) {
    const settings = validateSettings(input);
    return transaction(current => ({ ...current, settings }));
  }
  async function notify(notice) {
    try {
      await notifier(notice);
      await transaction(current => ({ ...current, notificationError: null }));
    } catch {
      await transaction(current => ({ ...current, notificationError: 'Không gửi được thông báo. Kiểm tra quyền thông báo trong Chrome và hệ điều hành.' }));
    }
  }

  async function checkVehicle(id, automatic) {
    let before;
    let start;
    let key;
    const token = generation;
    await transaction(current => {
      const v = current.vehicles.find(vehicle => vehicle.id === id);
      if (!v) return current;
      start = clock();
      key = identity(v);
      const day = localDateKey(start);
      const previous = current.budgets[key];
      const budget = previous?.day === day ? previous : { day, count: 0, successDay: previous?.successDay ?? null };
      const succeededToday = v.lastSuccessAt != null && localDateKey(v.lastSuccessAt) === day;
      if (automatic && (current.settings.paused || budget.count > 0 || budget.successDay === day || succeededToday)) return current;
      before = copy(v);
      return { ...current, budgets: { ...current.budgets, [key]: { ...budget, count: budget.count + 1, lastAttemptAt: start } }, vehicles: current.vehicles.map(vehicle => vehicle.id === id ? { ...vehicle, status: 'checking', lastAttemptAt: start, limitMessage: null } : vehicle) };
    });
    if (!before) return;
    let raw;
    try { raw = await source.lookup(copy(before)); }
    catch { raw = { kind: 'error', error: { code: 'NETWORK' } }; }
    let outcome = safeOutcome(raw);
    const now = clock();
    if (outcome.kind !== 'success') {
      const error = diagnostic({ ...outcome.error, at: now, durationMs: now - start }, version);
      outcome = { kind: 'error', message: ERROR_MESSAGES[error.code], error };
    }
    let result;
    await transaction(current => {
      if (generation !== token) return current;
      const budget = current.budgets[key];
      const budgets = outcome.kind === 'success' ? { ...current.budgets, [key]: { ...budget, successDay: localDateKey(now) } } : current.budgets;
      const errors = outcome.kind === 'error' ? [...current.errors, outcome.error].slice(-20) : current.errors;
      return { ...current, budgets, errors, vehicles: current.vehicles.map(v => {
        if (v.id !== id || identity(v) !== key || v.lastAttemptAt !== start) return v;
        result = applyOutcome(v, outcome, now);
        return { ...result, lastError: outcome.kind === 'error' ? outcome.error : null };
      }) };
    });
    if (!result) return;
    const settings = (await getState()).settings;
    const changed = outcome.kind === 'success' && (outcome.records.length > 0 || before.lastResult) && resultFingerprint(before.lastResult?.records ?? []) !== resultFingerprint(outcome.records);
    if (changed && settings.notifyChanges) await notify({ kind: 'change', id, title: 'Có cập nhật kết quả tra cứu', message: `${result.plate}: ${outcome.records.length} hồ sơ. Dữ liệu tham khảo VNeTraffic.org; đối chiếu trang chính thức.` });
  }

  async function checkNow(id, { automatic = false } = {}) {
    const snapshot = await getState();
    if (id && !snapshot.vehicles.some(v => v.id === id)) throw new Error('Không tìm thấy phương tiện.');
    // Start all claims immediately, rather than leaving later vehicles unclaimed behind a slow request.
    await Promise.all(snapshot.vehicles.filter(v => !id || v.id === id).map(vehicle => {
      const key = identity(vehicle);
      if (!flights.has(key)) {
        const promise = checkVehicle(vehicle.id, automatic).finally(() => {
          if (flights.get(key) === promise) flights.delete(key);
        });
        flights.set(key, promise);
      }
      return flights.get(key);
    }));
    return getState();
  }
  const ensureDaily = () => checkNow(undefined, { automatic: true });
  async function exportData() {
    try { return await getState(); }
    catch { return copy(await store.read()); }
  }
  async function clearData() {
    const work = mutations.then(async () => {
      generation++;
      const reset = { ...defaultState(), settings: { ...defaultState().settings, paused: true } };
      await store.write(reset);
      state = reset;
      initialization = Promise.resolve(copy(reset));
      return copy(reset);
    });
    mutations = work.catch(() => {});
    return work;
  }
  return { initialize, getState, saveVehicle, deleteVehicle, saveSettings, checkNow, ensureDaily, clearData, exportData };
}

function validateStoredState(loaded) {
  const failure = () => { throw new Error('Dữ liệu cục bộ không hợp lệ. Hãy xuất bản sao trước khi đặt lại.'); };
  if (![1, 2].includes(loaded.schemaVersion) || !Array.isArray(loaded.vehicles)) failure();
  try {
    validateSettings(loaded.settings);
    if (loaded.schemaVersion === 2) {
      if (!loaded.budgets || typeof loaded.budgets !== 'object' || Array.isArray(loaded.budgets) || !Array.isArray(loaded.errors) || loaded.errors.length > 20) failure();
      for (const budget of Object.values(loaded.budgets)) {
        if (!budget || !/^\d{4}-\d{2}-\d{2}$/.test(budget.day) || !Number.isInteger(budget.count) || budget.count < 0) failure();
      }
    }
    const ids = new Set();
    for (const vehicle of loaded.vehicles) {
      if (!vehicle || typeof vehicle.id !== 'string' || !vehicle.id || ids.has(vehicle.id) || !Array.isArray(vehicle.history) || vehicle.history.length > 200) failure();
      ids.add(vehicle.id);
      validateVehicle(vehicle, loaded.vehicles);
      if (!['never', 'checking', 'clear', 'violations', 'auth_required', 'unavailable', 'error'].includes(vehicle.status)) failure();
      if (vehicle.lastResult != null && safeOutcome({ kind: 'success', records: vehicle.lastResult.records }).kind !== 'success') failure();
      for (const key of ['lastAttemptAt', 'lastSuccessAt']) if (vehicle[key] != null && !Number.isFinite(vehicle[key])) failure();
      if (vehicle.history.some(entry => !entry || typeof entry !== 'object' || !Number.isFinite(entry.at) || typeof entry.status !== 'string')) failure();
    }
  } catch { failure(); }
}
