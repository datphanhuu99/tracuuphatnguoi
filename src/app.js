import { $, element, formatDate, request, setError, vehicleHeading, statusBadge, STATUS_LABELS, resultNotice, errorDetails, lookupAvailability } from './ui.js';
let currentState;
let confirming = false;

function action(label, handler, className = 'button-text') {
  const button = element('button', label, className);
  button.type = 'button';
  button.addEventListener('click', () => execute(button, handler));
  return button;
}

async function execute(button, handler) {
  button.disabled = true;
  setError('global-error', '');
  try { await handler(); }
  catch (error) { setError('global-error', error); }
  finally {
    button.disabled = false;
    if (button.id === 'check-all' && currentState) button.disabled = !currentState.vehicles.some(v => !lookupAvailability(v, currentState).disabled);
  }
}

function confirmation(title, description, trigger) {
  if (confirming) return Promise.resolve(false);
  confirming = true;
  $('confirm-title').textContent = title;
  $('confirm-description').textContent = description;
  const dialog = $('confirm-dialog');
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => {
    confirming = false;
    const confirmed = dialog.returnValue === 'confirm';
    if (!confirmed && trigger?.isConnected) { trigger.disabled = false; trigger.focus(); }
    resolve(confirmed);
  }, { once: true }));
}

function resetVehicleForm() {
  $('vehicle-form').reset();
  $('vehicle-id').value = '';
  $('form-title').textContent = 'Thêm phương tiện';
  $('save-vehicle').textContent = 'Lưu phương tiện';
  $('cancel-edit').hidden = true;
  $('plate').removeAttribute('aria-invalid');
  setError('vehicle-error', '');
}

function editVehicle(vehicle) {
  $('vehicle-id').value = vehicle.id;
  $('plate').value = vehicle.plate;
  $('type').value = vehicle.type;
  $('name').value = vehicle.name;
  $('form-title').textContent = 'Sửa phương tiện';
  $('save-vehicle').textContent = 'Lưu thay đổi';
  $('cancel-edit').hidden = false;
  setError('vehicle-error', '');
  $('plate').focus();
}

function renderRecords(container, vehicle) {
  if (!vehicle.lastResult) return;
  const records = vehicle.lastResult.records;
  const source = element('p', `Nguồn kết quả: ${vehicle.lastResult.source ?? 'Nguồn chưa xác định'} · ${records.length} hồ sơ · Ngày dữ liệu: ${vehicle.lastResult.dataAsOf ?? 'Chưa xác định'}`, 'muted');
  container.append(source);
  if (vehicle.status !== 'clear' && vehicle.status !== 'violations') container.append(element('p', 'Đây là kết quả cũ, chưa xác minh lại được.', 'stale-note'));
  for (const record of records) {
    const list = element('dl', undefined, 'record');
    for (const [key, value] of Object.entries(record)) list.append(element('dt', key), element('dd', typeof value === 'object' ? JSON.stringify(value) : String(value)));
    container.append(list);
  }
}

function renderVehicle(vehicle) {
  const item = element('li', undefined, 'vehicle-card');
  item.dataset.vehicleId = vehicle.id;
  const top = element('div', undefined, 'card-top');
  const identity = element('div');
  identity.append(element('p', vehicleHeading(vehicle), 'vehicle-name'), element('h3', vehicle.plate, 'plate-number'));
  top.append(identity, statusBadge(vehicle));
  const freshness = element('dl', undefined, 'freshness');
  freshness.append(element('dt', 'Lần thử gần nhất'), element('dd', formatDate(vehicle.lastAttemptAt)), element('dt', 'Thành công gần nhất'), element('dd', formatDate(vehicle.lastSuccessAt)));
  item.append(top, freshness);
  item.append(element('p', resultNotice(vehicle), 'stale-note'));
  if (vehicle.message) item.append(element('p', vehicle.message, 'vehicle-message'));
  if (vehicle.lastError) item.append(errorDetails(vehicle.lastError));
  const availability = lookupAvailability(vehicle, currentState);
  item.append(element('p', availability.text, 'muted'));
  renderRecords(item, vehicle);
  const controls = element('div', undefined, 'card-actions');
  const retry = action(vehicle.status === 'error' ? 'Thử lại' : 'Kiểm tra ngay', async () => {
    $('action-status').textContent = `Đang kiểm tra ${vehicle.plate}…`;
    render((await request('checkNow', { id: vehicle.id })).state);
    $('action-status').textContent = 'Đã hoàn tất lượt kiểm tra. Xem trạng thái nguồn trên từng xe.';
  });
  retry.disabled = availability.disabled;
  controls.append(retry, action('Sửa', () => editVehicle(vehicle)));
  const deleteButton = action('Xóa', async () => {
    if (!(await confirmation(`Xóa ${vehicle.plate}?`, 'Lịch sử và thông tin của phương tiện này sẽ bị xóa khỏi máy. Bạn có thể xuất bản sao trước khi xóa.', deleteButton))) return;
    render((await request('deleteVehicle', { id: vehicle.id })).state);
    if ($('vehicle-id').value === vehicle.id) resetVehicleForm();
    $('plate').focus();
  }, 'button-text danger');
  controls.append(deleteButton);
  item.append(controls);
  const details = element('details', undefined, 'history');
  details.append(element('summary', `Lịch sử thay đổi (${vehicle.history.length})`));
  const historyList = element('ol');
  for (const entry of [...vehicle.history].reverse()) historyList.append(element('li', `${formatDate(entry.at)} — ${STATUS_LABELS[entry.status] ?? entry.status}${entry.message ? `: ${entry.message}` : ''}`));
  if (!vehicle.history.length) historyList.append(element('li', 'Chưa có lịch sử kiểm tra.'));
  details.append(historyList);
  item.append(details);
  return item;
}

function render(state) {
  currentState = state;
  $('vehicle-list').replaceChildren(...state.vehicles.map(renderVehicle));
  $('vehicle-count').textContent = String(state.vehicles.length);
  $('empty-state').hidden = state.vehicles.length > 0;
  $('check-all').disabled = !state.vehicles.some(v => !lookupAvailability(v, state).disabled);
  $('schedule-display').textContent = 'Mỗi ngày';
  $('schedule-status').textContent = state.settings.paused ? 'Đã tạm dừng tự động cập nhật' : 'Tự cập nhật nền mỗi ngày · giờ máy';
  $('notification-warning').textContent = state.notificationError ?? '';
  $('notification-warning').hidden = !state.notificationError;
}

function populateSettings(settings) {
  $('paused').checked = settings.paused;
  $('notify-changes').checked = settings.notifyChanges;
}

$('vehicle-form').addEventListener('submit', async event => {
  event.preventDefault();
  await execute($('save-vehicle'), async () => {
    try {
      const payload = { plate: $('plate').value, type: $('type').value, name: $('name').value, ...($('vehicle-id').value ? { id: $('vehicle-id').value } : {}) };
      render((await request('saveVehicle', payload)).state);
      request('ensureDaily').catch(error => setError('global-error', error));
      resetVehicleForm();
      $('action-status').textContent = 'Đã lưu phương tiện trên máy này.';
      $('plate').focus();
    } catch (error) {
      setError('vehicle-error', error);
      $('plate').setAttribute('aria-invalid', 'true');
      $('plate').focus();
    }
  });
});
$('cancel-edit').addEventListener('click', resetVehicleForm);
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  await execute($('save-settings'), async () => {
    try {
      const payload = { paused: $('paused').checked, notifyChanges: $('notify-changes').checked };
      const state = (await request('saveSettings', payload)).state;
      render(state);
      populateSettings(state.settings);
      setError('settings-error', '');
      $('action-status').textContent = 'Đã lưu cài đặt.';
    } catch (error) {
      setError('settings-error', error);
      $('paused').focus();
    }
  });
});
$('check-all').addEventListener('click', () => execute($('check-all'), async () => {
  $('action-status').textContent = 'Đang kiểm tra các phương tiện…';
  render((await request('checkNow')).state);
  $('action-status').textContent = 'Đã hoàn tất lượt kiểm tra. Xem trạng thái nguồn trên từng xe.';
}));
$('open-official').addEventListener('click', () => execute($('open-official'), () => request('openOfficial')));
$('export-data').addEventListener('click', () => execute($('export-data'), async () => {
  const { data } = await request('exportData');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = `phat-nguoi-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('action-status').textContent = 'Đã tạo bản sao JSON. Kiểm tra thư mục tải xuống của Chrome.';
}));
$('clear-data').addEventListener('click', () => execute($('clear-data'), async () => {
  if (!(await confirmation('Xóa toàn bộ dữ liệu?', 'Toàn bộ xe, lịch sử và cài đặt sẽ bị xóa. Tự động cập nhật sẽ tạm dừng. Hãy xuất bản sao nếu bạn cần giữ thông tin.', $('clear-data')))) return;
  const state = (await request('clearData')).state;
  render(state);
  populateSettings(state.settings);
  resetVehicleForm();
  $('action-status').textContent = 'Đã xóa dữ liệu và tạm dừng tự động cập nhật.';
}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.appState?.newValue) render(changes.appState.newValue);
});
request('getState').then(({ state }) => {
  render(state); populateSettings(state.settings);
  return request('ensureDaily');
}).then(({ state }) => render(state)).catch(error => setError('global-error', error));
