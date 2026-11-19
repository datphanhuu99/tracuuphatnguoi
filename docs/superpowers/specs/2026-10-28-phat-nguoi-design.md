# Thiết kế extension tra cứu phạt nguội

## Mục tiêu và phạm vi đã thống nhất

Extension Chrome tự lên lịch tra cứu phương tiện hai lần mỗi ngày, lưu thông tin trên máy và nhắc người dùng hằng ngày. Người dùng chấp nhận đăng nhập hoặc hoàn tất xác thực trên trang chính thức khi được yêu cầu. Nguồn dự kiến là website Cục CSGT. Không có máy chủ trung gian hoặc đồng bộ dữ liệu lên đám mây.

## Luồng sử dụng

1. Người dùng thêm biển số, loại phương tiện và tên gợi nhớ tùy chọn. Hỗ trợ nhiều xe; kiểm tra và chuẩn hóa biển số trước khi lưu, tránh thêm trùng cùng biển số và loại xe.
2. Lịch mặc định là 08:00 và 20:00 theo giờ địa phương của máy; người dùng có thể đổi hai mốc giờ và tạm dừng lịch.
3. Extension thực hiện tra cứu tuần tự khi đến lịch và chỉ cập nhật kết quả khi xác định được phản hồi thành công từ nguồn chính thức.
4. Khi cần đăng nhập hoặc CAPTCHA, ghi trạng thái cần xác thực và gửi thông báo. Chỉ mở trang xác thực khi người dùng bấm thông báo hoặc nút trong extension; sau khi hoàn tất, thử tiếp lượt tra cứu đang chờ.
5. Hiển thị kết quả, nguồn, lần thử gần nhất và lần thành công gần nhất. Cho phép kiểm tra ngay, xem lịch sử, xuất và xóa dữ liệu.

## Thành phần

- Popup: tổng quan phương tiện, tình trạng kiểm tra và nút kiểm tra ngay.
- Trang cài đặt: quản lý xe, lịch, thông báo, xuất JSON và xóa dữ liệu.
- Service worker Manifest V3: điều phối chrome.alarms, hàng đợi tra cứu, lưu trữ và thông báo.
- Bộ kết nối CSGT: tách riêng cách đọc trang và nhận biết trạng thái; dùng content script nếu luồng thực tế cần trang đang đăng nhập. Chỉ cấp quyền cho các tên miền chính thức đã xác minh là cần thiết.
- Kho dữ liệu chrome.storage.local: xe, cài đặt, kết quả gần nhất và lịch sử thay đổi. Không lưu mật khẩu hoặc OTP; phiên đăng nhập do website và trình duyệt quản lý.

## Lập lịch và thông báo

Dùng alarm một lần cho mốc sắp tới rồi tính lại mốc tiếp theo, tránh trôi lịch theo chu kỳ 12 giờ. Kiểm tra và khôi phục lịch khi trình duyệt hoặc worker khởi động; tính lại khi giờ hoặc múi giờ thay đổi. Nếu lỡ nhiều mốc do máy ngủ hoặc Chrome đóng, thực hiện tối đa một lượt kiểm tra bù cho mỗi xe rồi trở về lịch bình thường. Không cam kết chạy đúng giờ khi trình duyệt không hoạt động.

Mỗi lần chỉ chạy một lượt cho mỗi xe; thao tác kiểm tra ngay không tạo lượt trùng với lịch đang chạy. Lượt lỗi mạng được thử lại tối đa hai lần với khoảng chờ tăng dần; khi cần xác thực hoặc bị giới hạn truy cập thì dừng và báo trạng thái, không lặp yêu cầu liên tục.

Báo ngay khi phát hiện vi phạm mới hoặc trạng thái vi phạm thay đổi. Bản tổng hợp hằng ngày mặc định gửi lúc 20:00 sau lượt kiểm tra; nếu đang chờ xác thực thì nêu dữ liệu chưa cập nhật. Người dùng có thể tắt từng nhóm thông báo. Khi quyền thông báo bị tắt, popup vẫn hiển thị tình trạng.

## Dữ liệu và lỗi

Trạng thái lượt tra cứu gồm: chưa kiểm tra, đang kiểm tra, thành công chưa thấy vi phạm, thành công có vi phạm, cần xác thực và lỗi. Lỗi mạng, thay đổi cấu trúc trang hoặc phản hồi không nhận diện được không được diễn giải thành không có vi phạm. Luôn giữ kết quả thành công trước đó, kèm dấu hiệu dữ liệu cũ.

Lưu dữ liệu vi phạm đúng nội dung nguồn cung cấp; không suy đoán mức tiền hoặc kết luận pháp lý. Dùng mã hồ sơ chính thức làm khóa nếu có, nếu không dùng tổ hợp trường ổn định đã kiểm chứng từ nguồn. Một hồ sơ biến mất khỏi kết quả không đồng nghĩa đã nộp phạt. Giữ tối đa 200 sự kiện thay đổi gần nhất cho mỗi xe và cho phép xuất JSON trước khi xóa. Gỡ extension sẽ làm mất kho lưu cục bộ.

Giới hạn quyền đọc kho dữ liệu vào các context tin cậy của extension. Hiển thị nội dung từ nguồn bằng văn bản, không chèn HTML không tin cậy. Không ghi biển số, nội dung hồ sơ hoặc phiên xác thực vào log chẩn đoán mặc định.

## Kiểm chứng kết nối trước khi triển khai đầy đủ

Trang tra cứu trực tiếp chưa truy cập thành công từ môi trường hiện tại. Hướng dẫn Công an Lạng Sơn ngày 31/08/2026 mô tả đăng nhập và xác thực qua VNeTraffic; đây là bằng chứng gián tiếp, chưa thay cho kiểm tra luồng trực tiếp.

Đầu tiên phải xác minh: URL thực tế, luồng xác thực, khả năng tái sử dụng phiên, cấu trúc kết quả và cách truy cập được nguồn hỗ trợ. Không giả định có API công khai. Không tạo hoặc công bố endpoint phỏng đoán. Nếu nguồn không hỗ trợ tra cứu không có người tương tác, báo rõ giới hạn này; không mô tả tính năng nhắc mở trang là tự động tra cứu hoàn chỉnh.

Nguồn tham khảo:
- https://www.csgt.vn/tra-cuu-phuong-tien-vi-pham.html
- https://congan.langson.gov.vn/tin-antt-va-canh-bao-toi-pham/32/canh-bao-mao-danh-canh-sat-giao-thong-goi-dien-bao-phat-nguoi-nham-lua-dao-chiem-doat-tai-san-va/18035.aspx
- https://developer.chrome.com/docs/extensions/reference/api/alarms
- https://developer.chrome.com/docs/extensions/reference/api/storage

## Tiêu chí nghiệm thu

- Thêm, sửa, xóa nhiều xe; dữ liệu còn sau khi khởi động lại Chrome.
- Lịch hai lần mỗi ngày, khôi phục sau khởi động, kiểm tra bù và không chạy trùng.
- Nhận biết chính xác kết quả không có vi phạm, có vi phạm, cần xác thực và lỗi bằng mẫu phản hồi đã xác minh.
- Thông báo vi phạm mới không lặp cho cùng thay đổi; bản tổng hợp phản ánh đúng độ mới của dữ liệu.
- Phiên hết hạn dẫn người dùng đến trang chính thức và có thể tiếp tục sau xác thực.
- Mất mạng hoặc thay đổi trang không xóa kết quả cũ, không báo sai là chưa thấy vi phạm.
- Kiểm thử các hành vi cốt lõi và trải nghiệm trên Chrome thật. Mock chỉ dùng để kiểm thử; nghiệm thu kết nối cần bằng chứng tra cứu thật với phương tiện do người dùng cung cấp.

## Ngoài phạm vi bản đầu

Thanh toán tiền phạt, lưu tài khoản đăng nhập, máy chủ chạy 24/7, gửi SMS/email, đồng bộ nhiều máy và phát hành Chrome Web Store.
