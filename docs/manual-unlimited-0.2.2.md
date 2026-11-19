# 0.2.2 — bỏ giới hạn kiểm tra thủ công

Theo yêu cầu người dùng, đã bỏ trần 3 lượt/ngày trong controller và giao diện. Kiểm tra ngay/Thử lại không giới hạn lượt, kể cả sau thành công hoặc khi dữ liệu cũ đã có từ3 lượt trở lên. Validation kho lưu chấp nhận số lượt lớn hơn3 qua restart.

Tự động một lượt/ngày, cache thành công, không tự retry sau lỗi và chống request trùng vẫn giữ. Giao diện chỉ khóa nút tra cứu khi có lượt đang chạy.

TDD: test mới ban đầu có3 lỗi đúng yêu cầu (lượt thứ4 bị chặn, thành công chỉ gọi3 thay vì6, nút bị khóa với8 lượt). Sau sửa,57/57 tests đạt. check đạt25JSfiles; coverage100% dòng/92,13% nhánh/95,24% hàm. Chrome thật15/15 ca đạt, gồm nút retry vẫn mở với dữ liệu cũ có3 lượt, tra cứu thật và cache/restart. Bằng chứng artifacts/{unit-test.log,coverage.log,static-check.log,chrome-report.json}.

Tải lại extension ở chrome://extensions rồi đóng/mở lại popup. Không cần xóa dữ liệu.
