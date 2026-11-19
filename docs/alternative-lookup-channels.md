# Khảo sát kênh tra cứu thay thế — 29/10/2026

Mục tiêu: giảm phụ thuộc vào tự động điều khiển form CSGT cho extension kiểm tra hai lần/ngày. Đây là nghiên cứu tài liệu công khai, chưa xác minh request trả về kết quả thật. Không tạo tài khoản, nạp tiền, gửi biển số hoặc đổi nguồn ứng dụng.

## VNeTraffic chính thức

Nguồn Chính phủ mô tả ứng dụng có tra cứu vi phạm, lịch sử và nhận thông báo chính thức. Phù hợp nhu cầu nhận thông báo của cá nhân, nhưng chưa tìm được API công khai chính thức dành cho extension trong phạm vi tìm kiếm này. Không được suy ra API của ứng dụng di động được phép dùng làm API công khai.

Nguồn: https://thanglong.chinhphu.vn/ha-noi-huong-dan-hon-10000-thi-sinh-du-sat-hach-cai-dat-ung-dung-vnetraffic-103251121160926058.htm

## XemPhatNguoi.vn — API đối tác bên thứ ba

Trang đối tác công bố REST API gửi biển số và loại phương tiện, nhận dữ liệu chuẩn hóa. Giá công bố tại thời điểm kiểm tra là20đ/request thành công; không phí tháng/khởi tạo. Request lỗi xác thực/sai dữ liệu/lỗi nguồn được công bố không tính phí. Tài liệu endpoint cần đăng nhập. Hướng dẫn tạo key/secret, giữ secret ở backend và cấu hình whitelistIP. Chưa rõ hỗ trợ gọi trực tiếp từ extension cục bộ hoặc yêu cầu IP cố định; cần kiểm chứng trước khi chọn.

Nếu1 xe,2 lần/ngày trong30 ngày và60 request đều thành công, riêng phí request theo bảng giá là1200đ. Đây là phép tính theo niêm yết, chưa xác minh hóa đơn/hạn mức nạp tối thiểu.

Điều khoản tự xác nhận là nền tảng độc lập, không thuộc cơ quan nhà nước; tuyên bố lấy dữ liệu từ CSGT nhưng không bảo đảm đầy đủ/tức thời. Không coi lời tuyên bố này là bằng chứng quan hệ đối tác dữ liệu chính thức.

Nguồn:
- https://xemphatnguoi.vn/doi-tac
- https://xemphatnguoi.vn/dieu-khoan-su-dung

## API Wayfindy — API bên thứ ba

Trang giá công bố gói Free0đ,10 calls/day; gói Business10USD/month có tính năng webhook và tuyên bố không giới hạn số lượt. Chưa xác minh vận hành hoặc điều kiện chi tiết.

Tài liệu công khai có mẫu request JSON question chứa biển số, header Client-Id/Client-Secret, phản hồi trafficViolations và isSuccess. Tài liệu dùng URL HTTP cho endpoint nên phải xác minh HTTPS thực tế trước khi gửi credentials. Công cụ đọc web chưa truy cập được URL HTTPS endpoint. Chưa xác minh dữ liệu đầu vào loại xe, dữ liệu nguồn và độ mới.

Nguồn:
- https://api.wayfindy.com/
- https://api.wayfindy.com/Home/Docs

## Hướng áp dụng

Nếu giữ yêu cầu nguồn chính chủ trực tiếp, tiếp tục luồng CSGT đã quan sát: VNeTraffic mức2 + reCAPTCHAv3; chưa có đường public API đơn giản hơn được xác nhận.

Nếu người dùng chấp nhận nguồn trung gian, API có tài liệu là ứng viên thử nghiệm tốt hơn scraping. Cần sample response thật cho trường hợp có/không có vi phạm, lỗi/quota, đối chiếu nguồn chính thức cùng xe, kiểm tra timestamp/độ trễ, HTTPS và khả năng sử dụng key riêng trên extension. Không nhúng secret dùng chung cho nhiều người vào gói extension. Kết quả có thể lưu cục bộ, nhưng biển số vẫn được gửi nhà cung cấp khi tra cứu; đây là thay đổi yêu cầu riêng tư/nguồn cần người dùng quyết định trước tích hợp.

Không chọn dịch vụ chỉ vì tên miền có chữ VNeTraffic; tên miền và branding không chứng minh là dịch vụ Bộ Công an.
