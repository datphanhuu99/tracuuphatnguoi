import { $, element, request, setError, statusBadge, formatDate, resultNotice, errorDetails, lookupAvailability } from './ui.js';
let currentState;

function render(state) {
  currentState = state;
  $('popup-schedule').textContent = state.settings.paused ? 'Đã tạm dừng tự động cập nhật' : 'Tự cập nhật nền · một lần/ngày theo giờ máy';
  $('popup-check').disabled = !state.vehicles.some(v => !lookupAvailability(v, state).disabled);
  $('popup-vehicles').replaceChildren(...state.vehicles.map(vehicle => {
    const item = element('li');
    item.append(element('strong', vehicle.plate), statusBadge(vehicle), element('small', `Thành công gần nhất: ${formatDate(vehicle.lastSuccessAt)}`));
    item.append(element('p', resultNotice(vehicle)));
    if (vehicle.message) item.append(element('p', vehicle.message));
    if (vehicle.lastResult) item.append(element('small', `Nguồn: ${vehicle.lastResult.source ?? 'Chưa xác định'} · Ngày dữ liệu: ${vehicle.lastResult.dataAsOf ?? 'Chưa xác định'} · ${vehicle.lastResult.records.length} hồ sơ`));
    const availability = lookupAvailability(vehicle, state);
    item.append(element('small', availability.text));
    const retry = element('button', vehicle.status === 'error' ? 'Thử lại' : 'Kiểm tra ngay', 'button-text');
    retry.type = 'button';
    retry.disabled = availability.disabled;
    retry.addEventListener('click', () => run(retry, async () => render((await request('checkNow', { id: vehicle.id })).state)));
    item.append(retry);
    if (vehicle.lastError) item.append(errorDetails(vehicle.lastError));
    return item;
  }));
  if (!state.vehicles.length) $('popup-vehicles').append(element('li', 'Chưa có xe. Mở phần quản lý để thêm phương tiện.'));
}
async function run(button, callback) {
  button.disabled = true;
  try { await callback(); }
  catch (error) { setError('popup-error', error); }
  finally {
    button.disabled = false;
    if (button.id === 'popup-check' && currentState) button.disabled = !currentState.vehicles.some(v => !lookupAvailability(v, currentState).disabled);
  }
}
$('popup-check').addEventListener('click', () => run($('popup-check'), async () => {
  $('popup-status').textContent = 'Đang kiểm tra…';
  render((await request('checkNow')).state);
  $('popup-status').textContent = 'Đã hoàn tất lượt kiểm tra. Xem trạng thái trên từng xe.';
}));
$('open-dashboard').addEventListener('click', () => run($('open-dashboard'), () => chrome.runtime.openOptionsPage()));
$('popup-official').addEventListener('click', () => run($('popup-official'), () => request('openOfficial')));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.appState?.newValue) render(changes.appState.newValue);
});
request('getState').then(({ state }) => { render(state); return request('ensureDaily'); })
  .then(({ state }) => render(state)).catch(error => setError('popup-error', error));
