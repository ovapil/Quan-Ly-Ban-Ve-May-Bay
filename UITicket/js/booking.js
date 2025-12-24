// ============================================
// booking.js - REAL VERSION (API + Token)
// Preview UI: booking.html?preview=1
// ============================================

const API_BASE_URL = "http://localhost:3000/api";


function fillSelect(el, rows, placeholder) {
  el.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
  rows.forEach(x => {
    const opt = document.createElement("option");
    opt.value = x.ma_san_bay;
    opt.textContent = `${x.thanh_pho} - ${x.ten_san_bay} (${x.ma_san_bay})`;
    el.appendChild(opt);
  });
}
async function loadAirportsFromApi() {
  const fromEl = document.getElementById("fromAirport");
  const toEl = document.getElementById("toAirport");
  if (!fromEl || !toEl) return;

  const data = await api("/airports");
  const rows = data.items || data.airports || [];

  fillSelect(fromEl, rows, "Sân bay đi");
  fillSelect(toEl, rows, "Sân bay đến");

  if (rows.length > 0) {
    fromEl.value = rows[0].ma_san_bay;
    toEl.value = (rows[1] ? rows[1].ma_san_bay : rows[0].ma_san_bay);
  }
}

async function loadAirports() {
  const fromEl = document.getElementById("fromAirport");
  const toEl = document.getElementById("toAirport");
  if (!fromEl || !toEl) return;

  try {
    const token = localStorage.getItem("uiticket_token");
    console.log("token:", token); // <- xem có null không

    const res = await fetch(`${API_BASE_URL}/airports`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const data = await res.json().catch(() => ({}));
    console.log("airports status:", res.status, data);

    if (!res.ok) return; // <-- nếu 401/500 thì dừng

    const rows = data.items || [];
    console.log("rows length:", rows.length);

    fillSelect(fromEl, rows, "Sân bay đi");
    fillSelect(toEl, rows, "Sân bay đến");
  } catch (e) {
    console.error("loadAirports error:", e);
  }
}

document.addEventListener("DOMContentLoaded", loadAirports);

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

  // Custom confirm dialog (không dùng window.confirm để khỏi hiện "127.0.0.1 says")
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
  },
};

function isPreviewMode() {
  const qs = new URLSearchParams(window.location.search);
  return qs.has("preview") || qs.get("preview") === "1";
}

function getToken() {
  return localStorage.getItem("uiticket_token");
}

async function api(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (!headers["Content-Type"] && opts.body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 404) return { items: [] }; // Handle 404 as no data
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const fmtMoney = (n) => Number(n || 0).toLocaleString("vi-VN") + " Vđ";
const pad2 = (x) => String(x).padStart(2, "0");
function fmtDateOnly(d) {
  const dt = new Date(d);
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}
function fmtDateTime(d) {
  const dt = new Date(d);
  return dt.toLocaleString("vi-VN", { hour12: false });
}
function durationText(mins) {
  const m = Number(mins || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} phút`;
  if (r === 0) return `${h} giờ`;
  return `${h} giờ ${r} phút`;
}
function priceByClass(base, cls) {
  const b = Number(base || 0);
  if (String(cls) === "1") return Math.round(b * 1.05);
  return Math.round(b);
}

let flights = [];
let selectedBookingId = null;
let selected = null;
let lastBookingQuery = "";

function renderFlights() {
  const table = document.getElementById("flightTable");
  if (!table) return;

  [...table.querySelectorAll(".flight-row")].forEach((x) => x.remove());

  flights.forEach((f) => {
    const row = document.createElement("div");
    row.className = "flight-row";

    row.innerHTML = `
      <div><b>${f.flight_code}</b></div>
      <div>${f.from_city} → ${f.to_city}</div>
      <div>${fmtDateOnly(f.depart_at)}</div>
      <div>${durationText(f.duration_minutes)}</div>
      <div class="seat-cell"></div>
    `;

    const seatCell = row.querySelector(".seat-cell");
    const hasSeat = f.seats_total_avail > 0;

    if (!hasSeat) {
      seatCell.innerHTML = `<div class="pill-soldout">Đã hết chỗ</div>`;
    } else {
      const btn = document.createElement("button");
      btn.className = "btn-choose";
      btn.textContent = "Chọn";
      btn.onclick = () => {
        selected = f;
        applySelected();
        UI.toast(`✅ Đã chọn ${f.flight_code}`, "success");
      };
      seatCell.appendChild(btn);
    }

    table.appendChild(row);
  });
}

function applySelected() {
  if (!selected) return;

  const cls = document.getElementById("ticketClass")?.value || "1";
  const seat = selected.seats_by_class ? Number(selected.seats_by_class[cls] || 0) : (cls === "1" ? Number(selected.seats1_avail) : Number(selected.seats2_avail));

  document.getElementById("selCode").textContent = selected.flight_code;
  document.getElementById("selRoute").textContent = `${selected.from_city} → ${selected.to_city}`;
  document.getElementById("selDepart").textContent = fmtDateTime(selected.depart_at);

  document.getElementById("selRoute2").textContent = `${selected.from_city} – ${selected.to_city}`;
  document.getElementById("selDate2").textContent = fmtDateOnly(selected.depart_at);
  document.getElementById("selDeadline").textContent = `trước ngày ${fmtDateOnly(selected.depart_at)}`;

  document.getElementById("seatNote").textContent = `Hạng ${cls} = ${seat} ghế trống`;

  const p = priceByClass(selected.base_price, cls);
  document.getElementById("selPriceInfo").textContent = `Đơn giá: ${fmtMoney(selected.base_price)}`;
  document.getElementById("classPrice").textContent = fmtMoney(p);
  document.getElementById("totalPrice").textContent = fmtMoney(p);
}

async function loadFlightsFromApi(showToast = true, validateAirports = true) {
  const from = document.getElementById("fromAirport")?.value || "";
  const to = document.getElementById("toAirport")?.value || "";
  const date = document.getElementById("flightDate")?.value || "";

  if (validateAirports && (!from || !to)) {
    throw new Error("Vui lòng chọn sân bay đi và đến");
  }

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (date) qs.set("date", date);

  const data = await api(`/flights?${qs.toString()}`);
  flights = data.items || [];
  console.log('Flights data:', flights); // Debug: Check seats_by_class

  selected = flights[0] || null;

  renderFlights();
  applySelected();

  if (showToast) {
    if (flights.length > 0) {
      UI.toast(`🔎 Tìm thấy ${flights.length} chuyến`, "success");
    } else {
      UI.toast("Không tìm được chuyến", "warn");
    }
  }
}


function renderBookings(items) {
  const body = document.getElementById("bookingList");
  if (!body) return;

  body.innerHTML = "";

  if (!items?.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:14px;">Chưa có phiếu đặt</td></tr>`;
    selectedBookingId = null;
    updateCancelBtn();
    return;
  }

  body.innerHTML = items
    .map((b) => {
      // b.ticket_class đang là BUS/ECO hoặc 1/2 tuỳ backend, hiển thị đơn giản:
      const clsTxt =
        String(b.ticket_class).toUpperCase() === "BUS" || String(b.ticket_class) === "1"
          ? "Hạng 1"
          : "Hạng 2";

      const isSel = Number(b.id) === Number(selectedBookingId);

      return `
        <tr class="bk-row ${isSel ? "selected" : ""}" data-id="${b.id}">
          <td class="link">${b.booking_code || ""}</td>
          <td>${b.flight_code || ""}</td>
          <td>${b.passenger_name || ""}</td>
          <td>${b.cccd || ""}</td>
          <td>${b.phone || ""}</td>
          <td>${clsTxt}</td>
          <td style="text-align:right;">${fmtMoney(b.price)}</td>
        </tr>
      `;
    })
    .join("");

  // gắn click chọn dòng
  body.querySelectorAll(".bk-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = Number(tr.dataset.id);
      selectedBookingId = id;
      body.querySelectorAll(".bk-row").forEach((x) => x.classList.remove("selected"));
      tr.classList.add("selected");
      updateCancelBtn();
    });
  });

  updateCancelBtn();
}
function updateCancelBtn() {
  const btn = document.getElementById("btnCancelBooking");
  if (!btn) return;

  // chỉ cho hủy khi đang xem "Đã thanh toán" (value = active)
  const status = document.getElementById("statusFilter")?.value || "active";
  const ok = !!selectedBookingId && status === "active";

  btn.style.display = ok ? "inline-flex" : "none";
}

async function loadBookingsFromApi() {
  const status = document.getElementById("statusFilter")?.value || "active";

  const qs = new URLSearchParams();
  qs.set("status", status);
  if (lastBookingQuery) qs.set("q", lastBookingQuery);

  const data = await api(`/bookings?${qs.toString()}`);
  renderBookings(data.items || []);
}


async function createBooking() {
  if (!selected) {
    UI.toast("⚠️ Chưa chọn chuyến bay", "warn");
    return;
  }

  const passengerName = document.getElementById("cusName").value.trim();
  const cccd = document.getElementById("cusCccd").value.trim();
  const phone = document.getElementById("cusPhone").value.trim();
  const ticketClass = document.getElementById("ticketClass").value;

  if (!passengerName) return UI.toast("⚠️ Nhập tên hành khách", "warn");
  if (!cccd) return UI.toast("⚠️ Nhập CMND/CCCD", "warn");
  if (!phone) return UI.toast("⚠️ Nhập số điện thoại", "warn");

  const seatAvail = selected?.seats_by_class
  ? Number(selected.seats_by_class[ticketClass] || 0)
  : (ticketClass === "1" ? Number(selected.seats1_avail) : Number(selected.seats2_avail));

  console.log('Selected flight:', selected); // Debug
  console.log('Ticket class:', ticketClass, 'Seat avail:', seatAvail); // Debug

  if (seatAvail <= 0) return UI.toast("Hạng vé này đã hết chỗ", "error");


  const payload = {
    flightId: selected.id,
    passengerName,
    cccd,
    phone,
    ticketClass: String(ticketClass),
  };

  const data = await api("/bookings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  UI.toast(`✅ Đã tạo ${data.booking?.booking_code || "phiếu đặt"}`, "success");

  // refresh list + seats
  await loadBookingsFromApi();
  await loadFlightsFromApi(false);
}

function bindUI() {
  // default date = hôm nay
  const dateEl = document.getElementById("flightDate");
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  document.getElementById("ticketClass")?.addEventListener("change", applySelected);

  document.getElementById("btnFind")?.addEventListener("click", async () => {
    try {
      UI.toast("🔎 Đang tìm chuyến...", "warn");
      await loadFlightsFromApi(true);
    } catch (e) {
      UI.toast(`❌ ${e.message}`, "warn");
    }
  });

  document.getElementById("btnCreate")?.addEventListener("click", async () => {
    try {
      await createBooking();
    } catch (e) {
      UI.toast(`❌ ${e.message}`, "warn");
    }
  });

  document.getElementById("btnReset")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("cusName").value = "";
    document.getElementById("cusCccd").value = "";
    document.getElementById("cusPhone").value = "";
    document.getElementById("ticketClass").value = "1";
    applySelected();
    UI.toast("♻️ Đã làm mới", "success");
  });
document.getElementById("btnCancelBooking")?.addEventListener("click", async () => {
  if (!selectedBookingId) return;

  const yes = await UI.confirm({
    title: "Hủy phiếu đặt",
    message: `Bạn có chắc muốn hủy phiếu <b>ID=${selectedBookingId}</b> không? <br/>Ghế sẽ được trả về hệ thống.`,
    confirmText: "Hủy phiếu",
    cancelText: "Không",
    type: "danger",
    icon: "fa-ban",
  });
  if (!yes) return;

  try {
    await api(`/bookings/${selectedBookingId}/cancel`, { method: "POST" });
    UI.toast("✅ Đã hủy phiếu", "success");
    selectedBookingId = null;
    await loadBookingsFromApi();     // refresh list
    const from = document.getElementById("fromAirport")?.value || "";
    const to = document.getElementById("toAirport")?.value || "";
    if (from && to) {
      await loadFlightsFromApi(false, false);      // refresh ghế trống chỉ khi đã chọn sân bay
    }
  } catch (e) {
    UI.toast(`❌ ${e.message}`, "warn");
  }
});

  // swap from/to
  const swapBtn = document.querySelector(".swap-btn");
  if (swapBtn) {
    swapBtn.addEventListener("click", () => {
      const fromEl = document.getElementById("fromAirport");
      const toEl = document.getElementById("toAirport");
      if (!fromEl || !toEl) return;
      const tmp = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = tmp;
      UI.toast("🔁 Đã đổi chiều", "success");
    });
  }

  // booking list tools
  document.getElementById("statusFilter")?.addEventListener("change", () => {
    loadBookingsFromApi().catch(() => {});
  });

  const btnSearch = document.querySelector(".btn-search");
if (btnSearch) {
  btnSearch.addEventListener("click", async () => {
    const q = String(document.getElementById("bookingSearchInput")?.value || "").trim();
    lastBookingQuery = q;
    try {
      await loadBookingsFromApi();
      UI.toast("🔎 Đã tìm kiếm", "success");
    } catch (e) {
      UI.toast(`❌ ${e.message}`, "warn");
    }
  });
}
function renderMiniBooking(items) {
  const box = document.getElementById("miniBookingList");
  if (!box) return;

  const b = items?.[0]; // list đang order created_at DESC => phần tử 0 là mới nhất
  if (!b) {
    box.innerHTML = `<div class="mini-row"><div class="muted">—</div><div class="muted">—</div><div class="muted">Chưa có</div></div>`;
    return;
  }

  // hạn chót đặt: tạm lấy theo ngày tạo phiếu + 1 ngày (bạn có rule khác thì đổi)
  const deadline = b.created_at ? fmtDateOnly(b.created_at) : "—";
const statusText = (s) => {
  if (s === "Đã hủy") return "Đã hủy";
  if (s === "Hết hạn") return "Hết hạn";
  return "Đã thanh toán";
};

const statusPill = (s) => {
  if (s === "Đã hủy") return "pill blue";
  if (s === "Hết hạn") return "pill gray";
  return "pill mint";
};


  box.innerHTML = `
    <div class="mini-row">
      <div class="link">${b.booking_code || "—"}</div>
      <div><span class="pill">${deadline}</span></div>
      <div><span class="${statusPill(b.status)}">${statusText(b.status)}</span></div>
    </div>
  `;
}

// Enter để tìm
document.getElementById("bookingSearchInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.querySelector(".btn-search")?.click();
});

  const btnClear = document.querySelector('.icon-mini[title="Xóa lọc"]');
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      lastBookingQuery = "";
      UI.toast("🧹 Đã xoá lọc", "success");
      try { await loadBookingsFromApi(); } catch {}
    });
  }

  const btnRefresh = document.querySelector('.icon-mini[title="Làm mới"]');
  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      try {
        await loadBookingsFromApi();
        UI.toast("🔄 Đã làm mới", "success");
      } catch {}
    });
  }
}

async function verifyOrRedirect() {
  const token = getToken();
  if (!token) {
    window.location.href = "index.html";
    return false;
  }
  try {
    await api("/auth/verify"); // chỉ cần ok là được
    return true;
  } catch {
    localStorage.removeItem("uiticket_token");
    localStorage.removeItem("uiticket_user");
    UI.toast("⚠️ Phiên đăng nhập hết hạn, vui lòng đăng nhập lại", "warn");
    setTimeout(() => (window.location.href = "index.html"), 700);
    return false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  bindUI();

  

  // Normal mode
  const ok = await verifyOrRedirect();
  if (!ok) return;

  try {
    await loadBookingsFromApi();
  } catch (e) {
    UI.toast(`❌ ${e.message}`, "warn");
  }
});
