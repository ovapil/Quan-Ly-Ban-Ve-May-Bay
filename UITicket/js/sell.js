// ============================================
// SELL.JS - Bán vé (BM2 + QĐ2)
// - Token: uiticket_token / uiticket_user
// - Preview mode: sell.html?preview=1
// ============================================

const API_BASE_URL = "http://localhost:3000/api";

// Toast nhỏ (sell.html có <div id="toast">)
const UI = {
  toast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.setAttribute("data-type", type);
    toast.style.display = "block";

    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toast.style.display = "none"), 2200);
  }
};

function getToken() {
  return localStorage.getItem("uiticket_token");
}

function isPreviewMode() {
  const qs = new URLSearchParams(window.location.search);
  return qs.has("preview") || qs.get("preview") === "1";
}

async function tryVerifyToken(token) {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, user: data.user };
  } catch {
    return { ok: "skip" };
  }
}

const SellPage = {
  flights: [
    // Demo data (mỗi chuyến có base riêng)
    { code: "VN123", from: "Hồ Chí Minh City", to: "Hà Nội", departISO: "2024-04-25T08:30:00", duration: "1 giờ 30 phút", base: 1000000, seats1: 1, seats2: 6, booked: 24 },
    { code: "VN234", from: "Hồ Chí Minh City", to: "Hà Nội", departISO: "2024-04-25T10:00:00", duration: "1 giờ 30 phút", base: 1000000, seats1: 2, seats2: 4, booked: 26 },
    { code: "VN345", from: "Hồ Chí Minh City", to: "Hà Nội", departISO: "2024-04-25T12:00:00", duration: "1 giờ 30 phút", base: 1000000, seats1: 0, seats2: 0, booked: 30 },
    { code: "VN678", from: "Đà Nẵng", to: "Hà Nội", departISO: "2024-04-26T09:15:00", duration: "1 giờ 20 phút", base: 900000, seats1: 3, seats2: 8, booked: 12 }
  ],

  filtered: [],
  selected: null,

  el: {},

  totalSeats(f) { return (f.seats1 || 0) + (f.seats2 || 0); },

  fmtMoney(n) {
    return new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + " Vđ";
  },

  fmtDate(dISO) {
    const d = new Date(dISO);
    return d.toLocaleDateString("vi-VN");
  },

  fmtDateTime(dISO) {
    const d = new Date(dISO);
    const date = d.toLocaleDateString("vi-VN");
    const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  },

  priceByClass(base, cls) {
    // QĐ2: Hạng 1 = 105% đơn giá; Hạng 2 = 100%
    return cls === "1" ? Math.round(base * 1.05) : base;
  },

  async init() {
    if (isPreviewMode()) {
      UI.toast("👀 Preview UI (không cần đăng nhập)", "warn");
      this.startUI();
      return;
    }

    const token = getToken();
    if (!token) {
      window.location.href = "index.html";
      return;
    }

    const verify = await tryVerifyToken(token);
    if (verify.ok === false) {
      localStorage.removeItem("uiticket_token");
      localStorage.removeItem("uiticket_user");
      UI.toast("⚠️ Phiên đăng nhập hết hạn, vui lòng đăng nhập lại", "warn");
      setTimeout(() => (window.location.href = "index.html"), 600);
      return;
    }

    if (verify.ok === "skip") {
      UI.toast("⚠️ Backend chưa chạy, đang mở UI (demo)", "warn");
    } else if (verify.ok === true && verify.user) {
      localStorage.setItem("uiticket_user", JSON.stringify(verify.user));
    }

    this.startUI();
  },

  startUI() {
    this.cache();
    this.bind();
    this.seedFilters();

    this.filtered = [...this.flights];
    this.renderFlights();
    this.recalcAndValidate();
  },

  cache() {
    this.el = {
      fromAirport: document.getElementById("fromAirport"),
      toAirport: document.getElementById("toAirport"),
      departDate: document.getElementById("departDate"),
      btnSearch: document.getElementById("btnSearch"),
      btnSwap: document.getElementById("btnSwap"),
      btnNoti: document.getElementById("btnNoti"),

      flightTable: document.getElementById("flightTable"),
      emptyFlights: document.getElementById("emptyFlights"),

      selectedWrap: document.getElementById("selectedWrap"),
      selCode: document.getElementById("selCode"),
      selRoute: document.getElementById("selRoute"),
      selDepart: document.getElementById("selDepart"),
      selBase: document.getElementById("selBase"),
      selSeat1: document.getElementById("selSeat1"),
      selSeat2: document.getElementById("selSeat2"),

      formAlert: document.getElementById("formAlert"),
      ticketForm: document.getElementById("ticketForm"),

      passengerName: document.getElementById("passengerName"),
      cmnd: document.getElementById("cmnd"),
      phone: document.getElementById("phone"),
      ticketClass: document.getElementById("ticketClass"),

      errName: document.getElementById("errName"),
      errCmnd: document.getElementById("errCmnd"),
      errPhone: document.getElementById("errPhone"),

      seatNote: document.getElementById("seatNote"),
      classPrice: document.getElementById("classPrice"),
      totalPrice: document.getElementById("totalPrice"),

      btnSell: document.getElementById("btnSell"),
      btnReset: document.getElementById("btnReset"),
    };
  },

  bind() {
    if (this.el.btnNoti) {
      this.el.btnNoti.onclick = () => UI.toast("🔔 Thông báo (demo)", "warn");
    }

    if (this.el.btnSearch) this.el.btnSearch.addEventListener("click", () => this.applyFilter());

    if (this.el.btnSwap) {
      this.el.btnSwap.addEventListener("click", () => {
        if (!this.el.fromAirport || !this.el.toAirport) return;
        const tmp = this.el.fromAirport.value;
        this.el.fromAirport.value = this.el.toAirport.value;
        this.el.toAirport.value = tmp;
        UI.toast("🔁 Đã đổi sân bay đi/đến", "success");
      });
    }

    if (this.el.ticketClass) this.el.ticketClass.addEventListener("change", () => this.recalcAndValidate());

    ["input", "blur"].forEach(evt => {
      this.el.passengerName?.addEventListener(evt, () => this.recalcAndValidate());
      this.el.cmnd?.addEventListener(evt, () => this.recalcAndValidate());
      this.el.phone?.addEventListener(evt, () => this.recalcAndValidate());
    });

    if (this.el.ticketForm) {
      this.el.ticketForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSell();
      });
    }

    if (this.el.btnReset) {
      this.el.btnReset.addEventListener("click", (e) => {
        e.preventDefault();
        this.resetForm();
      });
    }
  },

  seedFilters() {
    const airports = Array.from(new Set(this.flights.flatMap(f => [f.from, f.to])))
      .sort((a, b) => a.localeCompare(b, "vi"));

    const addOptions = (sel) => {
      if (!sel) return;
      airports.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = a;
        sel.appendChild(opt);
      });
    };

    addOptions(this.el.fromAirport);
    addOptions(this.el.toAirport);

    // set default date theo data demo
    if (this.el.departDate && !this.el.departDate.value) {
      this.el.departDate.value = "2024-04-25";
    }
  },

  applyFilter() {
    const from = (this.el.fromAirport?.value || "").trim();
    const to = (this.el.toAirport?.value || "").trim();
    const date = this.el.departDate?.value || "";

    this.filtered = this.flights.filter(f => {
      const fDate = f.departISO.slice(0, 10);
      if (from && f.from !== from) return false;
      if (to && f.to !== to) return false;
      if (date && fDate !== date) return false;
      return true;
    });

    // nếu chuyến đang chọn không còn trong list filter -> bỏ chọn
    if (this.selected && !this.filtered.some(x => x.code === this.selected.code)) {
      this.selected = null;
      this.el.selectedWrap.style.display = "none";
    }

    this.renderFlights();
    this.recalcAndValidate();
    UI.toast("🔎 Đã lọc chuyến bay", "success");
  },

  renderFlights() {
    const table = this.el.flightTable;
    if (!table) return;

    // xóa row cũ
    [...table.querySelectorAll(".flight-row")].forEach(x => x.remove());

    if (!this.filtered.length) {
      this.el.emptyFlights && (this.el.emptyFlights.style.display = "block");
      return;
    }
    this.el.emptyFlights && (this.el.emptyFlights.style.display = "none");

    this.filtered.forEach(f => {
      const row = document.createElement("div");
      row.className = "flight-row";

      row.innerHTML = `
        <div><b>${f.code}</b></div>
        <div>${f.from} → ${f.to}</div>
        <div>${this.fmtDate(f.departISO)}</div>
        <div>${f.duration}</div>
        <div class="t-center">${this.totalSeats(f)}</div>
        <div class="t-center">${f.booked ?? ""}</div>
        <div class="seat-cell"></div>
      `;

      const seatCell = row.querySelector(".seat-cell");
      const hasSeat = this.totalSeats(f) > 0;

      if (!hasSeat) {
        seatCell.innerHTML = `<div class="pill-soldout">Đã hết chỗ</div>`;
      } else {
        const btn = document.createElement("button");
        btn.className = "btn-choose";
        btn.type = "button";
        btn.textContent = "Chọn";
        btn.onclick = () => {
          this.selected = f;
          this.applySelected();
          UI.toast(`✅ Đã chọn ${f.code}`, "success");
        };
        seatCell.appendChild(btn);
      }

      table.appendChild(row);
    });
  },

  applySelected() {
    if (!this.selected) return;

    this.el.selectedWrap.style.display = "grid";
    this.el.selCode.textContent = this.selected.code;
    this.el.selRoute.textContent = `${this.selected.from} → ${this.selected.to}`;
    this.el.selDepart.textContent = this.fmtDateTime(this.selected.departISO);
    this.el.selBase.textContent = `Đơn giá: ${this.fmtMoney(this.selected.base)}`;

    this.el.selSeat1.textContent = String(this.selected.seats1 ?? 0);
    this.el.selSeat2.textContent = String(this.selected.seats2 ?? 0);

    this.hideAlert();
    this.recalcAndValidate();
  },

  validateFields() {
    const name = (this.el.passengerName?.value || "").trim();
    const cmnd = (this.el.cmnd?.value || "").trim();
    const phone = (this.el.phone?.value || "").trim();

    const errors = { name: "", cmnd: "", phone: "" };
    if (!name) errors.name = "Vui lòng nhập tên hành khách.";
    if (!cmnd) errors.cmnd = "Vui lòng nhập CMND.";
    if (!phone) errors.phone = "Vui lòng nhập số điện thoại.";

    if (cmnd && !/^\d{8,12}$/.test(cmnd)) errors.cmnd = "CMND nên là 8–12 chữ số.";
    if (phone && !/^\d{9,11}$/.test(phone)) errors.phone = "SĐT nên là 9–11 chữ số.";

    this.el.errName.textContent = errors.name;
    this.el.errCmnd.textContent = errors.cmnd;
    this.el.errPhone.textContent = errors.phone;

    return {
      ok: !errors.name && !errors.cmnd && !errors.phone,
      errors
    };
  },

  recalcAndValidate() {
    const cls = this.el.ticketClass?.value || "2";

    // chưa chọn chuyến
    if (!this.selected) {
      this.el.seatNote.textContent = "Chưa chọn chuyến";
      this.el.classPrice.textContent = "—";
      this.el.totalPrice.textContent = "—";
      this.el.btnSell.disabled = true;
      this.validateFields();
      return;
    }

    // tính giá theo QĐ2
    const price = this.priceByClass(this.selected.base, cls);
    this.el.classPrice.textContent = this.fmtMoney(price);
    this.el.totalPrice.textContent = this.fmtMoney(price);

    // check chỗ theo hạng
    const seatAvail = cls === "1" ? (this.selected.seats1 ?? 0) : (this.selected.seats2 ?? 0);
    this.el.seatNote.textContent = `Hạng ${cls} = ${seatAvail} ghế trống`;

    // validate BM2
    const v = this.validateFields();

    // disable nếu thiếu field / hết chỗ
    const canSell = v.ok && seatAvail > 0;
    this.el.btnSell.disabled = !canSell;

    if (seatAvail <= 0) {
      this.showAlert("Chuyến bay (theo hạng vé đã chọn) đã hết chỗ. Vui lòng chọn hạng/chuyến khác.");
    } else {
      this.hideAlert();
    }
  },

  handleSell() {
    if (!this.selected) {
      UI.toast("⚠️ Vui lòng chọn chuyến bay", "warn");
      return;
    }

    this.recalcAndValidate();
    if (this.el.btnSell.disabled) {
      UI.toast("⚠️ Vui lòng kiểm tra dữ liệu / số ghế trước khi bán vé", "warn");
      return;
    }

    const cls = this.el.ticketClass.value;
    if (cls === "1") this.selected.seats1 -= 1;
    else this.selected.seats2 -= 1;

    this.selected.booked = (this.selected.booked ?? 0) + 1;

    UI.toast("✅ Bán vé thành công (demo)", "success");
    this.applySelected();
    this.renderFlights();
  },

  resetForm() {
    this.el.passengerName.value = "";
    this.el.cmnd.value = "";
    this.el.phone.value = "";
    this.el.ticketClass.value = "2";
    this.hideAlert();
    this.recalcAndValidate();
    UI.toast("♻️ Đã làm mới", "success");
  },

  showAlert(msg) {
    if (!this.el.formAlert) return;
    this.el.formAlert.style.display = "block";
    this.el.formAlert.textContent = msg;
  },

  hideAlert() {
    if (!this.el.formAlert) return;
    this.el.formAlert.style.display = "none";
    this.el.formAlert.textContent = "";
  }
};

SellPage.init();
