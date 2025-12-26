// ============================================
// BACKEND API - UITicket (FIXED VERSION)
// ============================================
require('dotenv').config({ path: './.env' });
const nodemailer = require("nodemailer");
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);

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
app.get("/api/airports", verifyToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT ma_san_bay, ten_san_bay, thanh_pho, quoc_gia
      FROM san_bay
      ORDER BY thanh_pho NULLS LAST, ten_san_bay
    `);

    // ✅ luôn trả đủ 2 key để FE nào cũng dùng được
    res.json({ 
      airports: r.rows,
      items: r.rows
    });
  } catch (e) {
    console.error("GET /api/airports error:", e);
    res.status(500).json({ error: e.message || "Lỗi server" });
  }
});


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
// FLIGHTS + BOOKINGS API (FINAL - FIX TYPE MISMATCH)
// DÁN KHỐI NÀY NGAY TRƯỚC "START SERVER"
// ============================================

// ====== TÊN BẢNG/CỘT THEO DB CỦA BẠN ======
const CB_TABLE = "chuyen_bay";
const CB_PK = "ma_chuyen_bay";
const CB_FROM = "san_bay_di";
const CB_TO = "san_bay_den";
const CB_DEPART = "ngay_gio_bay";
const CB_DURATION = "thoi_gian_bay";
const CB_BASE_PRICE = "gia_ve";

const CBHV_TABLE = "chuyen_bay_hang_ve";
const CBHV_CB = "ma_chuyen_bay";
const CBHV_HV = "ma_hang_ve";

// ⚠️ Nếu bạn chạy mà báo "column cbhv.tong_ghe does not exist" thì đổi tên cột ghế ở đây
const CBHV_SEATS = "so_luong_ghe";

// QĐ2: hạng 1 = 105%, hạng 2 = base
const CLASS1_MULT = 1.05;

const toInt = (x) => Math.round(Number(x || 0));
const calcPrice = (base, maHangVe) => {
  const b = toInt(base);
  return maHangVe === "BUS" ? toInt(b * 1.05) : b;
};

const uiToDbClass = (uiClass) => {
  const c = String(uiClass || "").trim().toUpperCase();
  if (c === "1") return "BUS";
  if (c === "2") return "ECO";
  if (c === "BUS" || c === "ECO") return c;
  return "ECO";
};

const dbToUiClass = (dbClass) => {
  const c = String(dbClass || "").trim().toUpperCase();
  if (c === "BUS") return "1";
  if (c === "ECO") return "2";
  return c;
};

// ===================================================
// GET /api/flights?from=...&to=...&date=YYYY-MM-DD
// ===================================================
app.get("/api/flights", verifyToken, async (req, res) => {
  try {
    const from = (req.query.from || "").trim();
    const to = (req.query.to || "").trim();
    const date = (req.query.date || "").trim();

    // ✅ Query tính ghế trống dựa trực tiếp vào chuyen_bay_hang_ve
    // (so_luong_ghe - so_ghe_da_ban)
    const q = `
      SELECT
        cb.${CB_PK} AS id,
        cb.${CB_PK} AS flight_code,

        cb.${CB_FROM} AS from_code,
        sbdi.thanh_pho AS from_city,
        sbdi.ten_san_bay AS from_airport,

        cb.${CB_TO} AS to_code,
        sbden.thanh_pho AS to_city,
        sbden.ten_san_bay AS to_airport,

        cb.${CB_DEPART} AS depart_at,
        cb.${CB_DURATION} AS duration_minutes,
        cb.${CB_BASE_PRICE} AS base_price,

        cbhv.${CBHV_HV}::text AS ticket_class,
        GREATEST(
          COALESCE(cbhv.so_luong_ghe, 0) - COALESCE(cbhv.so_ghe_da_ban, 0) - COALESCE(cbhv.so_ghe_da_dat, 0),
          0
        ) AS seats_avail
      FROM ${CB_TABLE} cb
      JOIN san_bay sbdi ON sbdi.ma_san_bay = cb.${CB_FROM}
      JOIN san_bay sbden ON sbden.ma_san_bay = cb.${CB_TO}
      JOIN ${CBHV_TABLE} cbhv
        ON cbhv.${CBHV_CB}::text = cb.${CB_PK}::text
      WHERE ($1 = '' OR cb.${CB_FROM} = $1)
        AND ($2 = '' OR cb.${CB_TO} = $2)
        AND (NULLIF($3,'') IS NULL OR cb.${CB_DEPART}::date = NULLIF($3,'')::date)
      ORDER BY cb.${CB_DEPART} ASC
      LIMIT 200;
    `;

    const r = await pool.query(q, [from, to, date]);

    // ✅ MAP DB (BUS/ECO) -> UI ("1"/"2")
    const dbToUiClass = (dbClass) => {
      const c = String(dbClass || "").toUpperCase().trim();
      if (c === "BUS") return "1"; // Hạng 1
      if (c === "ECO") return "2"; // Hạng 2
      return c; // fallback nếu DB đã là "1"/"2"
    };

    // Gom theo chuyến bay
    const map = new Map();

    for (const row of r.rows) {
      const key = String(row.flight_code);
      let f = map.get(key);

      if (!f) {
        f = {
          id: row.id,
          flight_code: row.flight_code,

          from_code: row.from_code,
          to_code: row.to_code,
          from_city: row.from_city,
          to_city: row.to_city,
          from_airport: row.from_airport,
          to_airport: row.to_airport,

          depart_at: row.depart_at,
          duration_minutes: row.duration_minutes,
          base_price: row.base_price,

          seats_by_class: {},
          seats_total_avail: 0,

          // giữ lại để tương thích UI cũ nếu có
          seats1_avail: 0,
          seats2_avail: 0,
        };
        map.set(key, f);
      }

      // ✅ cls luôn là "1" hoặc "2" cho UI
      const cls = dbToUiClass(row.ticket_class);
      const avail = Number(row.seats_avail || 0);

      f.seats_by_class[cls] = avail;
      f.seats_total_avail += avail;

      if (cls === "1") f.seats1_avail = avail;
      if (cls === "2") f.seats2_avail = avail;
    }

    // đảm bảo luôn có key 1/2 để UI khỏi undefined -> 0
    const items = Array.from(map.values()).map((f) => {
      f.seats_by_class["1"] = f.seats_by_class["1"] ?? 0;
      f.seats_by_class["2"] = f.seats_by_class["2"] ?? 0;
      f.seats1_avail = f.seats_by_class["1"];
      f.seats2_avail = f.seats_by_class["2"];
      return f;
    });

    res.json({ items });
  } catch (e) {
    console.error("GET /api/flights error:", e);
    res.status(500).json({ error: e.message || "Lỗi server" });
  }
});

// ===================================================
// GET /api/bookings?status=active|cancelled&q=...
// ===================================================

// ===================================================
// BOOKING (BM3) API
// ===================================================
// Quy định QĐ3:
// - Chỉ cho đặt vé chậm nhất X ngày trước khi khởi hành (mặc định 1 ngày)
// - Tới ngày khởi hành (hoặc sớm hơn Y ngày tuỳ tham số), tất cả phiếu đang "Đặt chỗ" sẽ bị hủy
//
// Lưu trữ:
// - giao_dich_ve.loai = 'dat_cho'
// - giao_dich_ve.trang_thai: 'Đặt chỗ' | 'Đã hủy' | 'Hết hạn' (Hết hạn = bị hủy tự động theo QĐ3)
// - chuyen_bay_hang_ve.so_ghe_da_dat dùng để giữ chỗ (đã đặt)
// ===================================================

async function autoCancelDatCho(client) {
  // Y = số ngày trước giờ bay sẽ hủy phiếu (mặc định 0 => hủy vào ngày khởi hành)
  const thamSo = await loadThamSoInt(client);
  const cancelDays = pickThamSo(thamSo, ['ThoiGianHuyDatVe', 'thoi_gian_huy_dat_ve'], 0);

  // Hủy các phiếu đặt chỗ tới "ngày hủy" và trả ghế (giảm so_ghe_da_dat)
  // Điều kiện: depart_date <= today + cancelDays
  const sql = `
    WITH to_cancel AS (
      SELECT gdv.id, gdv.ma_chuyen_bay, gdv.ma_hang_ve
      FROM giao_dich_ve gdv
      JOIN chuyen_bay cb
        ON cb.ma_chuyen_bay::text = gdv.ma_chuyen_bay::text
      WHERE gdv.loai = 'dat_cho'
        AND gdv.trang_thai = 'Đặt chỗ'
        AND (cb.ngay_gio_bay AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              <= ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + (($1::INTEGER) * INTERVAL '1 day'))
      FOR UPDATE
    ),
    upd AS (
      UPDATE giao_dich_ve g
      SET trang_thai = 'Hết hạn'
      FROM to_cancel t
      WHERE g.id = t.id
      RETURNING t.ma_chuyen_bay, t.ma_hang_ve
    ),
    agg AS (
      SELECT ma_chuyen_bay, ma_hang_ve, COUNT(*)::int AS cnt
      FROM upd
      GROUP BY 1, 2
    )
    UPDATE chuyen_bay_hang_ve cbhv
    SET so_ghe_da_dat = GREATEST(COALESCE(so_ghe_da_dat,0) - agg.cnt, 0)
    FROM agg
    WHERE cbhv.ma_chuyen_bay::text = agg.ma_chuyen_bay::text
      AND cbhv.ma_hang_ve::text = agg.ma_hang_ve::text;
  `;
  await client.query(sql, [cancelDays]);
}

// ===================================================
// GET /api/bookings?status=active|expired|cancelled&q=...
// ===================================================
app.get("/api/bookings", verifyToken, async (req, res) => {
  const status = String(req.query.status || "active").trim(); // active | expired | cancelled
  const qtxt = String(req.query.q || req.query.keyword || "").trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Auto-cancel phiếu đặt tới ngày hủy (QĐ3)
    await autoCancelDatCho(client);

    // 2) (tuỳ chọn) Auto-expire cho giao dịch bán vé (nếu bạn còn dùng giao_dich_ve cho ban_ve)
    await client.query(`
      UPDATE giao_dich_ve gdv
      SET trang_thai = 'Hết hạn'
      FROM chuyen_bay cb
      WHERE gdv.loai = 'ban_ve'
        AND gdv.trang_thai = 'Đã thanh toán'
        AND gdv.ma_chuyen_bay::text = cb.ma_chuyen_bay::text
        AND cb.ngay_gio_bay < NOW()
    `);

    const statusSql = (() => {
      if (status === "cancelled") return "gdv.trang_thai='Đã hủy'";
      if (status === "expired")   return "gdv.trang_thai='Hết hạn'";
      return "gdv.trang_thai='Đặt chỗ'";
    })();

    const whereQ = qtxt
      ? `AND (
            gdv.ma_phieu ILIKE '%'||$1||'%'
         OR gdv.ma_chuyen_bay ILIKE '%'||$1||'%'
         OR gdv.hanh_khach ILIKE '%'||$1||'%'
         OR gdv.cmnd ILIKE '%'||$1||'%'
         OR gdv.dien_thoai ILIKE '%'||$1||'%'
      )`
      : "";

    const sql = `
      SELECT
        gdv.id,
        gdv.ma_phieu AS booking_code,
        gdv.ma_chuyen_bay AS flight_code,
        gdv.hanh_khach AS passenger_name,
        gdv.cmnd AS cccd,
        gdv.dien_thoai AS phone,
        gdv.ma_hang_ve AS ticket_class,
        gdv.gia_tien AS price,
        gdv.trang_thai AS status,
        gdv.created_at,
        cb.ngay_gio_bay AS depart_at
      FROM giao_dich_ve gdv
      JOIN chuyen_bay cb
        ON cb.ma_chuyen_bay::text = gdv.ma_chuyen_bay::text
      WHERE gdv.loai = 'dat_cho'
        AND ${statusSql}
        ${whereQ}
      ORDER BY gdv.created_at DESC
      LIMIT 200
    `;

    const r = await client.query(sql, qtxt ? [qtxt] : []);
    await client.query("COMMIT");

    res.json({ items: r.rows });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("GET /api/bookings error:", e);
    res.status(500).json({ error: e.message || "Lỗi server" });
  } finally {
    client.release();
  }
});

// ===================================================
// POST /api/bookings
// body: { flightId, passengerName, cccd, phone, ticketClass }
// ===================================================
app.post("/api/bookings", verifyToken, async (req, res) => {
  const { flightId, passengerName, cccd, phone, ticketClass } = req.body || {};
  const maChuyenBay = String(flightId || "").trim();
  const clsText = String(ticketClass || "").trim(); // '1' hoặc '2'

  if (!maChuyenBay) return res.status(400).json({ error: "Thiếu mã chuyến bay" });
  if (!passengerName || !cccd || !phone) return res.status(400).json({ error: "Thiếu thông tin hành khách" });

  const maHangVeDb = uiToDbClass(clsText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // đọc tham số QĐ3
    const thamSo = await loadThamSoInt(client);
    const latestDays = pickThamSo(thamSo, ['ThoiGianDatVeChamNhat', 'thoi_gian_dat_ve_cham_nhat'], 1);

    // 1) flight tồn tại + chưa quá giờ bay + còn hạn đặt vé
    const fr = await client.query(
      `SELECT cb.gia_ve AS base,
              cb.ngay_gio_bay AS depart_at,
              (NOW() < (cb.ngay_gio_bay AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS ok_time,
              (NOW() <= (cb.ngay_gio_bay AT TIME ZONE 'Asia/Ho_Chi_Minh') - (($2::INTEGER) * INTERVAL '1 day')) AS ok_book
       FROM chuyen_bay cb
       WHERE cb.ma_chuyen_bay::text = $1::text
       FOR SHARE`,
      [maChuyenBay, Number(latestDays)]
    );
    if (fr.rowCount === 0) throw new Error("Không tìm thấy chuyến bay");

    if (!fr.rows[0].ok_time) throw new Error("Chuyến bay đã qua giờ bay");
    if (!fr.rows[0].ok_book) throw new Error(`Chỉ cho đặt vé chậm nhất ${latestDays} ngày trước khi khởi hành`);

    const base = Number(fr.rows[0].base || 0);

    // 2) lock ghế theo DB class để chống đặt trùng
    const seatRow = await client.query(
      `SELECT ${CBHV_SEATS} AS total_seats,
              COALESCE(so_ghe_da_ban, 0) AS sold_seats,
              COALESCE(so_ghe_da_dat, 0) AS booked_seats
       FROM ${CBHV_TABLE}
       WHERE ${CBHV_CB}::text=$1::text
         AND ${CBHV_HV}::text=$2::text
       FOR UPDATE`,
      [maChuyenBay, maHangVeDb]
    );

    if (seatRow.rowCount === 0) throw new Error("Chuyến bay không có hạng vé này");

    const total = Number(seatRow.rows[0].total_seats);
    const sold = Number(seatRow.rows[0].sold_seats);
    const booked = Number(seatRow.rows[0].booked_seats);
    const avail = total - sold - booked;

    if (!Number.isFinite(total) || total <= 0) throw new Error(`Số ghế (${CBHV_SEATS}) chưa hợp lệ`);
    if (avail <= 0) throw new Error("Hạng vé đã hết chỗ");

    // 3) tính giá theo tỷ lệ hạng vé
    const ratioRes = await client.query(
      `SELECT ti_le_gia FROM hang_ve WHERE ma_hang_ve = $1`,
      [maHangVeDb]
    );
    const ratio = ratioRes.rowCount ? Number(ratioRes.rows[0].ti_le_gia) : 1;
    const price = Math.round(base * (Number.isFinite(ratio) ? ratio : 1));

    // 4) insert phiếu đặt
    const ins = await client.query(
      `INSERT INTO giao_dich_ve
        (ma_chuyen_bay, ma_hang_ve, hanh_khach, cmnd, dien_thoai, gia_tien, loai, trang_thai, created_by)
       VALUES
        ($1, $2, $3, $4, $5, $6, 'dat_cho', 'Đặt chỗ', $7)
       RETURNING id, created_at`,
      [
        maChuyenBay,
        maHangVeDb,
        String(passengerName).trim(),
        String(cccd).trim(),
        String(phone).trim(),
        price,
        req.user?.id ?? null,
      ]
    );

    const id = ins.rows[0].id;

    // 5) tạo mã phiếu PDxxxx
    const bookingCode = "PD" + String(id).padStart(4, "0");
    await client.query(
      `UPDATE giao_dich_ve SET ma_phieu=$1 WHERE id=$2`,
      [bookingCode, id]
    );

    // 6) tăng ghế đã đặt
    await client.query(
      `UPDATE ${CBHV_TABLE}
       SET so_ghe_da_dat = COALESCE(so_ghe_da_dat,0) + 1
       WHERE ${CBHV_CB}::text=$1::text
         AND ${CBHV_HV}::text=$2::text`,
      [maChuyenBay, maHangVeDb]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Tạo phiếu đặt thành công",
      booking: {
        id,
        booking_code: bookingCode,
        flight_code: maChuyenBay,
        passenger_name: String(passengerName).trim(),
        cccd: String(cccd).trim(),
        phone: String(phone).trim(),
        ticket_class: maHangVeDb,
        price,
        status: "Đặt chỗ",
        created_at: ins.rows[0].created_at,
      },
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("POST /api/bookings error:", e);
    res.status(400).json({ error: e.message || "Lỗi tạo phiếu đặt" });
  } finally {
    client.release();
  }
});

// ===================================================
// POST /api/bookings/:id/cancel
// ===================================================
app.post("/api/bookings/:id/cancel", verifyToken, async (req, res) => {
  const id = req.params.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Lấy thông tin phiếu đặt để biết chuyến bay + hạng vé
    const info = await client.query(
      `SELECT ma_chuyen_bay, ma_hang_ve, loai, trang_thai
       FROM giao_dich_ve
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (info.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Không tìm thấy phiếu đặt" });
    }

    const { ma_chuyen_bay, ma_hang_ve, loai, trang_thai } = info.rows[0];
    if (String(loai || "").trim() !== "dat_cho") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Phiếu này không phải phiếu đặt chỗ" });
    }
    if (String(trang_thai || "").trim() !== "Đặt chỗ") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Chỉ được hủy phiếu đang ở trạng thái Đặt chỗ" });
    }

    // 2) Update trạng thái
    await client.query(
      `UPDATE giao_dich_ve
       SET trang_thai='Đã hủy'
       WHERE id=$1`,
      [id]
    );

    // 3) Trả ghế về DB (giảm ghế đã đặt)
    await client.query(
      `UPDATE chuyen_bay_hang_ve
       SET so_ghe_da_dat = GREATEST(COALESCE(so_ghe_da_dat,0) - 1, 0)
       WHERE ma_chuyen_bay=$1 AND ma_hang_ve=$2`,
      [ma_chuyen_bay, ma_hang_ve]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Cancel booking error:", e);
    res.status(500).json({ error: "Lỗi hủy phiếu" });
  } finally {
    client.release();
  }
});

// ===================================================
// POST /api/bookings/:id/sell
// Convert a "phiếu đặt chỗ" (dat_cho) into a sold ticket (ve)
// - Move 1 seat from so_ghe_da_dat -> so_ghe_da_ban
// - Mark giao_dich_ve.trang_thai = 'Đã bán'
// ===================================================
app.post("/api/bookings/:id/sell", verifyToken, async (req, res) => {
  const id = req.params.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Lock booking row
    const info = await client.query(
      `SELECT id, ma_phieu, ma_chuyen_bay, ma_hang_ve, hanh_khach, cmnd, dien_thoai, gia_tien, loai, trang_thai
       FROM giao_dich_ve
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (info.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Không tìm thấy phiếu đặt" });
    }

    const b = info.rows[0];
    if (String(b.loai || "").trim() !== "dat_cho") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Phiếu này không phải phiếu đặt chỗ" });
    }
    if (String(b.trang_thai || "").trim() !== "Đặt chỗ") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Chỉ được bán vé từ phiếu đang ở trạng thái Đặt chỗ" });
    }

    // 1b) Atomic reserve: set status to 'Đã bán' early to prevent duplicate inserts on retries/double-click.
    // If anything fails later, the transaction rolls back so the status is not permanently changed.
    const reserve = await client.query(
      `UPDATE giao_dich_ve
       SET trang_thai = 'Đã bán'
       WHERE id = $1 AND trang_thai = 'Đặt chỗ'
       RETURNING id`,
      [id]
    );
    if (reserve.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Phiếu đặt đã được bán trước đó" });
    }

    const ma_chuyen_bay = String(b.ma_chuyen_bay || "").trim();
    const ma_hang_ve = String(b.ma_hang_ve || "").trim();
    const ho_ten = String(b.hanh_khach || "").trim();
    const cmnd = String(b.cmnd || "").trim();
    const sdt = String(b.dien_thoai || "").trim();

    if (!ma_chuyen_bay || !ma_hang_ve) throw new Error("Phiếu đặt thiếu thông tin chuyến bay/hạng vé");
    if (!ho_ten || !cmnd || !sdt) throw new Error("Phiếu đặt thiếu thông tin hành khách");
    if (!isValidCMND(cmnd)) throw new Error("CMND/CCCD phải 9 hoặc 12 số");
    if (!isValidPhone(sdt)) throw new Error("SĐT phải đúng 10 số");

    // 2) Check flight still sellable (reuse rules from /api/ban-ve)
    const flightBase = await client.query(
      `SELECT ma_chuyen_bay, ngay_gio_bay, gia_ve, trang_thai
       FROM chuyen_bay
       WHERE ma_chuyen_bay = $1
       FOR SHARE`,
      [ma_chuyen_bay]
    );
    if (flightBase.rowCount === 0 || flightBase.rows[0].trang_thai !== 1) {
      throw new Error("Chuyến bay không tồn tại hoặc đã khóa");
    }

    const flightTime = new Date(flightBase.rows[0].ngay_gio_bay);
    const now = new Date();
    if (flightTime <= now) throw new Error("Chuyến bay đã qua giờ bay");

    const thamSo = await loadThamSoInt(client);
    const cutoffDays = pickThamSo(thamSo, ['ThoiGianDatVeChamNhat', 'thoi_gian_dat_ve_cham_nhat'], 0);
    if (cutoffDays > 0) {
      const latestSell = new Date(flightTime);
      latestSell.setDate(latestSell.getDate() - cutoffDays);
      if (now > latestSell) {
        throw new Error(`Đã quá hạn bán vé (phải trước ${cutoffDays} ngày so với giờ bay)`);
      }
    }

    // 3) Lock seat row, allow conversion even when sold+booked==total
    const seatRow = await client.query(
      `SELECT so_luong_ghe, COALESCE(so_ghe_da_ban,0) AS so_ghe_da_ban, COALESCE(so_ghe_da_dat,0) AS so_ghe_da_dat
       FROM chuyen_bay_hang_ve
       WHERE ma_chuyen_bay = $1 AND ma_hang_ve = $2
       FOR UPDATE`,
      [ma_chuyen_bay, ma_hang_ve]
    );
    if (seatRow.rowCount === 0) throw new Error("Chuyến bay không có hạng vé này");

    const total = Number(seatRow.rows[0].so_luong_ghe);
    const sold = Number(seatRow.rows[0].so_ghe_da_ban);
    const booked = Number(seatRow.rows[0].so_ghe_da_dat);
    if (!Number.isFinite(total) || total <= 0) throw new Error("Số lượng ghế không hợp lệ");
    if (booked <= 0) throw new Error("Phiếu đặt này không còn giữ chỗ để chuyển sang bán vé");
    if (sold + booked > total) throw new Error("Dữ liệu ghế không hợp lệ (vượt quá tổng ghế)");

    // 4) Upsert passenger
    const paxRes = await client.query(
      `INSERT INTO hanh_khach (ho_ten, cmnd, sdt)
       VALUES ($1, $2, $3)
       ON CONFLICT (cmnd)
       DO UPDATE SET ho_ten = EXCLUDED.ho_ten, sdt = EXCLUDED.sdt
       RETURNING id, ho_ten, cmnd, sdt`,
      [ho_ten, cmnd, sdt]
    );
    const pax = paxRes.rows[0];

    // 5) Compute price (keep consistent with /api/ban-ve)
    const priceRes = await client.query(
      `SELECT cb.gia_ve AS gia_co_ban, hv.ti_le_gia
       FROM chuyen_bay cb
       JOIN hang_ve hv ON hv.ma_hang_ve = $2
       WHERE cb.ma_chuyen_bay = $1`,
      [ma_chuyen_bay, ma_hang_ve]
    );
    if (priceRes.rowCount === 0) throw new Error("Không tính được giá vé");

    const base = Number(priceRes.rows[0].gia_co_ban);
    const ratio = Number(priceRes.rows[0].ti_le_gia);
    const finalPrice = Math.round(base * ratio);

    // 6) Insert ticket
    const ins = await client.query(
      `INSERT INTO ve (ma_chuyen_bay, ma_hang_ve, hanh_khach_id, gia_ve, nguoi_ban)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ma_chuyen_bay, ma_hang_ve, gia_ve, created_at`,
      [ma_chuyen_bay, ma_hang_ve, pax.id, finalPrice, req.user?.id ?? null]
    );

    // 7) Move seat: booked -> sold
    await client.query(
      `UPDATE chuyen_bay_hang_ve
       SET so_ghe_da_ban = COALESCE(so_ghe_da_ban,0) + 1,
           so_ghe_da_dat = GREATEST(COALESCE(so_ghe_da_dat,0) - 1, 0)
       WHERE ma_chuyen_bay = $1 AND ma_hang_ve = $2`,
      [ma_chuyen_bay, ma_hang_ve]
    );

    const updatedFlight = await getFlightWithSeats(client, ma_chuyen_bay);
    await client.query("COMMIT");

    const ticket = ins.rows[0];
    const ma_ve = 'VE' + String(ticket.id).padStart(8, '0');

    res.status(201).json({
      message: 'Bán vé từ phiếu đặt thành công',
      ticket: {
        ...ticket,
        ma_ve,
        hanh_khach: pax,
        booking_id: Number(id),
        booking_code: b.ma_phieu || null
      },
      flight: updatedFlight
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Sell-from-booking error:", e);
    res.status(400).json({ error: e.message || "Lỗi bán vé từ phiếu" });
  } finally {
    client.release();
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
    // By default return all flights. Previously this endpoint filtered to active/upcoming only.
    // Provide optional query flags `upcoming=1` and `onlyActive=1` to restore that behavior.
    let where = `WHERE 1=1`;

    if (req.query.upcoming === '1' || req.query.upcoming === 'true') {
      where += ` AND cb.ngay_gio_bay >= NOW()`;
    }

    if (req.query.onlyActive === '1' || req.query.onlyActive === 'true') {
      where += ` AND cb.trang_thai = 1`;
    }

    if (from) { params.push(from); where += ` AND cb.san_bay_di = $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND cb.san_bay_den = $${params.length}`; }
    if (date) { params.push(date); where += ` AND cb.ngay_gio_bay::date = $${params.length}::date`; }

    const having = (onlyAvailable === "1" || onlyAvailable === "true")
      ? `HAVING COALESCE(SUM(chv.so_luong_ghe - chv.so_ghe_da_ban - COALESCE(chv.so_ghe_da_dat,0)), 0) > 0`
      : ``;

    const sql = `
      SELECT
        cb.ma_chuyen_bay,
        cb.gia_ve,
        cb.ngay_gio_bay,
        cb.thoi_gian_bay,
        (cb.ngay_gio_bay < NOW()) AS departed,
        cb.san_bay_di  AS ma_san_bay_di,
        cb.san_bay_den AS ma_san_bay_den,
        sb_di.ten_san_bay  AS san_bay_di,
        sb_den.ten_san_bay AS san_bay_den,

        COALESCE(SUM(chv.so_luong_ghe), 0) AS tong_ghe,
        COALESCE(SUM(chv.so_ghe_da_ban), 0) AS ghe_da_ban,
        COALESCE(SUM(COALESCE(chv.so_ghe_da_dat,0)), 0) AS ghe_da_dat,
        COALESCE(SUM(chv.so_luong_ghe - chv.so_ghe_da_ban - COALESCE(chv.so_ghe_da_dat,0)), 0) AS ghe_con_lai,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'ma_hang_ve', chv.ma_hang_ve,
              'ten_hang_ve', hv.ten_hang_ve,
              'ti_le_gia', hv.ti_le_gia,
              'so_luong_ghe', COALESCE(chv.so_luong_ghe, 0),
              'da_ban', COALESCE(chv.so_ghe_da_ban, 0),
              'da_dat', COALESCE(chv.so_ghe_da_dat, 0),
              'con_lai', (COALESCE(chv.so_luong_ghe, 0) - COALESCE(chv.so_ghe_da_ban, 0) - COALESCE(chv.so_ghe_da_dat,0))
            )
            ORDER BY hv.ti_le_gia DESC
          ) FILTER (WHERE chv.ma_hang_ve IS NOT NULL),
          '[]'::json
        ) AS hang_ve
        , COALESCE(
          (
            SELECT JSON_AGG(JSON_BUILD_OBJECT(
              'ma_san_bay', ctsg.ma_san_bay,
              'ten_san_bay', sb_tg.ten_san_bay,
              'thanh_pho', sb_tg.thanh_pho,
              'thoi_gian_dung', ctsg.thoi_gian_dung,
              'ghi_chu', ctsg.ghi_chu,
              'thu_tu_dung', ctsg.thu_tu_dung
            ) ORDER BY ctsg.thu_tu_dung)
            FROM chi_tiet_san_bay_trung_gian ctsg
            LEFT JOIN san_bay sb_tg ON sb_tg.ma_san_bay = ctsg.ma_san_bay
            WHERE ctsg.ma_chuyen_bay = cb.ma_chuyen_bay
          ), '[]'::json
        ) AS stopovers

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
      -- Order upcoming flights first, then departed flights last
      ORDER BY (cb.ngay_gio_bay < NOW()) ASC, cb.ngay_gio_bay ASC
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
        COALESCE(SUM(COALESCE(chv.so_ghe_da_dat,0)), 0) AS ghe_da_dat,
      COALESCE(SUM(chv.so_luong_ghe - chv.so_ghe_da_ban - COALESCE(chv.so_ghe_da_dat,0)), 0) AS ghe_con_lai,

      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'ma_hang_ve', chv.ma_hang_ve,
            'ten_hang_ve', hv.ten_hang_ve,
            'ti_le_gia', hv.ti_le_gia,
            'so_luong_ghe', COALESCE(chv.so_luong_ghe, 0),
            'da_ban', COALESCE(chv.so_ghe_da_ban, 0),
              'da_dat', COALESCE(chv.so_ghe_da_dat, 0),
              'con_lai', (COALESCE(chv.so_luong_ghe, 0) - COALESCE(chv.so_ghe_da_ban, 0) - COALESCE(chv.so_ghe_da_dat,0))
          )
          ORDER BY hv.ti_le_gia DESC
        ) FILTER (WHERE chv.ma_hang_ve IS NOT NULL),
        '[]'::json
      ) AS hang_ve
      , COALESCE(
          (
            SELECT JSON_AGG(JSON_BUILD_OBJECT(
              'ma_san_bay', ctsg.ma_san_bay,
              'ten_san_bay', sb_tg.ten_san_bay,
              'thanh_pho', sb_tg.thanh_pho,
              'thoi_gian_dung', ctsg.thoi_gian_dung,
              'ghi_chu', ctsg.ghi_chu
            ) ORDER BY ctsg.thu_tu_dung)
            FROM chi_tiet_san_bay_trung_gian ctsg
            LEFT JOIN san_bay sb_tg ON sb_tg.ma_san_bay = ctsg.ma_san_bay
            WHERE ctsg.ma_chuyen_bay = cb.ma_chuyen_bay
          ), '[]'::json
        ) AS stopovers
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
      `SELECT so_luong_ghe, so_ghe_da_ban, COALESCE(so_ghe_da_dat,0) AS so_ghe_da_dat
       FROM chuyen_bay_hang_ve
       WHERE ma_chuyen_bay = $1 AND ma_hang_ve = $2
       FOR UPDATE`,
      [ma_chuyen_bay, ma_hang_ve]
    );
    if (seatRow.rowCount === 0) throw new Error('Chuyến bay không có hạng vé này');

    const total = Number(seatRow.rows[0].so_luong_ghe);
    const sold  = Number(seatRow.rows[0].so_ghe_da_ban);
    const booked = Number(seatRow.rows[0].so_ghe_da_dat);
    if (sold + booked >= total) throw new Error('Hạng vé đã hết chỗ');

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
// GET /api/tickets?q=...
// Danh sách vé đã bán (BM2)
// ============================================
app.get('/api/tickets', verifyToken, async (req, res) => {
  const qtxt = String(req.query.q || req.query.keyword || '').trim();

  const client = await pool.connect();
  try {
    const whereQ = qtxt
      ? `WHERE (
            ('VE' || LPAD(v.id::text, 8, '0')) ILIKE '%'||$1||'%'
         OR v.ma_chuyen_bay ILIKE '%'||$1||'%'
         OR hk.ho_ten ILIKE '%'||$1||'%'
         OR hk.cmnd ILIKE '%'||$1||'%'
         OR hk.sdt ILIKE '%'||$1||'%'
      )`
      : '';

    const sql = `
      SELECT
        v.id,
        ('VE' || LPAD(v.id::text, 8, '0')) AS ticket_code,
        v.ma_chuyen_bay AS flight_code,
        hk.ho_ten AS passenger_name,
        hk.cmnd AS cccd,
        hk.sdt AS phone,
        v.ma_hang_ve AS ticket_class,
        v.gia_ve AS price,
        v.created_at,
        u.full_name AS seller_name,
        u.username AS seller_username
      FROM ve v
      JOIN hanh_khach hk
        ON hk.id = v.hanh_khach_id
      LEFT JOIN users u
        ON u.id = v.nguoi_ban
      ${whereQ}
      ORDER BY v.created_at DESC
      LIMIT 200
    `;

    const r = await client.query(sql, qtxt ? [qtxt] : []);
    res.json({ items: r.rows });
  } catch (e) {
    console.error('GET /api/tickets error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  } finally {
    client.release();
  }
});

// ============================================
// REPORT API - Lập báo cáo (Theo tháng / Theo năm)
// ✅ Doanh thu CHỈ tính từ bảng VE (vé đã bán). KHÔNG cộng tiền phiếu đặt chỗ.
// Endpoints:
//   GET /api/reports/month?month=YYYY-MM&status=paid|all
//   GET /api/reports/year?year=YYYY&status=paid|all
// ============================================

function parseMonthRange(monthStr) {
  const m = String(monthStr || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mm] = m.split('-').map(Number);
  if (!y || !mm || mm < 1 || mm > 12) return null;
  const start = `${String(y).padStart(4, '0')}-${String(mm).padStart(2, '0')}-01`;
  const nextY = mm === 12 ? y + 1 : y;
  const nextM = mm === 12 ? 1 : mm + 1;
  const end = `${String(nextY).padStart(4, '0')}-${String(nextM).padStart(2, '0')}-01`;
  return { month: m, start, end };
}

function parseYearRange(yearStr) {
  const y = String(yearStr || '').trim();
  if (!/^\d{4}$/.test(y)) return null;
  const yr = Number(y);
  if (!Number.isFinite(yr) || yr < 2000 || yr > 2100) return null;
  const start = `${y}-01-01`;
  const end = `${String(yr + 1).padStart(4, '0')}-01-01`;
  return { year: y, start, end };
}

// --------------------------------------------
// GET /api/reports/month
// --------------------------------------------
app.get('/api/reports/month', verifyToken, async (req, res) => {
  const range = parseMonthRange(req.query.month);
  const status = String(req.query.status || 'paid').trim(); // paid|all
  if (!range) return res.status(400).json({ error: 'month phải có dạng YYYY-MM' });
  if (!['paid', 'all'].includes(status)) return res.status(400).json({ error: "status phải là 'paid' hoặc 'all'" });

  const client = await pool.connect();
  try {
    const baseFlights = `
      SELECT cb.ma_chuyen_bay::text AS flight_code,
             cb.san_bay_di::text AS from_code,
             cb.san_bay_den::text AS to_code,
             sb_di.ten_san_bay AS from_name,
             sb_den.ten_san_bay AS to_name,
             cb.ngay_gio_bay AS depart_at
      FROM chuyen_bay cb
      LEFT JOIN san_bay sb_di ON sb_di.ma_san_bay = cb.san_bay_di
      LEFT JOIN san_bay sb_den ON sb_den.ma_san_bay = cb.san_bay_den
    `;

    let sql = '';
    if (status === 'paid') {
      sql = `
        WITH sold AS (
          SELECT v.ma_chuyen_bay::text AS flight_code,
                 COUNT(*)::int AS tickets_sold,
                 COALESCE(SUM(v.gia_ve), 0)::bigint AS revenue
          FROM ve v
          WHERE (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1::date
            AND (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') <  $2::date
          GROUP BY 1
        )
        SELECT f.flight_code, f.from_code, f.to_code, f.from_name, f.to_name, f.depart_at,
               s.tickets_sold, s.revenue,
               0::int AS booked_total, 0::int AS booked_active, 0::int AS booked_cancelled, 0::int AS booked_expired
        FROM sold s
        LEFT JOIN (${baseFlights}) f
          ON f.flight_code = s.flight_code
        ORDER BY s.revenue DESC, s.tickets_sold DESC, s.flight_code ASC;
      `;
    } else {
      sql = `
        WITH sold AS (
          SELECT v.ma_chuyen_bay::text AS flight_code,
                 COUNT(*)::int AS tickets_sold,
                 COALESCE(SUM(v.gia_ve), 0)::bigint AS revenue
          FROM ve v
          WHERE (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1::date
            AND (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') <  $2::date
          GROUP BY 1
        ),
        booked AS (
          SELECT gdv.ma_chuyen_bay::text AS flight_code,
                 COUNT(*)::int AS booked_total,
                 COUNT(*) FILTER (WHERE gdv.trang_thai = 'Đặt chỗ')::int AS booked_active,
                 COUNT(*) FILTER (WHERE gdv.trang_thai = 'Đã hủy')::int AS booked_cancelled,
                 COUNT(*) FILTER (WHERE gdv.trang_thai = 'Hết hạn')::int AS booked_expired
          FROM giao_dich_ve gdv
          WHERE gdv.loai = 'dat_cho'
            AND (gdv.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1::date
            AND (gdv.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') <  $2::date
          GROUP BY 1
        ),
        keys AS (
          SELECT flight_code FROM sold
          UNION
          SELECT flight_code FROM booked
        )
        SELECT f.flight_code, f.from_code, f.to_code, f.from_name, f.to_name, f.depart_at,
               COALESCE(s.tickets_sold,0)::int AS tickets_sold,
               COALESCE(s.revenue,0)::bigint AS revenue,
               COALESCE(b.booked_total,0)::int AS booked_total,
               COALESCE(b.booked_active,0)::int AS booked_active,
               COALESCE(b.booked_cancelled,0)::int AS booked_cancelled,
               COALESCE(b.booked_expired,0)::int AS booked_expired
        FROM keys k
        LEFT JOIN (${baseFlights}) f
          ON f.flight_code = k.flight_code
        LEFT JOIN sold s
          ON s.flight_code = k.flight_code
        LEFT JOIN booked b
          ON b.flight_code = k.flight_code
        ORDER BY revenue DESC, tickets_sold DESC, f.flight_code ASC;
      `;
    }

    const r = await client.query(sql, [range.start, range.end]);
    const items = r.rows || [];

    const revenue = items.reduce((s, it) => s + Number(it.revenue || 0), 0);
    const tickets_sold = items.reduce((s, it) => s + Number(it.tickets_sold || 0), 0);
    const booked_total = items.reduce((s, it) => s + Number(it.booked_total || 0), 0);

    res.json({
      type: 'month',
      month: range.month,
      status,
      range: { start: range.start, end: range.end },
      summary: {
        revenue,
        tickets_sold,
        booked_total,
        flights_count: items.length,
        right_value: items.length,
      },
      items,
    });
  } catch (e) {
    console.error('GET /api/reports/month error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  } finally {
    client.release();
  }
});

// --------------------------------------------
// GET /api/reports/year
// --------------------------------------------
app.get('/api/reports/year', verifyToken, async (req, res) => {
  const range = parseYearRange(req.query.year);
  const status = String(req.query.status || 'paid').trim(); // paid|all
  if (!range) return res.status(400).json({ error: 'year phải có dạng YYYY' });
  if (!['paid', 'all'].includes(status)) return res.status(400).json({ error: "status phải là 'paid' hoặc 'all'" });

  const client = await pool.connect();
  try {
    let sql = '';
    if (status === 'paid') {
      sql = `
        WITH sold AS (
          SELECT to_char(date_trunc('month', v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') AS month,
                 COUNT(*)::int AS tickets_sold,
                 COALESCE(SUM(v.gia_ve), 0)::bigint AS revenue
          FROM ve v
          WHERE (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1::date
            AND (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') <  $2::date
          GROUP BY 1
        )
        SELECT month,
               tickets_sold,
               revenue,
               0::int AS booked_total, 0::int AS booked_active, 0::int AS booked_cancelled, 0::int AS booked_expired
        FROM sold
        ORDER BY month ASC;
      `;
    } else {
      sql = `
        WITH sold AS (
          SELECT to_char(date_trunc('month', v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') AS month,
                 COUNT(*)::int AS tickets_sold,
                 COALESCE(SUM(v.gia_ve), 0)::bigint AS revenue
          FROM ve v
          WHERE (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1::date
            AND (v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') <  $2::date
          GROUP BY 1
        ),
        booked AS (
          SELECT to_char(date_trunc('month', gdv.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') AS month,
                 COUNT(*)::int AS booked_total,
                 COUNT(*) FILTER (WHERE gdv.trang_thai = 'Đặt chỗ')::int AS booked_active,
                 COUNT(*) FILTER (WHERE gdv.trang_thai = 'Đã hủy')::int AS booked_cancelled,
                 COUNT(*) FILTER (WHERE gdv.trang_thai = 'Hết hạn')::int AS booked_expired
          FROM giao_dich_ve gdv
          WHERE gdv.loai = 'dat_cho'
            AND (gdv.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1::date
            AND (gdv.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') <  $2::date
          GROUP BY 1
        ),
        keys AS (
          SELECT month FROM sold
          UNION
          SELECT month FROM booked
        )
        SELECT k.month,
               COALESCE(s.tickets_sold,0)::int AS tickets_sold,
               COALESCE(s.revenue,0)::bigint AS revenue,
               COALESCE(b.booked_total,0)::int AS booked_total,
               COALESCE(b.booked_active,0)::int AS booked_active,
               COALESCE(b.booked_cancelled,0)::int AS booked_cancelled,
               COALESCE(b.booked_expired,0)::int AS booked_expired
        FROM keys k
        LEFT JOIN sold s ON s.month = k.month
        LEFT JOIN booked b ON b.month = k.month
        ORDER BY k.month ASC;
      `;
    }

    const r = await client.query(sql, [range.start, range.end]);
    const items = r.rows || [];

    const revenue = items.reduce((s, it) => s + Number(it.revenue || 0), 0);
    const tickets_sold = items.reduce((s, it) => s + Number(it.tickets_sold || 0), 0);
    const booked_total = items.reduce((s, it) => s + Number(it.booked_total || 0), 0);

    res.json({
      type: 'year',
      year: range.year,
      status,
      range: { start: range.start, end: range.end },
      summary: {
        revenue,
        tickets_sold,
        booked_total,
        months_count: items.length,
        right_value: items.length,
      },
      items,
    });
  } catch (e) {
    console.error('GET /api/reports/year error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
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

// ============================================
// API: Passengers list (aggregate from giao_dich_ve + ve)
// GET /api/passengers?search=&status=&sort=&page=&limit=
// Returns: { passengers: [...], total }
app.get('/api/passengers', verifyToken, async (req, res) => {
  try {
    const { search = '', status = '', sort = 'newest', page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page || '1'));
    const perPage = Math.max(1, Math.min(200, parseInt(limit || '20')));
    const offset = (pageNum - 1) * perPage;

    // Build safe search
    const searchVal = (search || '').trim();

    // The query aggregates entries from giao_dich_ve (gd) and ve (v)
    // We normalize status: map vietnamese status to canonical keys
    const baseQuery = `
      WITH all_entries AS (
        SELECT
          gd.id::text AS entry_id,
          COALESCE(NULLIF(gd.cmnd, ''), NULLIF(gd.dien_thoai, '')) AS key_id,
          gd.hanh_khach AS ho_ten,
          gd.cmnd,
          gd.dien_thoai AS sdt,
          gd.gia_tien::numeric AS amount,
          CASE
            WHEN LOWER(gd.trang_thai) LIKE '%đặt%' THEN 'booked'
            WHEN LOWER(gd.trang_thai) LIKE '%thanh toán%' OR LOWER(gd.trang_thai) LIKE '%paid%' OR LOWER(gd.trang_thai) LIKE '%bán%' THEN 'paid'
            WHEN LOWER(gd.trang_thai) LIKE '%hủy%' THEN 'cancelled'
            WHEN LOWER(gd.trang_thai) LIKE '%hết hạn%' THEN 'expired'
            ELSE LOWER(gd.trang_thai)
          END AS status,
          gd.created_at,
          'gd' AS source
        FROM giao_dich_ve gd

        UNION ALL

        SELECT
          v.id::text AS entry_id,
          COALESCE(NULLIF(hk.cmnd, ''), NULLIF(hk.sdt, '')) AS key_id,
          hk.ho_ten AS ho_ten,
          hk.cmnd,
          hk.sdt AS sdt,
          v.gia_ve::numeric AS amount,
          'paid' AS status,
          v.created_at,
          've' AS source
        FROM ve v
        LEFT JOIN hanh_khach hk ON hk.id = v.hanh_khach_id
      ),
      numbered AS (
        SELECT *, COALESCE(NULLIF(key_id, ''), NULL) AS key_id_norm
        FROM all_entries
      ),
      -- last status/time per key
      last_per_key AS (
        SELECT DISTINCT ON (key_id_norm) key_id_norm AS key_id, status AS last_status, created_at AS last_time
        FROM numbered
        WHERE key_id_norm IS NOT NULL
        ORDER BY key_id_norm, created_at DESC
      ),
      grouped AS (
        SELECT
          key_id_norm AS key_id,
          MAX(ho_ten) AS ho_ten,
          MAX(cmnd) AS cmnd,
          MAX(sdt) AS sdt,
          COUNT(*) AS tickets,
          COALESCE(SUM(CASE WHEN (source='ve' OR status='paid') THEN amount ELSE 0 END),0) AS total_spent
        FROM numbered
        WHERE key_id_norm IS NOT NULL
        GROUP BY key_id_norm
      )
      SELECT g.key_id, g.ho_ten, g.cmnd, g.sdt, g.tickets, g.total_spent, l.last_status, l.last_time
      FROM grouped g
      LEFT JOIN last_per_key l ON l.key_id = g.key_id
    `;

    // Build filters
    let whereClauses = [];
    const params = [];
    let idx = 1;

    if (searchVal) {
      whereClauses.push(`(LOWER(g.ho_ten) LIKE $${idx} OR g.cmnd LIKE $${idx} OR g.sdt LIKE $${idx})`);
      params.push(`%${searchVal.toLowerCase()}%`);
      idx++;
    }

    if (status) {
      whereClauses.push(`(l.last_status = $${idx})`);
      params.push(status);
      idx++;
    }

    // We will wrap the baseQuery as a subselect to apply where/sort/pagination
    let finalQuery = `SELECT * FROM (${baseQuery}) g`;

    if (whereClauses.length > 0) {
      finalQuery += ' WHERE ' + whereClauses.join(' AND ');
    }

    // Sorting
    if (sort === 'name') finalQuery += ' ORDER BY g.ho_ten ASC NULLS LAST';
    else finalQuery += ' ORDER BY g.last_time DESC NULLS LAST';

    // Pagination
    finalQuery += ` LIMIT ${perPage} OFFSET ${offset}`;

    const dataRes = await pool.query(finalQuery, params);

    // Total count (simple count from grouped with same filters)
    let countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) g`;
    if (whereClauses.length > 0) countQuery += ' WHERE ' + whereClauses.join(' AND ');
    const countRes = await pool.query(countQuery, params);

    const rows = dataRes.rows.map(r => ({
      id: r.key_id,
      ho_ten: r.ho_ten,
      cmnd: r.cmnd,
      sdt: r.sdt,
      tickets: parseInt(r.tickets) || 0,
      total_spent: Number(r.total_spent) || 0,
      last_status: r.last_status || null,
      last_time: r.last_time || null
    }));

    res.json({ passengers: rows, total: Number(countRes.rows[0].total) || 0 });
  } catch (e) {
    console.error('GET /api/passengers error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// ============================================
// API: transactions for a passenger
// GET /api/passengers/:key/transactions
app.get('/api/passengers/:key/transactions', verifyToken, async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Missing key' });

    console.log('DEBUG GET /api/passengers/:key/transactions key=', key);

    const q = `
      WITH gd AS (
        SELECT id::text AS id, ma_chuyen_bay, gia_tien::numeric AS amount, 
               CASE
                 WHEN LOWER(trang_thai) LIKE '%đặt%' THEN 'booked'
                 WHEN LOWER(trang_thai) LIKE '%thanh toán%' OR LOWER(trang_thai) LIKE '%paid%' OR LOWER(trang_thai) LIKE '%bán%' THEN 'paid'
                 WHEN LOWER(trang_thai) LIKE '%hủy%' THEN 'cancelled'
                 WHEN LOWER(trang_thai) LIKE '%hết hạn%' THEN 'expired'
                 ELSE LOWER(trang_thai)
               END AS status,
               created_at, 'giao_dich_ve' AS source
        FROM giao_dich_ve
        WHERE cmnd = $1 OR dien_thoai = $1
      ),
      v AS (
        SELECT v.id::text AS id, v.ma_chuyen_bay, v.gia_ve::numeric AS amount, 'paid' AS status, v.created_at, 've' AS source
        FROM ve v
        LEFT JOIN hanh_khach hk ON hk.id = v.hanh_khach_id
        WHERE hk.cmnd = $1 OR hk.sdt = $1 OR v.hanh_khach_id::text = $1
      ),
      allt AS (
        SELECT * FROM gd
        UNION ALL
        SELECT * FROM v
      )
      SELECT at.id, at.ma_chuyen_bay, at.amount, at.status, at.created_at, at.source, cb.ngay_gio_bay
      FROM allt at
      LEFT JOIN chuyen_bay cb ON cb.ma_chuyen_bay = at.ma_chuyen_bay
      ORDER BY at.created_at DESC
    `;

    const data = await pool.query(q, [key]);
    console.log('DEBUG /api/passengers/:key/transactions -> rows count =', (data.rows || []).length);

    const rows = (data.rows || []).map(r => ({
      id: r.id,
      flight_code: r.ma_chuyen_bay,
      flight_date: r.ngay_gio_bay,
      amount: Number(r.amount || 0),
      status: r.status,
      source: r.source,
      created_at: r.created_at
    }));

    res.json({ transactions: rows });
  } catch (e) {
    console.error('GET /api/passengers/:key/transactions error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// Create passenger
app.post('/api/passengers', verifyToken, async (req, res) => {
  try {
    const { ho_ten, cmnd, sdt } = req.body || {};
    if (!ho_ten) return res.status(400).json({ error: 'Missing ho_ten' });

    const q = `INSERT INTO hanh_khach (ho_ten, cmnd, sdt, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *`;
    const r = await pool.query(q, [ho_ten, cmnd || null, sdt || null]);
    res.json({ passenger: r.rows[0] });
  } catch (e) {
    console.error('POST /api/passengers error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// Update passenger by id or key (cmnd or sdt)
app.put('/api/passengers/:key', verifyToken, async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    const { ho_ten, cmnd, sdt } = req.body || {};
    if (!key) return res.status(400).json({ error: 'Missing key' });
    // Distinguish between DB numeric id and CMND/SĐT which are also numeric strings.
    // Treat as DB id only if it's a short numeric value (e.g. <= 6 digits).
    const isNumericId = (/^\d+$/.test(key) && key.length <= 6);

    // 1) Find existing hanh_khach if any (to get old cmnd/sdt for ripple updates)
    let hkBefore = null;
    if (isNumericId) {
      const r0 = await pool.query('SELECT * FROM hanh_khach WHERE id=$1', [parseInt(key)]);
      hkBefore = r0.rows[0] || null;
    } else {
      const r0 = await pool.query('SELECT * FROM hanh_khach WHERE cmnd=$1 OR sdt=$1 LIMIT 1', [key]);
      hkBefore = r0.rows[0] || null;
    }

    // 2) Update or insert hanh_khach
    let hk = null;
    if (hkBefore) {
      const r = await pool.query(
        `UPDATE hanh_khach SET ho_ten = $1, cmnd = $2, sdt = $3 WHERE id = $4 RETURNING *`,
        [ho_ten || hkBefore.ho_ten, cmnd || hkBefore.cmnd, sdt || hkBefore.sdt, hkBefore.id]
      );
      hk = r.rows[0];
    } else {
      const insertQ = `INSERT INTO hanh_khach (ho_ten, cmnd, sdt, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *`;
      const insertVals = [ho_ten || null, cmnd || (isNumericId ? null : key) || null, sdt || (isNumericId ? null : key) || null];
      const ins = await pool.query(insertQ, insertVals);
      hk = ins.rows[0];
    }

    // 3) Ripple updates to giao_dich_ve so the stored cmnd/dien_thoai/hanh_khach text also reflect changes
    const oldCmnd = hkBefore && hkBefore.cmnd ? hkBefore.cmnd : null;
    const oldSdt = hkBefore && hkBefore.sdt ? hkBefore.sdt : null;
    const routeKey = key;

    try {
      // Only sync text snapshot for bookings (dat_cho) to avoid overwriting historical sold tickets
      await pool.query(
        `UPDATE giao_dich_ve SET hanh_khach = $1, cmnd = $2, dien_thoai = $3
         WHERE ( (cmnd IS NOT NULL AND (cmnd = $4 OR cmnd = $7))
                 OR (dien_thoai IS NOT NULL AND (dien_thoai = $5 OR dien_thoai = $7))
                 OR (cmnd IS NULL AND dien_thoai IS NULL AND (cmnd = $7 OR dien_thoai = $7)) )
           AND (loai = 'dat_cho' OR trang_thai = 'Đặt chỗ')`,
        [hk ? hk.ho_ten : ho_ten, hk ? hk.cmnd : cmnd, hk ? hk.sdt : sdt, oldCmnd, oldSdt, routeKey, routeKey]
      );
    } catch (err) {
      console.warn('Ripple update giao_dich_ve (bookings only) failed:', err.message);
    }

    // 4) Try linking ve rows that weren't linked to hanh_khach (if any) to the hk we just created/updated
    if (!hkBefore && hk && (hk.cmnd || hk.sdt)) {
      try {
        await pool.query(
          `UPDATE ve SET hanh_khach_id = $1
           FROM hanh_khach hk2
           WHERE ve.hanh_khach_id IS NULL AND (hk2.cmnd = $2 OR hk2.sdt = $3) AND hk2.id = $1`,
          [hk.id, hk.cmnd, hk.sdt]
        );
      } catch (err) {
        console.warn('Attempt to link ve to new hanh_khach failed:', err.message);
      }
    }

    return res.json({ passenger: hk, created: !hkBefore });
  } catch (e) {
    console.error('PUT /api/passengers/:key error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// Delete passenger by id or key (cmnd or sdt)
app.delete('/api/passengers/:key', verifyToken, async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Missing key' });

    const isNumericId = (/^\d+$/.test(key) && key.length <= 6);

    // Find existing hanh_khach (if any) to know old cmnd/sdt
    let hkBefore = null;
    if (isNumericId) {
      const r0 = await pool.query('SELECT * FROM hanh_khach WHERE id=$1', [parseInt(key)]);
      hkBefore = r0.rows[0] || null;
    } else {
      const r0 = await pool.query('SELECT * FROM hanh_khach WHERE cmnd=$1 OR sdt=$1 LIMIT 1', [key]);
      hkBefore = r0.rows[0] || null;
    }

    const oldCmnd = hkBefore && hkBefore.cmnd ? hkBefore.cmnd : null;
    const oldSdt = hkBefore && hkBefore.sdt ? hkBefore.sdt : null;
    const routeKey = key;

    // Anonymize hanh_khach if exists
    if (hkBefore) {
      await pool.query(`UPDATE hanh_khach SET ho_ten = '[Đã xóa]', cmnd = NULL, sdt = NULL WHERE id = $1`, [hkBefore.id]);
    }

    // Clear sensitive fields in giao_dich_ve for matching rows
    try {
      await pool.query(
        `UPDATE giao_dich_ve SET hanh_khach = '[Đã xóa]', cmnd = NULL, dien_thoai = NULL
         WHERE (cmnd IS NOT NULL AND (cmnd = $1 OR cmnd = $4))
            OR (dien_thoai IS NOT NULL AND (dien_thoai = $2 OR dien_thoai = $4))
            OR (cmnd IS NULL AND dien_thoai IS NULL AND (cmnd = $4 OR dien_thoai = $4))`,
        [oldCmnd, oldSdt, hkBefore ? hkBefore.id : null, routeKey]
      );
    } catch (err) {
      console.warn('Anonymize giao_dich_ve failed:', err.message);
    }

    // For ve table, try to nullify hanh_khach_id if it points to this passenger (may fail if FK prevents it)
    if (hkBefore) {
      try {
        await pool.query('UPDATE ve SET hanh_khach_id = NULL WHERE hanh_khach_id = $1', [hkBefore.id]);
      } catch (err) {
        console.warn('Failed to nullify ve.hanh_khach_id:', err.message);
      }
    }

    return res.json({ success: true, anonymized: true });
  } catch (e) {
    console.error('DELETE /api/passengers/:key error:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});