# Phân tích HTML do người dùng tải — 29/10/2026

Nguồn đầu vào: ../../output.html do người dùng cung cấp. Chỉ đọc, không thực thi script của trang và không sao chép token phiên vào tài liệu hoặc fixture test.

- Dung lượng file: 220200 byte.
- Title: Trang chủ – Cục cảnh sát giao thông.
- og:url: https://csgt.bocongan.gov.vn.
- Thẻ body nhận diện page-home; file là trang chủ, không phải phản hồi kết quả phạt nguội.
- Các liên kết ở dòng 934, 1781 và 1800 dẫn đến cùng trang tra cứu: https://csgt.bocongan.gov.vn/tra-cuu-phat-nguoi.
- Script module được nhúng: https://csgtmedia.bocongan.gov.vn/build/assets/public-BE1odRj_.js. Chưa tải và chưa phân tích nội dung script.
- HTML đã đọc chưa cung cấp form gửi biển số hoặc phản hồi dữ liệu vi phạm để xây adapter. Không suy đoán endpoint POST, tham số hoặc kết quả từ liên kết trang.
- Công cụ web thử đọc URL tra cứu mới vẫn timeout trong phiên hiện tại.

Bước tiếp theo là tải trực tiếp URL tra cứu mới thành phat-nguoi.html trong terminal người dùng đang truy cập được. Phân tích tiếp form/script/auth từ file đó. Không cần gửi mật khẩu hoặc OTP.

## File phat-nguoi.html đã được cung cấp

Đã đọc ../../phat-nguoi.html. Title và og:url nhận diện đúng trang tra cứu. Những quan sát dưới đây từ file người dùng cung cấp, chưa phải bằng chứng gửi yêu cầu thành công trong phiên agent:

- Form violationsForm POST tới https://csgt.bocongan.gov.vn/tra-cuu-phat-nguoi (dòng1185).
- Các trường: vehicle_type (car/motorbike/electricbike), plate_number, _token, g-recaptcha-response. Không lưu hoặc sao chép giá trị token phiên.
- Mapping từ app sang website: car→car, motorcycle→motorbike, electric→electricbike.
- Trang dùng reCAPTCHA v3 qua grecaptcha.execute với action tracuuvipham rồi gửi form.serialize bằng jQuery AJAX (dòng1618–1686). Không thể chỉ gửi biển số bằng curl rồi coi như đã đáp ứng luồng này.
- Thông báo trên trang yêu cầu VNeTraffic định danh mức2. Khi response.needVneAuth, UI nhận response.redirectUrl và chỉ chuyển hướng sau nút xác nhận (dòng1635–1639,1668–1672).
- Sau xác thực, script có biến vnetraffic_auto_form và vnetraffic_auto_result phục hồi luồng. Trong file hiện tại cả hai đều null: đây là trang chưa có kết quả xác thực/tra cứu.
- Phản hồi thành công chứa resultHtml, có thể có quotaRemaining/quotaLimit. Không suy ra số lượt cụ thể khi chưa có phản hồi thật.
- Có xử lý lỗi HTTP429 và422. 429 hiển thị thông báo server; 422 có thể do reCAPTCHA hoặc validation và làm tải lại trang. Không tự thử dồn dập khi hết quota.
- Vùng #result hiện trống (dòng1242–1243). Chưa có cấu trúc hồ sơ vi phạm hay thông điệp không có vi phạm để viết parser đáng tin cậy.

Đã cập nhật OFFICIAL_URL trong extension theo liên kết quan sát được. Adapter vẫn trả unavailable, không giả vờ đã xác thực hay đã tra cứu. Bước cần người dùng tương tác là đăng nhập qua trang chính thức và cung cấp riêng phần HTML #result sau một lượt tra cứu hợp lệ; không cần cookie, CSRF token, mật khẩu hoặc OTP.

Regression: đổi hai assertion URL trước khi sửa source cho thấy URL cũ thất bại; sau khi cập nhật source, chạy lại cả bộ test. Đây chỉ xác minh liên kết mở trang chính thức, không xác minh POST thật.
