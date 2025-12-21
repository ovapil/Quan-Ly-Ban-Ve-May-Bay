const Dashboard = {
  init() {
    const session = Storage.getSession();
    if (!session) {
      // chưa login -> quay về index
      window.location.href = "index.html";
      return;
    }

    this.applySession(session);
    this.initAvatar();
  },

  applySession(session) {
    const nameEl = document.getElementById("homeName");
    const roleEl = document.getElementById("homeRole");
    const chipEl = document.getElementById("roleChip");
    const systemTile = document.getElementById("systemTile");

    nameEl.textContent = (session.role === "Admin") ? "Nguyễn Văn A" : session.username;
    roleEl.textContent = session.role;

    chipEl.style.background = (session.role === "Admin") ? "var(--chip-admin)" : "var(--primary)";

    if (session.role !== "Admin") {
      systemTile.classList.add("disabled");
      systemTile.title = "Không đủ quyền";
    } else {
      systemTile.classList.remove("disabled");
      systemTile.title = "";
    }
  },

  initAvatar() {
    const img = document.getElementById("avatarImg");
    const fallback = document.getElementById("avatarFallback");
    if (!img || !fallback) return;

    img.onload = () => { img.style.display = "block"; fallback.style.display = "none"; };
    img.onerror = () => { img.style.display = "none"; fallback.style.display = "block"; };
    img.src = "avatar.png";
  },

  tileClick(key) {
    const session = Storage.getSession() || { role: "User" };

    if (key === "system" && session.role !== "Admin") {
      UI.toast("❌ Không đủ quyền", "warn");
      return;
    }

    const map = {
      profile: "Mở Hồ sơ (demo)",
      lookup: "Tra cứu Chuyến bay (demo)",
      customers: "Khách hàng / Hành khách (demo)",
      booking: "Quản lý Đặt vé (demo)",
      schedule: "Nhận lịch Chuyến bay (demo)",
      report: "Báo cáo / Thống kê (demo)",
      sell: "Bán vé (demo)",
      system: "Hệ thống / Cài đặt (Admin) (demo)"
    };
    UI.toast(map[key] || "Tính năng (demo)", "success");
  },

  tabClick(tab) {
    UI.toast(`Tab: ${tab} (demo)`, "warn");
  },

  openNotifications() {
    const b = document.getElementById("notifBadge");
    if (b) b.style.display = "none";
    UI.toast("Thông báo: Bạn có 1 yêu cầu mới (demo)", "success");
  },

  logout() {
    Storage.clearSession();
    window.location.href = "index.html";
  }
};

Dashboard.init();
