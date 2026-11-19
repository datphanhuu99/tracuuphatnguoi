import test from 'node:test';
import assert from 'node:assert/strict';
import * as adapter from '../src/source.js';

const vehicle = { plate: '51K999999', type: 'motorcycle' };
const reply = (extra = {}) => ({ plate: '51K999999', type: 'motorbike', status: 'not_found', violations: [], data_as_of: '2026-09-25', ...extra });
const html = '<script>var VNE = {"restUrl":"https://vnetraffic.org/wp-json/vne/v1/","nonce":"test-token"};</script>';
function fixture(body = reply(), options = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (options.throw) throw new TypeError('secret-cookie=test-token');
    if (options.hang) return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    if (requests.length === 1) return new Response(options.html ?? html, { status: options.pageStatus ?? 200 });
    return new Response(options.raw ?? JSON.stringify(body), { status: options.status ?? 200 });
  };
  return { requests, source: () => adapter.createVneSource({ fetchImpl, timeoutMs: options.timeoutMs ?? 25000 }) };
}
test('connector dynamically parses JSON nonce and posts normalized plate and mapped type without executing scripts', async () => {
  assert.equal(typeof adapter.createVneSource, 'function');
  for (const [type, apiType] of [['car', 'car'], ['motorcycle', 'motorbike'], ['electric', 'electricbike']]) {
    const f = fixture(reply({ type: apiType }));
    const outcome = await f.source().lookup({ plate: '51k9-999.99', type });
    assert.equal(outcome.kind, 'success');
    assert.equal(outcome.source, 'VNeTraffic.org');
    assert.equal(outcome.dataAsOf, '2026-09-25');
    assert.equal(f.requests[1].url, 'https://vnetraffic.org/wp-json/vne/v1/lookup');
    assert.deepEqual(JSON.parse(f.requests[1].init.body), { plate: '51K999999', type: apiType });
    assert.equal(f.requests[1].init.headers['X-WP-Nonce'], 'test-token');
    assert.equal(f.requests[0].init.credentials, 'omit');
  }
});
test('only valid not_found and nonempty found can succeed; identity and dates must match', async () => {
  for (const body of [reply({ plate: '30A12345' }), reply({ type: 'car' }), reply({ type: undefined }), reply({ status: 'other' }), reply({ violations: [{}] }), reply({ status: 'found' }), reply({ data_as_of: '2026-02-30' }), reply({ status: 'found', violations: [null] }), reply({ status: 'found', violations: [{ unexpected: true }] })]) {
    const outcome = await fixture(body).source().lookup(vehicle);
    assert.equal(outcome.kind, 'error');
    assert.equal(outcome.error.code, 'INVALID_RESPONSE');
  }
});
test('found records have stable IDs across ordering and mutable processing status', async () => {
  const first = { bien_so: '51K9-999.99', thoi_gian: '2026-09-01 10:00', dia_diem: 'A', loi_vi_pham: 'B', trang_thai: 'Chưa xử lý' };
  const a = await fixture(reply({ status: 'found', violations: [first] })).source().lookup(vehicle);
  const b = await fixture(reply({ status: 'found', violations: [{ trang_thai: 'Đã xử lý', loi_vi_pham: 'B', dia_diem: 'A', thoi_gian: first.thoi_gian, bien_so: '51K999999' }] })).source().lookup(vehicle);
  assert.equal(a.kind, 'success');
  assert.ok(a.records[0].id);
  assert.equal(a.records[0].id, b.records[0].id);
  assert.equal((await fixture(reply({ status: 'found', violations: [{ ...first, bien_so: '30A12345' }] })).source().lookup(vehicle)).kind, 'error');
});

test('expired nonce is not retried and the next explicit lookup fetches a fresh configuration', async () => {
  let calls = 0;
  const source = adapter.createVneSource({ fetchImpl: async (url, init) => {
    calls++;
    if (calls % 2) return new Response(`<script>var VNE = {"nonce":"token-${calls}"};</script>`);
    if (calls === 2) return new Response('{"code":"rest_cookie_invalid_nonce"}', { status: 403 });
    assert.equal(init.headers['X-WP-Nonce'], 'token-3');
    return new Response(JSON.stringify(reply()));
  } });
  assert.equal((await source.lookup(vehicle)).error.code, 'NONCE_INVALID');
  assert.equal(calls, 2);
  assert.equal((await source.lookup(vehicle)).kind, 'success');
  assert.equal(calls, 4);
});

test('lookup response body is also subject to the request timeout', async () => {
  let calls = 0;
  const source = adapter.createVneSource({ timeoutMs: 5, fetchImpl: async () => {
    calls++;
    return calls === 1 ? new Response(html) : { ok: true, status: 200, json: () => new Promise(() => {}) };
  } });
  const outcome = await source.lookup(vehicle);
  assert.equal(outcome.error.code, 'TIMEOUT');
  assert.equal(outcome.error.step, 'lookup');
  assert.equal(outcome.error.httpStatus, 200);
  assert.equal(calls, 2);
});
test('HTTP errors, nonce, network, timeout and malformed JSON are distinct and never retry', async () => {
  for (const [options, code, count] of [
    [{ throw: true }, 'NETWORK', 1], [{ hang: true, timeoutMs: 5 }, 'TIMEOUT', 1],
    [{ status: 429 }, 'RATE_LIMITED', 2], [{ status: 503 }, 'SERVER', 2],
    [{ status: 403, raw: '{"code":"rest_cookie_invalid_nonce"}' }, 'NONCE_INVALID', 2],
    [{ status: 403 }, 'HTTP', 2], [{ raw: '<html>oops</html>' }, 'INVALID_RESPONSE', 2],
    [{ html: '<script>var VNE = malicious();</script>' }, 'NONCE_CONFIG', 1],
    [{ pageStatus: 502 }, 'SERVER', 1],
  ]) {
    const f = fixture(reply(), options);
    const outcome = await f.source().lookup(vehicle);
    assert.equal(outcome.error.code, code);
    assert.equal(f.requests.length, count);
    assert.ok(['config', 'lookup'].includes(outcome.error.step));
    assert.ok(outcome.error.durationMs >= 0);
    assert.ok(!JSON.stringify(outcome).includes('test-token'));
  }
});
