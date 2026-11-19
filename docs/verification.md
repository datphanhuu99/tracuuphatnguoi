> Báo cáo lịch sử bản 0.1.0. Kết quả mới nhất của bản 0.2.1: [VNeTraffic verification](vnetraffic-0.2.1.md).

# Báo cáo kiểm chứng — 29/10/2026

## Kết luận

Bản nền tảng cục bộ có mã nguồn và hướng dẫn cài thử. Các kiểm thử nghiệp vụ và tích hợp API giả lập đạt; chưa nghiệm thu được toàn bộ yêu cầu. Bộ kết nối tự tra cứu CSGT chưa được triển khai vì chưa kiểm chứng được nguồn. Chrome thật không khởi động trong sandbox của phiên này. Không có bằng chứng extension ổn định trên Chrome và không có kết quả tra cứu phương tiện thật.

## Kiểm tra đã chạy trên bản hiện tại

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| `rtk npm test` | PASS: 35 test theo Node runner, 0 fail, 0 skipped | ../artifacts/unit-test.log |
| `rtk npm run test:coverage` | PASS: 100% lines, 92.56% branches, 94.67% functions | ../artifacts/coverage.log |
| `rtk npm run check` | PASS: manifest, resource paths, 17 JavaScript syntax checks, HTML/CSP/source-safety checks | ../artifacts/static-check.log |
| `rtk npm run test:chrome` | FAIL ở bước khởi động Chrome; chưa nạp extension | ../artifacts/chrome-report.json |
| Code review độc lập và kiểm lại các sửa lỗi | APPROVE cho phần nền tảng cục bộ; không còn finding mở | code-review.md |
| Tra cứu thật từ CSGT | NOT TESTED; nguồn chưa truy cập được, chưa có adapter thật | research-source.md |

Coverage chỉ đo năm mô-đun domain.js, scheduler.js, controller.js, storage.js, source.js. Con số không bao gồm UI, service worker chạy trong trình duyệt hay bộ test CDP. Source.js là bộ kết nối chưa sẵn sàng và có test bảo đảm nó không trả thành công giả; coverage của nó không chứng minh đã tích hợp website.

Ứng dụng dùng JavaScript ES modules chạy trực tiếp, không có bước bundle/build hoặc TypeScript. Check dùng vm.SourceTextModule để kiểm tra cú pháp mà không chạy các module Chrome; không thay thế kiểm tra hành vi UI hay lint toàn diện.

## Những hành vi đã kiểm chứng bằng Node

- Chuẩn hóa biển số, chống trùng xe, thêm/sửa/xóa và dữ liệu trả về không lộ tham chiếu mutable.
- Hai giờ theo giờ máy, lượt kiểm tra bù, tạm dừng, tránh kiểm tra lặp khi có yêu cầu đồng thời.
- Giữ kết quả cũ khi lỗi, phân biệt nguồn chưa sẵn sàng và kết quả thành công, giới hạn lịch sử.
- Thông báo thay đổi không lặp; lỗi notification không làm mất kết quả; tổng hợp mỗi ngày.
- Background với Chrome API giả lập: kiểm tra sender, giữ alarm qua đọc trạng thái, pause/resume, phục hồi module từ kho cũ.
- Dữ liệu lưu lỗi có thể xuất nguyên trạng; reset phải được yêu cầu rõ ràng và tạo trạng thái tạm dừng.
- Transport CDP: chia chunk, tiếng Việt UTF-8, lỗi giao thức, crash và timeout.

Các mẫu thành công trong test chỉ thuộc dependency injection ở controller tests. Ứng dụng phát hành không chứa endpoint giả hoặc runtime message để chèn kết quả test.

## Giới hạn Chrome thật

Lệnh test đã gọi Chrome 150 bằng profile tạm và CDP pipe. Chrome dừng với:

```text
FATAL:content/browser/sandbox_host_linux.cc:41
Check failed: . shutdown: Operation not permitted (1)
```

Harness trả exit code 1 và ghi FAIL, không chuyển sang mock. Chưa chạy được các ca UI, screenshot, thông báo hệ điều hành, alarm thật hoặc khởi động lại service worker thật. Test khởi động lại module trong Node là kiểm thử tích hợp giả lập riêng biệt.

Đã có `rtk npm run test:chrome:repeat` để chạy ba profile độc lập khi môi trường cho phép Chrome. Script này chưa đạt và các selector/luồng browser cần được xác nhận thực tế. Chạy lặp lại cùng lỗi sandbox không cung cấp thêm bằng chứng độ ổn định nên không coi đó là kiểm thử hồi quy thành công.

## Công việc còn lại

1. Chạy harness ở môi trường cho phép Chrome khởi động và sửa các lỗi UI/browser nếu có.
2. Xác minh trực tiếp luồng tra cứu CSGT/VNeTraffic, CAPTCHA, thời hạn phiên và cách truy cập phù hợp.
3. Triển khai adapter từ bằng chứng thực tế, gồm tiếp tục sau xác thực, timeout và nhận diện kết quả.
4. Kiểm chứng tra cứu thật với phương tiện được người dùng cho phép; chạy lại cả bộ test và ba lượt Chrome độc lập trước khi báo ổn định.

Không yêu cầu nâng quyền hoặc gửi dữ liệu/tài khoản người dùng ra ngoài. Không sửa ECC hoặc extension BiSplit ở thư mục test/.

## Cập nhật sau khi người dùng cung cấp HTML

Đã đọc output.html và phat-nguoi.html trong thư mục cha. File thứ hai xác định form POST, field names, yêu cầu VNeTraffic mức2, reCAPTCHA v3, các nhánh needVneAuth/resultHtml và thông tin quota. Đây là bằng chứng cấu trúc giao diện, chưa phải phản hồi tra cứu thành công; #result hiện trống.

Đã sửa liên kết mở nguồn chính thức sang https://csgt.bocongan.gov.vn/tra-cuu-phat-nguoi theo form quan sát được. Sau sửa, npm test35 PASS và npm run check17 syntax/static checks PASS. Bộ kết nối vẫn unavailable; chưa gửi POST thật hoặc nhận hồ sơ thật. Chi tiết ở source-html-findings.md. Không sao chép CSRF token từ HTML vào mã nguồn, docs hoặc fixture.
