# UITicket - Hệ thống quản lý bán vé máy bay

UITicket là một ứng dụng web hỗ trợ quản lý bán vé máy bay cho phòng vé/đại lý, bao gồm các chức năng từ nhận lịch chuyến bay, đặt vé, bán vé, quản lý hành khách đến lập báo cáo doanh thu. Dự án được xây dựng với giao diện web tĩnh (HTML/CSS/JS) và backend Node.js/Express kết nối PostgreSQL.

## 1. Tính năng chính

- **Xác thực & phân quyền**
  - Đăng nhập bằng tài khoản Staff/Admin, lưu phiên bằng JWT.
  - Kiểm tra phiên tự động, khóa tài khoản, đăng xuất, kiểm tra token.
  - Yêu cầu reset mật khẩu, quản trị viên phê duyệt và gửi mật khẩu tạm qua email.
- **Quản lý người dùng (Admin)**
  - Tạo tài khoản Staff/Admin, đặt lại mật khẩu, khóa/mở khóa tài khoản.
  - Ghi log đăng nhập, quản lý phiên (sessions) của người dùng.
- **Quản lý sân bay & tham số hệ thống**
  - Danh sách sân bay: mã sân bay, tên sân bay, thành phố, quốc gia.
  - Tham số hệ thống: số sân bay trung gian tối đa, thời gian dừng tối thiểu/tối đa, thời gian đặt vé chậm nhất, thời gian bay tối thiểu,…
- **Nhận lịch chuyến bay (schedule.html / schedule.js)**
  - Tự sinh mã chuyến bay kế tiếp từ backend.
  - Chọn sân bay đi/đến, nhập ngày giờ khởi hành, thời gian bay.
  - Khai báo hạng vé, số lượng ghế cho từng hạng.
  - Khai báo các sân bay trung gian (thời gian dừng, ghi chú) và kiểm tra theo tham số hệ thống.
  - Gửi dữ liệu lên backend để tạo chuyến bay mới.
- **Đặt vé (booking.html / booking.js)**
  - Lọc chuyến bay theo sân bay đi/đến, ngày bay, mã chuyến.
  - Kiểm tra số ghế trống theo từng hạng, chọn chuyến bay.
  - Nhập thông tin hành khách (họ tên, CMND/CCCD, số điện thoại) với kiểm tra định dạng.
  - Tạo phiếu đặt chỗ dựa trên hạn đặt vé, quy định số ngày tối thiểu trước giờ bay.
- **Bán vé (sell.html / sell.js)**
  - Tìm chuyến bay còn chỗ theo nhiều tiêu chí.
  - Bán vé theo từng hạng (Hạng 1/Hạng 2) với quy định về đơn giá (ví dụ: Hạng 1 = 105% đơn giá).
  - Kiểm tra số ghế trống theo hạng, số ghế đã bán/đã đặt.
  - Kiểm tra thông tin hành khách (CMND/CCCD, số điện thoại), chỉ hiện lỗi khi bấm "Bán vé".
  - Danh sách vé đã bán, gồm: mã vé, mã chuyến bay, hành khách, CMND, SĐT, hạng vé, giá vé, thời điểm bán.
- **Tra cứu chuyến bay / vé (lookup.html / lookup.js)**
  - Tra cứu thông tin chuyến bay, vé/phiếu đặt theo nhiều tiêu chí (mã chuyến, hành khách, số CMND/CCCD,…).
- **Quản lý hành khách (passenger.html / passenger.js)**
  - Gom thông tin hành khách từ giao dịch vé và bảng vé.
  - Thống kê theo hành khách: số vé, trạng thái (paid/booked/cancelled/expired), tổng tiền đã chi.
  - Lọc, tìm kiếm, sắp xếp, phân trang danh sách hành khách.
  - Xem lịch sử giao dịch chi tiết của từng hành khách.
- **Lập báo cáo doanh thu (report.html / report.js)**
  - Báo cáo theo **tháng** (nhóm theo chuyến bay) hoặc **năm** (nhóm theo tháng).
  - Doanh thu chỉ tính từ vé đã bán (bảng VE), không cộng tiền phiếu đặt.
  - Vẽ biểu đồ đường doanh thu đơn giản bằng canvas (không dùng thư viện ngoài).
  - Lọc trạng thái (paid/all), tìm kiếm nhanh, xuất/ìn báo cáo (ở mức giao diện).
- **Dashboard (dashboard.html / dashboard.js)**
  - Màn hình tổng quan sau khi đăng nhập: điều hướng nhanh đến các chức năng: nhận lịch, đặt vé, bán vé, tra cứu, hành khách, báo cáo, cài đặt.
  - Badge thông báo cho Admin về các yêu cầu reset mật khẩu đang chờ.
- **Cài đặt tài khoản / hệ thống (account.html, settings.html, settings.js)**
  - Cập nhật thông tin cá nhân, avatar,…
  - Thay đổi các tham số hệ thống (nếu có quyền phù hợp).

## 2. Kiến trúc thư mục

Cấu trúc chính (đã lược bớt chi tiết):

- UITicket/
  - index.html — Trang đăng nhập/forgot password.
  - dashboard.html — Trang dashboard sau đăng nhập.
  - booking.html — Quản lý đặt vé.
  - sell.html — Bán vé.
  - schedule.html — Nhận lịch chuyến bay.
  - lookup.html — Tra cứu chuyến bay/vé.
  - passenger.html — Quản lý hành khách.
  - report.html — Lập báo cáo doanh thu.
  - account.html — Thông tin tài khoản người dùng.
  - settings.html — Cài đặt/tham số hệ thống.
  - assets/
    - images/ — Logo, icon, hình minh họa.
  - css/
    - common.css — Style chung (layout, button, toast, modal,…).
    - auth.css — Giao diện đăng nhập/quên mật khẩu.
    - dashboard.css, booking.css, sell.css, schedule.css, lookup.css, passenger.css, report.css, settings.css — Style cho từng module.
  - js/
    - auth.js — Xử lý đăng nhập, quên mật khẩu (gọi API backend, lưu token).
    - dashboard.js — Kiểm tra phiên, hiển thị dashboard, quản lý thông báo Admin, modal reset mật khẩu, quản lý staff.
    - booking.js — Đặt vé (chọn chuyến, nhập hành khách, tạo phiếu đặt).
    - sell.js — Bán vé, kiểm tra ghế, map hạng vé, xử lý bán vé.
    - schedule.js — Nhận lịch chuyến bay, tham số, sân bay trung gian.
    - lookup.js — Tra cứu chuyến bay/vé.
    - passenger.js — Quản lý hành khách, thống kê, lọc/sắp xếp, chi tiết giao dịch.
    - report.js — Lập báo cáo doanh thu tháng/năm, vẽ biểu đồ.
    - settings.js — Cài đặt hệ thống, tham số, cấu hình phụ.
    - storage.js — Các helper lưu trữ localStorage (nếu được sử dụng).
  - backend/
    - package.json — Thông tin gói backend, scripts chạy server.
    - server.js — Toàn bộ API backend (Express, JWT, PostgreSQL, Nodemailer,…).
    - nodemon.json — Cấu hình nodemon cho chế độ dev.

## 3. Công nghệ sử dụng

- **Frontend**
  - HTML5, CSS3 (flex/grid, hiệu ứng glass, toast, modal,…).
  - JavaScript thuần (không dùng framework), gọi API bằng `fetch`.
- **Backend**
  - Node.js + Express (REST API).
  - PostgreSQL (thông qua `pg.Pool`).
  - Xác thực JWT (`jsonwebtoken`), mã hóa mật khẩu (`bcrypt`).
  - Gửi email qua `nodemailer` (SMTP, Gmail hoặc SMTP khác tuỳ cấu hình).
  - CORS, body parser JSON, quản lý phiên bằng bảng `sessions`.
- **Thư viện npm (chính)**
  - `express`, `pg`, `cors`, `dotenv`, `bcrypt`, `jsonwebtoken`, `nodemailer`, `nodemon` (dev).

## 4. Chuẩn bị môi trường

1. **Cài đặt Node.js** (LTS) và PostgreSQL trên máy.
2. Tạo cơ sở dữ liệu PostgreSQL tương ứng, import schema/data theo script của bạn (bảng `users`, `sessions`, `login_logs`, `reset_requests`, `san_bay`, `chuyen_bay`, `ve`, `giao_dich_ve`, `tham_so`, `hang_ve`,…).
3. Trong thư mục `backend/`, tạo file `.env` với các biến cơ bản:

   ```env
   DATABASE_URL=postgres://user:password@host:port/dbname
   JWT_SECRET=chuoi-bi-mat-it-nhat-32-ky-tu

   # cấu hình mail (tùy chọn nhưng nên có nếu dùng reset mật khẩu)
   MAIL_HOST=smtp.gmail.com
   MAIL_PORT=465
   MAIL_SECURE=true
   MAIL_USER=your_email@gmail.com
   MAIL_PASS=app_password_hoac_smtp_pass
   MAIL_FROM="UITicket <your_email@gmail.com>"
   ```

   Lưu ý: trong mã có log `DATABASE_URL set`, `JWT_SECRET set` để kiểm tra nhanh.

## 5. Cài đặt & chạy backend

Từ thư mục gốc dự án, di chuyển vào `backend/` và cài đặt phụ thuộc:

```bash
cd backend
npm install
```

Chạy server ở chế độ development (nodemon):

```bash
npm run dev
```

Hoặc chạy bình thường:

```bash
npm start
```

Mặc định server Express sẽ lắng nghe trên port được cấu hình trong `server.js` (thường là `3000`), ví dụ: `http://localhost:3000/api`.

## 6. Chạy frontend

Frontend là các file HTML tĩnh trong thư mục UITicket. Có thể chạy theo các cách:

- Mở trực tiếp `index.html` bằng trình duyệt (double click) **hoặc**
- Dùng một HTTP server tĩnh (khuyến nghị để tránh lỗi CORS/file protocol), ví dụ:
  - Sử dụng tiện ích **Live Server** của VS Code.
  - Hoặc một server tĩnh bất kỳ (serve, http-server, Nginx,…).

Khi backend chạy tại `http://localhost:3000`, các file JS (auth.js, booking.js, sell.js, schedule.js, v.v.) sẽ gọi API dưới prefix `/api` (ví dụ: `/api/auth/login`, `/api/airports`, `/api/chuyen-bay`, `/api/tickets`, `/api/reports/*`,…).

## 7. Tài khoản mẫu & phân quyền

Tùy vào dữ liệu bạn import, cần có ít nhất:

- **Tài khoản Admin**: để tạo Staff, duyệt yêu cầu reset mật khẩu, cấu hình tham số.
- **Tài khoản Staff**: để thực hiện các nghiệp vụ đặt vé, bán vé, xem báo cáo, quản lý hành khách (theo quyền được backend kiểm soát).

Nếu chưa có, hãy tự chèn dữ liệu ban đầu vào bảng `users` (mật khẩu cần được hash bằng `bcrypt`).

## 8. Ghi chú triển khai / tuỳ chỉnh

- Nên bật SSL cho kết nối PostgreSQL nếu triển khai lên server thực (trong `new Pool({ ssl: { rejectUnauthorized: false } })` đã hỗ trợ cấu hình cơ bản).
- Cần bảo vệ kỹ `JWT_SECRET` và thông tin SMTP trong `.env`, không commit lên Git.
- Khi triển khai production, có thể:
  - Chạy backend dưới process manager (PM2, Docker, systemd,…).
  - Trỏ domain/tên miền, reverse proxy (Nginx) đến port backend.
  - Build một static hosting cho thư mục frontend hoặc serve static qua Express (nếu muốn gom một server).

---

README này mô tả tổng quan kiến trúc, tính năng và cách chạy project UITicket. Bạn có thể chỉnh sửa/viết thêm phần mô tả nghiệp vụ chi tiết hoặc hướng dẫn cài đặt database cho phù hợp với tài liệu môn học/đồ án của mình.