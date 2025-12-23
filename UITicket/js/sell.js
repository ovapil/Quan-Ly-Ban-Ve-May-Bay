// ============================================
// SELL.JS - Bán vé (BM2 + QĐ2)
// Fix theo yêu cầu:
// - Chỉ hiện lỗi đỏ khi bấm "Bán vé" mà thiếu/không hợp lệ
// - CMND/CCCD: 9 số hoặc 12 số
// - SĐT: đúng 10 số
// - Bảng: có cột "Ghế đặt" (booked)
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
  attemptedSell: false, // ✅ chỉ bật true khi người dùng bấm "Bán vé"

  flights: [],
  airports: [],

mapFlight(row) {
  // backend may return JSON column as JS array or as a JSON string
  let classes = [];
  try {
    if (Array.isArray(row.hang_ve)) classes = row.hang_ve;
    else if (typeof row.hang_ve === 'string' && row.hang_ve) classes = JSON.parse(row.hang_ve);
  } catch (e) {
    console.warn('Failed to parse hang_ve for', row.ma_chuyen_bay, e);
    classes = [];
  }
  // sắp theo ti_le_gia giảm dần (hạng cao trước)
  classes.sort((a,b) => (Number(b.ti_le_gia)||0) - (Number(a.ti_le_gia)||0));

  const c1 = classes[0];
  const c2 = classes[1];
  // fallback: if per-class data empty, use aggregated `ghe_con_lai`
  const totalConLai = Number(row.ghe_con_lai ?? 0);
  const seats1 = classes.length === 0 ? totalConLai : (c1 ? Number(c1.con_lai || 0) : 0);
  const seats2 = classes.length === 0 ? 0 : (c2 ? Number(c2.con_lai || 0) : 0);

  // DEBUG: xem dữ liệu trả về
  console.log(`🔍 mapFlight(${row.ma_chuyen_bay}):`, {
    rawRow: row,
    classes: classes,
    c1, c2,
    totalConLai,
    seats1, seats2
  });

  return {
    code: row.ma_chuyen_bay,
    fromCode: row.ma_san_bay_di,
    toCode: row.ma_san_bay_den,
    fromName: row.san_bay_di,
    toName: row.san_bay_den,
    // backward-compatible aliases used by renderFlights
    from: row.san_bay_di,
    to: row.san_bay_den,
    departISO: row.ngay_gio_bay,
    duration: this.minutesToText(Number(row.thoi_gian_bay || 0)),
    base: Number(row.gia_ve || 0),
    booked: Number(row.ghe_da_ban || 0),

    // UI bạn đang có 2 dòng Hạng 1/Hạng 2 => map 2 hạng đầu
    seats1,
    seats2,

    classes, // giữ lại để tính giá/hiện select
  };
},

minutesToText(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} phút`;
  if (m <= 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
},

  filtered: [],
  selected: null,
  el: {},

  totalSeats(f) {
    return (f.seats1 || 0) + (f.seats2 || 0);
  },

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

    // Try auto-loading available flights on start (no filters)
    // seedFilters is async but we don't strictly need to await it here
    // — calling applyFilter will fetch flights and render.
    this.applyFilter().catch((e) => {
      // show existing empty state if fetch fails
      console.warn('Auto-fetch flights failed', e);
      this.filtered = [...this.flights];
      this.renderFlights();
    });

    // ✅ quan trọng: KHÔNG hiện lỗi ngay khi chưa bấm "Bán vé"
    this.attemptedSell = false;
    this.validateFields(false);   // ẩn err
    this.recalcAndValidate();     // set nút + giá
  },

  cache() {
    this.el = {
      fromAirport: document.getElementById("fromAirport"),
      toAirport: document.getElementById("toAirport"),
      departDate: document.getElementById("departDate"),
      btnSearch: document.getElementById("btnSearch"),
      btnSwap: document.getElementById("btnSwap"),
      btnNoti: document.getElementById("btnNoti"),
      tabHome: document.getElementById("tabHome"),
      tabAccount: document.getElementById("tabAccount"),
      tabSettings: document.getElementById("tabSettings"),

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
      btnReset: document.getElementById("btnReset")
    };
  },

  bind() {
    if (this.el.btnNoti) {
      this.el.btnNoti.onclick = () => UI.toast("🔔 Thông báo (demo)", "warn");
    }

    // Header tabs
    this.el.tabHome?.addEventListener("click", () => (window.location.href = "dashboard.html"));
    this.el.tabAccount?.addEventListener("click", () => (window.location.href = "account.html"));
    this.el.tabSettings?.addEventListener("click", () => (window.location.href = "settings.html"));

    this.el.btnSearch?.addEventListener("click", () => this.applyFilter());


    this.el.btnSwap?.addEventListener("click", () => {
      const from = this.el.fromAirport;
      const to = this.el.toAirport;
      if (!from || !to) return;
      const tmp = from.value;
      from.value = to.value;
      to.value = tmp;
      UI.toast("🔁 Đã đổi sân bay đi/đến", "success");
    });

    this.el.ticketClass?.addEventListener("change", () => this.recalcAndValidate());

    // input events: chỉ show lỗi khi attemptedSell=true
    const revalidate = () => this.recalcAndValidate();

    this.el.passengerName?.addEventListener("input", revalidate);
    this.el.passengerName?.addEventListener("blur", revalidate);

    // CMND: chỉ cho nhập số, max 12
    ["input", "blur"].forEach((evt) => {
      this.el.cmnd?.addEventListener(evt, (e) => {
        if (evt === "input") {
          e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 12);
        }
        revalidate();
      });
    });

    // Phone: chỉ cho nhập số, max 10
    ["input", "blur"].forEach((evt) => {
      this.el.phone?.addEventListener(evt, (e) => {
        if (evt === "input") {
          e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 10);
        }
        revalidate();
      });
    });

    if (this.el.ticketForm) {
      this.el.ticketForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSell();
      });
    }

    this.el.btnReset?.addEventListener("click", (e) => {
      e.preventDefault();
      this.resetForm();
    });
  },

  async seedFilters() {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/airports`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  this.airports = data.airports || [];

  const opt = this.airports
    .map(a => `<option value="${a.ma_san_bay}">${a.ten_san_bay}</option>`)
    .join("");

  const fill = (sel) => {
    if (!sel) return;
    sel.innerHTML = `<option value="">-- Tất cả --</option>` + opt;
  };

  fill(this.el.fromAirport);
  fill(this.el.toAirport);
},


  async applyFilter() {
  const token = getToken();
  const from = (this.el.fromAirport?.value || "").trim();
  const to = (this.el.toAirport?.value || "").trim();
  const date = this.el.departDate?.value || "";

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (date) qs.set("date", date);

  const res = await fetch(`${API_BASE_URL}/chuyen-bay?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) {
    UI.toast(data?.error || "Lỗi tải chuyến bay", "error");
    return;
  }

  this.flights = (data.flights || []).map(r => this.mapFlight(r));
  this.filtered = [...this.flights];

  // nếu chuyến đang chọn không còn => bỏ chọn
  if (this.selected && !this.filtered.some(x => x.code === this.selected.code)) {
    this.selected = null;
    if (this.el.selectedWrap) this.el.selectedWrap.style.display = "none";
  } else if (this.selected) {
    // refresh object selected theo list mới
    const updated = this.filtered.find(x => x.code === this.selected.code);
    if (updated) this.selected = updated;
  }

  this.renderFlights();
  this.recalcAndValidate();
  UI.toast("🔎 Đã tìm chuyến bay", "success");
},


  renderFlights() {
    const table = this.el.flightTable;
    if (!table) return;

    // xóa row cũ
    [...table.querySelectorAll(".flight-row")].forEach((x) => x.remove());

    if (!this.filtered.length) {
      if (this.el.emptyFlights) this.el.emptyFlights.style.display = "block";
      return;
    }
    if (this.el.emptyFlights) this.el.emptyFlights.style.display = "none";

    this.filtered.forEach((f) => {
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

    if (this.el.selectedWrap) this.el.selectedWrap.style.display = "grid";
    this.el.selCode.textContent = this.selected.code;
    this.el.selRoute.textContent = `${this.selected.from} → ${this.selected.to}`;
    this.el.selDepart.textContent = this.fmtDateTime(this.selected.departISO);
    this.el.selBase.textContent = `Đơn giá: ${this.fmtMoney(this.selected.base)}`;

    this.el.selSeat1.textContent = String(this.selected.seats1 ?? 0);
    this.el.selSeat2.textContent = String(this.selected.seats2 ?? 0);

    // fill select hạng vé theo chuyến
if (this.el.ticketClass) {
  const opts = (this.selected.classes || []).map(c => {
    const pct = Math.round(Number(c.ti_le_gia || 1) * 100);
    return `<option value="${c.ma_hang_ve}">${c.ten_hang_ve} (${pct}%)</option>`;
  }).join("");

  this.el.ticketClass.innerHTML = opts || `<option value="">(Không có hạng vé)</option>`;
}

    console.log(`✅ applySelected: ${this.selected.code}`, this.selected);

    this.hideAlert();
    this.recalcAndValidate();
  },

  setErr(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  },

  // showErrors chỉ true khi attemptedSell = true
  validateFields(showErrors = this.attemptedSell) {
    const name = (this.el.passengerName?.value || "").trim();
    const cmnd = (this.el.cmnd?.value || "").trim();
    const phone = (this.el.phone?.value || "").trim();

    const errors = { name: "", cmnd: "", phone: "" };

    if (!name) errors.name = "Vui lòng nhập tên hành khách.";
    if (!cmnd) errors.cmnd = "Vui lòng nhập CMND/CCCD.";
    if (!phone) errors.phone = "Vui lòng nhập số điện thoại.";

    // CMND/CCCD: 9 hoặc 12 chữ số
    if (cmnd && !/^\d{9}(\d{3})?$/.test(cmnd)) {
      errors.cmnd = "CMND/CCCD phải gồm 9 hoặc 12 chữ số.";
    }

    // SĐT: 10 chữ số
    if (phone && !/^\d{10}$/.test(phone)) {
      errors.phone = "Số điện thoại phải gồm 10 chữ số.";
    }

    if (showErrors) {
      this.setErr(this.el.errName, errors.name);
      this.setErr(this.el.errCmnd, errors.cmnd);
      this.setErr(this.el.errPhone, errors.phone);
    } else {
      this.setErr(this.el.errName, "");
      this.setErr(this.el.errCmnd, "");
      this.setErr(this.el.errPhone, "");
    }

    return { ok: !errors.name && !errors.cmnd && !errors.phone, errors };
  },

  recalcAndValidate() {
  const cls = this.el.ticketClass?.value || "";

  if (!this.selected) {
    this.el.seatNote.textContent = "Chưa chọn chuyến";
    this.el.classPrice.textContent = "—";
    this.el.totalPrice.textContent = "—";
    this.el.btnSell.disabled = true;
    this.validateFields(this.attemptedSell);
    return;
  }

  const classes = this.selected.classes || [];
  const picked = classes.find(x => String(x.ma_hang_ve) === String(cls)) || classes[0];

  const ratio = Number(picked?.ti_le_gia || 1);
  const seatAvail = Number(picked?.con_lai ?? 0);

  const price = Math.round((this.selected.base || 0) * ratio);

  this.el.classPrice.textContent = this.fmtMoney(price);
  this.el.totalPrice.textContent = this.fmtMoney(price);
  this.el.seatNote.textContent = picked
    ? `${picked.ten_hang_ve}: ${seatAvail} ghế trống`
    : `Chưa có hạng vé`;

  console.log(`📊 recalcAndValidate:`, { cls, picked, seatAvail, price });

  this.validateFields(this.attemptedSell);

  const canSell = seatAvail > 0;
  this.el.btnSell.disabled = !canSell;

  if (!canSell) {
    this.showAlert("Chuyến bay (theo hạng vé đã chọn) đã hết chỗ. Vui lòng chọn hạng/chuyến khác.");
  } else {
    this.hideAlert();
  }
},

  async handleSell() {
    if (!this.selected) {
      UI.toast("⚠️ Vui lòng chọn chuyến bay", "warn");
      return;
    }

    // ✅ bấm bán vé -> bật hiển thị lỗi
    this.attemptedSell = true;
    this.recalcAndValidate();

    const v = this.validateFields(true);
    if (!v.ok) {
      UI.toast("⚠️ Thiếu hoặc sai thông tin, vui lòng kiểm tra lại", "warn");
      return;
    }

    if (this.el.btnSell.disabled) {
      UI.toast("⚠️ Chuyến bay (theo hạng vé đã chọn) đã hết chỗ", "warn");
      return;
    }

    // gọi backend bán vé
const token = getToken();
const payload = {
  ma_chuyen_bay: this.selected.code,
  ma_hang_ve: this.el.ticketClass.value,
  ho_ten: this.el.passengerName.value.trim(),
  cmnd: this.el.cmnd.value.trim(),
  sdt: this.el.phone.value.trim()
};

const res = await fetch(`${API_BASE_URL}/ban-ve`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify(payload)
});

const data = await res.json();
if (!res.ok) {
  UI.toast(data?.error || "Bán vé thất bại", "error");
  return;
}

// update lại chuyến bay trên UI
const updated = this.mapFlight(data.flight);
this.flights = this.flights.map(f => (f.code === updated.code ? updated : f));
this.filtered = this.filtered.map(f => (f.code === updated.code ? updated : f));
this.selected = updated;

// sau khi bán thành công -> tắt lỗi đỏ
this.attemptedSell = false;
this.validateFields(false);

UI.toast(`✅ Bán vé thành công (${data.ticket?.ma_ve || "OK"})`, "success");
this.applySelected();
this.renderFlights();
  },

  resetForm() {
    this.attemptedSell = false;
    this.el.passengerName.value = "";
    this.el.cmnd.value = "";
    this.el.phone.value = "";
    this.el.ticketClass.value = "2";

    this.hideAlert();
    this.validateFields(false);
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
