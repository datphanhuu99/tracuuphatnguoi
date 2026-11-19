import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlate, validateVehicle, validateSettings, defaultState, applyOutcome, resultFingerprint } from '../src/domain.js';
import { nextLocalDay, localDateKey } from '../src/scheduler.js';

test('normalizes plate separators and rejects unsupported characters', () => {
  assert.equal(normalizePlate(' 30a-123.45 '), '30A12345');
  assert.equal(normalizePlate('59-x1 123.45'), '59X112345');
  for (const plate of ['', 'abc', '<script>', '30A💥12345', '30A1234567890']) {
    assert.throws(() => normalizePlate(plate));
  }
});
test('validates vehicles and rejects duplicates independently of spacing', () => {
  const vehicle = validateVehicle({ plate: '30a-123.45', type: 'car', name: ' Gia đình ' }, []);
  assert.equal(vehicle.plate, '30A12345');
  assert.equal(vehicle.name, 'Gia đình');
  assert.throws(() => validateVehicle({ plate: '30A12345', type: 'car' }, [{ ...vehicle, id: 'one' }]));
  assert.equal(validateVehicle({ ...vehicle, id: 'one' }, [{ ...vehicle, id: 'one' }]).id, 'one');
  assert.throws(() => validateVehicle({ plate: '30A12345', type: 'plane' }, []));
  assert.throws(() => validateVehicle({ plate: '30A12345', type: 'car', name: 'x'.repeat(81) }, []));
});
test('settings accept only current flags and drop legacy schedules', () => {
  const base = defaultState().settings;
  assert.deepEqual(validateSettings({ ...base, times: ['08:00', '20:00'], notifyDaily: true }), { paused: false, notifyChanges: true });
  assert.throws(() => validateSettings({ ...base, paused: 'true' }));
  assert.throws(() => validateSettings(null));
});
test('day keys and reset boundary use the local calendar', () => {
  assert.equal(localDateKey(new Date(2026, 0, 2).getTime()), '2026-01-02');
  assert.equal(nextLocalDay(new Date(2026, 9, 29, 23, 59).getTime()), new Date(2026, 9, 30).getTime());
});
test('local midnight remains correct across daylight saving changes', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const spring = new Date(2026, 2, 8).getTime();
    const autumn = new Date(2026, 10, 1).getTime();
    assert.equal(nextLocalDay(spring) - spring, 23 * 3600000);
    assert.equal(nextLocalDay(autumn) - autumn, 25 * 3600000);
    assert.equal(localDateKey(nextLocalDay(spring)), '2026-03-09');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('failure preserves previous success and never becomes clear', () => {
  const old = { id: 'a', status: 'violations', lastSuccessAt: 10, lastResult: { records: [{ id: 'x' }] }, history: [] };
  const failed = applyOutcome(old, { kind: 'error', message: 'Offline' }, 20);
  assert.equal(failed.status, 'error');
  assert.equal(failed.lastSuccessAt, 10);
  assert.deepEqual(failed.lastResult, old.lastResult);
  assert.equal(failed.lastAttemptAt, 20);
  assert.equal(old.status, 'violations');
});
test('success records exact result, deduplicates histories and caps them', () => {
  const record = { id: 'x', status: 'Chưa xử lý', location: 'A' };
  const first = applyOutcome({ history: [] }, { kind: 'success', records: [record] }, 10);
  assert.equal(first.status, 'violations');
  assert.equal(first.lastSuccessAt, 10);
  const second = applyOutcome(first, { kind: 'success', records: [record] }, 20);
  assert.equal(second.history.length, 1);
  const cleared = applyOutcome(second, { kind: 'success', records: [] }, 30);
  assert.equal(cleared.status, 'clear');
  assert.equal(cleared.history.length, 2);
  const capped = applyOutcome({ ...first, history: Array.from({ length: 200 }, (_, id) => ({ id })) }, { kind: 'auth_required', message: 'Đăng nhập' }, 40);
  assert.equal(capped.history.length, 200);
  assert.equal(resultFingerprint([record, { id: 'y' }]), resultFingerprint([{ id: 'y' }, record]));
});
test('unknown source response is an error rather than clear', () => {
  assert.equal(applyOutcome({ history: [] }, { kind: 'success' }, 10).status, 'error');
  assert.equal(applyOutcome({ history: [] }, { kind: 'success', records: [null] }, 10).status, 'error');
  assert.equal(applyOutcome({ history: [] }, { kind: 'mystery' }, 10).status, 'error');
});
