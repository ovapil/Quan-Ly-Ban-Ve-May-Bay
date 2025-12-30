// ============================================
// DASHBOARD.JS - REALTIME AUTO-REFRESH VERSION
// ============================================

const API_BASE_URL = 'http://localhost:3000/api';

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isAdmin(user) {
  return normalizeRole(user?.role) === "admin";
}

const Dashboard = {
  sessionCheckInterval: null,
  staffRefreshInterval: null,
  resetBadgeInterval: null,
  
  async init() {
    const token = localStorage.getItem('uiticket_token');

    if (!token) {
      console.log('Không có token, redirect về index');
      window.location.href = "index.html";
      return;
    }

    console.log('Token tìm thấy:', token.substring(0, 20) + '...');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('Verify response status:', response.status);

      if (!response.ok) {
        const errData = await response.json();
        console.error('Verify error response:', errData);
        throw new Error(errData.error || 'Token không hợp lệ');
      }

      const data = await response.json();
      console.log('Verify thành công:', data.user);
      this.applySession(data.user);
      this.initAvatar();

      if (isAdmin(data.user)) {
        await refreshAdminBadge();
        this.resetBadgeInterval = setInterval(refreshAdminBadge, 10000);
      }

      this.startSessionCheck();

    } catch (error) {
      console.error('Verify error:', error);
      localStorage.removeItem('uiticket_token');
      localStorage.removeItem('uiticket_user');
      alert(`Lỗi: ${error.message}\n\nVui lòng đăng nhập lại.`);
      window.location.href = "index.html";
    }
  },

  startSessionCheck() {
    this.sessionCheckInterval = setInterval(async () => {
      const token = localStorage.getItem('uiticket_token');
      if (!token) {
        this.forceLogout('Phiên đăng nhập đã hết hạn');
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          this.forceLogout('Tài khoản đã bị khóa hoặc phiên hết hạn');
        }
      } catch (error) {
        console.error('Session check error:', error);
      }
    }, 5000);
  },

  forceLogout(reason) {
    this.stopAllIntervals();
    localStorage.removeItem('uiticket_token');
    localStorage.removeItem('uiticket_user');
    UI.toast(`⚠️ ${reason}`, "warn");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1500);
  },

  stopAllIntervals() {
    if (this.sessionCheckInterval) clearInterval(this.sessionCheckInterval);
    if (this.staffRefreshInterval) clearInterval(this.staffRefreshInterval);
    if (this.resetBadgeInterval) clearInterval(this.resetBadgeInterval);
  },

  applySession(user) {
    const nameEl = document.getElementById("homeName");
    const roleEl = document.getElementById("homeRole");
    const chipEl = document.getElementById("roleChip");
    const infoTile = document.getElementById("infoTile");

    nameEl.textContent = user.full_name || user.username;
    roleEl.textContent = user.role;

    chipEl.style.background = (user.role === "Admin") ? "var(--chip-admin)" : "var(--primary)";

    if (infoTile) {
      // Giữ giao diện đẹp: không làm mờ ô (disabled) cho user thường.
      // Quyền truy cập vẫn được chặn ở tileClick().
      infoTile.classList.remove("disabled");
      infoTile.title = (user.role !== "Admin") ? "Chỉ Admin" : "";
    }

    localStorage.setItem('uiticket_user', JSON.stringify(user));

    const grid = document.getElementById("dashboardGrid") || document.querySelector(".grid");
    const userMgmtTile = document.getElementById("userMgmtBtn");
    const notifBtn = document.querySelector('.actions .icon-btn[aria-label="Notifications"]');

    if (grid) grid.classList.toggle("admin-grid", isAdmin(user));
    if (userMgmtTile) userMgmtTile.style.display = isAdmin(user) ? "" : "none";
    if (notifBtn) notifBtn.style.display = isAdmin(user) ? "" : "none";
  },

  initAvatar() {
    const img = document.getElementById("avatarImg");
    const fallback = document.getElementById("avatarFallback");
    if (!img || !fallback) return;

    const user = JSON.parse(localStorage.getItem('uiticket_user') || '{}');

    img.onload = () => { img.style.display = "block"; fallback.style.display = "none"; };
    img.onerror = () => { img.style.display = "none"; fallback.style.display = "block"; };
    
    if (user.avatar_url) {
      img.src = user.avatar_url;
    } else {
      // Nếu chưa có avatar, hiển thị fallback icon
      img.style.display = "none";
      fallback.style.display = "block";
    }
  },

  tileClick(key) {
    const user = JSON.parse(localStorage.getItem('uiticket_user') || '{"role":"User"}');

    if (key === "info" && user.role !== "Admin") {
      UI.toast("Không đủ quyền", "warn");
      return;
    }

    if (key === "schedule") {
      window.location.href = "schedule.html?preview=1";
      return;
    }

    if (key === "booking") {
      window.location.href = "booking.html?preview=1";
      return;
    }

    if (key === "lookup") {
      window.location.href = "lookup.html";
      return;
    }

    if (key === "customers") {
      window.location.href = "passenger.html";
      return;
    }

    if (key === "report") {
      // ✅ FIX: Lập báo cáo phải mở report.html, không phải trang bán vé
      window.location.href = "report.html";
      return;
    }

    if (key === "info") {
      this.showInfoModal();
      return;
    }

    if (key === "sell") {
      window.location.href = "sell.html";
      return;
    }

    const map = {
      profile: "Mở Hồ sơ (demo)",
      lookup: "Tra cứu Chuyến bay (demo)",
      customers: "Khách hàng / Hành khách (demo)",
      booking: "Quản lý Đặt vé (demo)",
      schedule: "Nhận lịch Chuyến bay (demo)",
      sell: "Bán vé (demo)",
      info: "Cập nhật thông tin (Admin) (demo)"
    };

    UI.toast(map[key] || "Tính năng (demo)", "success");
  },

  tabClick(tab) {
    if (tab === 'account') {
      window.location.href = 'account.html';
      return;
    }
    if (tab === 'settings') {
      window.location.href = 'settings.html';
      return;
    }
    UI.toast(`Tab: ${tab} (demo)`, "warn");
  },

  showResetModal() {
    const modal = document.getElementById("resetModal");
    if (modal) modal.classList.remove("hidden");
  },

  closeResetModal() {
    const modal = document.getElementById("resetModal");
    if (modal) modal.classList.add("hidden");
  },

  async loadResetRequests() {
    const token = localStorage.getItem("uiticket_token");
    
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reset-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      const box = document.getElementById("resetList");
      
      if (box) {
        if (!data.items?.length) {
          box.innerHTML = `<p style="text-align:center; color:#64748b; padding:20px;">Không có yêu cầu pending</p>`;
          return;
        }

        box.innerHTML = data.items.map(x => `
          <div class="req">
            <div class="req-info">
              <div class="req-title">Staff ${escapeHtml(x.username)} yêu cầu reset</div>
              <div class="req-msg">Lý do: ${escapeHtml(x.message || "(không có)")}</div>
              <div class="req-time">${new Date(x.created_at).toLocaleString('vi-VN')}</div>
            </div>
            <div class="req-actions">
              <button class="btn ok" onclick="Dashboard.approveReset(${x.id})">✓ Đồng ý</button>
              <button class="btn no" onclick="Dashboard.rejectReset(${x.id})">✗ Từ chối</button>
            </div>
          </div>
        `).join("");
      }
    } catch (error) {
      console.error('Load reset requests error:', error);
    }
  },

  async approveReset(id) {
    const token = localStorage.getItem("uiticket_token");
    
    try {
      UI.showLoading();
      
      const res = await fetch(`${API_BASE_URL}/admin/reset-requests/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      
      UI.hideLoading();
      
      if (!res.ok) return UI.toast(data.error || "Approve failed", "warn");

      UI.toast("Đã duyệt & gửi mail mật khẩu mới", "success");
      await this.loadResetRequests();
      await refreshAdminBadge();
    } catch (error) {
      UI.hideLoading();
      console.error('Approve reset error:', error);
      UI.toast("Không thể duyệt yêu cầu", "warn");
    }
  },

  async rejectReset(id) {
    const reason = await UI.prompt({
      title: "Từ chối yêu cầu reset",
      message: "Nhập lý do từ chối (tuỳ chọn):",
      placeholder: "Vd: Vui lòng liên hệ trực tiếp với IT Support...",
      confirmText: "Từ chối",
      cancelText: "Hủy"
    });

    if (reason === null) return;

    const token = localStorage.getItem("uiticket_token");

    try {
      UI.showLoading();
      
      const res = await fetch(`${API_BASE_URL}/admin/reset-requests/${id}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: reason || "" })
      });

      const data = await res.json();
      
      UI.hideLoading();
      
      if (!res.ok) {
        console.error('Reject API error:', data);
        return UI.toast(data.error || "Reject failed", "warn");
      }

      UI.toast("Đã từ chối & gửi mail thông báo", "success");
      await this.loadResetRequests();
      await refreshAdminBadge();
    } catch (error) {
      UI.hideLoading();
      console.error('Reject reset error:', error);
      UI.toast("Không thể từ chối yêu cầu", "warn");
    }
  },

  async openNotifications() {
    const user = JSON.parse(localStorage.getItem("uiticket_user") || "{}");

    if (!isAdmin(user)) {
      UI.toast("Hiện chưa có thông báo dành cho Staff (demo)", "warn");
      return;
    }

    this.showResetModal();
    await this.loadResetRequests();
  },

  showStaffModal() {
    const modal = document.getElementById("staffModal");
    if (modal) modal.classList.remove("hidden");
  },

  closeStaffModal() {
    const modal = document.getElementById("staffModal");
    if (modal) {
      modal.classList.add("hidden");
      if (this.staffRefreshInterval) {
        clearInterval(this.staffRefreshInterval);
        this.staffRefreshInterval = null;
      }
    }
  },

  async openUserManagement() {
    const user = JSON.parse(localStorage.getItem("uiticket_user") || "{}");
    if (!isAdmin(user)) return UI.toast("Không đủ quyền", "warn");

    this.showStaffModal();
    await this.loadStaffList();
    
    if (!this.staffRefreshInterval) {
      this.staffRefreshInterval = setInterval(async () => {
        const modal = document.getElementById("staffModal");
        if (modal && !modal.classList.contains("hidden")) {
          await this.loadStaffList(true);
        } else {
          clearInterval(this.staffRefreshInterval);
          this.staffRefreshInterval = null;
        }
      }, 5000);
    }
  },

  formatDateTime(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  applyStaffFilters(items) {
    const q = (document.getElementById("staffSearch")?.value || "").trim().toLowerCase();
    const f = document.getElementById("staffFilter")?.value || "all";

    let out = items;

    if (q) {
      out = out.filter(s => {
        const name = (s.full_name || s.username || "").toLowerCase();
        const u = (s.username || "").toLowerCase();
        const e = (s.email || "").toLowerCase();
        return name.includes(q) || u.includes(q) || e.includes(q);
      });
    }

    if (f === "online") out = out.filter(s => !!s.online);
    if (f === "offline") out = out.filter(s => !s.online);
    if (f === "active") out = out.filter(s => !!s.is_active);
    if (f === "locked") out = out.filter(s => !s.is_active);

    return out;
  },

  renderStaffTable(items) {
    const box = document.getElementById("staffList");
    if (!box) return;

    if (!items?.length) {
      box.innerHTML = `<div style="padding:20px; text-align:center;">
        <p style="color:#64748b; font-weight:700;">Chưa có Staff/Agent nào.</p>
      </div>`;
      return;
    }

    const rows = items.map(s => {
      const onlineBadge = s.online
        ? `<span class="badge-pill badge-online">● Online</span>`
        : `<span class="badge-pill badge-offline">○ Offline</span>`;

      const activeBadge = s.is_active
        ? `<span class="badge-pill badge-active">✓ Active</span>`
        : `<span class="badge-pill badge-locked">✗ Locked</span>`;

      const lockBtn = s.is_active
        ? `<button class="action-btn lock" onclick="Dashboard.toggleStaff(${s.id}, false)"><i class='fa-solid fa-lock'></i></button>`
        : `<button class="action-btn unlock" onclick="Dashboard.toggleStaff(${s.id}, true)"><i class='fa-solid fa-unlock'></i></button>`;

      return `
        <tr>
          <td>
            <div class="staff-user">
              <div class="staff-ava">
                ${
                  s.avatar_url
                    ? `<img src="${escapeHtml(s.avatar_url)}" alt="avatar" />`
                    : `<span class="fallback"><i class="fa-solid fa-user"></i></span>`
                }
              </div>
              <div class="staff-meta">
                <div class="staff-name">${escapeHtml(s.full_name || s.username)}</div>
                <div class="staff-subline">@${escapeHtml(s.username)} • ${escapeHtml(s.email || "-")}</div>
              </div>
            </div>
          </td>

          <td>${escapeHtml(s.role || "-")}</td>
          <td>${onlineBadge}</td>
          <td>${activeBadge}</td>

          <td class="staff-muted">${this.formatDateTime(s.last_session_login)}</td>
          <td class="staff-muted">${this.formatDateTime(s.last_logout)}</td>

          <td>
            <div class="staff-actions">
              ${lockBtn}
              <button class="action-btn reset" onclick="Dashboard.resetStaffPassword(${s.id})"><i class='fa-solid fa-rotate-right'></i></button>
              <button class="action-btn delete" onclick="Dashboard.deleteStaff(${s.id})"><i class='fa-solid fa-trash'></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    box.innerHTML = `
      <div class="staff-table-wrap">
        <table class="staff-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Role</th>
              <th>Trạng thái</th>
              <th>Khóa</th>
              <th>Login gần nhất</th>
              <th>Logout gần nhất</th>
              <th style="text-align:center;">Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  async loadStaffList(silent = false) {
    const token = localStorage.getItem("uiticket_token");
    
    try {
      const res = await fetch(`${API_BASE_URL}/admin/staff`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const data = await res.json();
      if (!res.ok) {
        if (!silent) UI.toast(data.error || "Load staff failed", "warn");
        return;
      }

      this._staffCache = data.items || [];

      const total = this._staffCache.length;
      const online = this._staffCache.filter(x => x.online).length;
      const locked = this._staffCache.filter(x => !x.is_active).length;
      const sumEl = document.getElementById("staffSummary");
      if (sumEl) {
        sumEl.textContent = `${total} nhân viên • ${online} online • ${locked} bị khóa`;
        
        if (!silent) {
          const now = new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          sumEl.title = `Cập nhật lúc ${now}`;
        }
      }

      const searchEl = document.getElementById("staffSearch");
      const filterEl = document.getElementById("staffFilter");
      
      if (searchEl && !searchEl.dataset.bound) {
        searchEl.dataset.bound = "1";
        searchEl.addEventListener("input", () => {
          const filtered = this.applyStaffFilters(this._staffCache);
          this.renderStaffTable(filtered);
        });
      }
      
      if (filterEl && !filterEl.dataset.bound) {
        filterEl.dataset.bound = "1";
        filterEl.addEventListener("change", () => {
          const filtered = this.applyStaffFilters(this._staffCache);
          this.renderStaffTable(filtered);
        });
      }

      const filtered = this.applyStaffFilters(this._staffCache);
      this.renderStaffTable(filtered);
      
    } catch (error) {
      if (!silent) {
        console.error('Load staff error:', error);
        UI.toast("Không thể tải danh sách nhân viên", "warn");
      }
    }
  },

  async toggleStaff(id, active) {
    const confirmed = await UI.confirm({
      title: active ? "Mở khóa nhân viên" : "Khóa nhân viên",
      message: active 
        ? "Bạn có chắc muốn mở khóa nhân viên này? Họ sẽ có thể đăng nhập lại sau khi mở khóa."
        : "Bạn có chắc muốn khóa nhân viên này? Họ sẽ bị đăng xuất ngay lập tức và không thể đăng nhập lại.",
      confirmText: active ? "Mở khóa" : "Khóa",
      cancelText: "Hủy",
      type: active ? "success" : "danger",
      icon: active ? "fa-lock-open" : "fa-lock"
    });

    if (!confirmed) return;

    const token = localStorage.getItem("uiticket_token");
    
    try {
      UI.showLoading();
      
      const res = await fetch(`${API_BASE_URL}/admin/staff/${id}/active`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ is_active: active })
      });
      
      const data = await res.json();
      
      UI.hideLoading();
      
      if (!res.ok) return UI.toast(data.error || "Update failed", "warn");
      
      UI.toast(`${active ? 'Đã mở khóa' : 'Đã khóa'} nhân viên thành công`, "success");
      
      await this.loadStaffList(true);
      
    } catch (error) {
      UI.hideLoading();
      console.error('Toggle staff error:', error);
      UI.toast("Không thể cập nhật trạng thái", "warn");
    }
  },

  toggleCreateStaffForm(force) {
    const box = document.getElementById("staffCreateForm");
    if (!box) return;
    const willShow = (typeof force === "boolean") ? force : box.classList.contains("hidden");
    box.classList.toggle("hidden", !willShow);
  },

  async createStaff() {
    const token = localStorage.getItem("uiticket_token");

    const username = document.getElementById("newStaffUsername")?.value?.trim();
    const full_name = document.getElementById("newStaffFullname")?.value?.trim();
    const email = document.getElementById("newStaffEmail")?.value?.trim();
    const role = document.getElementById("newStaffRole")?.value || "Staff";
    const password = document.getElementById("newStaffPassword")?.value?.trim();

    if (!username || !email) return UI.toast("Thiếu username hoặc email", "warn");

    try {
      UI.showLoading();
      
      const res = await fetch(`${API_BASE_URL}/admin/staff`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, email, full_name, role, password })
      });

      const data = await res.json();
      
      UI.hideLoading();
      
      if (!res.ok) return UI.toast(data.error || "Tạo nhân viên thất bại", "warn");

      ["newStaffUsername","newStaffFullname","newStaffEmail","newStaffPassword"].forEach(id=>{
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      this.toggleCreateStaffForm(false);
      
      await this.loadStaffList(true);

      if (data.mailSent) {
        UI.toast("Đã tạo nhân viên & gửi mail", "success");
      } else {
        UI.toast("⚠️ Đã tạo nhân viên (chưa cấu hình mail)", "warn");
        
        if (data.tempPassword) {
          console.log("TEMP PASSWORD:", data.tempPassword);
          await UI.alert({
            title: "⚠️ Mailer chưa cấu hình",
            message: `
              <div style="margin-bottom:12px;">Tạo nhân viên thành công!</div>
              <div style="background:#fef3c7; padding:12px; border-radius:8px; border-left:4px solid #f59e0b;">
                <div style="font-weight:900; margin-bottom:6px;">Mật khẩu tạm:</div>
                <code style="background:#fff; padding:8px 12px; border-radius:6px; display:block; font-size:16px; font-weight:900;">${data.tempPassword}</code>
              </div>
              <div style="margin-top:12px; font-size:13px; color:#64748b;">
                Vui lòng lưu lại mật khẩu này và gửi cho nhân viên.
              </div>
            `,
            type: "primary",
            icon: "fa-key",
            buttonText: "Đã lưu"
          });
        }
      }
      
    } catch (error) {
      UI.hideLoading();
      console.error('Create staff error:', error);
      UI.toast("Không thể tạo nhân viên", "warn");
    }
  },

  async resetStaffPassword(id) {
    const confirmed = await UI.confirm({
      title: "Reset mật khẩu",
      message: "Bạn có chắc muốn reset mật khẩu cho nhân viên này? Mật khẩu mới sẽ được gửi qua email và họ sẽ bị đăng xuất khỏi tất cả phiên đăng nhập.",
      confirmText: "Reset",
      cancelText: "Hủy",
      type: "danger",
      icon: "fa-key"
    });

    if (!confirmed) return;

    const token = localStorage.getItem("uiticket_token");
    
    try {
      UI.showLoading();
      
      const res = await fetch(`${API_BASE_URL}/admin/staff/${id}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const data = await res.json();
      
      UI.hideLoading();
      
      if (!res.ok) return UI.toast(data.error || "Reset failed", "warn");
      
      UI.toast("Đã reset mật khẩu & gửi email", "success");
      
      await this.loadStaffList(true);
      
    } catch (error) {
      UI.hideLoading();
      console.error('Reset password error:', error);
      UI.toast("Không thể reset mật khẩu", "warn");
    }
  },

  async deleteStaff(id) {
    const confirmed = await UI.confirm({
      title: "Xóa nhân viên",
      message: "⚠️ Hành động này không thể hoàn tác. Bạn có chắc muốn xóa nhân viên này?\n\nNhân viên sẽ bị xóa vĩnh viễn khỏi hệ thống.",
      confirmText: "Xóa",
      cancelText: "Hủy",
      type: "danger",
      icon: "fa-trash"
    });

    if (!confirmed) return;

    const token = localStorage.getItem("uiticket_token");
    
    try {
      UI.showLoading();
      
      const res = await fetch(`${API_BASE_URL}/admin/staff/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const data = await res.json();
      
      UI.hideLoading();
      
      if (!res.ok) return UI.toast(data.error || "Delete failed", "warn");
      
      UI.toast("Đã xóa nhân viên thành công", "success");
      
      await this.loadStaffList(true);
      
    } catch (error) {
      UI.hideLoading();
      console.error('Delete staff error:', error);
      UI.toast("Không thể xóa nhân viên", "warn");
    }
  },

  async logout() {
    const confirmed = await UI.confirm({
      title: "Đăng xuất",
      message: "Bạn có chắc muốn đăng xuất khỏi hệ thống?",
      confirmText: "Đăng xuất",
      cancelText: "Ở lại",
      type: "danger",
      icon: "fa-right-from-bracket"
    });

    if (!confirmed) return;

    const token = localStorage.getItem('uiticket_token');

    this.stopAllIntervals();

    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    localStorage.removeItem('uiticket_token');
    localStorage.removeItem('uiticket_user');

    UI.toast("Đã đăng xuất!", "success");

    setTimeout(() => {
      window.location.href = "index.html";
    }, 500);
  }
};

const UI = {
  toast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    
    toast.textContent = message;
    toast.setAttribute('data-type', type);
    toast.style.display = "block";
    
    setTimeout(() => { 
      toast.style.display = "none"; 
    }, 2500);
  },

  showLoading() {
    let overlay = document.getElementById("loadingOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "loadingOverlay";
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        backdrop-filter: blur(2px);
      `;
      
      const spinner = document.createElement("div");
      spinner.style.cssText = `
        width: 60px;
        height: 60px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      `;
      
      overlay.appendChild(spinner);
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
  },

  hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
      overlay.style.display = "none";
    }
  },

  confirm(options) {
    return new Promise((resolve) => {
      const {
        title = "Xác nhận",
        message = "Bạn có chắc chắn?",
        confirmText = "Xác nhận",
        cancelText = "Hủy",
        type = "primary",
        icon = "fa-circle-question"
      } = options;

      const overlay = document.createElement("div");
      overlay.className = "confirm-overlay";
      
      overlay.innerHTML = `
        <div class="confirm-box">
          <div class="confirm-header">
            <div class="confirm-title">
              <i class="fa-solid ${icon}"></i>
              ${title}
            </div>
          </div>
          <div class="confirm-body">${message}</div>
          <div class="confirm-footer">
            <button class="confirm-btn cancel" data-action="cancel">${cancelText}</button>
            <button class="confirm-btn ${type}" data-action="confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      
      setTimeout(() => overlay.classList.add("show"), 10);

      const handleClick = (e) => {
        const action = e.target.dataset.action;
        if (action) {
          overlay.classList.remove("show");
          setTimeout(() => {
            overlay.remove();
            resolve(action === "confirm");
          }, 200);
        }
      };

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.classList.remove("show");
          setTimeout(() => {
            overlay.remove();
            resolve(false);
          }, 200);
        }
      });

      overlay.querySelector(".confirm-footer").addEventListener("click", handleClick);
    });
  },

  prompt(options) {
    return new Promise((resolve) => {
      const {
        title = "Nhập thông tin",
        message = "",
        placeholder = "",
        confirmText = "Xác nhận",
        cancelText = "Hủy",
        defaultValue = ""
      } = options;

      const overlay = document.createElement("div");
      overlay.className = "confirm-overlay";
      
      overlay.innerHTML = `
        <div class="confirm-box">
          <div class="confirm-header">
            <div class="confirm-title">
              <i class="fa-solid fa-keyboard"></i>
              ${title}
            </div>
          </div>
          <div class="confirm-body">
            ${message ? `<div style="margin-bottom:8px;">${message}</div>` : ''}
            <input type="text" class="confirm-input" placeholder="${placeholder}" value="${defaultValue}" />
          </div>
          <div class="confirm-footer">
            <button class="confirm-btn cancel" data-action="cancel">${cancelText}</button>
            <button class="confirm-btn primary" data-action="confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      setTimeout(() => overlay.classList.add("show"), 10);

      const input = overlay.querySelector(".confirm-input");
      input.focus();
      input.select();

      const cleanup = (value) => {
        overlay.classList.remove("show");
        setTimeout(() => {
          overlay.remove();
          resolve(value);
        }, 200);
      };

      const handleClick = (e) => {
        const action = e.target.dataset.action;
        if (action === "confirm") {
          cleanup(input.value.trim());
        } else if (action === "cancel") {
          cleanup(null);
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") cleanup(input.value.trim());
        if (e.key === "Escape") cleanup(null);
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cleanup(null);
      });

      overlay.querySelector(".confirm-footer").addEventListener("click", handleClick);
    });
  },

  alert(options) {
    return new Promise((resolve) => {
      const {
        title = "Thông báo",
        message = "",
        type = "primary",
        icon = "fa-circle-info",
        buttonText = "Đóng"
      } = options;

      const overlay = document.createElement("div");
      overlay.className = "confirm-overlay";
      
      overlay.innerHTML = `
        <div class="confirm-box">
          <div class="confirm-header">
            <div class="confirm-title">
              <i class="fa-solid ${icon}"></i>
              ${title}
            </div>
          </div>
          <div class="confirm-body">${message}</div>
          <div class="confirm-footer">
            <button class="confirm-btn ${type}" data-action="close">${buttonText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      setTimeout(() => overlay.classList.add("show"), 10);

      const cleanup = () => {
        overlay.classList.remove("show");
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 200);
      };

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.dataset.action === "close") {
          cleanup();
        }
      });
    });
  },

  toggleMenu() {
    const menu = document.getElementById("dropdownMenu");
    if (menu) {
      menu.classList.toggle("hidden");
    }
  }
};

async function refreshAdminBadge() {
  const token = localStorage.getItem("uiticket_token");
  const user = JSON.parse(localStorage.getItem("uiticket_user") || "{}");
  if (!isAdmin(user)) return;

  try {
    const res = await fetch(`${API_BASE_URL}/admin/reset-requests/count`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    const badge = document.getElementById("notifBadge");
    if (badge) {
      badge.textContent = data.count;
      badge.style.display = data.count > 0 ? "grid" : "none";
    }
  } catch (error) {
    console.error('Refresh badge error:', error);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

const LOCKED_PARAM_NAMES = new Set([
  'thoigianbaytoithieu',
  'sosanbaytrunggiantoida',
  'thoigiandungtoithieu',
  'thoigiandungtoida',
  'soluonghangve',
  'tilegiahangve1',
  'tilegiahangve2',
  'thoigiandatvechamnhat'
]);

function isLockedParameterName(name = '') {
  return LOCKED_PARAM_NAMES.has(String(name).trim().toLowerCase());
}

// ============================================
// INFO MODAL FUNCTIONS (SYSTEM INFO)
// ============================================
Object.assign(Dashboard, {
  currentInfoTab: 'airport',
  infoEditContext: null,

  showInfoModal() {
    const modal = document.getElementById("infoModal");
    if (modal) {
      modal.classList.remove("hidden");
      this.loadAirports();
      this.loadClasses();
      this.loadParameters();
    }
  },

  closeInfoModal() {
    const modal = document.getElementById("infoModal");
    if (modal) modal.classList.add("hidden");
  },

  switchInfoTab(tab) {
    this.currentInfoTab = tab;
    
    document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`.info-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(tab + 'Tab')?.classList.add('active');
  },

  openInfoEditModal(type, payload = {}) {
    const modal = document.getElementById("infoEditModal");
    const titleEl = document.getElementById("infoEditTitle");
    const form = document.getElementById("infoEditForm");
    if (!modal || !titleEl || !form) return;

    // Reset form content
    form.innerHTML = '';

    if (type === 'airport') {
      const { code = '', name = '', city = '', country = '' } = payload;
      this.infoEditContext = { type, originalCode: code };
      titleEl.textContent = 'Sửa thông tin sân bay';
      form.innerHTML = `
        <input type="text" id="editAirportCode" placeholder="Mã sân bay" value="${escapeHtml(code)}" />
        <input type="text" id="editAirportName" placeholder="Tên sân bay" value="${escapeHtml(name)}" />
        <input type="text" id="editAirportCity" placeholder="Thành phố" value="${escapeHtml(city)}" />
        <input type="text" id="editAirportCountry" placeholder="Quốc gia" value="${escapeHtml(country)}" />
      `;
    } else if (type === 'class') {
      const { code = '', name = '', ratio = '' } = payload;
      this.infoEditContext = { type, originalCode: code };
      titleEl.textContent = 'Sửa hạng vé';
      form.innerHTML = `
        <input type="text" id="editClassCode" placeholder="Mã hạng vé" value="${escapeHtml(code)}" />
        <input type="text" id="editClassName" placeholder="Tên hạng vé" value="${escapeHtml(name)}" />
        <input type="number" step="0.01" id="editClassRatio" placeholder="Tỷ lệ giá" value="${escapeHtml(ratio)}" />
      `;
    } else if (type === 'parameter') {
      const { name = '', value = '', desc = '' } = payload;
      const locked = isLockedParameterName(name);
      this.infoEditContext = { type, originalName: name, locked };
      titleEl.textContent = 'Sửa tham số hệ thống';
      form.innerHTML = `
        <input type="text" id="editParamName" placeholder="Tên tham số" value="${escapeHtml(name)}" ${locked ? 'readonly style="background:#f1f5f9;color:#6b7280;cursor:not-allowed;"' : ''} />
        <input type="text" id="editParamValue" placeholder="Giá trị" value="${escapeHtml(value)}" />
        <input type="text" id="editParamDesc" placeholder="Mô tả" value="${escapeHtml(desc || '')}" />
        ${locked ? '<div class="info-note" style="font-size:12px;color:var(--muted);">Tên tham số này được cố định để tránh sai lệch giữa các màn hình.</div>' : ''}
      `;
    } else {
      return;
    }

    modal.classList.remove('hidden');
  },

  closeInfoEditModal() {
    const modal = document.getElementById("infoEditModal");
    const form = document.getElementById("infoEditForm");
    if (modal) modal.classList.add('hidden');
    if (form) form.innerHTML = '';
    this.infoEditContext = null;
  },

  async submitInfoEdit() {
    const ctx = this.infoEditContext;
    if (!ctx) {
      this.closeInfoEditModal();
      return;
    }

    const token = localStorage.getItem("uiticket_token");

    try {
      if (ctx.type === 'airport') {
        const code = document.getElementById("editAirportCode")?.value?.trim().toUpperCase();
        const name = document.getElementById("editAirportName")?.value?.trim();
        const city = document.getElementById("editAirportCity")?.value?.trim();
        const country = document.getElementById("editAirportCountry")?.value?.trim();

        if (!code || !name) {
          UI.toast('Vui lòng nhập mã và tên sân bay', 'warn');
          return;
        }

        UI.showLoading();
        const res = await fetch(`${API_BASE_URL}/admin/airports/${encodeURIComponent(ctx.originalCode)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code, name, city, country })
        });
        const data = await res.json();
        UI.hideLoading();

        if (!res.ok) {
          UI.toast(data.error || 'Lỗi cập nhật sân bay', 'warn');
          return;
        }

        UI.toast('Cập nhật sân bay thành công', 'success');
        this.closeInfoEditModal();
        await this.loadAirports();
      } else if (ctx.type === 'class') {
        const code = document.getElementById("editClassCode")?.value?.trim().toUpperCase();
        const name = document.getElementById("editClassName")?.value?.trim();
        const ratio = parseFloat(document.getElementById("editClassRatio")?.value);

        if (!code || !name || Number.isNaN(ratio)) {
          UI.toast('Vui lòng nhập đầy đủ thông tin hạng vé', 'warn');
          return;
        }

        UI.showLoading();
        const res = await fetch(`${API_BASE_URL}/admin/classes/${encodeURIComponent(ctx.originalCode)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code, name, ratio })
        });
        const data = await res.json();
        UI.hideLoading();

        if (!res.ok) {
          UI.toast(data.error || 'Lỗi cập nhật hạng vé', 'warn');
          return;
        }

        UI.toast('Cập nhật hạng vé thành công', 'success');
        this.closeInfoEditModal();
        await this.loadClasses();
      } else if (ctx.type === 'parameter') {
        const rawName = document.getElementById("editParamName")?.value?.trim();
        const value = document.getElementById("editParamValue")?.value?.trim();
        const desc = document.getElementById("editParamDesc")?.value?.trim();
        const name = ctx.locked ? ctx.originalName : rawName;

        if (!name || !value) {
          UI.toast('Vui lòng nhập tên và giá trị tham số', 'warn');
          return;
        }

        UI.showLoading();
        const res = await fetch(`${API_BASE_URL}/admin/parameters/${encodeURIComponent(ctx.originalName)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, value, desc })
        });
        const data = await res.json();
        UI.hideLoading();

        if (!res.ok) {
          UI.toast(data.error || 'Lỗi cập nhật tham số', 'warn');
          return;
        }

        UI.toast('Cập nhật tham số thành công', 'success');
        this.closeInfoEditModal();
        await this.loadParameters();
      }
    } catch (error) {
      UI.hideLoading();
      console.error('Submit info edit error:', error);
      UI.toast('Không thể cập nhật, vui lòng thử lại', 'warn');
    }
  },

  editAirport(code, name, city, country) {
    this.openInfoEditModal('airport', { code, name, city, country });
  },

  editClass(code, name, ratio) {
    this.openInfoEditModal('class', { code, name, ratio });
  },

  editParameter(name, value, desc) {
    this.openInfoEditModal('parameter', { name, value, desc });
  },

  // ✅ AIRPORT FUNCTIONS
  async loadAirports() {
    const token = localStorage.getItem("uiticket_token");
    const list = document.getElementById("airportList");
    if (!list) return;

    try {
      const res = await fetch(`${API_BASE_URL}/admin/airports`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!data.airports) {
        list.innerHTML = '<div class="info-empty">Chưa có sân bay nào</div>';
        return;
      }

      list.innerHTML = data.airports.map(a => `
        <div class="info-item">
          <div class="info-item-main">
            <div class="info-item-code">${escapeHtml(a.ma_san_bay)}</div>
            <div class="info-item-details">
              <div class="info-item-name">${escapeHtml(a.ten_san_bay)}</div>
              <div class="info-item-subtext">${escapeHtml(a.thanh_pho || '')} - ${escapeHtml(a.quoc_gia || '')}</div>
            </div>
          </div>
          <button class="info-edit-btn" onclick="Dashboard.editAirport('${escapeHtml(a.ma_san_bay)}', '${escapeHtml(a.ten_san_bay)}', '${escapeHtml(a.thanh_pho || '')}', '${escapeHtml(a.quoc_gia || '')}')">
            <i class='fa-solid fa-pen'></i>
          </button>
          <button class="info-del-btn" onclick="Dashboard.deleteAirport('${escapeHtml(a.ma_san_bay)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `).join('');
    } catch (error) {
      console.error('Load airports error:', error);
      UI.toast('Lỗi tải sân bay', 'warn');
    }
  },

  async addAirport() {
    const token = localStorage.getItem("uiticket_token");
    const code = document.getElementById("airportCode")?.value?.trim().toUpperCase();
    const name = document.getElementById("airportName")?.value?.trim();
    const city = document.getElementById("airportCity")?.value?.trim();
    const country = document.getElementById("airportCountry")?.value?.trim();

    if (!code || !name) {
      UI.toast("Vui lòng nhập mã & tên sân bay", "warn");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/airports`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code, name, city, country })
      });
      const data = await res.json();
      
      if (!res.ok) {
        UI.toast(`${data.error || 'Lỗi thêm sân bay'}`, 'warn');
        return;
      }

      UI.toast("Thêm sân bay thành công", "success");
      document.getElementById("airportCode").value = '';
      document.getElementById("airportName").value = '';
      document.getElementById("airportCity").value = '';
      document.getElementById("airportCountry").value = '';
      this.loadAirports();
    } catch (error) {
      console.error('Add airport error:', error);
      UI.toast('Lỗi thêm sân bay', 'warn');
    }
  },

  async deleteAirport(code) {
    const confirmed = await UI.confirm({
      title: "Xóa sân bay",
      message: `Bạn có chắc muốn xóa sân bay ${escapeHtml(code)} này?`,
      confirmText: "Xóa",
      cancelText: "Hủy",
      type: "danger",
      icon: "fa-trash"
    });

    if (!confirmed) return;

    const token = localStorage.getItem("uiticket_token");
    
    try {
      const res = await fetch(`${API_BASE_URL}/admin/airports/${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        UI.toast(`${data.error || 'Lỗi xóa sân bay'}`, 'warn');
        return;
      }

      UI.toast("Đã xóa sân bay", "success");
      this.loadAirports();
    } catch (error) {
      console.error('Delete airport error:', error);
      UI.toast('Lỗi xóa sân bay', 'warn');
    }
  },

  // ✅ CLASS FUNCTIONS
  async loadClasses() {
    const token = localStorage.getItem("uiticket_token");
    const list = document.getElementById("classList");
    if (!list) return;

    try {
      const res = await fetch(`${API_BASE_URL}/admin/classes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!data.classes) {
        list.innerHTML = '<div class="info-empty">Chưa có hạng vé nào</div>';
        return;
      }

      list.innerHTML = data.classes.map(c => `
        <div class="info-item">
          <div class="info-item-main">
            <div class="info-item-code">${escapeHtml(c.ma_hang_ve)}</div>
            <div class="info-item-details">
              <div class="info-item-name">${escapeHtml(c.ten_hang_ve)}</div>
              <div class="info-item-subtext">Tỷ lệ: ${c.ti_le_gia}x</div>
            </div>
          </div>
          <button class="info-edit-btn" onclick="Dashboard.editClass('${escapeHtml(c.ma_hang_ve)}', '${escapeHtml(c.ten_hang_ve)}', '${c.ti_le_gia}')">
            <i class='fa-solid fa-pen'></i>
          </button>
          <button class="info-del-btn" onclick="Dashboard.deleteClass('${escapeHtml(c.ma_hang_ve)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `).join('');
    } catch (error) {
      console.error('Load classes error:', error);
      UI.toast('Lỗi tải hạng vé', 'warn');
    }
  },

  async addClass() {
    const token = localStorage.getItem("uiticket_token");
    const code = document.getElementById("className")?.value?.trim().toUpperCase();
    const name = document.getElementById("classDisplayName")?.value?.trim();
    const ratio = parseFloat(document.getElementById("classPriceRatio")?.value);

    if (!code || !name || isNaN(ratio)) {
      UI.toast("Vui lòng nhập đầy đủ thông tin", "warn");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/classes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code, name, ratio })
      });
      const data = await res.json();
      
      if (!res.ok) {
        UI.toast(`${data.error || 'Lỗi thêm hạng vé'}`, 'warn');
        return;
      }

      UI.toast("Thêm hạng vé thành công", "success");
      document.getElementById("className").value = '';
      document.getElementById("classDisplayName").value = '';
      document.getElementById("classPriceRatio").value = '';
      this.loadClasses();
    } catch (error) {
      console.error('Add class error:', error);
      UI.toast('Lỗi thêm hạng vé', 'warn');
    }
  },

  async deleteClass(code) {
    const confirmed = await UI.confirm({
      title: "Xóa hạng vé",
      message: `Bạn có chắc muốn xóa hạng vé ${escapeHtml(code)} này?`,
      confirmText: "Xóa",
      cancelText: "Hủy",
      type: "danger",
      icon: "fa-trash"
    });

    if (!confirmed) return;

    const token = localStorage.getItem("uiticket_token");
    
    try {
      const res = await fetch(`${API_BASE_URL}/admin/classes/${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        UI.toast(`${data.error || 'Lỗi xóa hạng vé'}`, 'warn');
        return;
      }

      UI.toast("Đã xóa hạng vé", "success");
      this.loadClasses();
    } catch (error) {
      console.error('Delete class error:', error);
      UI.toast('Lỗi xóa hạng vé', 'warn');
    }
  },

  // ✅ PARAMETER FUNCTIONS
  async loadParameters() {
    const token = localStorage.getItem("uiticket_token");
    const list = document.getElementById("parameterList");
    if (!list) return;

    try {
      const res = await fetch(`${API_BASE_URL}/admin/parameters`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!data.parameters) {
        list.innerHTML = '<div class="info-empty">Chưa có tham số nào</div>';
        return;
      }

      list.innerHTML = data.parameters.map(p => `
        <div class="info-item">
          <div class="info-item-main">
            <div class="info-item-code">${escapeHtml(p.ten_tham_so)}</div>
            <div class="info-item-details">
              <div class="info-item-name">${escapeHtml(p.gia_tri)}</div>
              <div class="info-item-subtext">${escapeHtml(p.mo_ta || '(không có mô tả)')}</div>
            </div>
          </div>
          <button class="info-edit-btn" onclick="Dashboard.editParameter('${escapeHtml(p.ten_tham_so)}', \`${p.gia_tri ? String(p.gia_tri).replace(/`/g, '\u0060').replace(/\\/g, '\\') : ''}\`, \`${p.mo_ta ? String(p.mo_ta).replace(/`/g, '\u0060').replace(/\\/g, '\\') : ''}\`)">
            <i class='fa-solid fa-pen'></i>
          </button>
        </div>
      `).join('');
    } catch (error) {
      console.error('Load parameters error:', error);
      UI.toast('Lỗi tải tham số', 'warn');
    }
  },

  async addParameter() {
    const token = localStorage.getItem("uiticket_token");
    const name = document.getElementById("paramName")?.value?.trim();
    const value = document.getElementById("paramValue")?.value?.trim();
    const desc = document.getElementById("paramDesc")?.value?.trim();

    if (!name || !value) {
      UI.toast("Vui lòng nhập tên & giá trị tham số", "warn");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/parameters`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, value, desc })
      });
      const data = await res.json();
      
      if (!res.ok) {
        UI.toast(`${data.error || 'Lỗi thêm tham số'}`, 'warn');
        return;
      }

      UI.toast("Thêm tham số thành công", "success");
      document.getElementById("paramName").value = '';
      document.getElementById("paramValue").value = '';
      document.getElementById("paramDesc").value = '';
      this.loadParameters();
    } catch (error) {
      console.error('Add parameter error:', error);
      UI.toast('Lỗi thêm tham số', 'warn');
    }
  },

  async deleteParameter(name) {
    const confirmed = await UI.confirm({
      title: "Xóa tham số",
      message: `Bạn có chắc muốn xóa tham số ${escapeHtml(name)} này?`,
      confirmText: "Xóa",
      cancelText: "Hủy",
      type: "danger",
      icon: "fa-trash"
    });

    if (!confirmed) return;

    const token = localStorage.getItem("uiticket_token");
    
    try {
      const res = await fetch(`${API_BASE_URL}/admin/parameters/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        UI.toast(`${data.error || 'Lỗi xóa tham số'}`, 'warn');
        return;
      }

      UI.toast("Đã xóa tham số", "success");
      this.loadParameters();
    } catch (error) {
      console.error('Delete parameter error:', error);
      UI.toast('Lỗi xóa tham số', 'warn');
    }
  }
});

window.addEventListener('beforeunload', () => {
  Dashboard.stopAllIntervals();
});

Dashboard.init();