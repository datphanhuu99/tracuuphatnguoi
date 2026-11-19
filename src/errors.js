export const ERROR_MESSAGES = Object.freeze({
  NETWORK: 'Không kết nối được VNeTraffic.org. Kiểm tra mạng rồi bấm Thử lại.',
  TIMEOUT: 'Nguồn tra cứu phản hồi quá chậm. Bấm Thử lại khi bạn sẵn sàng.',
  NONCE_CONFIG: 'Không đọc được cấu hình xác thực của nguồn. Bấm Thử lại để tải cấu hình mới.',
  NONCE_INVALID: 'Mã xác thực của nguồn không hợp lệ hoặc đã hết hạn. Bấm Thử lại để lấy mã mới.',
  RATE_LIMITED: 'Nguồn đang giới hạn lượt tra cứu (429). Vui lòng chờ rồi bấm Thử lại.',
  SERVER: 'Máy chủ VNeTraffic.org đang gián đoạn. Vui lòng thử lại sau.',
  HTTP: 'Nguồn từ chối yêu cầu tra cứu. Xem Chi tiết lỗi để biết mã HTTP.',
  INVALID_RESPONSE: 'Phản hồi nguồn không đúng cấu trúc hoặc không khớp phương tiện. Chưa xác nhận được kết quả.',
  INTERRUPTED: 'Lượt tra cứu trước bị gián đoạn. Bấm Thử lại để kiểm tra lại.',
});
/** Strict allowlist excludes arbitrary exception text, headers and response bodies. */
export function diagnostic(input = {}, version = 'unknown') {
  const code = Object.hasOwn(ERROR_MESSAGES, input.code) ? input.code : 'INVALID_RESPONSE';
  return {
    code, at: Number.isFinite(input.at) ? input.at : Date.now(),
    step: ['config', 'lookup', 'recovery'].includes(input.step) ? input.step : 'lookup',
    httpStatus: Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599 ? input.httpStatus : null,
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : 0,
    version,
  };
}
