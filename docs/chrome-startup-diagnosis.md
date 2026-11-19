# Chẩn đoán Chrome không khởi động — 29/10/2026

Đã tái hiện lỗi với Chrome chỉ mở about:blank, không nạp extension. Do đó lỗi hiện tại xảy ra trước mã ứng dụng.

Lệnh kiểm tra:

```sh
rtk proxy google-chrome --headless=new --disable-crashpad-for-testing --no-first-run --no-default-browser-check --user-data-dir=/tmp/phat-nguoi-diagnose-chrome --dump-dom about:blank
```

Kết quả exit134/SIGABRT: sandbox_host_linux.cc:41, shutdown: Operation not permitted (1).

Đối chứng bằng Python trong cùng môi trường:

- socket.socketpair(): thành công.
- socket.shutdown(socket.SHUT_RD): PermissionError errno1.
- socket.setsockopt(SOL_SOCKET,SO_PASSCRED,1): PermissionError errno1.
- /proc/self/status: NoNewPrivs1, Seccomp2, Seccomp_filters1.
- DNS getaddrinfo(www.csgt.vn,443): Temporary failure in name resolution.

Bằng chứng cho thấy một số thao tác socket bị chính sách môi trường từ chối. Không phải mọi IPC đều bị cấm: socketpair vẫn hoạt động. Việc sửa JavaScript/manifest không khắc phục được lỗi khởi động này.

Phiên hiện tại không cho phép yêu cầu nâng quyền sandbox. Không sửa chính sách hệ thống hoặc tìm cách vượt sandbox. Đường chạy khả dụng là chạy npm run test:chrome trong terminal/môi trường phát triển được chủ máy cho phép chạy Chrome, hoặc cấu hình quyền của phiên thông qua cơ chế chính thức của ứng dụng chủ nếu được hỗ trợ. Chưa kiểm chứng Chrome ở môi trường khác nên không cam kết kết quả PASS sau khi chuyển môi trường.

Bộ test đã có sẵn trong project, không cần nạp vào profile cá nhân. Chạy từ tracuuphatnguoi:

```sh
rtk npm run test:chrome
rtk npm run test:chrome:repeat
```

Kết nối CSGT chưa triển khai là yêu cầu riêng biệt; khởi động được Chrome chưa đồng nghĩa đã tra cứu tự động được.
