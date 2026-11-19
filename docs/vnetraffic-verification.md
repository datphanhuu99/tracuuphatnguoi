> Báo cáo lịch sử bản 0.2.0. Lỗi gọi trực tiếp 403 đã được khắc phục ở bản 0.2.1; xem [kiểm chứng mới](vnetraffic-0.2.1.md).

# Kiểm chứng VNeTraffic.org — 29/10/2026, extension 0.2.0

Kết luận: phần nghiệp vụ và giao diện đã được triển khai/kiểm thử; **chưa nghiệm thu tích hợp lấy kết quả thật thành công**. Không đổi phản hồi lỗi thành “Chưa thấy vi phạm”.

## Thay đổi

- source.js: GET trang lấy JSON cấu hình VNE và nonce động, POST endpoint cố định; không thực thi mã website hoặc gửi cookie. Ánh xạ đầy đủ ba loại xe, timeout 25 giây cho từng request/body, không retry.
- Kiểm tra phản hồi plate/type/data_as_of/status/violations; found cần hồ sơ hợp lệ, tạo SHA-256 ID ổn định theo định danh hồ sơ và biển số chuẩn hóa, không phụ thuộc thứ tự hoặc trạng thái xử lý.
- controller.js/domain.js: schema 2, giữ dữ liệu v1; cache theo ngày máy, một lần tự thử/ngày, lỗi khóa tự động tới ngày sau, Thử lại chủ động, ngân sách 3 lượt/ngày theo biển số+loại xe.
- Ghi nhận lượt trước network và dùng chung promise đang chạy; giữ hạn mức khi sửa/xóa/thêm lại xe. Giữ kết quả cũ, phục hồi lượt worker bị gián đoạn thành lỗi. Kết quả về muộn không ghi vào xe đã đổi biển số hoặc kho đã xóa.
- background.js: bỏ lập lịch và tổng hợp ngày, xóa alarm cũ; startup và UI mở chủ động gọi ensureDaily. getState luôn có thể đọc trong khi fetch.
- Popup/dashboard: nguồn tham khảo, ngày dữ liệu, lần thành công, lỗi dễ hiểu, cảnh báo dữ liệu cũ/chưa có dữ liệu, hạn mức và mốc 00:00, Chi tiết lỗi và sao chép. Giữ nút đối chiếu CSGT.
- errors.js: chỉ lưu trường diagnostic cho phép, tối đa 20 lỗi; không ghi body/header, nonce, cookie, exception tùy ý hoặc thông tin xác thực. Lịch sử thay đổi vẫn tối đa 200 mục/xe.
- Manifest chỉ thêm host permission https://vnetraffic.org/*. alarms chỉ còn để dọn hai alarm cũ, không tạo lịch mới. Phiên bản 0.2.0.

## Kết quả chạy thực tế

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| rtk npm run check | PASS, 21 file JavaScript, manifest/CSP/HTML/resource safety | artifacts/static-check.log |
| rtk npm test | 47/47 PASS | artifacts/unit-test.log |
| rtk npm run test:coverage | PASS: 100% dòng, 93,35% nhánh, 97,62% hàm | artifacts/coverage.log |
| Chrome unpacked, UI và vòng đời | 15/15 PASS, Chrome 150.0.7871.128 | artifacts/chrome-report.json |
| API thật từ service worker, 51K999999 / motorcycle → motorbike | FAILED: HTTP 403 tại bước lookup, 2209 ms | liveLookup trong artifacts/chrome-report.json |

Coverage chỉ đo domain/controller/scheduler/storage/source/errors, không tính UI/background/Chrome transport. Không có bước build, TypeScript hay linter độc lập trong package; check là bước kiểm tra tĩnh hiện có.

Chrome harness có harnessStatus=PASS, status=PARTIAL và exit 1 vì liveLookup=FAILED. Những dòng PASS về vòng đời xác nhận lỗi được xử lý đúng; chúng không xác nhận đã lấy được kết quả vi phạm thật.

Chrome đã chạy qua: nạp extension; đọc storage; không còn alarms; tên truy cập/Tab; bố cục hẹp; lượt thật trong worker khi đóng popup; mở lại popup/reload/nhiều thông điệp không tăng lượt; dừng và khởi động lại worker; đóng Chrome và mở lại cùng profile; lưu cài đặt; xuất JSON; fixture cục bộ có nhãn để kiểm tra dữ liệu cũ/nonce-expired/clipboard/hết hạn mức; Escape và focus hộp thoại; không có exception trang extension.

Fixture chỉ phục vụ UI, không phải phản hồi thật của VNeTraffic. found/not_found hợp lệ và nonce hết hạn được kiểm chứng bằng test có kiểm soát; chưa có phản hồi thành công thật để xác nhận chúng trong Chrome.

## Phát hiện về môi trường và giới hạn

- Cờ --disable-crashpad-for-testing trong harness cũ gây network service crash/FD ownership violation trên Chrome 150. Đã bỏ cờ; Chrome chạy được ngoài sandbox qua cơ chế cấp quyền chính thức.
- Có một lượt thực tế timeout 25 giây ở bước config. Các lượt sau lấy nonce được và POST bị 403. Không kết luận nguyên nhân 403 là nonce hết hạn vì không nhận được mã WordPress rest_cookie_invalid_nonce tương ứng.
- Không có nonce cố định, dữ liệu kết quả thật giả lập hay logic tự làm mới nonce để che lỗi. Nguồn cần cho phép luồng request từ extension/môi trường này trước khi có thể nghiệm thu tích hợp thành công.
- Kiểm tra ngày mới, DST, lỗi giữ dữ liệu cũ, ngân sách và nonce hết hạn được mô phỏng với clock/fetch trong Node; không đổi đồng hồ hệ thống hay chờ qua đêm.
- Profile Chrome test là profile tạm riêng; không sửa profile cá nhân. Thông báo native của hệ điều hành chưa được xác nhận trực tiếp.
- Không có Git checkout trong thư mục nên không tạo commit; bằng chứng RED/GREEN lưu trong báo cáo TDD.

Cách tải lại: chrome://extensions → Reload extension này, chấp thuận host access mới nếu Chrome hỏi, đóng/mở lại popup hoặc trang quản lý. Chi tiết trong README.md.

Rà soát độc lập theo requesting-code-review/ECC: không phát hiện vấn đề correctness/security quan trọng trong mã, manifest và tests. Không gọi mạng hoặc mở browser trong lượt review.
