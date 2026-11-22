import test from 'node:test';
import assert from 'node:assert/strict';

function event() {
  const listeners = [];
  return { listeners, addListener: callback => listeners.push(callback), removeListener: callback => { const index = listeners.indexOf(callback); if (index >= 0) listeners.splice(index, 1); } };
}

function chromeFixture() {
  const data = {};
  const alarms = new Map();
  const tabs = [];
  const notices = [];
  const createdAlarms = [];
  const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/';
  const chrome = {
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getURL: path => `${origin}${path}`, onMessage: event(), onStartup: event(), onInstalled: event() },
    storage: { local: {
      get: async key => structuredClone({ [key]: data[key] }),
      set: async values => { Object.assign(data, structuredClone(values)); },
      setAccessLevel: async options => { assert.equal(options.accessLevel, 'TRUSTED_CONTEXTS'); },
    } },
    alarms: {
      create: async (name, details) => { alarms.set(name, { name, ...details }); createdAlarms.push(name); },
      get: async name => alarms.get(name),
      clear: async name => alarms.delete(name),
      onAlarm: event(),
    },
    tabs: {
      onRemoved: event(),
      get: async id => tabs[id - 1],
      create: async options => {
        tabs.push(options);
        const id = tabs.length;
        if (options.url.includes('vnetraffic.org')) setTimeout(() => {
          for (const listener of [...chrome.runtime.onMessage.listeners]) listener({ type: 'vne:ready' }, { id: chrome.runtime.id, url: options.url, tab: { id } }, () => {});
        }, 0);
        return { id };
      },
      remove: async () => {},
      sendMessage: async (id, message) => {
        const response = await fetch(message.url, message.init ?? {});
        return { status: response.status, body: await response.text() };
      },
    },
    notifications: { create: async (id, options) => { notices.push({ id, ...options }); }, onClicked: event() },
    action: { setBadgeText: async () => {}, setTitle: async () => {} },
  };
  const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('src/app.html') };
  const message = (type, payload, from = sender) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No background response to ${type}`)), 2000);
    chrome.runtime.onMessage.listeners[0]({ type, payload }, from, response => { clearTimeout(timer); resolve(response); });
  });
  return { chrome, message, data, alarms, tabs, notices, createdAlarms };
}


test('background maintains daily wakeups, checks on startup and rejects untrusted senders', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const h = chromeFixture();
  h.chrome.runtime.getManifest = () => ({ version: '0.2.0' });
  h.alarms.set('vehicle-check', {});
  h.alarms.set('schedule-maintenance', {});
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    if (!init.method) return new Response('<script>var VNE = {"nonce":"test-nonce"};</script>');
    return new Response(JSON.stringify({ plate: '51K999999', type: 'motorbike', status: 'not_found', violations: [], data_as_of: '2026-09-25' }));
  };
  globalThis.chrome = h.chrome;
  try {
    await import('../src/background.js?daily-background');
    assert.equal((await h.message('getState')).state.schemaVersion, 2);
    assert.equal(h.alarms.has('schedule-maintenance'), false);
    assert.equal(h.alarms.get('vehicle-check').periodInMinutes, 5);
    const rejected = await h.message('saveVehicle', { plate: '51K999999', type: 'motorcycle' }, { id: 'other', url: h.chrome.runtime.getURL('src/app.html') });
    assert.equal(rejected.ok, false);
    assert.equal((await h.message('getState', null, { id: h.chrome.runtime.id, url: 'https://example.com' })).ok, false);
    const saved = await h.message('saveVehicle', { plate: '51K999999', type: 'motorcycle' });
    assert.equal(saved.ok, true);
    await h.chrome.runtime.onStartup.listeners[0]();
    const result = await h.message('getState');
    assert.equal(result.state.vehicles[0].status, 'clear');
    await h.message('ensureDaily');
    await h.message('getState');
    await h.chrome.runtime.onStartup.listeners[0]();
    assert.equal(calls, 2);
    assert.equal(h.createdAlarms.length, 1);
    assert.equal(h.notices.some(n => n.id.startsWith('daily')), false);
    await h.message('openOfficial');
    assert.equal(h.tabs.at(-1).url, 'https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/');
    assert.equal((await h.message('injectFakeResult')).ok, false);
    const cleared = await h.message('clearData');
    assert.equal(cleared.state.vehicles.length, 0);
    assert.equal(cleared.state.settings.paused, true);
  } finally { globalThis.chrome = previousChrome; globalThis.fetch = previousFetch; }
});

test('background allows export/reset after corrupt storage and recovers on next request', async () => {
  const previous = globalThis.chrome;
  const h = chromeFixture();
  h.chrome.runtime.getManifest = () => ({ version: '0.2.0' });
  const raw = { schemaVersion: 99, vehicles: [], retained: 'keep' };
  h.data.appState = structuredClone(raw);
  globalThis.chrome = h.chrome;
  try {
    await import('../src/background.js?corrupt-daily-background');
    assert.equal((await h.message('getState')).ok, false);
    assert.deepEqual((await h.message('exportData')).data, raw);
    assert.equal((await h.message('clearData')).ok, true);
    assert.equal((await h.message('getState')).state.schemaVersion, 2);
  } finally { globalThis.chrome = previous; }
});

for (const paused of [false, true]) {
  test(`alarm checks without opening popup; paused=${paused}`, async () => {
    const previousChrome = globalThis.chrome;
    const previousFetch = globalThis.fetch;
    const h = chromeFixture();
    h.chrome.runtime.getManifest = () => ({ version: '0.0.1' });
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      if (!init.method) return new Response('<script>var VNE = {"nonce":"test-nonce"};</script>');
      return new Response(JSON.stringify({ plate: '51K999999', type: 'motorbike', status: 'not_found', violations: [], data_as_of: '2026-09-25' }));
    };
    globalThis.chrome = h.chrome;
    try {
      await import(`../src/background.js?alarm-${paused}`);
      await h.message('saveVehicle', { plate: '51K999999', type: 'motorcycle' });
      const { state } = await h.message('getState');
      await h.message('saveSettings', { ...state.settings, paused });
      assert.equal(h.chrome.alarms.onAlarm.listeners.length, 1);
      const fire = name => h.chrome.alarms.onAlarm.listeners[0]({ name });
      await fire('unrelated');
      assert.equal(calls, 0);
      await fire('vehicle-check');
      assert.equal((await h.message('getState')).state.vehicles[0].status, paused ? 'never' : 'clear');
      await fire('vehicle-check');
      assert.equal(calls, paused ? 0 : 2, 'one automatic lookup per day');
    } finally { globalThis.chrome = previousChrome; globalThis.fetch = previousFetch; }
  });
}
