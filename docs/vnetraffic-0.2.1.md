# VNeTraffic 0.2.1 — kiểm chứng 30/10/2026

**Đã lấy được kết quả thật từ extension Chrome.** Báo cáo 0.2.0 trước đó (PARTIAL/403) là lịch sử, đã được thay bằng luồng tra cứu trong tab VNeTraffic.

## Chẩn đoán

Cùng trình duyệt và cùng payload biển số 51K999999 / motorbike:
- Gọi trực tiếp từ ngữ cảnh extension: HTTP403, JSON code vne_forbidden.
- Gọi từ trang https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/: HTTP200, status not_found, violations rỗng, data_as_of 2026-09-25; không cần đăng nhập.
- Cả hai lượt POST dùng credentials omit. Không ghi nonce/cookie vào bằng chứng. Chưa xác định rule cụ thể phía máy chủ; khác biệt được kiểm chứng là ngữ cảnh gọi.
- Bằng chứng so sánh đã lọc: artifacts/vne-diagnosis.json. Script tái hiện: scripts/vne-diagnose.mjs.

## Sửa lỗi

- page-source.js mở tab nền đúng trang, chờ content script đóng gói sẵn rồi dùng lại bộ chuẩn hóa của source.js.
- vne-bridge.js chạy ở isolated world trên đúng đường dẫn; đọc text JSON cấu hình mà không eval JavaScript từ website. POST diễn ra trong ngữ cảnh trang, tới duy nhất endpoint VNeTraffic đã xác minh.
- Không gửi cookie trong POST, không dùng phiên đăng nhập. Việc mở website là điều hướng bình thường của trình duyệt.
- Content bridge chỉ nhận lệnh nội bộ cùng extension, chỉ có hai URL cố định, kiểm tra payload và cho tối đa một POST trên mỗi document. Không có window.postMessage bridge hay mã thực thi tải từ xa.
- Tab do tiện ích mở được đóng trong finally khi còn ở đúng trang nguồn. Nếu người dùng chuyển tab sang trang khác, tab được giữ. Chỉ lưu ID tab do tiện ích tạo trong chrome.storage.session để dọn khi worker khởi động lại; không đóng tab VNeTraffic có sẵn của người dùng.
- Chờ tab và từng request đều có timeout hữu hạn25 giây. Không tự retry hoặc tự chuyển sang nguồn khác khi lỗi.
- Cache theo ngày, hạn mức3 lượt/xe/ngày, error latch, giữ kết quả cũ và log20 lỗi vẫn do controller/service worker quản lý.
- Manifest vẫn chỉ có storage/alarms/notifications và host https://vnetraffic.org/*; không thêm scripting, tabs hoặc host khác. Bản0.2.1.

## Kiểm chứng cuối

| Lệnh / phạm vi | Kết quả |
| --- | --- |
| rtk npm run check | PASS,25 file JS; manifest/content script/resource/CSP/HTML checks |
| rtk npm test |55/55 PASS |
| rtk npm run test:coverage | PASS:100% dòng,91,97% nhánh,95,28% hàm trong8 mô-đun được đo |
| rtk npm run test:chrome | PASS, exit0;15 ca UI/vòng đời; liveLookup SUCCESS |
| Biển số thật từ extension |51K999999, motorcycle → motorbike |
| Kết quả thật lưu trong controller |VNeTraffic.org,0 hồ sơ, dataAsOf2026-09-25, checkedAt có giá trị, error null |

Chrome150.0.7871.128 dùng profile tạm riêng. Đã xác nhận popup đóng không hủy tra cứu, tab nguồn đóng khi hoàn tất, không gọi trùng khi mở lại, worker restart và đóng/mở Chrome giữ cache, xuất JSON, clipboard lỗi, hạn mức, focus/keyboard và không có exception trang extension. Bằng chứng: artifacts/chrome-report.json. Chỉ dùng fixture có nhãn trong bước test UI lỗi/dữ liệu cũ, sau khi ghi riêng kết quả tra cứu thật.

Coverage gồm domain/controller/scheduler/storage/source/errors/page-source/vne-bridge; không gồm UI/background/CDP. Native OS notifications chưa kiểm chứng trực tiếp. Biển số thật trả not_found; nhánh found và nonce hết hạn được kiểm tra bằng fixture, chưa có hồ sơ vi phạm thật để nghiệm thu các nhánh đó.

Review độc lập: không phát hiện vấn đề correctness/security quan trọng trong trust boundary, endpoint, giới hạn mộtPOST, timeout hay dọn tab. Reviewer không gọi mạng, không sửa mã.

## TDD

tests/page-source.test.js ban đầu4/4 FAIL vì chưa có page-source/bridge. Sau triển khai,8/8 PASS: kết quả thật được chuẩn hóa qua transport, đóng tab sau thành công/lỗi, không retry, sender/tab/url validation, readiness timeout, đóng tab giữa chừng, registry/recovery, chỉ gọi endpoint cố định và lỗi không lộ secret.
Regression “user đã chuyển tab sang trang khác”: RED do tab17 bị đóng; GREEN sau khi kiểm tra URL trước khi đóng.
Các test cache/hạn mức/chống trùng/dữ liệu cũ từ bản0.2.0 vẫn đạt. Không có Git checkout nên lưu bằng chứng tại đây.

## Tải lại

chrome://extensions → Reload tiện ích → đóng/mở lại popup/trang quản lý. Không cần xóa xe hay kho dữ liệu. Khi cập nhật sẽ thấy một tab VNeTraffic nền được mở tạm rồi đóng. Nếu hôm nay đang lưu lỗi của bản cũ, bấm Thử lại (trong hạn mức) hoặc chờ ngày sau.
