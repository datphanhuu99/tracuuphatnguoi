import { diagnostic, ERROR_MESSAGES } from './errors.js';
export const VEHICLE_TYPES = Object.freeze({ car: 'Ô tô', motorcycle: 'Xe máy', electric: 'Xe đạp điện' });
export const HISTORY_LIMIT = 200;

/** Normalize a Vietnamese plate without accepting arbitrary scripts or symbols. */
export function normalizePlate(input) {
  if (typeof input !== 'string' || /[^a-zA-Z0-9\s.-]/.test(input)) throw new Error('Biển số chứa ký tự không hợp lệ.');
  const plate = input.toUpperCase().replace(/[\s.-]/g, '');
  if (!/^\d{2}[A-Z]{1,2}\d{4,6}$/.test(plate)) throw new Error('Nhập biển số hợp lệ, ví dụ 30A-123.45 hoặc 59-X1 123.45.');
  return plate;
}

/** @param {object} input @param {object[]} vehicles */
export function validateVehicle(input, vehicles) {
  if (!input || typeof input !== 'object') throw new Error('Thông tin phương tiện không hợp lệ.');
  const plate = normalizePlate(input.plate);
  if (!Object.hasOwn(VEHICLE_TYPES, input.type)) throw new Error('Chọn loại phương tiện hợp lệ.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length > 80) throw new Error('Tên gợi nhớ tối đa 80 ký tự.');
  if (vehicles.some(v => v.plate === plate && v.type === input.type && v.id !== input.id)) throw new Error('Phương tiện này đã được thêm.');
  return { ...(input.id ? { id: String(input.id) } : {}), plate, type: input.type, name };
}

export function defaultState() {
  return { schemaVersion: 2, vehicles: [], settings: { paused: false, notifyChanges: true }, budgets: {}, errors: [], notificationError: null };
}

/** Validate the complete settings object rather than accepting unknown keys. */
export function validateSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('Cài đặt không hợp lệ.');
  for (const key of ['paused', 'notifyChanges']) {
    if (typeof input[key] !== 'boolean') throw new Error('Cài đặt thông báo hoặc lịch không hợp lệ.');
  }
  return { paused: input.paused, notifyChanges: input.notifyChanges };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

/** Stable across record/key ordering; never includes the fetch timestamp. */
export function resultFingerprint(records) {
  return JSON.stringify(records.map(record => JSON.stringify(stable(record))).sort());
}

export function safeOutcome(outcome) {
  if (outcome?.kind === 'success' && Array.isArray(outcome.records) && outcome.records.every(record => record && typeof record === 'object' && !Array.isArray(record) && typeof record.id === 'string' && record.id.length > 0)) {
    return { kind: 'success', records: structuredClone(outcome.records), source: outcome.source === 'VNeTraffic.org' ? outcome.source : 'Nguồn chưa xác định', dataAsOf: typeof outcome.dataAsOf === 'string' ? outcome.dataAsOf : null };
  }
  const error = diagnostic(outcome?.error);
  return { kind: 'error', message: ERROR_MESSAGES[error.code], error };
}

/** Preserve the last successful result on every failure. */
export function applyOutcome(vehicle, rawOutcome, now) {
  const outcome = safeOutcome(rawOutcome);
  const status = outcome.kind === 'success' ? (outcome.records.length ? 'violations' : 'clear') : outcome.kind;
  const next = { ...vehicle, status, lastAttemptAt: vehicle.status === 'checking' ? vehicle.lastAttemptAt : now, message: outcome.kind === 'success' ? null : outcome.message, limitMessage: null, lastError: outcome.kind === 'success' ? null : outcome.error };
  if (outcome.kind === 'success') {
    next.lastSuccessAt = now;
    next.lastResult = { records: outcome.records, source: outcome.source, dataAsOf: outcome.dataAsOf, checkedAt: now };
  }
  const fingerprint = outcome.kind === 'success' ? resultFingerprint(outcome.records) : `${status}:${next.message}`;
  const history = vehicle.history ?? [];
  next.history = history.at(-1)?.fingerprint === fingerprint ? history : [...history, { at: now, status, fingerprint, message: next.message, ...(outcome.kind === 'success' ? { records: outcome.records } : {}) }].slice(-HISTORY_LIMIT);
  return next;
}
