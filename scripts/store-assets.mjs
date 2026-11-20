import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { defaultState, applyOutcome } from '../src/domain.js';

const root = resolve(import.meta.dirname, '..');
const profile = resolve(root, '.store-profile');
const output = resolve(root, 'store');
await mkdir(output, { recursive: true });
await rm(profile, { recursive: true, force: true });
const args = [ '--enable-unsafe-extension-debugging', '--disable-dev-shm-usage', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'];
if (process.env.CHROME_NO_SANDBOX === '1') args.push('--no-sandbox');
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    timeout: 20000, headless: true, args, ignoreDefaultArgs: ['--disable-extensions'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: 'light',
  });
  process.stdout.write('Chrome started\n');
  await context.route(/^https?:/, route => route.abort());
  // Chrome branded builds may ignore --load-extension. Explicit CDP loading works there.
  const cdp = await context.browser().newBrowserCDPSession();
  const worker = context.serviceWorkers()[0];
  const id = worker ? new URL(worker.url()).host
    : (await cdp.send('Extensions.loadUnpacked', { path: root })).id;
  process.stdout.write(`Extension loaded: ${id}\n`);
  assert.match(id, /^[a-p]{32}$/);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/src/app.html`);
  process.stdout.write('Dashboard opened\n');
  await page.waitForFunction(async () => (await chrome.runtime.sendMessage({ type: 'getState' }))?.ok);
  process.stdout.write('Worker ready\n');
  const now = new Date('2026-11-20T02:00:00+07:00').getTime();
  // Deliberately impossible province code: never query a potentially real plate.
  const vehicle = applyOutcome({ id: 'store-demo', plate: '00A00000', type: 'car', name: 'Xe minh họa · BIỂN SỐ GIẢ', status: 'never', history: [] },
    { kind: 'success', records: [], source: 'VNeTraffic.org', dataAsOf: '2026-11-19' }, now);
  const state = { ...defaultState(), settings: { paused: true, notifyChanges: true }, vehicles: [vehicle] };
  async function seed(value, theme = 'light') {
    await page.evaluate(async ({ value, theme }) => {
      await chrome.storage.local.set({ appState: value, themePreference: theme });
    }, { value, theme });
    const pageCdp = await context.newCDPSession(page);
    await pageCdp.send('ServiceWorker.enable');
    await pageCdp.send('ServiceWorker.stopAllWorkers');
    await pageCdp.detach();
    await page.reload();
    await page.locator('#theme-select:not([disabled])').waitFor();
    await page.waitForFunction(() => !document.querySelector('#schedule-status').textContent.includes('Đang tải'));
    await page.locator('#plate').fill('00B-000.00');
  }
  const assets = [];
  async function capture(name, width = 1280, height = 800) {
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.bringToFront();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const shot = await context.newCDPSession(page);
    await shot.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const scrollY = await page.evaluate(() => window.scrollY);
    const { data } = await shot.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: scrollY, width, height, scale: 1 } });
    await shot.detach();
    const bytes = Buffer.from(data, 'base64');
    await writeFile(resolve(output, name), bytes);
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
    assets.push({ file: name, width, height });
  }
  await seed(state);
  await page.locator('.plate-number').filter({ hasText: '00A00000' }).waitFor();
  await capture('01-dashboard.png');
  await seed(state, 'dark');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await capture('02-dark.png');
  await seed({ ...state, vehicles: [] });
  await page.locator('#plate').fill('00B-000.00');
  await page.locator('#name').fill('Xe minh họa · BIỂN SỐ GIẢ');
  await page.evaluate(() => window.scrollTo(0, 390));
  await capture('03-add-vehicle.png');
  // A separate code-native brand composition, not a fabricated product screen.
  await page.setViewportSize({ width: 440, height: 280 });
  const icon = (await readFile(resolve(root, 'icons/icon128.png'))).toString('base64');
  await page.setContent(`<html><body style="margin:0;background:#123b32;width:440px;height:280px;display:grid;place-items:center;overflow:hidden"><div style="width:340px;height:180px;border:2px solid #c6df99;border-radius:90px;display:grid;place-items:center;box-shadow:0 0 0 24px #ffffff08,0 0 0 48px #ffffff05"><img width="128" height="128" src="data:image/png;base64,${icon}"></div></body></html>`);
  await capture('promo-440x280.png', 440, 280);
  await writeFile(resolve(output, 'assets.json'), JSON.stringify({ extensionVersion: JSON.parse(await readFile(resolve(root, 'manifest.json'))).version, browser: context.browser().version(), fixture: 'Synthetic impossible plates (00 province), paused, HTTP(S) blocked; not live lookup evidence.', assets }, null, 2) + '\n');
  process.stdout.write(`PASS: real unpacked extension; ${assets.length} PNG assets verified in store/\n`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
