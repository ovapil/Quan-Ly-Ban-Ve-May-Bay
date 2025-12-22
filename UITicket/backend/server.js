// ============================================
// BACKEND API - UITicket (FIXED VERSION)
// ============================================
require('dotenv').config();
const nodemailer = require("nodemailer");
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================
// DATABASE CONNECTION
// ============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

// ============================================
// MIDDLEWARE: Verify JWT Token
// ============================================
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Không có token xác thực' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // ✅ Kiểm tra session trong DB + user is_active
    const result = await pool.query(
      `SELECT s.*, u.is_active 
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 
         AND s.expires_at > NOW() 
         AND s.revoked_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
    }

    // ✅ Kiểm tra user có bị khóa không
    if (!result.rows[0].is_active) {
      await pool.query(
        'UPDATE sessions SET revoked_at = NOW() WHERE token = $1',
        [token]
      );
      return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
};

// ============================================
// ADMIN MIDDLEWARE
// ============================================
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
};

// ============================================
// API: ĐĂNG KÝ
// ============================================
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username hoặc Email đã tồn tại' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const role = 'User';

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, role, created_at`,
      [username, email, passwordHash, role]
    );

    res.status(201).json({
      message: 'Đăng ký thành công',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: ĐĂNG NHẬP
// ============================================
app.post('/api/auth/login', async (req, res) => {
  const { username, password, remember } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({ error: 'Thiếu username hoặc password' });
    }

    // ✅ Kiểm tra cả is_active
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    const user = result.rows[0];

    if (!user) {
      await logLoginAttempt(null, false, req, 'User không tồn tại');
      return res.status(401).json({ error: 'Tài khoản không tồn tại' });
    }

    // ✅ Kiểm tra tài khoản có bị khóa không
    if (!user.is_active) {
      await logLoginAttempt(user.id, false, req, 'Tài khoản bị khóa');
      return res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ Admin.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      await logLoginAttempt(user.id, false, req, 'Sai mật khẩu');
      return res.status(401).json({ error: 'Mật khẩu không đúng' });
    }

    const expiresIn = remember ? '30d' : '1d';
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn }
    );

    const expiresAt = new Date(Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at) 
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, token, req.ip, req.headers['user-agent'], expiresAt]
    );

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await logLoginAttempt(user.id, true, req, null);

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        avatar_url: user.avatar_url
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: KIỂM TRA SESSION (Verify Token)
// ============================================
app.get('/api/auth/verify', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, full_name, avatar_url, is_active FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }

    const user = result.rows[0];

    // ✅ Double check is_active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: ĐĂNG XUẤT
// ============================================
app.post('/api/auth/logout', verifyToken, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  try {
    await pool.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE token = $1 AND revoked_at IS NULL',
      [token]
    );
    res.json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: SEND RESET PASSWORD REQUEST
// ============================================
// Endpoint: POST /api/auth/reset-request
// Body: { username, email, message? }
// Chức năng: Tạo yêu cầu reset mật khẩu (chờ duyệt từ Admin)
app.post('/api/auth/reset-request', async (req, res) => {
  let { username, email, message } = req.body || {};

  try {
    if (!username || !email) {
      return res.status(400).json({ error: 'Thiếu username hoặc email' });
    }

    username = String(username).trim();
    email = String(email).trim().toLowerCase();
    message = String(message || '').trim();

    console.log('🔍 Reset request:', { username, email, message });

    // Kiểm tra user tồn tại và email khớp (email phải lowercase)
    const user = await pool.query(
      `SELECT id FROM users WHERE LOWER(username)=LOWER($1) AND LOWER(email)=LOWER($2)`,
      [username, email]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Username hoặc Email không khớp' });
    }

    const userId = user.rows[0].id;

    // Kiểm tra có reset request pending chưa
    const existing = await pool.query(
      `SELECT id FROM reset_requests WHERE user_id=$1 AND status='pending'`,
      [userId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bạn đã có một yêu cầu reset đang chờ xử lý' });
    }

    // Tạo reset request
    const result = await pool.query(
      `INSERT INTO reset_requests (user_id, email, message, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, user_id, created_at`,
      [userId, email, message || null]
    );

    console.log(`✅ Reset request created for user ${username}`);

    res.status(201).json({
      message: 'Yêu cầu reset mật khẩu đã được gửi tới Admin. Vui lòng chờ phê duyệt.',
      requestId: result.rows[0].id
    });

  } catch (e) {
    console.error('POST /api/auth/reset-request error:', e);
    res.status(500).json({ error: 'Lỗi server', details: e.message });
  }
});

// ============================================
// HELPER: Log Login Attempts
// ============================================
async function logLoginAttempt(userId, success, req, failedReason) {
  try {
    await pool.query(
      `INSERT INTO login_logs (user_id, success, ip_address, user_agent, failed_reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, success, req.ip, req.headers['user-agent'], failedReason]
    );
  } catch (error) {
    console.error('Error logging login attempt:', error);
  }
}

// ============================================
// HELPER: Generate Temp Password
// ============================================
function generateTempPassword() {
  return "UiT@" + Math.random().toString(36).slice(2, 8) + "9";
}

// ============================================
// MAILER SETUP
// ============================================
let mailer = null;

if (process.env.MAIL_USER && process.env.MAIL_PASS) {
  console.log('📧 Initializing mailer with:', {
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    user: process.env.MAIL_USER,
    secure: process.env.MAIL_SECURE
  });

  try {
    mailer = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT) || 465,
      secure: process.env.MAIL_SECURE === 'true' || true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });
    console.log('✅ Mailer initialized successfully');
  } catch (error) {
    console.error('❌ Mailer init error:', error);
    mailer = null;
  }
} else {
  console.warn('⚠️ MAIL_USER hoặc MAIL_PASS chưa cấu hình');
}

async function sendMail(to, subject, html) {
  if (!mailer) {
    console.log("⚠️ Mailer chưa cấu hình → skip sendMail()");
    return false;
  }
  try {
    console.log(`📧 Sending mail to ${to}...`);
    const result = await mailer.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject,
      html,
    });
    console.log(`✅ Mail sent: ${result.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Send mail error to ${to}:`, error.message);
    return false;
  }
}

async function getAdminEmailsFromDB() {
  try {
    const r = await pool.query(
      `SELECT email FROM users WHERE role = 'Admin' AND is_active = true AND email IS NOT NULL`
    );
    const emails = r.rows.map(x => x.email);
    console.log(`✅ Found ${emails.length} admin emails`);
    return emails;
  } catch (error) {
    console.error('❌ getAdminEmailsFromDB error:', error);
    return [];
  }
}

// ============================================
// ADMIN: CREATE STAFF (GỬI MAIL CHO STAFF)
// ============================================
app.post("/api/admin/staff", verifyToken, requireAdmin, async (req, res) => {
  let { username, email, full_name, role, password } = req.body || {};

  try {
    if (!username || !email) {
      return res.status(400).json({ error: "Thiếu username hoặc email" });
    }

    username = String(username).trim();
    email = String(email).trim().toLowerCase();
    full_name = String(full_name || "").trim();
    role = String(role || "Staff").trim();

    if (!["Staff", "Agent"].includes(role)) {
      return res.status(400).json({ error: "Role chỉ được là Staff hoặc Agent" });
    }

    const exist = await pool.query(
      "SELECT id FROM users WHERE username=$1",
      [username]
    );
    
    if (exist.rows.length > 0) {
      return res.status(409).json({ error: "Username đã tồn tại" });
    }

    const rawPassword = String(password || "").trim() || generateTempPassword();
    if (rawPassword.length < 6) {
      return res.status(400).json({ error: "Mật khẩu phải >= 6 ký tự" });
    }

    const passwordHash = await bcrypt.hash(rawPassword, SALT_ROUNDS);

    const created = await pool.query(
      `INSERT INTO users (username, email, full_name, role, password_hash, is_active)
       VALUES ($1,$2,$3,$4,$5,true)
       RETURNING id, username, email, full_name, role, is_active, created_at`,
      [username, email, full_name || null, role, passwordHash]
    );

    console.log(`✅ Staff created: ${username} (${email})`);
    console.log(`📧 Mailer status: ${mailer ? '✅ READY' : '❌ NOT CONFIGURED'}`);

    let mailSent = false;
    let mailError = null;

    if (mailer) {
      try {
        const sent = await sendMail(
          email,
          "[UITicket] Tài khoản nhân viên đã được tạo",
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2E4AA8;">🎉 Tài khoản nhân viên UITicket</h2>
            <p>Chào <b>${full_name || username}</b>,</p>
            <p>Tài khoản nhân viên của bạn đã được tạo thành công bởi Admin.</p>
            
            <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2E4AA8;">
              <p><strong>👤 Username:</strong> <code style="background:#fff; padding:4px 8px; border-radius:4px;">${username}</code></p>
              <p><strong>🔐 Mật khẩu tạm:</strong> <code style="background:#fff; padding:4px 8px; border-radius:4px;">${rawPassword}</code></p>
              <p><strong>📧 Email:</strong> <code style="background:#fff; padding:4px 8px; border-radius:4px;">${email}</code></p>
              <p><strong>👔 Vai trò:</strong> <code style="background:#fff; padding:4px 8px; border-radius:4px;">${role}</code></p>
            </div>
            
            <p style="color: #ef4444; font-weight: bold;">⚠️ Vui lòng đăng nhập ngay và đổi mật khẩu!</p>
            <p>Nếu không thay đổi mật khẩu trong 24h, tài khoản sẽ bị khoá tạm thời.</p>
            
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;"/>
            <p style="color: #64748b; font-size: 12px;">
              Email tự động từ hệ thống UITicket. Vui lòng không reply email này.
            </p>
          </div>`
        );
        mailSent = sent;
      } catch (error) {
        console.error(`❌ Mail send failed: ${error.message}`);
        mailError = error.message;
        mailSent = false;
      }
    } else {
      console.warn("⚠️ Mailer not configured - email not sent");
      mailSent = false;
    }

    return res.status(201).json({
      message: "Đã tạo nhân viên",
      user: created.rows[0],
      mailSent,
      ...(mailError && { mailError }),
      ...(mailer ? {} : { note: "Mailer not configured - password shown below instead of email" }),
      ...(mailer ? {} : { tempPassword: rawPassword })
    });

  } catch (e) {
    console.error("POST /api/admin/staff error:", e);
    res.status(500).json({ error: "Lỗi server", details: e.message });
  }
});

// ============================================
// ADMIN: APPROVE RESET REQUEST (GỬI MAIL CHO STAFF)
// ============================================
app.post('/api/admin/reset-requests/:id/approve', verifyToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const rr = await client.query(
      `SELECT rr.id, rr.user_id, u.email, u.username, u.full_name
       FROM reset_requests rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.id = $1 AND rr.status='pending'
       FOR UPDATE`,
      [id]
    );
    
    if (rr.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Request không tồn tại hoặc đã xử lý" });
    }

    const staff = rr.rows[0];
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    await client.query(
      `UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`,
      [passwordHash, staff.user_id]
    );
    
    await client.query(
      `UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`,
      [staff.user_id]
    );

    await client.query(
      `UPDATE reset_requests
       SET status='approved', resolved_at=NOW(), resolved_by=$1
       WHERE id=$2`,
      [req.user.id, id]
    );

    await client.query("COMMIT");

    let mailSent = false;
    if (mailer) {
      try {
        mailSent = await sendMail(
          staff.email,
          "[UITicket] Yêu cầu reset mật khẩu đã được duyệt",
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2E4AA8;">✅ Yêu cầu reset mật khẩu đã được duyệt</h2>
            <p>Chào <b>${staff.full_name || staff.username}</b>,</p>
            <p>Admin đã duyệt yêu cầu reset mật khẩu của bạn.</p>
            
            <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2E4AA8;">
              <p><strong>🔐 Mật khẩu tạm:</strong> <code style="background:#fff; padding:4px 8px; border-radius:4px;">${tempPassword}</code></p>
            </div>
            
            <p><strong>Các bước tiếp theo:</strong></p>
            <ol>
              <li>Đăng nhập lại với mật khẩu tạm ở trên</li>
              <li>Đổi mật khẩu mới của bạn (tối thiểu 6 ký tự)</li>
            </ol>
            
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;"/>
            <p style="color: #64748b; font-size: 12px;">
              Email tự động từ hệ thống UITicket. Vui lòng không reply email này.
            </p>
          </div>`
        );
      } catch (error) {
        console.error(`❌ Mail send error:`, error.message);
        mailSent = false;
      }
    }

    res.json({ 
      message: "Đã duyệt và gửi mật khẩu tạm cho Staff",
      mailSent,
      staff: staff.username
    });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("approve error:", e);
    res.status(500).json({ error: "Lỗi server" });
  } finally {
    client.release();
  }
});

// ============================================
// ADMIN: REJECT RESET REQUEST (GỬI MAIL CHO STAFF)
// ============================================
app.post('/api/admin/reset-requests/:id/reject', verifyToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  let { reason } = req.body;

  console.log('📝 Reject request received:', { 
    id, 
    reason, 
    reasonType: typeof reason,
    body: req.body 
  });

  try {
    if (reason === null || reason === undefined || reason === '') {
      reason = null;
    } else {
      reason = String(reason).trim();
      if (reason === '') reason = null;
    }

    console.log('✅ Normalized reason:', reason);

    const rr = await pool.query(
      `SELECT rr.id, rr.user_id, u.email, u.username, u.full_name
       FROM reset_requests rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.id = $1 AND rr.status='pending'`,
      [id]
    );

    if (rr.rows.length === 0) {
      return res.status(404).json({ error: "Request không tồn tại hoặc đã xử lý" });
    }

    const staff = rr.rows[0];
    console.log('✅ Found staff:', staff.username);

    const updateResult = await pool.query(
      `UPDATE reset_requests
       SET status='rejected', resolved_at=NOW(), resolved_by=$1, reject_reason=$2
       WHERE id=$3
       RETURNING id, status, reject_reason`,
      [req.user.id, reason, id]
    );

    console.log('✅ Update result:', updateResult.rows[0]);

    let mailSent = false;
    if (mailer) {
      try {
        mailSent = await sendMail(
          staff.email,
          "[UITicket] ❌ Yêu cầu reset mật khẩu bị từ chối",
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">❌ Yêu cầu reset mật khẩu bị từ chối</h2>
            <p>Chào <b>${staff.full_name || staff.username}</b>,</p>
            <p>Admin đã từ chối yêu cầu reset mật khẩu của bạn.</p>
            ${reason ? `
              <div style="background: #fef2f2; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 16px 0;">
                <strong>📋 Lý do từ chối:</strong><br/>
                <p style="margin: 8px 0 0 0; color: #7f1d1d;">${reason}</p>
              </div>
            ` : '<p style="color: #666;">Admin không cung cấp lý do cụ thể.</p>'}
            <p>Vui lòng liên hệ Admin qua email hoặc nội bộ nếu cần hỗ trợ thêm.</p>
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;"/>
            <p style="color: #64748b; font-size: 12px;">
              Email tự động từ hệ thống UITicket. Vui lòng không reply email này.
            </p>
          </div>`
        );
      } catch (mailError) {
        console.error('⚠️ Send mail error:', mailError.message);
        mailSent = false;
      }
    }

    res.json({ 
      message: "Đã từ chối request",
      reason: reason || "(không có lý do)",
      staff: staff.username,
      mailSent
    });

  } catch (e) {
    console.error("❌ Reject error:", e);
    console.error("❌ Stack trace:", e.stack);
    
    res.status(500).json({ 
      error: "Lỗi server khi từ chối request", 
      details: process.env.NODE_ENV === 'development' ? e.message : undefined 
    });
  }
});

// ============================================
// ADMIN: RESET STAFF PASSWORD (GỬI MAIL CHO STAFF)
// ============================================
// Endpoint: POST /api/admin/staff/:id/reset-password
// Chức năng: Reset mật khẩu nhân viên → tạo mật khẩu tạm → revoke sessions → gửi mail
app.post("/api/admin/staff/:id/reset-password", verifyToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  try {
    // Lấy thông tin staff
    const u = await pool.query(
      `SELECT id, email, username, role, full_name FROM users WHERE id=$1`,
      [id]
    );
    
    if (u.rows.length === 0) {
      return res.status(404).json({ error: "User không tồn tại" });
    }
    
    if (!["Staff", "Agent"].includes(u.rows[0].role)) {
      return res.status(400).json({ error: "Chỉ áp dụng cho Staff/Agent" });
    }

    // Tạo mật khẩu tạm
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    // Cập nhật password trong database
    await pool.query(
      `UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`,
      [passwordHash, id]
    );
    
    // Revoke tất cả sessions cũ
    await pool.query(
      `UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`,
      [id]
    );

    // Gửi email
    let mailSent = false;
    if (mailer) {
      try {
        mailSent = await sendMail(
          u.rows[0].email,
          "[UITicket] 🔐 Mật khẩu của bạn đã được reset",
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2E4AA8;">🔐 Mật khẩu được reset</h2>
            <p>Chào <b>${u.rows[0].full_name || u.rows[0].username}</b>,</p>
            <p>Admin đã reset mật khẩu tài khoản của bạn.</p>
            
            <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2E4AA8;">
              <p><strong>🔐 Mật khẩu tạm của bạn:</strong></p>
              <p style="font-size: 18px; font-weight: bold; font-family: monospace; background: white; padding: 12px; border-radius: 4px; word-break: break-all;">${tempPassword}</p>
              <p style="color: #666; margin-top: 8px; font-size: 13px;">Sao chép mật khẩu trên để đăng nhập.</p>
            </div>
            
            <p style="color: #ef4444; font-weight: bold;">⚠️ <strong>Hành động cần thiết:</strong></p>
            <ol style="color: #333; line-height: 1.8;">
              <li><strong>Đăng xuất</strong> khỏi tất cả các thiết bị khác</li>
              <li><strong>Đăng nhập lại</strong> với mật khẩu tạm ở trên</li>
              <li><strong>Đổi mật khẩu</strong> ngay trong <strong>Cài đặt → Đổi mật khẩu</strong></li>
            </ol>
            
            <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; font-size: 13px; color: #92400e;">💡 <strong>Lưu ý:</strong> Mật khẩu tạm này sẽ hết hạn sau 24 giờ nếu không được thay đổi.</p>
            </div>
            
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;"/>
            <p style="color: #64748b; font-size: 12px;">
              Email tự động từ hệ thống UITicket. Vui lòng không reply email này.
            </p>
          </div>`
        );
      } catch (error) {
        console.error(`❌ Mail send error:`, error.message);
        mailSent = false;
      }
    }

    res.json({ 
      message: "Đã reset mật khẩu cho Staff",
      mailSent,
      staff: u.rows[0].username
    });
  } catch (e) {
    console.error("POST /admin/staff/:id/reset-password error:", e);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ============================================
// ADMIN: GET STAFF LIST
// ============================================
app.get("/api/admin/staff", verifyToken, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        u.id, u.username, u.email, u.full_name, u.avatar_url, u.role, u.is_active,
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.user_id = u.id
            AND s.expires_at > NOW()
            AND s.revoked_at IS NULL
        ) AS online,
        (SELECT MAX(s2.created_at) FROM sessions s2 WHERE s2.user_id=u.id) AS last_session_login,
        (SELECT MAX(s3.revoked_at) FROM sessions s3 WHERE s3.user_id=u.id) AS last_logout
      FROM users u
      WHERE u.role IN ('Staff','Agent')
      ORDER BY u.is_active DESC, u.username ASC
    `);

    res.json({ items: r.rows });
  } catch (e) {
    console.error("GET /admin/staff error:", e);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ============================================
// ADMIN: GET RESET REQUESTS COUNT
// ============================================
app.get('/api/admin/reset-requests/count', verifyToken, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count FROM reset_requests WHERE status='pending'`
    );
    res.json({ count: r.rows[0].count });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// ADMIN: GET RESET REQUESTS LIST
// ============================================
app.get('/api/admin/reset-requests', verifyToken, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rr.id, rr.user_id, u.username, u.email, rr.message, rr.created_at
       FROM reset_requests rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.status='pending'
       ORDER BY rr.created_at DESC`
    );
    res.json({ items: r.rows });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// ADMIN: DELETE STAFF
// ============================================
app.delete("/api/admin/staff/:id", verifyToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();

  try {
    const u = await client.query(
      `SELECT id, role FROM users WHERE id=$1`,
      [id]
    );
    
    if (u.rows.length === 0) {
      return res.status(404).json({ error: "User không tồn tại" });
    }
    
    if (!u.rows[0].role || !["Staff", "Agent"].includes(u.rows[0].role)) {
      return res.status(400).json({ error: "Chỉ xóa Staff/Agent" });
    }

    await client.query("BEGIN");

    // 1️⃣ Xóa tất cả reset requests của user này
    await client.query(
      `DELETE FROM reset_requests WHERE user_id=$1`,
      [id]
    );
    console.log(`✅ Deleted reset_requests for user ${id}`);

    // 2️⃣ Xóa tất cả sessions của user này
    await client.query(
      `DELETE FROM sessions WHERE user_id=$1`,
      [id]
    );
    console.log(`✅ Deleted sessions for user ${id}`);

    // 3️⃣ Xóa tất cả login logs của user này
    await client.query(
      `DELETE FROM login_logs WHERE user_id=$1`,
      [id]
    );
    console.log(`✅ Deleted login_logs for user ${id}`);

    // 4️⃣ Cuối cùng xóa user
    await client.query(
      `DELETE FROM users WHERE id=$1`,
      [id]
    );
    console.log(`✅ Deleted user ${id}`);

    await client.query("COMMIT");
    res.json({ message: "Đã xóa nhân viên thành công" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("DELETE /admin/staff/:id error:", e);
    res.status(500).json({ error: "Lỗi server: " + e.message });
  } finally {
    client.release();
  }
});

// ============================================
// ADMIN: TOGGLE STAFF ACTIVE
// ============================================
app.patch("/api/admin/staff/:id/active", verifyToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { is_active } = req.body;

  try {
    const u = await pool.query(`SELECT id, role FROM users WHERE id=$1`, [id]);
    
    if (u.rows.length === 0) {
      return res.status(404).json({ error: "User không tồn tại" });
    }
    
    if (!["Staff", "Agent"].includes(u.rows[0].role)) {
      return res.status(400).json({ error: "Chỉ áp dụng cho Staff/Agent" });
    }

    await pool.query(
      `UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2`,
      [!!is_active, id]
    );

    if (!is_active) {
      await pool.query(
        `UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`,
        [id]
      );
    }

    res.json({ message: "OK" });
  } catch (e) {
    console.error("PATCH /admin/staff/:id/active error:", e);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ============================================
// USER: CHANGE PASSWORD
// ============================================
app.post("/api/user/change-password", verifyToken, async (req, res) => {
  const userId = req.user.id;
  let { currentPassword, newPassword } = req.body || {};

  try {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
    }

    currentPassword = String(currentPassword).trim();
    newPassword = String(newPassword).trim();

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    // Lấy mật khẩu hiện tại từ DB
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Kiểm tra mật khẩu hiện tại
    const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Mật khẩu hiện tại không chính xác' });
    }

    // Hash mật khẩu mới
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Cập nhật password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );

    // Revoke tất cả sessions cũ
    await pool.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );

    res.json({ message: '✅ Thay đổi mật khẩu thành công. Vui lòng đăng nhập lại.' });

  } catch (error) {
    console.error('POST /api/user/change-password error:', error);
    res.status(500).json({ error: 'Lỗi server', details: error.message });
  }
});

// ============================================
// USER: CHANGE AVATAR
// ============================================
app.post("/api/user/change-avatar", verifyToken, async (req, res) => {
  const userId = req.user.id;
  let { avatar_url } = req.body || {};

  try {
    if (!avatar_url) {
      return res.status(400).json({ error: 'Vui lòng nhập URL ảnh' });
    }

    avatar_url = String(avatar_url).trim();

    // Kiểm tra URL hợp lệ (hỗ trợ http://, https://, hoặc data URL)
    const isValidUrl = avatar_url.startsWith('http://') || 
                       avatar_url.startsWith('https://') || 
                       avatar_url.startsWith('data:image/');
    
    if (!isValidUrl) {
      return res.status(400).json({ error: 'URL ảnh phải là http://, https://, hoặc ảnh được tải lên' });
    }

    // Cập nhật avatar_url
    const result = await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, avatar_url',
      [avatar_url, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    res.json({ 
      message: '✅ Cập nhật ảnh đại diện thành công',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('POST /api/user/change-avatar error:', error);
    res.status(500).json({ error: 'Lỗi server', details: error.message });
  }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});