// ============================================
// AUTH.JS - KẾT NỐI API BACKEND (FIXED VERSION)
// ============================================

const API_BASE_URL = 'http://localhost:3000/api';

const AuthUI = {
  hideAll() {
    ["welcome-screen", "login-screen", "signup-screen", "forgot-screen"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  },
  showWelcome() {
    this.hideAll();
    document.getElementById("welcome-screen").style.display = "block";
  },
  showLogin() {
    this.hideAll();
    document.getElementById("login-screen").style.display = "flex";
    history.pushState({ screen: "login" }, "");
  },
  showSignup() {
    this.hideAll();
    document.getElementById("signup-screen").style.display = "flex";
    history.pushState({ screen: "signup" }, "");
  },
  showForgot() {
    this.hideAll();
    document.getElementById("forgot-screen").style.display = "flex";
    history.pushState({ screen: "forgot" }, "");
  }
};

const Auth = {
  init() {
    // Toggle password login
    const passwordInput = document.getElementById("passwordInput");
    const toggleBtn = document.getElementById("togglePasswordBtn");
    if (passwordInput && toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        if (passwordInput.type === "password") {
          passwordInput.type = "text";
          toggleBtn.classList.replace("fa-eye-slash", "fa-eye");
        } else {
          passwordInput.type = "password";
          toggleBtn.classList.replace("fa-eye", "fa-eye-slash");
        }
      });
    }

    // Toggle password signup
    const signupPass = document.getElementById("signupPass");
    const toggleSignupBtn = document.getElementById("toggleSignupBtn");
    if (signupPass && toggleSignupBtn) {
      toggleSignupBtn.addEventListener("click", () => {
        if (signupPass.type === "password") {
          signupPass.type = "text";
          toggleSignupBtn.classList.replace("fa-eye-slash", "fa-eye");
        } else {
          signupPass.type = "password";
          toggleSignupBtn.classList.replace("fa-eye", "fa-eye-slash");
        }
      });
    }

    window.onpopstate = () => AuthUI.showWelcome();
  },

  // ✅ Đăng ký qua API
  async handleSignup() {
    const user = document.getElementById("signupUser").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const pass = document.getElementById("signupPass").value;
    const passConfirm = document.getElementById("signupPassConfirm").value;

    // Validate
    if (!user) return alert("Vui lòng nhập tên tài khoản!");
    if (user.length < 3) return alert("Tên tài khoản phải có ít nhất 3 ký tự!");
    if (!email) return alert("Vui lòng nhập email!");
    if (!/\S+@\S+\.\S+/.test(email)) return alert("Email không hợp lệ!");
    if (!pass) return alert("Vui lòng nhập mật khẩu!");
    if (pass.length < 6) return alert("Mật khẩu phải có ít nhất 6 ký tự!");
    if (pass !== passConfirm) return alert("Mật khẩu xác nhận không khớp!");

    try {
      UI.showLoading();

      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, email, password: pass })
      });

      const data = await response.json();
      
      UI.hideLoading();

      if (!response.ok) {
        UI.toast(`❌ ${data.error || "Đăng ký thất bại"}`, "warn");
        return;
      }

      UI.toast("🎉 Đăng ký thành công!", "success");

      setTimeout(() => {
        AuthUI.showLogin();
        document.getElementById("loginUser").value = user;
        ["signupUser", "signupEmail", "signupPass", "signupPassConfirm"].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
      }, 650);

    } catch (error) {
      UI.hideLoading();
      console.error('Signup error:', error);
      UI.toast("❌ Lỗi kết nối server. Vui lòng kiểm tra backend đã chạy chưa!", "warn");
    }
  },

  // ✅ Đăng nhập qua API
  async handleLogin() {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("passwordInput").value;

    if (!username) return alert("Vui lòng nhập tên tài khoản!");
    if (!password) return alert("Vui lòng nhập mật khẩu!");

    const remember = document.getElementById("remember").checked;

    try {
      UI.showLoading();

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember })
      });

      const data = await response.json();
      
      UI.hideLoading();

      if (!response.ok) {
        UI.toast(`❌ ${data.error || "Đăng nhập thất bại"}`, "warn");
        return;
      }

      // ✅ Lưu token và user info
      localStorage.setItem('uiticket_token', data.token);
      localStorage.setItem('uiticket_user', JSON.stringify(data.user));

      UI.toast("✅ Đăng nhập thành công!", "success");

      // ✅ Clear form
      document.getElementById("passwordInput").value = "";
      document.getElementById("remember").checked = false;

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 450);

    } catch (error) {
      UI.hideLoading();
      console.error('Login error:', error);
      UI.toast("❌ Lỗi kết nối server. Vui lòng kiểm tra backend đã chạy chưa!", "warn");
    }
  },

  // ✅ Gửi yêu cầu reset qua API
  async sendResetRequest() {
    const user = document.getElementById("resetUser").value.trim();
    const email = document.getElementById("resetEmail").value.trim();
    const msg = document.getElementById("resetMessage").value.trim();

    if (!user) return alert("Vui lòng nhập Tên tài khoản!");
    if (!email) return alert("Vui lòng nhập Email đã đăng ký!");

    UI.showLoading();

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, email, message: msg })
      });

      const data = await response.json();

      UI.hideLoading();

      if (!response.ok) {
        UI.toast(`❌ ${data.error || "Gửi yêu cầu thất bại"}`, "warn");
        return;
      }

      UI.toast("✅ Đã gửi yêu cầu reset tới Admin!", "success");

      // ✅ Clear form
      ["resetUser", "resetEmail", "resetMessage"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      setTimeout(() => AuthUI.showLogin(), 650);

    } catch (error) {
      UI.hideLoading();
      console.error('Reset request error:', error);
      UI.toast("❌ Lỗi kết nối server!", "warn");
    }
  }
};

// ============================================
// UI UTILITIES
// ============================================
const UI = {
  // Toast notification
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

  // Loading overlay
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
    if (overlay) overlay.style.display = "none";
  }
};

Auth.init();