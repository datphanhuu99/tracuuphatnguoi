# Bằng chứng test nền và harness Chrome

## Phân biệt phạm vi

Các bài node:test kiểm tra điều phối và adapter Chrome giả lập. Chúng không chứng minh Chrome đã chạy extension. Harness scripts/chrome-test.mjs khởi chạy Chrome thật bằng profile tạm, giao tiếp CDP qua pipe và nạp extension bằng Extensions.loadUnpacked. Không có kết quả nguồn giả trong ứng dụng hoặc API runtime dành cho test.

## RED và GREEN thực tế

| Hành vi | RED đã quan sát | Sửa và GREEN |
| --- | --- | --- |
| Transport CDP gửi, ghép phản hồi, lỗi/timeout | Import scripts/cdp.mjs thất bại vì module chưa tồn tại | Transport được triển khai; 5 ca có tên chạy và đạt với test isolation none |
| Chữ tiếng Việt chia nhiều chunk | tests/cdp.test.js trả về `���` thay vì `ộ`, 1 fail / 5 pass | Dùng StringDecoder UTF-8; chạy lại 6 ca, cả 6 đạt |
| Đọc trạng thái không dời alarm | tests/background.test.js: `4 !== 2` lần tạo alarm sau getState/exportData | Chỉ lập lịch lại cho thao tác thay đổi; cùng bài test chạy lại đạt |
| Quyền truy cập runtime và kho lưu | Bài background kiểm tra sender ngoài extension bị từ chối, CRUD, pause, adapter unavailable, restart module | 8 test tính cả nhóm cha đạt; đây là API giả lập trong Node |

Lệnh xác nhận transport: `rtk proxy node --experimental-test-isolation=none --test --test-reporter=spec tests/cdp.test.js`.

Lệnh xác nhận background: `rtk proxy node --experimental-test-isolation=none --test --test-reporter=spec tests/background.test.js`.

## Phát hiện môi trường test

Trong sandbox này spawnSync có thể trả error EPERM kèm status 0. Chế độ node:test cách ly tiến trình mặc định từng hiển thị PASS theo file mà không có các test bên trong. Các con số xác nhận chỉ lấy từ chế độ --experimental-test-isolation=none, chạy cùng tiến trình, có tên từng test. Kiểm tra cú pháp cũng dùng vm.SourceTextModule trong cùng tiến trình, không dựa vào exit status của tiến trình con bị chặn.

## Lần thử Chrome thật

`rtk proxy node scripts/chrome-test.mjs` đã được chạy. Kết quả: FAIL ngay tại khởi động Chrome, chưa nạp extension. Chrome báo `sandbox_host_linux.cc:41 ... shutdown: Operation not permitted (1)`.

Chi tiết máy đọc được ở ../artifacts/chrome-report.json. Không có screenshot và không có test UI nào được ghi nhận PASS. Không thể kết luận độ ổn định UI, thông báo thật hoặc service worker thật từ kết quả Node.

## Harness đã chuẩn bị để chạy lại

`rtk npm run test:chrome` chạy một lần. `rtk npm run test:chrome:repeat` chạy ba profile độc lập; bất kỳ lỗi nào đều trả exit code khác 0. Có thể đặt CHROME_PATH để chọn Chrome có hỗ trợ Extensions.loadUnpacked. Tùy chọn CHROME_NO_SANDBOX=1 chỉ dành cho môi trường CI yêu cầu; không dùng để vượt sandbox của phiên này.

Harness kiểm tra nạp manifest, dashboard và popup, lưu và sửa xe, chống trùng, dữ liệu sau reload, trạng thái nguồn chưa kết nối, cài lịch, pause/resume, xuất JSON, xóa có xác nhận, phím Tab/Escape, tên truy cập, bố cục hẹp, alarm thật và khởi động lại worker. Các ca này hiện chưa chạy được sau bước khởi động; script cần được xác nhận tiếp trong môi trường cho phép Chrome hoạt động.
