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
  },

  // Custom confirm dialog (dùng chung style ở common.css)
  confirm(options = {}) {
    return new Promise((resolve) => {
      const {
        title = "Xác nhận",
        message = "Bạn có chắc chắn?",
        confirmText = "Xác nhận",
        cancelText = "Hủy",
        type = "danger",
        icon = "fa-circle-question",
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

      const close = (ok) => {
        overlay.classList.remove("show");
        setTimeout(() => {
          overlay.remove();
          resolve(ok);
        }, 200);
      };

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });

      overlay.querySelector(".confirm-footer").addEventListener("click", (e) => {
        const action = e.target?.dataset?.action;
        if (action === "confirm") close(true);
        if (action === "cancel") close(false);
      });
    });
  }
};

function escAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Timezone handling: always display times in Vietnam timezone.
// Backend timestamps may come as ISO with timezone (preferred) or without timezone.
// If no timezone info is present, we assume UTC to avoid "server UTC shown as local" drift.
const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

function pad2(x) {
  return String(x).padStart(2, "0");
}

function parseApiDate(dISO) {
  if (!dISO) return null;
  const s = String(dISO);
  const hasTz = /([zZ]|[+\-]\d\d:\d\d)$/.test(s);
  const normalized = hasTz ? s : `${s}Z`;
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function fmtVnDateTime(dISO) {
  const d = parseApiDate(dISO);
  if (!d) return "";

  // Manual VN timezone (UTC+7) formatting to be independent of client timezone settings.
  // Example: if backend stores/returns UTC, adding +7 hours will show VN local time.
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = vn.getUTCFullYear();
  const mm = pad2(vn.getUTCMonth() + 1);
  const dd = pad2(vn.getUTCDate());
  const hh = pad2(vn.getUTCHours());
  const mi = pad2(vn.getUTCMinutes());
  const ss = pad2(vn.getUTCSeconds());
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

let lastTicketQuery = "";

async function api(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (!headers["Content-Type"] && opts.body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderTickets(items, fmtMoney) {
  const body = document.getElementById("ticketList");
  if (!body) return;

  body.innerHTML = "";

  if (!items?.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b;padding:14px;">Chưa có vé đã bán</td></tr>`;
    return;
  }

  body.innerHTML = items
    .map((t) => {
      const clsTxt =
        String(t.ticket_class).toUpperCase() === "BUS" || String(t.ticket_class) === "1"
          ? "Hạng 1"
          : "Hạng 2";

      const soldAt = fmtVnDateTime(t.created_at);

      return `
        <tr class="tk-row" data-id="${t.id}">
          <td class="link">${t.ticket_code || ""}</td>
          <td>${t.flight_code || ""}</td>
          <td>${t.passenger_name || ""}</td>
          <td>${t.cccd || ""}</td>
          <td>${t.phone || ""}</td>
          <td>${clsTxt}</td>
          <td style="text-align:right;">${fmtMoney(t.price)}</td>
          <td>${soldAt}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadTicketsFromApi(fmtMoney) {
  const qs = new URLSearchParams();
  if (lastTicketQuery) qs.set("q", lastTicketQuery);

  const data = await api(`/tickets?${qs.toString()}`);
  renderTickets(data.items || [], fmtMoney);
}

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

  sellInFlight: false,

  hasSearchedFlights: false,

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
    fromCity: this.airports?.find((a) => String(a.ma_san_bay) === String(row.ma_san_bay_di))?.thanh_pho || "",
    toCity: this.airports?.find((a) => String(a.ma_san_bay) === String(row.ma_san_bay_den))?.thanh_pho || "",
    // backward-compatible aliases used by renderFlights
    from: row.san_bay_di,
    to: row.san_bay_den,
    departISO: row.ngay_gio_bay,
    duration: this.minutesToText(Number(row.thoi_gian_bay || 0)),
    base: Number(row.gia_ve || 0),
    booked: Number(row.ghe_da_dat ?? 0),
    sold: Number(row.ghe_da_ban ?? 0),

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
    return new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + " VNĐ";
  },

  fmtDate(dISO) {
    const d = parseApiDate(dISO);
    if (!d) return "";
    const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const yyyy = vn.getUTCFullYear();
    const mm = pad2(vn.getUTCMonth() + 1);
    const dd = pad2(vn.getUTCDate());
    return `${dd}/${mm}/${yyyy}`;
  },

  fmtDateTime(dISO) {
    const d = parseApiDate(dISO);
    if (!d) return "";
    const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const yyyy = vn.getUTCFullYear();
    const mm = pad2(vn.getUTCMonth() + 1);
    const dd = pad2(vn.getUTCDate());
    const hh = pad2(vn.getUTCHours());
    const mi = pad2(vn.getUTCMinutes());
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  },

  priceByClass(base, cls) {
    // QĐ2: Hạng 1 = 105% đơn giá; Hạng 2 = 100%
    return cls === "1" ? Math.round(base * 1.05) : base;
  },

  async init() {
    if (isPreviewMode()) {
      UI.toast("Preview UI (không cần đăng nhập)", "warn");
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

  // Ẩn danh sách chuyến bay cho tới khi người dùng bấm "Tìm chuyến"
  this.setFlightsVisible(false);

  // Chỉ load danh sách sân bay; không auto-fetch chuyến bay
  this.seedFilters().then(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const flightId = qs.get('flightId') || '';
      const from = qs.get('from') || '';
      const to = qs.get('to') || '';
      const date = qs.get('date') || '';

      // If any of these params exist, prefill the form and auto-search
      if (from) this.el.fromAirport.value = from;
      if (to) this.el.toAirport.value = to;
      if (date) this.el.departDate.value = date;

      if (from || to || date || flightId) {
        // perform search and then auto-select the matching flight if flightId provided
        this.hasSearchedFlights = true;
        this.applyFilter().then(() => {
          // If no flights returned, show explicit 'not found' state and do NOT use sample data
          if (!this.filtered || this.filtered.length === 0) {
            UI.toast('Không tìm thấy chuyến bay phù hợp', 'warn');
            this.setFlightsVisible(false);
            return;
          }

          if (flightId) {
            const found = this.filtered.find(f => String(f.code) === String(flightId));
            if (found) {
              this.selected = found;
              this.applySelected();
              UI.toast(`Đã chọn chuyến ${found.code}`, 'success');
            } else {
              // flightId provided but not found in results
              UI.toast('Không tìm thấy chuyến theo mã chuyến được cung cấp', 'warn');
            }
          }
        }).catch((e) => {
          console.warn('Auto-search failed', e);
          UI.toast('Không thể tìm chuyến (lỗi kết nối)', 'error');
        });
      }
    } catch (e) {
      console.warn('Prefill from query failed', e);
    }
  }).catch((e) => {
    console.warn("seedFilters failed", e);
  });

  // ✅ quan trọng: KHÔNG hiện lỗi ngay khi chưa bấm "Bán vé"
  this.attemptedSell = false;
  this.validateFields(false);   // ẩn err
  this.recalcAndValidate();     // set nút + giá

  // Sold tickets list panel
  this.initTicketsList();
},

  setFlightsVisible(visible) {
    if (this.el.flightTable) this.el.flightTable.style.display = visible ? "block" : "none";
    if (!visible && this.el.emptyFlights) this.el.emptyFlights.style.display = "none";
  },

  initTicketsList() {
    const hasPanel = !!document.getElementById("ticketList");
    if (!hasPanel) return;

    // Preview mode / chưa đăng nhập: không gọi API bookings
    if (!getToken() || isPreviewMode()) return;

    const fmtMoney = (n) => this.fmtMoney(n);

    document.getElementById("btnSearchTicket")?.addEventListener("click", async () => {
      lastTicketQuery = String(document.getElementById("ticketSearchInput")?.value || "").trim();
      try {
        await loadTicketsFromApi(fmtMoney);
        UI.toast("Đã tìm kiếm", "success");
      } catch (e) {
        UI.toast(`${e.message}`, "error");
      }
    });

    document.getElementById("ticketSearchInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("btnSearchTicket")?.click();
    });

    document.getElementById("btnClearTicketFilter")?.addEventListener("click", async () => {
      lastTicketQuery = "";
      const input = document.getElementById("ticketSearchInput");
      if (input) input.value = "";
      UI.toast("🧹 Đã xoá lọc", "success");
      try { await loadTicketsFromApi(fmtMoney); } catch {}
    });

    document.getElementById("btnRefreshTicket")?.addEventListener("click", async () => {
      try {
        await loadTicketsFromApi(fmtMoney);
        UI.toast("Đã làm mới", "success");
      } catch (e) {
        UI.toast(`${e.message}`, "error");
      }
    });

    // initial load
    loadTicketsFromApi(fmtMoney).catch((e) => {
      UI.toast(`${e.message}`, "error");
    });
  },

  cache() {
    this.el = {
      fromAirport: document.getElementById("fromAirport"),
      toAirport: document.getElementById("toAirport"),
      departDate: document.getElementById("departDate"),
      btnSearch: document.getElementById("btnSearch"),
      btnSwap: document.getElementById("btnSwap"),
      btnBackTop: document.getElementById("btnBackTop"),
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
      this.el.btnNoti.onclick = () => UI.toast("Thông báo (demo)", "warn");
    }

    // Header tabs
    this.el.tabHome?.addEventListener("click", () => (window.location.href = "dashboard.html"));
    this.el.tabAccount?.addEventListener("click", () => (window.location.href = "account.html"));
    this.el.tabSettings?.addEventListener("click", () => (window.location.href = "settings.html"));

    // Back button
    this.el.btnBackTop?.addEventListener("click", () => (window.location.href = "dashboard.html"));

    this.el.btnSearch?.addEventListener("click", () => {
      this.hasSearchedFlights = true;
      this.setFlightsVisible(true);
      this.applyFilter();
    });


    this.el.btnSwap?.addEventListener("click", () => {
      const from = this.el.fromAirport;
      const to = this.el.toAirport;
      if (!from || !to) return;
      const tmp = from.value;
      from.value = to.value;
      to.value = tmp;
      UI.toast("Đã đổi sân bay đi/đến", "success");
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

  // ✅ ăn được cả 2 kiểu response: {items:[...]} hoặc {airports:[...]}
  this.airports = data.items || data.airports || [];

  const opt = this.airports
    .map(a => `<option value="${a.ma_san_bay}">${a.thanh_pho} - ${a.ten_san_bay} (${a.ma_san_bay})</option>`)
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

  const now = new Date();
  this.flights = (data.flights || [])
    .map(r => this.mapFlight(r))
    .filter(f => {
      const d = parseApiDate(f.departISO);
      return d ? d.getTime() >= now.getTime() : true; // ẩn chuyến đã bay
    });
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
  UI.toast("Đã tìm chuyến bay", "success");
},


  renderFlights() {
  const table = this.el.flightTable;
  if (!table) return;

  // Chỉ hiện danh sách sau khi user bấm "Tìm chuyến"
  if (!this.hasSearchedFlights) {
    this.setFlightsVisible(false);
    return;
  }

  this.setFlightsVisible(true);

  // ✅ đảm bảo luôn có header đúng 7 cột
  let head = table.querySelector(".flight-head");
  if (!head) {
    head = document.createElement("div");
    head.className = "flight-head";
    table.prepend(head);
  }
  head.innerHTML = `
    <div>Mã chuyến</div>
    <div>Tuyến</div>
    <div class="t-center">Khởi hành</div>
    <div class="t-center">Thời gian</div>
    <div class="t-center">Ghế trống</div>
    <div class="t-center">Ghế đặt</div>
    <div class="t-center"></div>
  `;

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

    const routeDisplay = `${(f.fromCity || f.from)} → ${(f.toCity || f.to)}`;
    const routeTooltip = `${(f.fromCity || "").trim()} - ${(f.fromName || f.from || "").trim()} (${(f.fromCode || "").trim()}) → ${(f.toCity || "").trim()} - ${(f.toName || f.to || "").trim()} (${(f.toCode || "").trim()})`;

    row.innerHTML = `
      <div><b>${f.code}</b></div>
      <div class="route-cell" title="${escAttr(routeTooltip)}">${routeDisplay}</div>
      <div class="t-center">${this.fmtDate(f.departISO)}</div>
      <div class="t-center">${f.duration}</div>
      <div class="t-center">${this.totalSeats(f)}</div>
      <div class="t-center">${f.booked ?? 0}</div>
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
        UI.toast(`Đã chọn ${f.code}`, "success");
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
    this.validateFields(this.attemptedSell);

    // Giữ giao diện như yêu cầu: không khóa nút theo điều kiện.
    // Chỉ khóa trong lúc đang gửi request.
    if (this.el.btnSell) this.el.btnSell.disabled = !!this.sellInFlight;
    this.hideAlert();
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

  // Không khóa nút theo ghế; chỉ báo khi người dùng bấm "Bán vé".
  if (this.el.btnSell) this.el.btnSell.disabled = !!this.sellInFlight;

  if (this.attemptedSell && !(seatAvail > 0)) {
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

    // check ghế theo hạng đã chọn
    const cls = this.el.ticketClass?.value || "";
    const classes = this.selected?.classes || [];
    const picked = classes.find(x => String(x.ma_hang_ve) === String(cls)) || classes[0];
    const seatAvail = Number(picked?.con_lai ?? 0);
    if (!(seatAvail > 0)) {
      this.showAlert("Chuyến bay (theo hạng vé đã chọn) đã hết chỗ. Vui lòng chọn hạng/chuyến khác.");
      UI.toast("⚠️ Chuyến bay (theo hạng vé đã chọn) đã hết chỗ", "warn");
      return;
    }

    if (this.sellInFlight) return;
    this.sellInFlight = true;
    this.recalcAndValidate();

    // gọi backend bán vé
const token = getToken();
const payload = {
  ma_chuyen_bay: this.selected.code,
  ma_hang_ve: this.el.ticketClass.value,
  ho_ten: this.el.passengerName.value.trim(),
  cmnd: this.el.cmnd.value.trim(),
  sdt: this.el.phone.value.trim()
};

let data = {};
try {
  const res = await fetch(`${API_BASE_URL}/ban-ve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  data = await res.json().catch(() => ({}));
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

UI.toast(`Bán vé thành công (${data.ticket?.ma_ve || "OK"})`, "success");
this.applySelected();
this.renderFlights();

// refresh danh sách vé đã bán (nếu đang mở panel)
if (document.getElementById("ticketList") && !isPreviewMode()) {
  loadTicketsFromApi((n) => this.fmtMoney(n)).catch(() => {});
}
} finally {
  this.sellInFlight = false;
  this.recalcAndValidate();
}
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
    UI.toast("Đã làm mới", "success");
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
