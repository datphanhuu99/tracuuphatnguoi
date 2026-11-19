import { createController } from './controller.js';
import { createLocalStore } from './storage.js';
import { LOOKUP_PAGE } from './source.js';
import { createPageSource } from './page-source.js';

const SCAN_ALARM = 'vehicle-check';
const MAINTENANCE_ALARM = 'schedule-maintenance';
const store = createLocalStore(chrome.storage.local);
const source = createPageSource({ tabs: chrome.tabs, runtime: chrome.runtime, registry: chrome.storage.session });
const controller = createController({ store, source, version: chrome.runtime.getManifest().version, notifier: notice => chrome.notifications.create(`${notice.kind}:${notice.id ?? 'summary'}`, {
  type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title: notice.title, message: notice.message,
}) });
let startupError = null;

async function initialize() {
  await store.initialize();
  await source.cleanup();
  await controller.initialize();
  // Alarms may disappear after a browser restart; restore on each worker start.
  const alarm = await chrome.alarms.get(SCAN_ALARM);
  if (alarm?.periodInMinutes !== 5) {
    await chrome.alarms.create(SCAN_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  }
  await chrome.alarms.clear(MAINTENANCE_ALARM);
}

function recordStartupError() {
  startupError = 'Không khởi tạo được kho dữ liệu. Tải lại tiện ích và kiểm tra dung lượng lưu trữ.';
  chrome.action.setBadgeText({ text: '!' }).catch(() => {});
}

function recordRuntimeError() {
  chrome.action.setBadgeText({ text: '!' }).catch(() => {});
  chrome.action.setTitle({ title: 'Có thao tác chưa hoàn tất. Mở tiện ích để kiểm tra.' }).catch(() => {});
}

const ready = initialize().catch(recordStartupError);

async function handleMessage(message) {
  await ready;
  if (startupError && !['exportData', 'clearData', 'openOfficial'].includes(message?.type)) throw new Error(`${startupError} Bạn vẫn có thể xuất bản sao hoặc xóa dữ liệu để khôi phục.`);
  if (!message || typeof message.type !== 'string') throw new Error('Yêu cầu không hợp lệ.');
  switch (message.type) {
    case 'getState': return { state: await controller.getState() };
    case 'saveVehicle': return { state: await controller.saveVehicle(message.payload) };
    case 'deleteVehicle': return { state: await controller.deleteVehicle(message.payload?.id) };
    case 'saveSettings': return { state: await controller.saveSettings(message.payload) };
    case 'checkNow': return { state: await controller.checkNow(message.payload?.id) };
    case 'ensureDaily': return { state: await controller.ensureDaily() };
    case 'exportData': return { data: await controller.exportData() };
    case 'clearData': {
      await store.initialize();
      const state = await controller.clearData();
      startupError = null;
      await chrome.action.setBadgeText({ text: '' });
      return { state };
    }
    case 'openOfficial': await chrome.tabs.create({ url: LOOKUP_PAGE }); return {};
    default: throw new Error('Yêu cầu không được hỗ trợ.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'vne:ready') return false;
  const trusted = [chrome.runtime.getURL('src/app.html'), chrome.runtime.getURL('src/popup.html')];
  if (sender.id !== chrome.runtime.id || !trusted.includes(sender.url?.split('#')[0].split('?')[0])) {
    respond({ ok: false, error: 'Trang không được phép truy cập dữ liệu.' });
    return false;
  }
  handleMessage(message).then(result => {
    respond({ ok: true, ...result });
  }).catch(error => respond({ ok: false, error: error instanceof Error ? error.message : 'Không thực hiện được thao tác.' }));
  return true;
});

function onOpen() {
  return ready.then(() => { if (!startupError) return controller.ensureDaily(); }).catch(recordRuntimeError);
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SCAN_ALARM) return onOpen();
});
chrome.runtime.onStartup.addListener(onOpen);
chrome.runtime.onInstalled.addListener(onOpen);
chrome.notifications.onClicked.addListener(id => {
  chrome.tabs.create({ url: id.startsWith('auth:') ? LOOKUP_PAGE : chrome.runtime.getURL('src/app.html') }).catch(recordRuntimeError);
});
