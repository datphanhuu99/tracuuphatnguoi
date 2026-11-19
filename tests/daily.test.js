import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.js';
import { defaultState } from '../src/domain.js';

const input = { plate: '51K999999', type: 'motorcycle', name: '' };
const success = { kind: 'success', source: 'VNeTraffic.org', dataAsOf: '2026-09-25', records: [] };
function harness(options = {}) {
  let data = options.data;
  let now = new Date(2026, 9, 29, 23, 59).getTime();
  let calls = 0;
  let outcome = options.outcome ?? success;
  const notices = [];
  const store = { read: async () => structuredClone(data), write: async value => { data = structuredClone(value); } };
  const source = { lookup: async vehicle => { calls++; return options.lookup ? options.lookup(vehicle) : outcome; } };
  const make = () => createController({ store, source, clock: () => now, version: '0.2.0', idFactory: () => 'v1', notifier: async n => notices.push(n) });
  return { controller: make(), restart: make, data: () => structuredClone(data), calls: () => calls, nextDay: () => { now = new Date(2026, 9, 30, 0, 1).getTime(); }, daysLater: () => { now = new Date(2026, 10, 5, 8).getTime(); }, outcome: value => { outcome = value; }, notices };
}
test('opening/startup fetches once on local day, caches through restart, next day refreshes with no catchup', async () => {
  const h = harness();
  await h.controller.saveVehicle(input);
  await h.controller.ensureDaily();
  await h.controller.ensureDaily();
  await h.restart().ensureDaily();
  assert.equal(h.calls(), 1);
  assert.equal(h.data().vehicles[0].lastResult.dataAsOf, '2026-09-25');
  h.nextDay();
  await h.controller.ensureDaily();
  assert.equal(h.calls(), 2);
  h.daysLater();
  await h.controller.ensureDaily();
  assert.equal(h.calls(), 3);
  assert.equal(h.notices.some(n => n.kind === 'daily'), false);
});
test('failures do not retry on open or restart, manual retry works, successful old results remain intact', async () => {
  const h = harness();
  await h.controller.saveVehicle(input);
  await h.controller.ensureDaily();
  const before = h.data().vehicles[0];
  h.nextDay();
  h.outcome({ kind: 'error', retryable: true, message: 'secret-token', error: { code: 'NONCE_INVALID', step: 'lookup', httpStatus: 403, durationMs: 12, cookie: 'secret-token' } });
  await h.controller.ensureDaily();
  await h.controller.ensureDaily();
  await h.restart().ensureDaily();
  assert.equal(h.calls(), 2);
  const failed = h.data().vehicles[0];
  assert.equal(failed.lastSuccessAt, before.lastSuccessAt);
  assert.deepEqual(failed.lastResult, before.lastResult);
  assert.equal(failed.lastError.code, 'NONCE_INVALID');
  assert.equal(h.data().errors.length, 1);
  assert.equal(h.data().errors[0].version, '0.2.0');
  assert.ok(!JSON.stringify(h.data()).includes('secret-token'));
  h.outcome(success);
  await h.controller.checkNow('v1');
  await h.controller.ensureDaily();
  assert.equal(h.calls(), 3);
  assert.equal(h.data().vehicles[0].status, 'clear');
});
test('manual checks remain unlimited across reloads while automatic attempts stay once per day', async () => {
  const h = harness({ outcome: { kind: 'error' } });
  await h.controller.saveVehicle(input);
  await h.controller.ensureDaily();
  await h.controller.checkNow();
  await h.controller.checkNow();
  let controller = h.restart();
  await controller.checkNow();
  assert.equal(h.calls(), 4);
  await controller.checkNow();
  await controller.checkNow();
  controller = h.restart();
  await controller.ensureDaily();
  assert.equal(h.calls(), 6);
  assert.equal(h.data().budgets['motorcycle:51K999999'].count, 6);
  h.nextDay();
  await controller.ensureDaily();
  assert.equal(h.calls(), 7);
});
test('successful daily cache does not block repeated explicit checks', async () => {
  const h = harness();
  await h.controller.saveVehicle(input);
  await h.controller.ensureDaily();
  for (let i = 0; i < 5; i++) await h.controller.checkNow();
  await h.controller.ensureDaily();
  assert.equal(h.calls(), 6);
  assert.equal(h.data().vehicles[0].status, 'clear');
});
test('startup, opening and manual clicks join one durable request; reads stay responsive', async () => {
  let release;
  const h = harness({ lookup: async () => new Promise(resolve => { release = resolve; }) });
  await h.controller.saveVehicle(input);
  const jobs = [h.controller.ensureDaily(), h.controller.ensureDaily(), h.controller.checkNow(), h.controller.checkNow('v1')];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await h.controller.getState()).vehicles[0].status, 'checking');
  assert.equal(h.data().budgets['motorcycle:51K999999'].count, 1);
  release(success);
  await Promise.all(jobs);
  assert.equal(h.calls(), 1);
});
test('worker interruption latches an error without another automatic fetch and preserves result', async () => {
  const data = defaultState();
  const at = new Date(2026, 9, 29, 7).getTime();
  data.vehicles = [{ ...input, id: 'v1', status: 'checking', lastAttemptAt: at, lastSuccessAt: at - 86400000, lastResult: { records: [], source: 'VNeTraffic.org' }, history: [] }];
  const h = harness({ data });
  await h.controller.ensureDaily();
  assert.equal(h.calls(), 0);
  assert.equal(h.data().vehicles[0].lastError.code, 'INTERRUPTED');
  assert.equal(h.data().errors.length, 1);
  await h.controller.checkNow();
  assert.equal(h.calls(), 1);
});
test('error log retains the latest 20 failures, never marks failed empty results as clear', async () => {
  let now = new Date(2026, 9, 1).getTime();
  let data;
  const c = createController({ store: { read: async () => data, write: async v => { data = structuredClone(v); } }, source: { lookup: async () => { throw Error('nonce=private'); } }, clock: () => now, version: '0.2.0', idFactory: () => 'v1' });
  await c.saveVehicle(input);
  for (let i = 0; i < 23; i++) { await c.ensureDaily(); now = new Date(2026, 9, i + 2).getTime(); }
  assert.equal(data.errors.length, 20);
  assert.equal(data.vehicles[0].lastSuccessAt, null);
  assert.equal(data.vehicles[0].lastResult, null);
  assert.equal(data.vehicles[0].status, 'error');
  assert.ok(!JSON.stringify(data).includes('private'));
});

test('a lookup finishing after midnight counts as success today and does not auto-fetch again', async () => {
  let release;
  const h = harness({ lookup: async () => new Promise(resolve => { release = resolve; }) });
  await h.controller.saveVehicle(input);
  const running = h.controller.ensureDaily();
  await new Promise(resolve => setImmediate(resolve));
  h.nextDay();
  release(success);
  await running;
  await h.controller.ensureDaily();
  assert.equal(h.calls(), 1);
  assert.equal(h.data().budgets['motorcycle:51K999999'].successDay, '2026-10-30');
});

test('clearing data during a fetch prevents late completion from restoring old state', async () => {
  let release;
  const h = harness({ lookup: async () => new Promise(resolve => { release = resolve; }) });
  await h.controller.saveVehicle(input);
  const running = h.controller.checkNow();
  await new Promise(resolve => setImmediate(resolve));
  await h.controller.clearData();
  release(success);
  await running;
  assert.deepEqual(h.data().vehicles, []);
  assert.deepEqual(h.data().budgets, {});
});

test('a changed plate never receives a response for its old identity', async () => {
  let release;
  const h = harness({ lookup: async () => new Promise(resolve => { release = resolve; }) });
  await h.controller.saveVehicle(input);
  const running = h.controller.checkNow();
  await new Promise(resolve => setImmediate(resolve));
  await h.controller.saveVehicle({ ...input, id: 'v1', plate: '30A12345', type: 'car' });
  release(success);
  await running;
  assert.equal(h.data().vehicles[0].plate, '30A12345');
  assert.equal(h.data().vehicles[0].lastResult, null);
});

test('v1 migration preserves old results and removes twice daily settings', async () => {
  const data = { schemaVersion: 1, settings: { times: ['08:00', '20:00'], paused: false, notifyChanges: true, notifyDaily: true, notifyAuth: true }, vehicles: [{ ...input, id: 'v1', status: 'clear', lastAttemptAt: 10, lastSuccessAt: 10, lastResult: { records: [], source: 'Legacy source' }, history: [] }] };
  const h = harness({ data });
  await h.controller.initialize();
  assert.equal(h.data().schemaVersion, 2);
  assert.equal(h.data().vehicles[0].lastSuccessAt, 10);
  assert.equal(h.data().vehicles[0].lastResult.source, 'Legacy source');
  assert.deepEqual(h.data().settings, { paused: false, notifyChanges: true });
});

test('a persisted successful result today is cached even when legacy attempt metadata is absent', async () => {
  const data = defaultState();
  const now = new Date(2026, 9, 29, 8).getTime();
  data.vehicles = [{ ...input, id: 'v1', status: 'clear', lastAttemptAt: null, lastSuccessAt: now, lastResult: { source: 'VNeTraffic.org', records: [] }, history: [] }];
  const h = harness({ data });
  await h.controller.ensureDaily();
  assert.equal(h.calls(), 0);
});
