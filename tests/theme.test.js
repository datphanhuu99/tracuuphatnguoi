import test from 'node:test';
import assert from 'node:assert/strict';
import { initTheme } from '../src/theme.js';

function fixture(saved = 'system', dark = false) {
  const handlers = {};
  const select = { value: '', disabled: true, addEventListener: (_, fn) => { handlers.select = fn; } };
  const status = { textContent: '' };
  const document = { documentElement: { dataset: {} }, querySelector: selector => selector === '#theme-select' ? select : status };
  const media = { matches: dark, addEventListener: (_, fn) => { handlers.media = fn; } };
  const writes = [];
  const storage = {
    local: { get: async () => ({ themePreference: saved }), set: async value => { writes.push(value); } },
    onChanged: { addListener: fn => { handlers.storage = fn; } },
  };
  return { document, select, status, media, storage, handlers, writes };
}

test('restores preference on reopen and saves changes without writing vehicle state', async () => {
  const f = fixture('dark');
  await initTheme(f);
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  assert.equal(f.select.value, 'dark');
  f.select.value = 'light';
  await f.handlers.select();
  assert.equal(f.document.documentElement.dataset.theme, 'light');
  assert.deepEqual(f.writes, [{ themePreference: 'light' }]);
  const reopened = fixture(f.writes[0].themePreference);
  await initTheme(reopened);
  assert.equal(reopened.document.documentElement.dataset.theme, 'light');
});

test('system mode follows OS changes; explicit choice does not', async () => {
  const f = fixture(undefined, true);
  await initTheme(f);
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  f.media.matches = false;
  f.handlers.media();
  assert.equal(f.document.documentElement.dataset.theme, 'light');
  f.select.value = 'dark';
  await f.handlers.select();
  f.handlers.media();
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
});

test('other pages and deletion update appearance; invalid values fall back to system', async () => {
  const f = fixture('invalid');
  await initTheme(f);
  assert.equal(f.select.value, 'system');
  f.handlers.storage({ themePreference: { newValue: 'dark' } }, 'sync');
  assert.equal(f.select.value, 'system');
  f.handlers.storage({ themePreference: { newValue: 'dark' } }, 'local');
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  f.handlers.storage({ themePreference: {} }, 'local');
  assert.equal(f.select.value, 'system');
});

test('storage failures are visible and controls remain usable', async () => {
  const f = fixture();
  f.storage.local.get = async () => { throw new Error('read failed'); };
  f.storage.local.set = async () => { throw new Error('write failed'); };
  await initTheme(f);
  assert.equal(f.select.disabled, false);
  assert.match(f.status.textContent, /Không/);
  f.select.value = 'dark';
  await f.handlers.select();
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  assert.match(f.status.textContent, /Không lưu/);
});
