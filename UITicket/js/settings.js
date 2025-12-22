// ============================================
// SETTINGS.JS - Quản lý trang cài đặt
// ============================================

const API_BASE_URL = 'http://localhost:3000/api';

const Settings = {
  async init() {
    // Verify token
    const token = localStorage.getItem('uiticket_token');
    if (!token) {
      window.location.href = 'index.html';
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Token không hợp lệ');
      }

      const data = await response.json();
      this.applyUserInfo(data.user);

    } catch (error) {
      console.error('Verify error:', error);
      localStorage.removeItem('uiticket_token');
      localStorage.removeItem('uiticket_user');
      window.location.href = 'index.html';
    }
  },

  applyUserInfo(user) {
    localStorage.setItem('uiticket_user', JSON.stringify(user));
  },

  showLogoutConfirm() {
    document.getElementById('logoutModal').classList.add('show');
  },

  closeLogoutConfirm() {
    document.getElementById('logoutModal').classList.remove('show');
  },

  async handleLogout() {
    const token = localStorage.getItem('uiticket_token');

    try {
      UI.showLoading();

      // Call logout API
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error('Logout API error');
      }

      UI.hideLoading();
    } catch (error) {
      UI.hideLoading();
      console.error('Logout error:', error);
    }

    // Clear localStorage
    localStorage.removeItem('uiticket_token');
    localStorage.removeItem('uiticket_user');

    // Redirect to login
    UI.toast('👋 Đã đăng xuất!', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 800);
  },

  goToDashboard() {
    window.location.href = 'dashboard.html';
  },

  goToAccount() {
    window.location.href = 'account.html';
  }
};

const UI = {
  showLoading() {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      `;
      overlay.innerHTML = `
        <div style="
          background: white;
          border-radius: 12px;
          padding: 24px 48px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
        ">
          <i class="fa-solid fa-spinner" style="
            font-size: 32px;
            color: var(--primary);
            animation: spin 1s linear infinite;
          "></i>
          <p style="margin: 12px 0 0; color: var(--text); font-weight: 600;">Đang xử lý...</p>
        </div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  },

  hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  },

  toast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.setAttribute('data-type', type);
    toast.style.display = 'block';

    setTimeout(() => {
      toast.style.display = 'none';
    }, 2500);
  }
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  Settings.init();
});

// Close modal when clicking backdrop
document.addEventListener('click', (e) => {
  if (e.target.id === 'logoutModal') {
    Settings.closeLogoutConfirm();
  }
});
