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
    console.error('❌ Verify error:', error);
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
// ADMIN: AIRPORT MANAGEMENT
// ============================================
app.get('/api/admin/airports', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT ma_san_bay, ten_san_bay, thanh_pho, quoc_gia FROM san_bay ORDER BY ma_san_bay'
    );
    res.json({ airports: result.rows });
  } catch (error) {
    console.error('GET /api/admin/airports error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.post('/api/admin/airports', verifyToken, requireAdmin, async (req, res) => {
  let { code, name, city, country } = req.body || {};

  try {
    code = String(code || '').trim().toUpperCase();
    name = String(name || '').trim();
    city = String(city || '').trim();
    country = String(country || '').trim();

    if (!code || !name) {
      return res.status(400).json({ error: 'Mã sân bay & tên sân bay là bắt buộc' });
    }

    const existing = await pool.query(
      'SELECT ma_san_bay FROM san_bay WHERE ma_san_bay = $1',
      [code]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Sân bay này đã tồn tại' });
    }

    const result = await pool.query(
      `INSERT INTO san_bay (ma_san_bay, ten_san_bay, thanh_pho, quoc_gia)
       VALUES ($1, $2, $3, $4)
       RETURNING ma_san_bay, ten_san_bay, thanh_pho, quoc_gia`,
      [code, name, city, country]
    );

    res.status(201).json({
      message: 'Thêm sân bay thành công',
      airport: result.rows[0]
    });
  } catch (error) {
    console.error('POST /api/admin/airports error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.delete('/api/admin/airports/:code', verifyToken, requireAdmin, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();

  try {
    const result = await pool.query(
      'DELETE FROM san_bay WHERE ma_san_bay = $1 RETURNING ma_san_bay',
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sân bay không tồn tại' });
    }

    res.json({ message: 'Đã xóa sân bay' });
  } catch (error) {
    console.error('DELETE /api/admin/airports/:code error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// ADMIN: CLASS MANAGEMENT (HẠNG VÉ)
// ============================================
app.get('/api/admin/classes', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT ma_hang_ve, ten_hang_ve, ti_le_gia FROM hang_ve ORDER BY ma_hang_ve'
    );
    res.json({ classes: result.rows });
  } catch (error) {
    console.error('GET /api/admin/classes error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.post('/api/admin/classes', verifyToken, requireAdmin, async (req, res) => {
  let { code, name, ratio } = req.body || {};

  try {
    code = String(code || '').trim().toUpperCase();
    name = String(name || '').trim();
    ratio = parseFloat(ratio);

    if (!code || !name || isNaN(ratio)) {
      return res.status(400).json({ error: 'Mã hạng vé, tên & tỷ lệ giá là bắt buộc' });
    }

    const existing = await pool.query(
      'SELECT ma_hang_ve FROM hang_ve WHERE ma_hang_ve = $1',
      [code]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Hạng vé này đã tồn tại' });
    }

    const result = await pool.query(
      `INSERT INTO hang_ve (ma_hang_ve, ten_hang_ve, ti_le_gia)
       VALUES ($1, $2, $3)
       RETURNING ma_hang_ve, ten_hang_ve, ti_le_gia`,
      [code, name, ratio]
    );

    res.status(201).json({
      message: 'Thêm hạng vé thành công',
      class: result.rows[0]
    });
  } catch (error) {
    console.error('POST /api/admin/classes error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.delete('/api/admin/classes/:code', verifyToken, requireAdmin, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();

  try {
    const result = await pool.query(
      'DELETE FROM hang_ve WHERE ma_hang_ve = $1 RETURNING ma_hang_ve',
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hạng vé không tồn tại' });
    }

    res.json({ message: 'Đã xóa hạng vé' });
  } catch (error) {
    console.error('DELETE /api/admin/classes/:code error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// ADMIN: PARAMETER MANAGEMENT (THAM SỐ)
// ============================================
app.get('/api/admin/parameters', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT ten_tham_so, gia_tri, mo_ta FROM tham_so ORDER BY ten_tham_so'
    );
    res.json({ parameters: result.rows });
  } catch (error) {
    console.error('GET /api/admin/parameters error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.post('/api/admin/parameters', verifyToken, requireAdmin, async (req, res) => {
  let { name, value, desc } = req.body || {};

  try {
    name = String(name || '').trim();
    value = String(value || '').trim();
    desc = String(desc || '').trim();

    if (!name || !value) {
      return res.status(400).json({ error: 'Tên tham số & giá trị là bắt buộc' });
    }

    const existing = await pool.query(
      'SELECT ten_tham_so FROM tham_so WHERE ten_tham_so = $1',
      [name]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Tham số này đã tồn tại' });
    }

    const result = await pool.query(
      `INSERT INTO tham_so (ten_tham_so, gia_tri, mo_ta)
       VALUES ($1, $2, $3)
       RETURNING ten_tham_so, gia_tri, mo_ta`,
      [name, value, desc || null]
    );

    res.status(201).json({
      message: 'Thêm tham số thành công',
      parameter: result.rows[0]
    });
  } catch (error) {
    console.error('POST /api/admin/parameters error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.delete('/api/admin/parameters/:name', verifyToken, requireAdmin, async (req, res) => {
  const name = String(req.params.name).trim();

  try {
    const result = await pool.query(
      'DELETE FROM tham_so WHERE ten_tham_so = $1 RETURNING ten_tham_so',
      [name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tham số không tồn tại' });
    }

    res.json({ message: 'Đã xóa tham số' });
  } catch (error) {
    console.error('DELETE /api/admin/parameters/:name error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: LẤY DANH SÁCH SÂN BAY (cho tất cả user)
// ============================================
app.get('/api/airports', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT ma_san_bay, ten_san_bay FROM san_bay ORDER BY ten_san_bay'
    );
    res.json({ airports: result.rows });
  } catch (error) {
    console.error('Get airports error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: LẤY DANH SÁCH HẠNG VÉ (cho tất cả user)
// ============================================
app.get('/api/hang-ve', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT ma_hang_ve, ten_hang_ve, ti_le_gia FROM hang_ve ORDER BY ti_le_gia'
    );
    res.json({ hangVe: result.rows });
  } catch (error) {
    console.error('Get hang ve error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: LẤY THAM SỐ HỆ THỐNG (cho tất cả user)
// ============================================
app.get('/api/tham-so', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tham_so');
    
    const thamSo = {};
    result.rows.forEach(row => {
      thamSo[row.ten_tham_so] = row.gia_tri;
    });
    
    res.json({ thamSo });
  } catch (error) {
    console.error('Get tham so error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: NHẬN LỊCH CHUYẾN BAY (FIXED VERSION)
// ============================================
app.post('/api/chuyen-bay', verifyToken, async (req, res) => {
  const {
    ma_chuyen_bay,
    san_bay_di,
    san_bay_den,
    gia_ve,
    ngay_gio_bay,
    thoi_gian_bay,
    hang_ve,
    san_bay_trung_gian
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ========== BƯỚC 1: LẤY THAM SỐ HỆ THỐNG ==========
    const thamSoResult = await client.query('SELECT * FROM tham_so');
    const thamSo = {};
    thamSoResult.rows.forEach(row => {
      thamSo[row.ten_tham_so] = parseInt(row.gia_tri);
    });

    console.log('📋 Tham số hệ thống:', thamSo);

    // ========== BƯỚC 2: VALIDATE DỮ LIỆU ==========
    
    // Validate thông tin cơ bản
    if (!ma_chuyen_bay || !san_bay_di || !san_bay_den || !gia_ve || !ngay_gio_bay || !thoi_gian_bay) {
      throw new Error('Thiếu thông tin chuyến bay bắt buộc');
    }

    // Validate thời gian bay
    if (thoi_gian_bay < thamSo.thoi_gian_bay_toi_thieu) {
      throw new Error(`Thời gian bay tối thiểu là ${thamSo.thoi_gian_bay_toi_thieu} phút`);
    }

    // Validate số sân bay trung gian
    if (san_bay_trung_gian && san_bay_trung_gian.length > thamSo.so_san_bay_trung_gian_toi_da) {
      throw new Error(`Số sân bay trung gian tối đa là ${thamSo.so_san_bay_trung_gian_toi_da}`);
    }

    // Validate thời gian dừng
    if (san_bay_trung_gian && san_bay_trung_gian.length > 0) {
      for (const sb of san_bay_trung_gian) {
        if (sb.thoi_gian_dung < thamSo.thoi_gian_dung_toi_thieu || 
            sb.thoi_gian_dung > thamSo.thoi_gian_dung_toi_da) {
          throw new Error(`Thời gian dừng phải từ ${thamSo.thoi_gian_dung_toi_thieu} đến ${thamSo.thoi_gian_dung_toi_da} phút`);
        }
      }
    }

    // Validate số lượng ghế
    if (!hang_ve || hang_ve.length === 0) {
      throw new Error('Phải nhập số lượng ghế cho ít nhất 1 hạng vé');
    }

    for (const hv of hang_ve) {
      if (!hv.so_luong_ghe || hv.so_luong_ghe <= 0) {
        throw new Error('Số lượng ghế phải lớn hơn 0');
      }
    }

    // ========== BƯỚC 3: KIỂM TRA MÃ CHUYẾN BAY ĐÃ TỒN TẠI ==========
    const existingFlight = await client.query(
      'SELECT ma_chuyen_bay FROM chuyen_bay WHERE ma_chuyen_bay = $1',
      [ma_chuyen_bay]
    );

    if (existingFlight.rows.length > 0) {
      throw new Error('Mã chuyến bay đã tồn tại');
    }

    // ========== BƯỚC 4: LƯU CHUYẾN BAY ==========
    await client.query(
      `INSERT INTO chuyen_bay 
       (ma_chuyen_bay, san_bay_di, san_bay_den, gia_ve, ngay_gio_bay, thoi_gian_bay, trang_thai)
       VALUES ($1, $2, $3, $4, $5, $6, 1)`,
      [ma_chuyen_bay, san_bay_di, san_bay_den, gia_ve, ngay_gio_bay, thoi_gian_bay]
    );

    console.log(`✅ Đã lưu chuyến bay: ${ma_chuyen_bay}`);

    // ========== BƯỚC 5: LƯU HẠNG VÉ ==========
    for (const hv of hang_ve) {
      await client.query(
        `INSERT INTO chuyen_bay_hang_ve (ma_chuyen_bay, ma_hang_ve, so_luong_ghe)
         VALUES ($1, $2, $3)`,
        [ma_chuyen_bay, hv.ma_hang_ve, hv.so_luong_ghe]
      );
      console.log(`✅ Đã lưu ghế hạng ${hv.ma_hang_ve}: ${hv.so_luong_ghe} ghế`);
    }

    // ========== BƯỚC 6: LƯU SÂN BAY TRUNG GIAN ==========
    if (san_bay_trung_gian && san_bay_trung_gian.length > 0) {
      for (let i = 0; i < san_bay_trung_gian.length; i++) {
        const sb = san_bay_trung_gian[i];
        await client.query(
          `INSERT INTO chi_tiet_san_bay_trung_gian 
           (ma_chuyen_bay, ma_san_bay, thu_tu_dung, thoi_gian_dung, ghi_chu)
           VALUES ($1, $2, $3, $4, $5)`,
          [ma_chuyen_bay, sb.ma_san_bay, i + 1, sb.thoi_gian_dung, sb.ghi_chu || '']
        );
        console.log(`✅ Đã lưu sân bay trung gian: ${sb.ma_san_bay}`);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: '✅ Đã lưu lịch chuyến bay thành công',
      ma_chuyen_bay,
      summary: {
        hang_ve: hang_ve.length,
        san_bay_trung_gian: san_bay_trung_gian ? san_bay_trung_gian.length : 0
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Create flight error:', error);
    res.status(400).json({ error: error.message || 'Lỗi tạo chuyến bay' });
  } finally {
    client.release();
  }
});

// ============================================
// API: LẤY MÃ CHUYẾN BAY TIẾP THEO TỰ ĐỘNG
// ============================================
app.get('/api/next-flight-code', verifyToken, async (req, res) => {
  try {
    // Lấy mã chuyến bay lớn nhất hiện tại
    const result = await pool.query(
      `SELECT ma_chuyen_bay FROM chuyen_bay 
       WHERE ma_chuyen_bay LIKE 'VN%' 
       ORDER BY ma_chuyen_bay DESC 
       LIMIT 1`
    );

    let nextCode = 'VN000001'; // Mã mặc định nếu chưa có chuyến bay nào

    if (result.rows.length > 0) {
      const lastCode = result.rows[0].ma_chuyen_bay;
      const lastNumber = parseInt(lastCode.substring(2)); // Lấy số sau VN
      const nextNumber = lastNumber + 1;
      nextCode = 'VN' + String(nextNumber).padStart(6, '0'); // Định dạng VN000001, VN000002, ...
    }

    res.json({ nextFlightCode: nextCode });
  } catch (error) {
    console.error('Get next flight code error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ============================================
// API: LẤY DANH SÁCH CHUYẾN BAY
// ============================================
// ============================================
// API: LẤY DANH SÁCH CHUYẾN BAY (kèm ghế trống/đặt + filter)
// Query: ?from=SGN&to=HAN&date=2025-12-31&onlyAvailable=1
// ============================================
app.get('/api/chuyen-bay', verifyToken, async (req, res) => {
  try {
    const { from, to, date, onlyAvailable } = req.query;

    const params = [];
    let where = `WHERE cb.trang_thai = 1 AND cb.ngay_gio_bay >= NOW()`;

    if (from) { params.push(from); where += ` AND cb.san_bay_di = $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND cb.san_bay_den = $${params.length}`; }
    if (date) { params.push(date); where += ` AND cb.ngay_gio_bay::date = $${params.length}::date`; }

    const having = (onlyAvailable === "1" || onlyAvailable === "true")
      ? `HAVING COALESCE(SUM(chv.so_luong_ghe - chv.so_ghe_da_ban), 0) > 0`
      : ``;

    const sql = `
      SELECT
        cb.ma_chuyen_bay,
        cb.gia_ve,
        cb.ngay_gio_bay,
        cb.thoi_gian_bay,
        cb.san_bay_di  AS ma_san_bay_di,
        cb.san_bay_den AS ma_san_bay_den,
        sb_di.ten_san_bay  AS san_bay_di,
        sb_den.ten_san_bay AS san_bay_den,

        COALESCE(SUM(chv.so_luong_ghe), 0) AS tong_ghe,
        COALESCE(SUM(chv.so_ghe_da_ban), 0) AS ghe_da_ban,
        COALESCE(SUM(chv.so_luong_ghe - chv.so_ghe_da_ban), 0) AS ghe_con_lai,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'ma_hang_ve', chv.ma_hang_ve,
              'ten_hang_ve', hv.ten_hang_ve,
              'ti_le_gia', hv.ti_le_gia,
              'so_luong_ghe', COALESCE(chv.so_luong_ghe, 0),
              'da_ban', COALESCE(chv.so_ghe_da_ban, 0),
              'con_lai', (COALESCE(chv.so_luong_ghe, 0) - COALESCE(chv.so_ghe_da_ban, 0))
            )
            ORDER BY hv.ti_le_gia DESC
          ) FILTER (WHERE chv.ma_hang_ve IS NOT NULL),
          '[]'::json
        ) AS hang_ve

      FROM chuyen_bay cb
      JOIN san_bay sb_di ON cb.san_bay_di = sb_di.ma_san_bay
      JOIN san_bay sb_den ON cb.san_bay_den = sb_den.ma_san_bay
      LEFT JOIN chuyen_bay_hang_ve chv ON cb.ma_chuyen_bay = chv.ma_chuyen_bay
      LEFT JOIN hang_ve hv ON hv.ma_hang_ve = chv.ma_hang_ve
      ${where}
      GROUP BY
        cb.ma_chuyen_bay, cb.gia_ve, cb.ngay_gio_bay, cb.thoi_gian_bay,
        cb.san_bay_di, cb.san_bay_den, sb_di.ten_san_bay, sb_den.ten_san_bay
      ${having}
      ORDER BY cb.ngay_gio_bay ASC
    `;

    const result = await pool.query(sql, params);
    
    // Debug: show what the DB returned for flights (helps diagnose missing seat counts)
    console.log('DEBUG /api/chuyen-bay -> SQL:', sql);
    console.log('DEBUG /api/chuyen-bay -> params:', params);
    console.log('DEBUG /api/chuyen-bay -> rows:', JSON.stringify(result.rows, null, 2));
    
    // Thêm debug: check dữ liệu trong chuyen_bay_hang_ve
    if (result.rows.length > 0) {
      const firstFlight = result.rows[0].ma_chuyen_bay;
      const hangVeDebug = await pool.query(
        `SELECT chv.*, hv.ten_hang_ve, hv.ti_le_gia
         FROM chuyen_bay_hang_ve chv
         LEFT JOIN hang_ve hv ON hv.ma_hang_ve = chv.ma_hang_ve
         WHERE chv.ma_chuyen_bay = $1`,
        [firstFlight]
      );
      console.log(`DEBUG: chuyen_bay_hang_ve for ${firstFlight}:`, hangVeDebug.rows);
    }
    
    res.json({ flights: result.rows });
  } catch (error) {
    console.error('Get flights error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});


// ============================================
// SELL TICKET HELPERS
// ============================================
const isValidCMND = (s) => /^(\d{9}|\d{12})$/.test(String(s || "").trim());
const isValidPhone = (s) => /^\d{10}$/.test(String(s || "").trim());

async function loadThamSoInt(client) {
  const r = await client.query("SELECT ten_tham_so, gia_tri FROM tham_so");
  const obj = {};
  for (const row of r.rows) obj[row.ten_tham_so] = parseInt(row.gia_tri, 10);
  return obj;
}

function pickThamSo(thamSo, keys, fallback = 0) {
  for (const k of keys) {
    const v = thamSo?.[k];
    if (Number.isFinite(v)) return v;
  }
  return fallback;
}

async function getFlightWithSeats(client, ma_chuyen_bay) {
  const sql = `
    SELECT
      cb.ma_chuyen_bay,
      cb.gia_ve,
      cb.ngay_gio_bay,
      cb.thoi_gian_bay,
      cb.san_bay_di  AS ma_san_bay_di,
      cb.san_bay_den AS ma_san_bay_den,
      sb_di.ten_san_bay  AS san_bay_di,
      sb_den.ten_san_bay AS san_bay_den,
      cb.trang_thai,

      COALESCE(SUM(chv.so_luong_ghe), 0) AS tong_ghe,
      COALESCE(SUM(chv.so_ghe_da_ban), 0) AS ghe_da_ban,
      COALESCE(SUM(chv.so_luong_ghe - chv.so_ghe_da_ban), 0) AS ghe_con_lai,

      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'ma_hang_ve', chv.ma_hang_ve,
            'ten_hang_ve', hv.ten_hang_ve,
            'ti_le_gia', hv.ti_le_gia,
            'so_luong_ghe', COALESCE(chv.so_luong_ghe, 0),
            'da_ban', COALESCE(chv.so_ghe_da_ban, 0),
            'con_lai', (COALESCE(chv.so_luong_ghe, 0) - COALESCE(chv.so_ghe_da_ban, 0))
          )
          ORDER BY hv.ti_le_gia DESC
        ) FILTER (WHERE chv.ma_hang_ve IS NOT NULL),
        '[]'::json
      ) AS hang_ve
    FROM chuyen_bay cb
    JOIN san_bay sb_di ON cb.san_bay_di = sb_di.ma_san_bay
    JOIN san_bay sb_den ON cb.san_bay_den = sb_den.ma_san_bay
    LEFT JOIN chuyen_bay_hang_ve chv ON cb.ma_chuyen_bay = chv.ma_chuyen_bay
    LEFT JOIN hang_ve hv ON hv.ma_hang_ve = chv.ma_hang_ve
    WHERE cb.ma_chuyen_bay = $1
    GROUP BY
      cb.ma_chuyen_bay, cb.gia_ve, cb.ngay_gio_bay, cb.thoi_gian_bay,
      cb.san_bay_di, cb.san_bay_den, sb_di.ten_san_bay, sb_den.ten_san_bay, cb.trang_thai
  `;
  const r = await client.query(sql, [ma_chuyen_bay]);
  return r.rows[0] || null;
}
// ============================================
// API: BÁN VÉ (trừ ghế + lưu vé)
// Body: { ma_chuyen_bay, ma_hang_ve, ho_ten, cmnd, sdt }
// ============================================
app.post('/api/ban-ve', verifyToken, async (req, res) => {
  const { ma_chuyen_bay, ma_hang_ve, ho_ten, cmnd, sdt } = req.body || {};

  // validate nhanh
  if (!ma_chuyen_bay || !ma_hang_ve || !ho_ten || !cmnd || !sdt) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  }
  if (!isValidCMND(cmnd)) return res.status(400).json({ error: 'CMND/CCCD phải 9 hoặc 12 số' });
  if (!isValidPhone(sdt)) return res.status(400).json({ error: 'SĐT phải đúng 10 số' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) check chuyến bay tồn tại + còn hạn bán vé
    const flightBase = await client.query(
      `SELECT ma_chuyen_bay, ngay_gio_bay, gia_ve, trang_thai
       FROM chuyen_bay
       WHERE ma_chuyen_bay = $1
       FOR SHARE`,
      [ma_chuyen_bay]
    );
    if (flightBase.rowCount === 0 || flightBase.rows[0].trang_thai !== 1) {
      throw new Error('Chuyến bay không tồn tại hoặc đã khóa');
    }

    const flightTime = new Date(flightBase.rows[0].ngay_gio_bay);
    const now = new Date();
    if (flightTime <= now) throw new Error('Chuyến bay đã qua giờ bay');

    const thamSo = await loadThamSoInt(client);
    const cutoffDays = pickThamSo(thamSo, ['ThoiGianDatVeChamNhat', 'thoi_gian_dat_ve_cham_nhat'], 0);
    if (cutoffDays > 0) {
      const latestSell = new Date(flightTime);
      latestSell.setDate(latestSell.getDate() - cutoffDays);
      if (now > latestSell) {
        throw new Error(`Đã quá hạn bán vé (phải trước ${cutoffDays} ngày so với giờ bay)`);
      }
    }

    // 2) lock ghế theo hạng để chống bán trùng
    const seatRow = await client.query(
      `SELECT so_luong_ghe, so_ghe_da_ban
       FROM chuyen_bay_hang_ve
       WHERE ma_chuyen_bay = $1 AND ma_hang_ve = $2
       FOR UPDATE`,
      [ma_chuyen_bay, ma_hang_ve]
    );
    if (seatRow.rowCount === 0) throw new Error('Chuyến bay không có hạng vé này');

    const total = Number(seatRow.rows[0].so_luong_ghe);
    const sold  = Number(seatRow.rows[0].so_ghe_da_ban);
    if (sold >= total) throw new Error('Hạng vé đã hết chỗ');

    // 3) upsert hành khách theo CMND
    const paxRes = await client.query(
      `INSERT INTO hanh_khach (ho_ten, cmnd, sdt)
       VALUES ($1, $2, $3)
       ON CONFLICT (cmnd)
       DO UPDATE SET ho_ten = EXCLUDED.ho_ten, sdt = EXCLUDED.sdt
       RETURNING id, ho_ten, cmnd, sdt`,
      [String(ho_ten).trim(), String(cmnd).trim(), String(sdt).trim()]
    );
    const pax = paxRes.rows[0];

    // 4) tính giá vé theo tỷ lệ hạng vé
    const priceRes = await client.query(
      `SELECT cb.gia_ve AS gia_co_ban, hv.ti_le_gia
       FROM chuyen_bay cb
       JOIN hang_ve hv ON hv.ma_hang_ve = $2
       WHERE cb.ma_chuyen_bay = $1`,
      [ma_chuyen_bay, ma_hang_ve]
    );
    if (priceRes.rowCount === 0) throw new Error('Không tính được giá vé');

    const base = Number(priceRes.rows[0].gia_co_ban);
    const ratio = Number(priceRes.rows[0].ti_le_gia);
    const finalPrice = Math.round(base * ratio);

    // 5) insert vé
    const ins = await client.query(
      `INSERT INTO ve (ma_chuyen_bay, ma_hang_ve, hanh_khach_id, gia_ve, nguoi_ban)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ma_chuyen_bay, ma_hang_ve, gia_ve, created_at`,
      [ma_chuyen_bay, ma_hang_ve, pax.id, finalPrice, req.user?.id ?? null]
    );

    // 6) tăng ghế đã bán
    await client.query(
      `UPDATE chuyen_bay_hang_ve
       SET so_ghe_da_ban = so_ghe_da_ban + 1
       WHERE ma_chuyen_bay = $1 AND ma_hang_ve = $2`,
      [ma_chuyen_bay, ma_hang_ve]
    );

    // 7) lấy lại flight mới nhất để FE update ngay
    const updatedFlight = await getFlightWithSeats(client, ma_chuyen_bay);

    await client.query('COMMIT');

    const ticket = ins.rows[0];
    const ma_ve = 'VE' + String(ticket.id).padStart(8, '0');

    res.status(201).json({
      message: 'Bán vé thành công',
      ticket: {
        ...ticket,
        ma_ve,
        hanh_khach: pax
      },
      flight: updatedFlight
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sell ticket error:', error);
    res.status(400).json({ error: error.message || 'Lỗi bán vé' });
  } finally {
    client.release();
  }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});