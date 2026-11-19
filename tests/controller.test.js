import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.js';
import { defaultState } from '../src/domain.js';
import { createLocalStore } from '../src/storage.js';


function harness(options = {}) {
  let data = options.data;
  let now = new Date(2026, 9, 28, 7).getTime();
  let id = 0;
  const notices = [];
  const calls = [];
  const waits = [];
  const store = {
    read: async () => structuredClone(data),
    write: async value => { data = structuredClone(value); },
  };
  const source = { lookup: async vehicle => { calls.push(vehicle.id); return options.outcome ?? { kind: 'success', records: [] }; } };
  const controller = createController({ store, source: options.source ?? source, notifier: options.notifier ?? (async notice => { notices.push(notice); }), clock: () => now, idFactory: () => `v${++id}`, sleep: async ms => { waits.push(ms); } });
  return { controller, notices, calls, waits, setNow: value => { now = value; }, read: () => data };
}
const input = { plate: '30A12345', type: 'car', name: 'Xe nhà' };

test('initializes, adds, edits, deletes and exports without state references leaking', async () => {
  const h = harness();
  await h.controller.initialize();
  assert.equal((await h.controller.getState()).settings.paused, false);
  const saved = await h.controller.saveVehicle(input);
  assert.equal(saved.vehicles[0].id, 'v1');
  await assert.rejects(h.controller.saveVehicle(input), /đã/);
  await h.controller.saveVehicle({ ...input, id: 'v1', name: 'Đổi tên' });
  assert.equal((await h.controller.getState()).vehicles[0].name, 'Đổi tên');
  saved.vehicles.length = 0;
  assert.equal((await h.controller.getState()).vehicles.length, 1);
  assert.equal((await h.controller.exportData()).schemaVersion, 2);
  await h.controller.deleteVehicle('v1');
  assert.equal((await h.controller.getState()).vehicles.length, 0);
  await assert.rejects(h.controller.deleteVehicle('missing'));
  await assert.rejects(h.controller.saveVehicle({ ...input, id: 'missing' }));
  await h.controller.clearData();
  assert.equal((await h.controller.getState()).settings.paused, true);
});
test('checks retain old results on failures and deduplicate change notifications', async () => {
  let outcome = { kind: 'success', records: [{ id: 'fine1', status: 'Chưa xử lý' }] };
  const h = harness({ source: { lookup: async () => outcome } });
  await h.controller.saveVehicle(input);
  await h.controller.checkNow();
  await h.controller.checkNow();
  assert.equal(h.notices.filter(n => n.kind === 'change').length, 1);
  outcome = { kind: 'error', error: { code: 'NONCE_INVALID' } };
  await h.controller.checkNow('v1');
  await h.controller.checkNow('v1');
  const vehicle = (await h.controller.getState()).vehicles[0];
  assert.equal(vehicle.status, 'error');
  assert.equal(vehicle.lastResult.records.length, 1);
  assert.ok(vehicle.lastSuccessAt);
  assert.equal(h.notices.filter(n => n.kind === 'auth').length, 0);
});
test('paused automatic checks can still be explicitly requested', async () => {
  const h = harness();
  await h.controller.saveVehicle(input);
  await h.controller.saveSettings({ ...defaultState().settings, paused: true });
  await h.controller.ensureDaily();
  assert.equal(h.calls.length, 0);
  await h.controller.checkNow();
  assert.equal(h.calls.length, 1);
});
test('startup recovers interrupted attempts without deleting success', async () => {
  const data = defaultState();
  data.vehicles = [{ ...input, id: 'a', status: 'checking', lastSuccessAt: 10, lastResult: { records: [] }, history: [] }];
  const h = harness({ data });
  await h.controller.initialize();
  const vehicle = (await h.controller.getState()).vehicles[0];
  assert.equal(vehicle.status, 'error');
  assert.equal(vehicle.lastSuccessAt, 10);
});
test('concurrent requests serialize and join active checks rather than repeat', async () => {
  let release;
  let calls = 0;
  const h = harness({ source: { lookup: async () => { calls++; await new Promise(resolve => { release = resolve; }); return { kind: 'success', records: [] }; } } });
  await h.controller.saveVehicle(input);
  const a = h.controller.checkNow();
  const b = h.controller.checkNow();
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
});
test('network errors never retry automatically', async () => {
  let calls = 0;
  const h = harness({ source: { lookup: async () => { calls++; throw new Error('network'); } } });
  await h.controller.saveVehicle(input);
  await h.controller.checkNow();
  assert.equal(calls, 1);
  assert.deepEqual(h.waits, []);
  assert.equal((await h.controller.getState()).vehicles[0].status, 'error');
  await assert.rejects(h.controller.checkNow('missing'));
});
test('notification failure does not lose outcome and settings suppress notifications', async () => {
  const h = harness({ outcome: { kind: 'auth_required', message: 'Xác thực' } });
  await h.controller.saveVehicle(input);
  await h.controller.saveSettings({ ...defaultState().settings, notifyChanges: false, notifyDaily: false, notifyAuth: false });
  await h.controller.checkNow();
  h.setNow(new Date(2026, 9, 28, 20, 1).getTime());
  await h.controller.ensureDaily();
  assert.equal(h.notices.length, 0);
});
test('local store uses only local key and restricts content-script access', async () => {
  const calls = [];
  const local = { get: async key => ({ [key]: { a: 1 } }), set: async value => calls.push(value), setAccessLevel: async value => calls.push(value) };
  const store = createLocalStore(local);
  await store.initialize();
  assert.deepEqual(await store.read(), { a: 1 });
  await store.write({ b: 2 });
  assert.deepEqual(calls[0], { accessLevel: 'TRUSTED_CONTEXTS' });
  assert.deepEqual(calls[1], { appState: { b: 2 } });
});
test('throwing notification API retains successful results and exposes a warning', async () => {
  let fail = true;
  let records = [{ id: 'f1' }];
  const h = harness({ source: { lookup: async () => ({ kind: 'success', records }) }, notifier: async () => { if (fail) throw new Error('OS denied'); } });
  await h.controller.saveVehicle(input);
  await h.controller.checkNow();
  const state = await h.controller.getState();
  assert.equal(state.vehicles[0].status, 'violations');
  assert.equal(state.vehicles[0].lastResult.records[0].id, 'f1');
  assert.match(state.notificationError, /thông báo/);
  fail = false;
  h.setNow(new Date(2026, 9, 28, 20, 1).getTime());
  records = [];
  await h.controller.checkNow();
  assert.equal((await h.controller.getState()).notificationError, null);
});
test('result disappearing is a source change, never labeled paid, and notifies once', async () => {
  let records = [{ id: 'f1', status: 'Chưa xử lý' }];
  const h = harness({ source: { lookup: async () => ({ kind: 'success', records }) } });
  await h.controller.saveVehicle(input);
  await h.controller.checkNow();
  records = [];
  await h.controller.checkNow();
  assert.equal(h.notices.filter(n => n.kind === 'change').length, 2);
  assert.equal((await h.controller.getState()).vehicles[0].status, 'clear');
});
test('invalid saved schema can be exported raw and explicitly cleared without silent data loss', async () => {
  const raw = { schemaVersion: 999, vehicles: 'broken', retained: 'keep-me' };
  const h = harness({ data: raw });
  await assert.rejects(h.controller.initialize(), /Dữ liệu/);
  assert.deepEqual(h.read(), raw);
  assert.deepEqual(await h.controller.exportData(), raw);
  const reset = await h.controller.clearData();
  assert.equal(reset.settings.paused, true);
  assert.equal((await h.controller.getState()).vehicles.length, 0);
  await h.controller.saveVehicle(input);
  assert.equal((await h.controller.getState()).vehicles.length, 1);
});
test('malformed stored vehicle exposes recovery instead of crashing later during UI rendering', async () => {
  const raw = { ...defaultState(), vehicles: [{ id: 'bad', plate: '<script>', type: 'car', history: null }] };
  const h = harness({ data: raw });
  await assert.rejects(h.controller.initialize(), /Dữ liệu/);
  assert.deepEqual(await h.controller.exportData(), raw);
});
