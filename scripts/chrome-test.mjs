import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PipeClient } from './cdp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const runs = Number(process.env.CHROME_TEST_RUNS ?? 1);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('CHROME_TEST_RUNS must be an integer from 1 to 10');
const executable = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const report = { startedAt: new Date().toISOString(), executable, requestedRuns: runs, runs: [], liveLookup: { status: 'NOT_TESTED' } };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(callback, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await callback()) return; }
    catch (error) { lastError = error.message; }
    await delay(75);
  }
  throw new Error(`Timeout: ${message}${lastError ? ` — ${lastError}` : ''}`);
}

async function evaluate(client, sessionId, expression) {
  const response = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}

async function openPage(client, url) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Page.enable', {}, sessionId);
  await client.send('Page.navigate', { url }, sessionId);
  await until(() => evaluate(client, sessionId, `location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`), 'extension page loads');
  return sessionId;
}

function dom(client, sessionId) {
  const run = expression => evaluate(client, sessionId, expression);
  return {
    run,
    fill: (id, value) => run(`(() => { const element = document.getElementById(${JSON.stringify(id)}); if (!element) throw new Error('Missing field: '+${JSON.stringify(id)}); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true})); })()`),
    click: id => run(`(() => { const element = document.getElementById(${JSON.stringify(id)}); if (!element) throw new Error('Missing button: '+${JSON.stringify(id)}); element.click(); })()`),
    state: () => run(`chrome.runtime.sendMessage({type:'getState'}).then(response => { if(!response.ok) throw new Error(response.error); return response.state; })`),
  };
}

async function stopChrome(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]);
  if (child.exitCode === null && !child.signalCode) {
    child.kill('SIGKILL');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]);
  }
}

async function runOne(index) {
  const entry = { index, status: 'FAIL', checks: [], error: null };
  report.runs.push(entry);
  const profile = await mkdtemp(join(tmpdir(), 'phat-nguoi-chrome-'));
  const args = ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, 'about:blank'];
  // Chrome does not consume the HTTP proxy environment used by CLI network tools.
  const proxyValue = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (proxyValue) {
    const proxy = new URL(proxyValue);
    if (proxy.username || proxy.password) throw new Error('Chrome test requires a proxy without embedded credentials');
    args.unshift(`--proxy-server=${proxy.origin}`);
  }
  if (process.env.CHROME_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let client = new PipeClient(child, 65000);
  const errors = [];
  client.on('event', event => {
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text);
  });
  const check = async (name, action) => {
    try { await action(); entry.checks.push({ name, status: 'PASS' }); }
    catch (error) { entry.checks.push({ name, status: 'FAIL', error: error.message }); throw error; }
  };
  try {
    await check('Chrome starts with an isolated temporary profile', async () => { entry.version = (await client.send('Browser.getVersion')).product; });
    let id;
    await check('Actual unpacked extension loads', async () => {
      ({ id } = await client.send('Extensions.loadUnpacked', { path: root }));
      assert.match(id, /^[a-p]{32}$/);
      entry.extensionId = id;
    });
    const origin = `chrome-extension://${id}`;
    let sessionId = await openPage(client, `${origin}/src/app.html`);
    const ui = dom(client, sessionId);
    await check('Dashboard starts and service worker responds', async () => {
      await until(async () => (await ui.state()).schemaVersion === 2, 'controller ready');
      assert.equal((await ui.state()).vehicles.length, 0);
    });
    const restart = async () => {
      await stopChrome(child);
      client.dispose();
      child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
      client = new PipeClient(child, 65000);
      client.on('event', event => {
        if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text);
      });
      await client.send('Browser.getVersion');
      // Re-load the same unpacked path if Chrome does not retain a debug-loaded extension.
      const targets = (await client.send('Target.getTargets')).targetInfos;
      if (!targets.some(target => target.url.startsWith(origin))) await client.send('Extensions.loadUnpacked', { path: root });
      sessionId = await openPage(client, `${origin}/src/app.html`);
      return { client, sessionId, ui: dom(client, sessionId) };
    };
    await runUiChecks({ client, sessionId, ui, origin, check, index, restart });
    await check('No uncaught extension-page exceptions', async () => assert.deepEqual(errors, []));
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(artifacts, `dashboard-${index}.png`), Buffer.from(screenshot.data, 'base64'));
    entry.status = 'PASS';
  } catch (error) {
    entry.error = error.message;
    entry.chromeStderr = client.stderr;
    process.exitCode = 1;
  } finally {
    await stopChrome(child);
    client.dispose();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}


async function runUiChecks({ client, sessionId, ui, origin, check, index, restart }) {
  await check('Legacy scan and maintenance alarms are absent', async () => {
    assert.deepEqual(await ui.run('chrome.alarms.getAll()'), []);
  });
  await check('Dashboard controls have accessible names and support keyboard navigation', async () => {
    assert.deepEqual(await ui.run(`Array.from(document.querySelectorAll('button,input:not([type=hidden]),select')).filter(e => !e.disabled && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.labels?.length && !e.textContent.trim()).map(e => e.id)`), []);
    await ui.run(`document.getElementById('plate').focus()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
    assert.equal(await ui.run('document.activeElement.id'), 'type');
  });
  await check('Narrow dashboard has no horizontal overflow', async () => {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    assert.ok(await ui.run('document.documentElement.scrollWidth <= innerWidth + 1'));
    await client.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
  });
  // A real, unmocked lookup is owned by the service worker, not the popup.
  const popup = await openPage(client, `${origin}/src/popup.html`);
  await check('Popup retains its width when the initial viewport is narrow', async () => {
    try {
      await client.send('Emulation.setDeviceMetricsOverride', { width: 77, height: 600, deviceScaleFactor: 1, mobile: false }, popup);
      const dimensions = await evaluate(client, popup, `({ width: document.body.offsetWidth, content: document.querySelector('.popup-header div').offsetWidth })`);
      assert.equal(dimensions.width, 380);
      assert.ok(dimensions.content > 150, 'Popup heading must have room for readable text');
    } finally {
      await client.send('Emulation.clearDeviceMetricsOverride', {}, popup);
    }
  });
  await check('Real motorcycle lookup starts in worker and survives closing popup', async () => {
    await ui.fill('plate', '51K9-999.99');
    await ui.fill('type', 'motorcycle');
    await ui.fill('name', 'Xe kiểm thử');
    await ui.run(`document.getElementById('vehicle-form').requestSubmit()`);
    await until(async () => (await ui.state()).vehicles.length === 1, 'vehicle saved');
    await evaluate(client, popup, `chrome.runtime.sendMessage({type:'ensureDaily'}); true`);
    await client.send('Page.close', {}, popup);
    await until(async () => ['clear', 'violations', 'error'].includes((await ui.state()).vehicles[0].status), 'live source completes', 60000);
    const state = await ui.state();
    const v = state.vehicles[0];
    assert.equal(state.budgets['motorcycle:51K999999'].count, 1);
    assert.deepEqual(await ui.run(`chrome.tabs.query({url:'https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/'})`), []);
    report.liveLookup = { status: v.status === 'error' ? 'FAILED' : 'SUCCESS', plate: v.plate, type: v.type, source: v.lastResult?.source ?? null, dataAsOf: v.lastResult?.dataAsOf ?? null, checkedAt: v.lastSuccessAt, recordCount: v.lastResult?.records.length ?? null, error: v.lastError ?? null };
    if (v.status === 'error') {
      assert.equal(v.lastSuccessAt, null);
      assert.equal(v.lastResult, null);
      assert.ok(await ui.run(`document.body.innerText.includes('Chưa lấy được kết quả') && document.body.innerText.includes('Thử lại') && document.body.innerText.includes('Chi tiết lỗi')`));
    } else {
      assert.equal(v.lastResult.source, 'VNeTraffic.org');
      assert.match(v.lastResult.dataAsOf, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(v.lastSuccessAt);
    }
  });
  await check('Reopening popup, concurrent opening messages and reloading use the persisted daily attempt', async () => {
    const v = (await ui.state()).vehicles[0];
    const firstAttempt = v.lastAttemptAt;
    const popup = await openPage(client, `${origin}/src/popup.html`);
    await until(() => evaluate(client, popup, `document.body.innerText.includes('51K999999')`), 'popup data');
    await ui.run(`Promise.all(Array.from({length:5},()=>chrome.runtime.sendMessage({type:'ensureDaily'})))`);
    await client.send('Page.reload', {}, sessionId);
    await until(() => ui.run(`document.readyState==='complete' && document.body.innerText.includes('51K999999')`), 'dashboard reload');
    assert.equal((await ui.state()).vehicles[0].lastAttemptAt, firstAttempt);
    assert.equal((await ui.state()).budgets['motorcycle:51K999999'].count, 1);
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' }, popup);
    await writeFile(join(artifacts, `popup-${index}.png`), Buffer.from(screenshot.data, 'base64'));
  });
  await check('Stopping and restarting service worker preserves daily cache/error latch', async () => {
    const before = await ui.state();
    await client.send('ServiceWorker.enable', {}, sessionId);
    await client.send('ServiceWorker.stopAllWorkers', {}, sessionId);
    const after = await ui.state();
    await ui.run(`chrome.runtime.sendMessage({type:'ensureDaily'})`);
    assert.equal(after.vehicles[0].lastAttemptAt, before.vehicles[0].lastAttemptAt);
    assert.equal((await ui.state()).budgets['motorcycle:51K999999'].count, 1);
  });
  await check('Closing Chrome and reopening the same profile preserves daily cache/error latch', async () => {
    const before = await ui.state();
    ({ client, sessionId, ui } = await restart());
    await until(() => ui.run(`document.body.innerText.includes('51K999999')`), 'restarted Chrome reads local data');
    await ui.run(`chrome.runtime.sendMessage({type:'ensureDaily'})`);
    const after = await ui.state();
    assert.equal(after.vehicles[0].lastAttemptAt, before.vehicles[0].lastAttemptAt);
    assert.deepEqual(after.vehicles[0].lastResult, before.vehicles[0].lastResult);
    assert.equal(after.budgets['motorcycle:51K999999'].count, 1);
  });
  await check('Change notification setting persists without recreating alarms', async () => {
    await ui.run(`document.getElementById('notify-changes').checked=false; document.getElementById('settings-form').requestSubmit()`);
    await until(async () => !(await ui.state()).settings.notifyChanges, 'settings persisted');
    assert.deepEqual(await ui.run('chrome.alarms.getAll()'), []);
  });
  await check('Export produces valid JSON containing persistent results and diagnostics', async () => {
    const downloads = await mkdtemp(join(artifacts, 'downloads-'));
    try {
      await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
      await ui.click('export-data');
      let file;
      await until(async () => { file = (await readdir(downloads)).find(name => name.endsWith('.json')); return Boolean(file); }, 'download');
      const data = JSON.parse(await readFile(join(downloads, file), 'utf8'));
      assert.equal(data.schemaVersion, 2);
      assert.equal(data.vehicles[0].plate, '51K999999');
      assert.ok(!JSON.stringify(data).includes('X-WP-Nonce'));
    } finally { await rm(downloads, { recursive: true, force: true }); }
  });
  // Controlled local-storage fixture: exercises stale/error UI only, never evidence of live integration.
  await check('Controlled stale-result fixture renders diagnostics, copy action and unlimited manual retry in popup/dashboard', async () => {
    await ui.run(`(async () => {
      const {appState:s} = await chrome.storage.local.get('appState');
      const v=s.vehicles[0]; v.status='error'; v.lastSuccessAt=Date.now()-86400000;
      v.lastResult={source:'VNeTraffic.org',dataAsOf:'2026-09-25',records:[{id:'fixture-only',loi_vi_pham:'UI TEST ONLY'}]};
      v.lastError={code:'NONCE_INVALID',step:'lookup',at:Date.now(),httpStatus:403,durationMs:500,version:chrome.runtime.getManifest().version};
      v.message='Mã xác thực đã hết hạn.';
      s.budgets['motorcycle:51K999999'].count=3; await chrome.storage.local.set({appState:s});
    })()`);
    await client.send('ServiceWorker.enable', {}, sessionId);
    await client.send('ServiceWorker.stopAllWorkers', {}, sessionId);
    await client.send('Page.reload', {}, sessionId);
    await until(() => ui.run(`document.body.innerText.includes('Cập nhật thất bại — đang hiển thị kết quả cũ')`), 'stale result warning');
    assert.ok(await ui.run(`document.body.innerText.includes('Không giới hạn lượt thủ công') && !document.getElementById('check-all').disabled`));
    await ui.run(`document.querySelector('#vehicle-list details').open=true`);
    assert.ok(await ui.run(`document.body.innerText.includes('NONCE_INVALID') && document.body.innerText.includes('403')`));
    await client.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin });
    await client.send('Page.bringToFront', {}, sessionId);
    await ui.run(`Array.from(document.querySelectorAll('#vehicle-list details button')).find(b => b.textContent==='Sao chép thông tin lỗi').click()`);
    await until(() => ui.run(`document.body.innerText.includes('Đã sao chép.')`), 'error copied');
    const copied = await ui.run('navigator.clipboard.readText()');
    assert.ok(copied.includes('NONCE_INVALID') && copied.includes('403') && copied.includes(await ui.run('chrome.runtime.getManifest().version')));
    const popup = await openPage(client, `${origin}/src/popup.html`);
    await until(() => evaluate(client, popup, `document.body.innerText.includes('Cập nhật thất bại — đang hiển thị kết quả cũ')`), 'popup stale data');
    assert.ok(await evaluate(client, popup, `!document.getElementById('popup-check').disabled`));
  });
  await check('Destructive reset requires confirmation; Escape cancels and restores focus', async () => {
    await client.send('Page.bringToFront', {}, sessionId);
    await ui.click('clear-data');
    await until(() => ui.run(`document.getElementById('confirm-dialog').open`), 'confirm');
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
    await until(() => ui.run(`!document.getElementById('confirm-dialog').open`), 'cancel');
    assert.equal((await ui.state()).vehicles.length, 1);
    await until(() => ui.run(`document.activeElement.id === 'clear-data'`), 'focus restored after dialog close event');
    await ui.click('clear-data');
    await until(() => ui.run(`document.getElementById('confirm-dialog').open`), 'confirm again');
    await ui.click('confirm-delete');
    await until(async () => (await ui.state()).vehicles.length === 0, 'reset');
    assert.equal((await ui.state()).settings.paused, true);
  });
}

await mkdir(artifacts, { recursive: true });
try {
  await readFile(join(root, 'manifest.json'));
  for (let index = 1; index <= runs; index++) await runOne(index);
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.harnessStatus = process.exitCode ? 'FAIL' : 'PASS';
  report.status = process.exitCode ? 'FAIL' : report.liveLookup.status === 'SUCCESS' ? 'PASS' : 'PARTIAL';
  if (report.status === 'PARTIAL') process.exitCode = 1;
  await writeFile(join(artifacts, 'chrome-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.info(`Chrome E2E: ${report.status}. Report: artifacts/chrome-report.json`);
  for (const run of report.runs) console.info(`Run ${run.index}: ${run.status}${run.error ? ` — ${run.error.slice(0, 500)}` : ''}`);
}
