import { VEHICLE_TYPES } from './domain.js';
import { localDateKey } from './scheduler.js';

export const STATUS_LABELS = Object.freeze({ never: 'Chưa kiểm tra', checking: 'Đang kiểm tra', clear: 'Chưa thấy vi phạm', violations: 'Có hồ sơ vi phạm', auth_required: 'Cần xác thực', unavailable: 'Nguồn chưa sẵn sàng', error: 'Chưa cập nhật được' });
export const $ = id => document.getElementById(id);
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function formatDate(value) { return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa có'; }
export async function request(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error ?? 'Không kết nối được tiện ích. Hãy tải lại trang.');
  return response;
}
export function setError(id, error) {
  const node = $(id);
  node.textContent = error instanceof Error ? error.message : String(error ?? '');
  node.hidden = !node.textContent;
}
export function vehicleHeading(vehicle) { return vehicle.name ? `${vehicle.name} · ${VEHICLE_TYPES[vehicle.type]}` : VEHICLE_TYPES[vehicle.type]; }
export function statusBadge(vehicle) { return element('span', STATUS_LABELS[vehicle.status] ?? 'Chưa xác định', `status-badge status-${vehicle.status}`); }

export function resultNotice(vehicle) {
  if (['error', 'auth_required', 'unavailable'].includes(vehicle.status)) return vehicle.lastResult ? 'Cập nhật thất bại — đang hiển thị kết quả cũ' : 'Chưa lấy được kết quả. Chưa xác nhận được có vi phạm hay không.';
  return vehicle.lastResult ? 'Dữ liệu tham khảo; đối chiếu trên trang chính thức.' : 'Chưa lấy được kết quả.';
}
export function errorText(error) {
  return `Mã lỗi: ${error.code}\nThời gian: ${new Date(error.at).toISOString()}\nBước thất bại: ${error.step}\nHTTP status: ${error.httpStatus ?? 'Không có'}\nThời gian xử lý: ${error.durationMs} ms\nPhiên bản extension: ${error.version}`;
}
export function errorDetails(error) {
  const details = element('details', undefined, 'history');
  details.append(element('summary', 'Chi tiết lỗi'), element('pre', errorText(error)));
  const copy = element('button', 'Sao chép thông tin lỗi', 'button-text');
  copy.type = 'button';
  const status = element('span');
  status.setAttribute('role', 'status');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(errorText(error)); status.textContent = 'Đã sao chép.'; }
    catch { status.textContent = 'Không sao chép được. Bạn có thể chọn nội dung lỗi ở trên để sao chép.'; }
  });
  details.append(copy, status);
  return details;
}
export function lookupAvailability(vehicle, state, now = Date.now()) {
  const budget = state.budgets[`${vehicle.type}:${vehicle.plate}`];
  const count = budget?.day === localDateKey(now) ? budget.count : 0;
  return { disabled: vehicle.status === 'checking', text: `${count} lượt tra cứu hôm nay · Không giới hạn lượt thủ công` };
}
