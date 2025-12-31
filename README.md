# ✈️ UITicket – Hệ thống Quản lý Bán vé Máy bay

> **Đồ án thuộc khuôn khổ môn học Nhập môn Công nghệ Phần mềm (SE104.Q13) - Trường Đại học Công nghệ Thông tin (UIT).**

**UITicket** là ứng dụng web toàn diện hỗ trợ phòng vé và đại lý hàng không quản lý quy trình nghiệp vụ: từ nhận lịch bay, đặt chỗ, bán vé, quản lý hành khách cho đến báo cáo doanh thu.

![UITicket Dashboard](https://github.com/user-attachments/assets/859353a1-c793-42e3-88bf-199d7c61e92d)

---

## 👥 Thành viên thực hiện

| STT | Họ và tên | MSSV | Email |
|:---:|:---|:---|:---|
| 1 | **Đoàn Ngọc Minh Châu** | 23520168 | 23520168@gm.uit.edu.vn |
| 2 | **Lê Nhật Trinh Nguyên** | 235201040 | 235201040@gm.uit.edu.vn |
| 3 | **Huỳnh Thị Phương Nghi** | 23521001 | 23521001@gm.uit.edu.vn |

---

## 🗄️ Hướng dẫn kết nối Database (NeonDB)

Để chạy demo nhanh chóng mà không cần cài đặt PostgreSQL local, bạn có thể kết nối trực tiếp đến **NeonDB** thông qua VS Code.

### Các bước thực hiện:

1. **Cài đặt Extension:**  
   Mở VS Code, nhấn `Ctrl + Shift + X`, tìm và cài đặt extension **Database Client** (tác giả *Weijan Chen*).

2. **Mở Database Manager:**  
   Click vào biểu tượng Database ở thanh bên trái VS Code.

3. **Tạo kết nối mới:**
   * **Server Type:** Chọn `PostgreSQL`.
   * **Connection String:** Tick vào tùy chọn *User Connection String*.
   * **Nhập chuỗi kết nối:** Copy và dán đoạn mã sau vào ô input:
   
   ```text
   postgresql://neondb_owner:npg_glAuGK79PJbN@ep-wild-bonus-a1zgno9i-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

4. **Hoàn tất:**  
   Đặt tên kết nối (ví dụ: `VeMayBay`) và nhấn **Save & Connect**.

5. **Kiểm tra:**  
   Sau khi kết nối thành công, chọn database `neondb` để xem danh sách các bảng dữ liệu.

> **Lưu ý:** NeonDB yêu cầu kết nối bảo mật (SSL), chuỗi kết nối trên đã bao gồm tham số `sslmode=require`.

---

## 🚀 Tính năng chính

### 🛡️ Quản trị & Bảo mật
* **Xác thực:** Đăng nhập an toàn với JWT, mã hóa mật khẩu Bcrypt.
* **Phân quyền:** Hệ thống phân quyền rõ ràng cho **Admin** và **Staff**.
* **Quản lý người dùng:** Admin có quyền quản lý tài khoản nhân viên.
* **Cấu hình hệ thống:** Quản lý sân bay, hạng vé và các tham số quy định.

### 🎫 Nghiệp vụ Bán vé
* **Nhận lịch chuyến bay:** Lên lịch bay, sân bay trung gian, thời gian bay.
* **Đặt vé & Bán vé:** Quy trình xử lý vé theo thời gian thực.
* **Tra cứu:** Tìm kiếm chuyến bay và thông tin vé nhanh chóng.
* **Quản lý hành khách:** Lưu trữ và tra cứu thông tin khách hàng.

### 📊 Báo cáo & Tiện ích
* **Dashboard:** Tổng quan tình hình kinh doanh.
* **Báo cáo doanh thu:** Xuất báo cáo chi tiết, trực quan.
* **Email:** Hỗ trợ gửi mail reset mật khẩu (SMTP).

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ / Thư viện |
| :--- | :--- |
| **Frontend** | HTML5, CSS3 (Flex/Grid, Glassmorphism), JavaScript thuần (Fetch API). |
| **Backend** | Node.js, Express.js (REST API). |
| **Database** | PostgreSQL (`pg.Pool`), NeonDB (Cloud). |
| **Security** | JWT (`jsonwebtoken`), Bcrypt, CORS. |
| **Utilities** | Nodemailer (Email), Dotenv (Config). |

---

## ⚙️ Cài đặt & Chạy dự án

### 1. Chuẩn bị môi trường
* Cài đặt **Node.js** (Bản LTS).
* Cài đặt **Live Server Extension** trên VS Code.

### 2. Cấu hình Backend

**Bước 1:** Cài đặt thư viện

Mở thư mục `backend` trong VS Code, click chuột phải chọn **"Open in Integrated Terminal"**, sau đó chạy lệnh:

```bash
npm install
```

**Bước 2:** Cấu hình Email (Tùy chọn)

Mở file `.env` trong thư mục `backend/` và chỉnh sửa thông tin email của bạn:

```env
# Chỉ cần thay đổi 2 dòng sau thành email của bạn
MAIL_USER=your_email@gmail.com        # Email của bạn
MAIL_FROM="UITicket <your_email@gmail.com>"  # Email hiển thị khi gửi
```

> **Lưu ý:** Database đã được cấu hình sẵn trong file `.env`, bạn không cần thay đổi gì thêm.

**Bước 3:** Khởi chạy Server

Tại thư mục `backend`, click chuột phải chọn **"Open in Integrated Terminal"** và chạy:

```bash
node server.js
```

Server sẽ chạy tại: `http://localhost:3000`

### 3. Chạy Frontend

1. Mở file `index.html` (tại thư mục gốc của dự án).
2. Click chuột phải vào file và chọn **"Open with Live Server"**.
3. Trình duyệt sẽ tự động mở ứng dụng.

---

## 👤 Tài khoản Demo

Dữ liệu mẫu đã có sẵn trong Database NeonDB, bạn có thể sử dụng các tài khoản sau (nếu chưa bị thay đổi):

* **Admin:** Quản lý nhân viên, cấu hình tham số.
* **Staff:** Thực hiện nghiệp vụ bán vé, đặt chỗ.

*(Nếu cần reset dữ liệu, vui lòng liên hệ admin hoặc kiểm tra bảng `users` trong database)*

---

## 📝 License

Dự án này được phát triển cho mục đích học tập tại Trường Đại học Công nghệ Thông tin (UIT).

---

## 📧 Liên hệ

Nếu có thắc mắc hoặc góp ý, vui lòng liên hệ qua email của các thành viên nhóm.
