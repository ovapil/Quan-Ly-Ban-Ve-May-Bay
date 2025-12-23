const ReceiveSchedule = {
  airports: [
    { code: "SGN", name: "Tân Sơn Nhất" },
    { code: "HAN", name: "Nội Bài" },
    { code: "DAD", name: "Đà Nẵng" },
    { code: "CXR", name: "Cam Ranh" },
    { code: "PQC", name: "Phú Quốc" },
    { code: "VCA", name: "Cần Thơ" },
    { code: "HPH", name: "Cát Bi" },
  ],

  init() {
    const session = Storage.getSession();
    if (!session) {
      window.location.href = "index.html";
      return;
    }

    this.bindHeader();
    this.buildSelects();
    this.bindActions();
  },

  bindHeader() {
    const $ = (id) => document.getElementById(id);

    $("tabHome")?.addEventListener("click", () => window.location.href = "dashboard.html");
    $("tabAccount")?.addEventListener("click", () => UI.toast("Tab Tài khoản (demo)", "warn"));
    $("tabSettings")?.addEventListener("click", () => UI.toast("Tab Cài đặt (demo)", "warn"));

    $("btnNoti")?.addEventListener("click", () => {
      const b = $("notifBadge");
      if (b) b.style.display = "none";
      UI.toast("Thông báo: Bạn có 1 yêu cầu mới (demo)", "success");
    });
  },

  buildSelects() {
    const airportOpts = this.airports
      .map(a => `<option value="${a.code}">${a.code} - ${a.name}</option>`)
      .join("");

    ["fromAirport","toAirport","stopAirport1","stopAirport2"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">-- Chọn --</option>${airportOpts}`;
    });

    this.fillNumberSelect("durationHours", 0, 23, true);
    this.fillNumberSelect("durationMinutes", 0, 59, true);

    this.fillNumberSelect("stopH1", 0, 23, true);
    this.fillNumberSelect("stopM1", 0, 59, true);
    this.fillNumberSelect("stopH2", 0, 23, true);
    this.fillNumberSelect("stopM2", 0, 59, true);

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dateEl = document.getElementById("flightDate");
    if (dateEl) dateEl.value = `${yyyy}-${mm}-${dd}`;
  },

  fillNumberSelect(id, start, end, pad2 = false) {
    const el = document.getElementById(id);
    if (!el) return;
    let html = "";
    for (let i = start; i <= end; i++) {
      const v = pad2 ? String(i).padStart(2, "0") : String(i);
      html += `<option value="${v}">${v}</option>`;
    }
    el.innerHTML = html;
  },

  bindActions() {
    const $ = (id) => document.getElementById(id);

    $("btnBack")?.addEventListener("click", () => window.location.href = "dashboard.html");
    $("btnUp")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    $("btnDown")?.addEventListener("click", () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));

    $("btnSwap")?.addEventListener("click", () => {
      const a = $("fromAirport");
      const b = $("toAirport");
      if (!a || !b) return;
      const tmp = a.value;
      a.value = b.value;
      b.value = tmp;
      UI.toast("Đã đổi sân bay đi/đến", "success");
    });

    $("btnMiniSave")?.addEventListener("click", () => UI.toast("Đã lưu số lượng ghế (demo)", "success"));

    $("btnDelete")?.addEventListener("click", () => {
      ["flightCode","ticketPrice","departHH","departMM","seatQty","stopNote1","stopNote2"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
      ["fromAirport","toAirport","stopAirport1","stopAirport2"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
      UI.toast("Đã xoá form (demo)", "warn");
    });

    $("btnSave")?.addEventListener("click", () => {
      UI.toast("Đã lưu lịch chuyến bay (demo)", "success");
    });
  }
};

ReceiveSchedule.init();
