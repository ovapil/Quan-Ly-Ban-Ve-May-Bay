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

  handleSignup() {
    const user = document.getElementById("signupUser").value.trim();
    const email = document.getElementById("signupEmail").value.trim();

    if (!user) return alert("Vui lòng nhập tên tài khoản!");
    if (!email) return alert("Vui lòng nhập email!");

    const users = Storage.getJSON("uiticket_users", []);
    if (users.some(u => u.username.toLowerCase() === user.toLowerCase())) {
      return alert("Tên tài khoản đã tồn tại!");
    }

    const role = (user.toLowerCase() === "admin") ? "Admin" : "User";
    users.unshift({ username: user, email, role, createdAt: new Date().toISOString() });
    Storage.setJSON("uiticket_users", users);

    UI.toast("🎉 Đăng ký thành công!", "success");

    setTimeout(() => {
      AuthUI.showLogin();
      document.getElementById("loginUser").value = user;
      ["signupUser","signupEmail","signupPass","signupPassConfirm"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
    }, 650);
  },

  handleLogin() {
    const username = document.getElementById("loginUser").value.trim();
    if (!username) return alert("Vui lòng nhập tên tài khoản!");

    const users = Storage.getJSON("uiticket_users", []);
    const found = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    const session = {
      username: found?.username || username,
      role: found?.role || (username.toLowerCase() === "admin" ? "Admin" : "User"),
      email: found?.email || ""
    };

    const remember = document.getElementById("remember").checked;
    Storage.setSession(session, remember);

    UI.toast("✅ Đăng nhập thành công!", "success");

    // ✅ Chuyển sang trang dashboard
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 450);
  },

  sendResetRequest() {
    const user = document.getElementById("resetUser").value.trim();
    const email = document.getElementById("resetEmail").value.trim();
    const msg = document.getElementById("resetMessage").value.trim();

    if (!user) return alert("Vui lòng nhập Tên tài khoản!");
    if (!email) return alert("Vui lòng nhập Email đã đăng ký!");

    const users = Storage.getJSON("uiticket_users", []);
    const matched = users.find(u =>
      u.username.toLowerCase() === user.toLowerCase() &&
      u.email.toLowerCase() === email.toLowerCase()
    );

    if (!matched) {
      UI.toast("❌ Username/Email không khớp!", "warn");
      return;
    }

    const requests = Storage.getJSON("uiticket_reset_requests", []);
    requests.unshift({
      user, email,
      message: msg || "Yêu cầu reset mật khẩu.",
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent
    });
    Storage.setJSON("uiticket_reset_requests", requests);

    UI.toast("✅ Đã gửi yêu cầu reset tới Admin!", "success");

    ["resetUser","resetEmail","resetMessage"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    setTimeout(() => AuthUI.showLogin(), 650);
  }
};

Auth.init();
