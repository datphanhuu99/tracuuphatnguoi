import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const PAGE = 'https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/';
const API = 'https://vnetraffic.org/wp-json/vne/v1/lookup';
function event() {
  const listeners = new Set();
  return { listeners, addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn), emit: (...args) => { for (const fn of listeners) fn(...args); } };
}
function fixture(options = {}) {
  const onMessage = event();
  const onRemoved = event();
  const sent = [];
  const removed = [];
  const created = [];
  const runtime = { id: 'test-extension', onMessage };
  const sender = { id: runtime.id, tab: { id: 17 }, url: PAGE };
  const tabs = {
    onRemoved,
    get: async () => ({ url: PAGE }),
    create: async args => { created.push(args); if (!options.noReady) setTimeout(() => onMessage.emit({ type: 'vne:ready' }, sender), 0); return { id: 17 }; },
    sendMessage: async (id, request) => {
      sent.push({ id, request });
      if (options.throw) throw Error('cookie=secret');
      if (request.url === PAGE) return { status: 200, body: '<script>var VNE = {"nonce":"test-nonce"};</script>' };
      return { status: options.status ?? 200, body: JSON.stringify(options.body ?? { status: 'not_found', plate: '51K999999', type: 'motorbike', violations: [], data_as_of: '2026-09-25' }) };
    },
    remove: async id => { removed.push(id); },
  };
  return { runtime, tabs, sent, removed, created, sender };
}
test('page transport uses only an inactive source tab, existing normalizer and closes it after success', async () => {
  const { createPageSource } = await import('../src/page-source.js');
  const f = fixture();
  const outcome = await createPageSource(f).lookup({ plate: '51K999999', type: 'motorcycle' });
  assert.equal(outcome.kind, 'success');
  assert.equal(outcome.source, 'VNeTraffic.org');
  assert.deepEqual(f.created, [{ url: PAGE, active: false }]);
  assert.deepEqual(f.removed, [17]);
  assert.equal(f.sent[1].request.url, API);
  assert.equal(f.sent[1].request.init.headers['X-WP-Nonce'], 'test-nonce');
  assert.equal(f.runtime.onMessage.listeners.size, 0);
});
test('page transport cleans up on HTTP/nonce/network errors and does not retry', async () => {
  const { createPageSource } = await import('../src/page-source.js');
  for (const options of [{ status: 403, body: { code: 'rest_cookie_invalid_nonce' } }, { status: 429 }, { throw: true }]) {
    const f = fixture(options);
    const result = await createPageSource(f).lookup({ plate: '51K999999', type: 'motorcycle' });
    assert.equal(result.kind, 'error');
    assert.deepEqual(f.removed, [17]);
    assert.ok(f.sent.length <= 2);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
test('readiness is bounded and messages from unrelated tabs/pages cannot satisfy it', async () => {
  const { createPageSource } = await import('../src/page-source.js');
  const f = fixture({ noReady: true });
  const pending = createPageSource({ ...f, timeoutMs: 15 }).lookup({ plate: '51K999999', type: 'motorcycle' });
  f.runtime.onMessage.emit({ type: 'vne:ready' }, { ...f.sender, id: 'other' });
  f.runtime.onMessage.emit({ type: 'vne:ready' }, { ...f.sender, tab: { id: 99 } });
  f.runtime.onMessage.emit({ type: 'vne:ready' }, { ...f.sender, url: 'https://example.com/' });
  const result = await pending;
  assert.equal(result.error.code, 'TIMEOUT');
  assert.deepEqual(f.removed, [17]);
  assert.equal(f.sent.length, 0);
});

test('managed tab registry is cleared after lookup and recovery closes only owned source pages', async () => {
  const { createPageSource } = await import('../src/page-source.js');
  const f = fixture();
  let saved = {};
  const registry = { get: async () => structuredClone(saved), set: async value => { saved = structuredClone(value); } };
  const source = createPageSource({ ...f, registry });
  await source.lookup({ plate: '51K999999', type: 'motorcycle' });
  assert.deepEqual(saved, { vneLookupTabs: [] });
  saved = { vneLookupTabs: [1, 2, 3] };
  f.tabs.get = async id => { if (id === 3) throw Error('closed'); return { url: id === 1 ? PAGE : 'https://example.com/' }; };
  await source.cleanup();
  assert.deepEqual(f.removed, [17, 1]);
  assert.deepEqual(saved, { vneLookupTabs: [] });
});

test('a temporary tab adopted by user navigation is not closed after lookup', async () => {
  const { createPageSource } = await import('../src/page-source.js');
  const f = fixture();
  f.tabs.get = async () => ({ url: 'https://example.com/' });
  await createPageSource(f).lookup({ plate: '51K999999', type: 'motorcycle' });
  assert.deepEqual(f.removed, []);
});

test('closing the lookup tab before ready returns an error without a network retry', async () => {
  const { createPageSource } = await import('../src/page-source.js');
  const f = fixture({ noReady: true });
  const pending = createPageSource(f).lookup({ plate: '51K999999', type: 'motorcycle' });
  await new Promise(resolve => setImmediate(resolve));
  f.tabs.onRemoved.emit(17);
  const result = await pending;
  assert.equal(result.error.code, 'NETWORK');
  assert.equal(f.sent.length, 0);
  assert.equal(f.tabs.onRemoved.listeners.size, 0);
});

test('isolated content bridge reads configuration text and fetches only the fixed same-origin endpoint', async () => {
  const text = await readFile(new URL('../src/vne-bridge.js', import.meta.url), 'utf8');
  const onMessage = event();
  const requests = [];
  const ready = [];
  const runtime = { id: 'test-extension', onMessage, sendMessage: async message => ready.push(message) };
  const context = vm.createContext({ chrome: { runtime }, document: { querySelectorAll: () => [{ textContent: 'var VNE = {"nonce":"test-nonce"};' }] }, fetch: async (url, init) => { requests.push({ url, init }); return new Response('{}'); }, AbortSignal, setTimeout, clearTimeout });
  vm.runInContext(text, context, { filename: new URL('../src/vne-bridge.js', import.meta.url).pathname });
  assert.equal(ready[0].type, 'vne:ready');
  const listener = [...onMessage.listeners][0];
  const send = (message, sender = { id: runtime.id }) => new Promise(resolve => { if (!listener(message, sender, resolve)) resolve(null); });
  const config = await send({ type: 'vne:fetch', url: PAGE });
  assert.match(config.body, /var VNE/);
  assert.equal(requests.length, 0);
  assert.equal(await send({ type: 'vne:fetch', url: 'https://example.com/' }), null);
  assert.equal(await send({ type: 'vne:fetch', url: PAGE }, { id: 'other' }), null);
  await send({ type: 'vne:fetch', url: API, init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': 'test-nonce' }, body: '{"plate":"51K999999","type":"motorbike"}' } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, API);
  assert.equal(requests[0].init.credentials, 'omit');
  assert.equal(requests[0].init.referrerPolicy, 'strict-origin-when-cross-origin');
  assert.equal(await send({ type: 'vne:fetch', url: API, init: { method: 'POST', body: '{}' } }), null);
});

test('content bridge classifies network and timeout errors without retaining exception secrets', async () => {
  const text = await readFile(new URL('../src/vne-bridge.js', import.meta.url), 'utf8');
  for (const [name, code] of [['TimeoutError', 'TIMEOUT'], ['TypeError', 'NETWORK']]) {
    const onMessage = event();
    const runtime = { id: 'test-extension', onMessage, sendMessage: async () => {} };
    const context = vm.createContext({ chrome: { runtime }, document: {}, fetch: async () => { throw { name, message: 'nonce=secret' }; }, AbortSignal });
    vm.runInContext(text, context, { filename: new URL('../src/vne-bridge.js', import.meta.url).pathname });
    const listener = [...onMessage.listeners][0];
    const result = await new Promise(resolve => listener({ type: 'vne:fetch', url: API, init: { method: 'POST', headers: { 'X-WP-Nonce': 'test-nonce' }, body: '{"plate":"51K999999","type":"motorbike"}' } }, { id: runtime.id }, resolve));
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { transportError: code });
  }
});
