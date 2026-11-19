import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../src/ui.js';

test('UI explains old and absent data without claiming clear after errors', () => {
  assert.equal(typeof ui.resultNotice, 'function');
  assert.match(ui.resultNotice({ status: 'error', lastResult: { records: [] } }), /Cập nhật thất bại — đang hiển thị kết quả cũ/);
  assert.match(ui.resultNotice({ status: 'error', lastResult: null }), /Chưa lấy được kết quả/);
});
test('error copy text includes only diagnostics, never untrusted properties', () => {
  assert.equal(typeof ui.errorText, 'function');
  const text = ui.errorText({ code: 'NONCE_INVALID', at: 10, step: 'lookup', httpStatus: 403, durationMs: 400, version: '0.2.0', nonce: 'sensitive' });
  for (const expected of ['NONCE_INVALID', 'lookup', '403', '400', '0.2.0']) assert.ok(text.includes(expected));
  assert.ok(!text.includes('sensitive'));
});
test('manual retry stays enabled beyond three attempts and disables only during an active lookup', () => {
  const now = new Date(2026, 9, 30, 12).getTime();
  const state = { budgets: { 'motorcycle:51K999999': { day: '2026-10-30', count: 8 } } };
  const vehicle = { plate: '51K999999', type: 'motorcycle', status: 'error' };
  assert.equal(ui.lookupAvailability(vehicle, state, now).disabled, false);
  assert.equal(ui.lookupAvailability({ ...vehicle, status: 'checking' }, state, now).disabled, true);
});
