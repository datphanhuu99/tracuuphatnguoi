# Kiểm chứng nguồn CSGT và môi trường Chrome

Ngày kiểm tra: 2026-10-28. Đây là kết quả thăm dò môi trường, không phải bằng chứng tra cứu phương tiện thành công.

## Nguồn chính thức

- Nguồn dự kiến: `https://www.csgt.vn/tra-cuu-phuong-tien-vi-pham.html`.
- `curl -IL --connect-timeout 10 --max-time 25` từ shell thất bại với mã 6: `Could not resolve host: www.csgt.vn`.
- Công cụ đọc web độc lập cũng timeout với cả trang chủ `https://www.csgt.vn/` và trang tra cứu.
- Không truy cập được DOM, script, form, phiên đăng nhập hoặc phản hồi tra cứu thật. Chưa xác minh endpoint API và chưa có căn cứ để triển khai một endpoint phỏng đoán.
- Không gửi tra cứu cho biển số bất kỳ, không nhập thông tin cá nhân và không sử dụng tài khoản của người dùng.

Hướng dẫn Công an Lạng Sơn ngày 31/08/2026 được kiểm tra bởi agent chính có mô tả đăng nhập và xác thực VNeTraffic. Đây là hướng dẫn gián tiếp, chưa chứng minh cấu trúc trang hay thời hạn phiên trong hiện tại:
`https://congan.langson.gov.vn/tin-antt-va-canh-bao-toi-pham/32/canh-bao-mao-danh-canh-sat-giao-thong-goi-dien-bao-phat-nguoi-nham-lua-dao-chiem-doat-tai-san-va/18035.aspx`

## Môi trường kiểm thử trình duyệt

- Có Google Chrome `150.0.7871.128` tại `/usr/bin/google-chrome`.
- Có Node.js 22 và Playwright `1.59.1` trong bộ đệm cục bộ: `/home/datphan/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` (kèm `playwright-core`).
- CLI `agent-browser` chưa được cài.
- Khởi chạy Chrome bằng profile riêng trong `/tmp` với `--headless=new --no-sandbox --disable-dev-shm-usage --dump-dom about:blank` bị dừng signal 5 bởi crashpad: `setsockopt: Operation not permitted`.
- Thử thêm cờ chẩn đoán `--disable-crashpad-for-testing` bị dừng signal 6 ở `content/browser/sandbox_host_linux.cc`: `shutdown: Operation not permitted`.
- Vì trình duyệt không khởi động được trong sandbox của phiên này, chưa chạy được DOM/UI extension, service worker thật, notification thật hoặc CDP `Extensions.loadUnpacked`. Đây là giới hạn môi trường, không phải một kiểm thử PASS.
- Không yêu cầu nâng quyền và không tắt các giới hạn của sandbox hệ thống.

## Hướng harness có thể tái lập ngoài sandbox hiện tại

Dùng Chrome profile tạm riêng, không dùng profile cá nhân. Khởi chạy qua Playwright với đường dẫn executable cấu hình được. Chrome có CDP `Extensions.loadUnpacked` để nạp extension bằng đường dẫn tuyệt đối; cần kiểm tra hỗ trợ của bản Chrome đang chạy và cờ `--enable-unsafe-extension-debugging` với kết nối pipe. Tài liệu giao thức: `https://chromedevtools.github.io/devtools-protocol/tot/Extensions/`.

Harness phải báo FAIL nếu Chrome không khởi động, extension không được nạp, hoặc không truy cập được worker; không thay chúng bằng mock rồi báo là browser E2E PASS. Các bài kiểm thử node với API Chrome giả lập cần được ghi riêng là unit/integration. Khi trình duyệt có thể chạy, kiểm tra thêm/sửa/xóa xe, đổi lịch, phục hồi sau restart, export, popup, trạng thái lỗi và luồng xác thực. Kết nối live cần website hoạt động và phương tiện thử do người dùng cho phép.

Schema CDP đã đọc trực tiếp từ nguồn Chromium DevTools:
`https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Extensions.pdl`

```json
{"method":"Extensions.loadUnpacked","params":{"path":"/absolute/path/to/extension"}}
```

Kết quả là `{ "id": "extension-id" }`. Tham số tùy chọn `enableInIncognito` có kiểu boolean. `Extensions.getExtensions` trả về danh sách các extension unpacked gồm `id`, `name`, `version`, `path`, `enabled`. Có thể kiểm tra kho lưu thật bằng `Extensions.getStorageItems` với `{id, storageArea: "local"}`, trả về `{data: object}`.
