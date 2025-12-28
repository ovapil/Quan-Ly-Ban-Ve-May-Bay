// ============================================
// booking.js - REAL VERSION (API + Token)
// Preview UI: booking.html?preview=1
// ============================================

const API_BASE_URL = "http://localhost:3000/api";


function fillSelect(el, rows, placeholder) {
  // Giống bán vé: mặc định hiển thị "-- Tất cả --"
  el.innerHTML = `<option value="" selected>-- Tất cả --</option>`;

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

document.addEventListener("DOMContentLoaded", () => {
  (async () => {
    await loadAirports();

    // After airports loaded, check URL params to prefill and auto-search
    try {
      const qs = new URLSearchParams(window.location.search);
      const flightId = qs.get('flightId') || '';
      const from = qs.get('from') || '';
      const to = qs.get('to') || '';
      const date = qs.get('date') || '';

      if (from) document.getElementById('fromAirport').value = from;
      if (to) document.getElementById('toAirport').value = to;
      if (date) document.getElementById('flightDate').value = date;

      if (from || to || date || flightId) {
        // auto search
        try {
          await loadFlightsFromApi(true, false);
          if (flightId) {
            const found = flights.find(f => String(f.flight_code) === String(flightId));
            if (found) {
              selected = found;
              applySelected();
              UI.toast(`Đã chọn chuyến ${found.flight_code}`, 'success');
            } else {
              UI.toast('Không tìm thấy chuyến theo mã chuyến được cung cấp', 'warn');
            }
          }
        } catch (e) {
          console.warn('Auto search failed', e);
          UI.toast('Không thể tìm chuyến (lỗi kết nối)', 'error');
        }
      }
    } catch (e) {
      console.warn('Prefill booking params failed', e);
    }
  })();

  // Back button handler
  const btnBack = document.getElementById("btnBackTop");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      window.location.href = "dashboard.html";
    });
  }
});

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
  const method = String(opts.method || "GET").toUpperCase();
  if (res.status === 404 && method === "GET") return { items: [] }; // Only treat missing GET list as empty
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const fmtMoney = (n) => Number(n || 0).toLocaleString("vi-VN") + " VNĐ";
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
let attemptedCreateBooking = false;
let createBookingInFlight = false;

function isValidCMND(v) {
  const s = String(v || "").trim();
  return /^\d{9}(\d{3})?$/.test(s); // 9 hoặc 12 số
}

function isValidPhone(v) {
  const s = String(v || "").trim();
  return /^\d{10}$/.test(s); // đúng 10 số
}

function setFieldError(inputEl, errEl, message, show) {
  if (!inputEl || !errEl) return;
  errEl.textContent = show ? (message || "") : "";
  inputEl.classList.toggle("invalid", !!(show && message));
}

function validateCreateBookingForm(showErrors) {
  const btn = document.getElementById("btnCreate");
  const nameEl = document.getElementById("cusName");
  const cccdEl = document.getElementById("cusCccd");
  const phoneEl = document.getElementById("cusPhone");

  const errName = document.getElementById("errCusName");
  const errCccd = document.getElementById("errCusCccd");
  const errPhone = document.getElementById("errCusPhone");

  const passengerName = String(nameEl?.value || "").trim();
  const cccd = String(cccdEl?.value || "").trim();
  const phone = String(phoneEl?.value || "").trim();

  let ok = true;

  if (!selected) ok = false;

  if (!passengerName) {
    ok = false;
    setFieldError(nameEl, errName, "Vui lòng nhập họ tên", showErrors);
  } else {
    setFieldError(nameEl, errName, "", false);
  }

  if (!cccd) {
    ok = false;
    setFieldError(cccdEl, errCccd, "Vui lòng nhập CMND/CCCD", showErrors);
  } else if (!isValidCMND(cccd)) {
    ok = false;
    setFieldError(cccdEl, errCccd, "CMND/CCCD phải 9 hoặc 12 chữ số", showErrors);
  } else {
    setFieldError(cccdEl, errCccd, "", false);
  }

  if (!phone) {
    ok = false;
    setFieldError(phoneEl, errPhone, "Vui lòng nhập số điện thoại", showErrors);
  } else if (!isValidPhone(phone)) {
    ok = false;
    setFieldError(phoneEl, errPhone, "Số điện thoại phải đúng 10 chữ số", showErrors);
  } else {
    setFieldError(phoneEl, errPhone, "", false);
  }

  // kiểm tra còn ghế theo hạng vé
  if (selected) {
    const ticketClass = document.getElementById("ticketClass")?.value || "1";
    const seatAvail = selected?.seats_by_class
      ? Number(selected.seats_by_class[ticketClass] || 0)
      : (ticketClass === "1" ? Number(selected.seats1_avail) : Number(selected.seats2_avail));
    if (Number(seatAvail || 0) <= 0) ok = false;
  }

  // Giữ giao diện như cũ: không khóa nút theo điều kiện nhập.
  // Chỉ khóa trong lúc đang gửi request để tránh double-click.
  if (btn) btn.disabled = !!createBookingInFlight;
  return ok;
}
let sellFromBookingInFlight = false;

function clearSelectedUI() {
  const wrap = document.getElementById("selectedWrap");
  if (wrap) wrap.style.display = "none";

  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setText("selCode", "—");
  setText("selRoute", "—");
  setText("selDepart", "—");
  setText("selPriceInfo", "Đơn giá: —");
  setText("selRoute2", "—");
  setText("selDate2", "—");
  setText("selDeadline", "—");

  setText("seatNote", "Chưa chọn chuyến");
  setText("classPrice", "—");
  setText("totalPrice", "—");

  validateCreateBookingForm(false);
}

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
      <div class="t-center">${Number(f.seats_total_avail || 0)}</div>
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
        UI.toast(`Đã chọn ${f.flight_code}`, "success");
      };
      seatCell.appendChild(btn);
    }

    table.appendChild(row);
  });
}

function applySelected() {
  if (!selected) {
    clearSelectedUI();
    return;
  }

  const wrap = document.getElementById("selectedWrap");
  if (wrap) wrap.style.display = "grid";

  const cls = document.getElementById("ticketClass")?.value || "1";
  const seat = selected.seats_by_class ? Number(selected.seats_by_class[cls] || 0) : (cls === "1" ? Number(selected.seats1_avail) : Number(selected.seats2_avail));

  document.getElementById("selCode").textContent = selected.flight_code;
  document.getElementById("selRoute").textContent = `${selected.from_city} → ${selected.to_city}`;
  document.getElementById("selDepart").textContent = fmtDateTime(selected.depart_at);

  document.getElementById("selRoute2").textContent = `${selected.from_city} – ${selected.to_city}`;
  document.getElementById("selDate2").textContent = fmtDateOnly(selected.depart_at);
    // QĐ3: đặt vé chậm nhất 1 ngày trước giờ bay
  let dlText = "—";
  if (selected.depart_at) {
    const dl = new Date(selected.depart_at);
    if (!isNaN(dl.getTime())) {
      dl.setDate(dl.getDate() - 1);
      dlText = fmtDateOnly(dl.toISOString());
    }
  }
  document.getElementById("selDeadline").textContent = `chậm nhất trước ngày ${dlText}`;

  const clsLabel = document.getElementById("ticketClass")?.selectedOptions?.[0]?.textContent?.trim() || `Hạng ${cls}`;
  document.getElementById("seatNote").textContent = `${clsLabel} có ${seat} ghế trống`;

  const p = priceByClass(selected.base_price, cls);
  document.getElementById("selPriceInfo").textContent = `Đơn giá: ${fmtMoney(selected.base_price)}`;
  document.getElementById("classPrice").textContent = fmtMoney(p);
  document.getElementById("totalPrice").textContent = fmtMoney(p);

  // update create button state based on selection + seat availability
  validateCreateBookingForm(attemptedCreateBooking);
}

async function loadFlightsFromApi(showToast = true, validateAirports = true) {
  const from = document.getElementById("fromAirport")?.value || "";
  const to = document.getElementById("toAirport")?.value || "";
  const date = document.getElementById("flightDate")?.value || "";

  // Không bắt buộc chọn sân bay/ ngày: để trống => coi như (Tất cả)

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (date) qs.set("date", date);

  const prevCode = selected?.flight_code || "";

  const data = await api(`/flights?${qs.toString()}`);
  flights = data.items || [];
  console.log('Flights data:', flights); // Debug: Check seats_by_class

  // Không tự chọn chuyến sau khi tìm; chỉ giữ lại nếu người dùng đã chọn trước đó
  if (prevCode) selected = flights.find((f) => f.flight_code === prevCode) || null;
  else selected = null;

  renderFlights();
  applySelected();

  if (showToast) {
    if (flights.length > 0) {
      UI.toast(`Tìm thấy ${flights.length} chuyến`, "success");
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
    updateSellBtn();
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
      updateSellBtn();
    });
  });

  updateCancelBtn();
  updateSellBtn();
}
function updateCancelBtn() {
  const btn = document.getElementById("btnCancelBooking");
  if (!btn) return;

  // chỉ cho hủy khi đang xem "Đặt chỗ" (value = active)
  const status = document.getElementById("statusFilter")?.value || "active";
  const ok = !!selectedBookingId && status === "active";

  btn.style.display = ok ? "inline-flex" : "none";
}

function updateSellBtn() {
  const btn = document.getElementById("btnSellBooking");
  if (!btn) return;

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
  attemptedCreateBooking = true;
  if (!validateCreateBookingForm(true)) {
    UI.toast("⚠️ Vui lòng kiểm tra thông tin trước khi tạo phiếu", "warn");
    return;
  }

  if (createBookingInFlight) return;
  createBookingInFlight = true;
  validateCreateBookingForm(true);

  if (!selected) {
    UI.toast("⚠️ Chưa chọn chuyến bay", "warn");
    createBookingInFlight = false;
    validateCreateBookingForm(true);
    return;
  }

  const passengerName = document.getElementById("cusName").value.trim();
  const cccd = document.getElementById("cusCccd").value.trim();
  const phone = document.getElementById("cusPhone").value.trim();
  const ticketClass = document.getElementById("ticketClass").value;

  // (đã validate trước khi vào đây, giữ check nhẹ để an toàn)
  if (!passengerName || !isValidCMND(cccd) || !isValidPhone(phone)) {
    createBookingInFlight = false;
    validateCreateBookingForm(true);
    return;
  }

  const seatAvail = selected?.seats_by_class
  ? Number(selected.seats_by_class[ticketClass] || 0)
  : (ticketClass === "1" ? Number(selected.seats1_avail) : Number(selected.seats2_avail));

  console.log('Selected flight:', selected); // Debug
  console.log('Ticket class:', ticketClass, 'Seat avail:', seatAvail); // Debug

  if (seatAvail <= 0) {
    UI.toast("Hạng vé này đã hết chỗ", "error");
    createBookingInFlight = false;
    validateCreateBookingForm(true);
    return;
  }


  const payload = {
    flightId: selected.id,
    passengerName,
    cccd,
    phone,
    ticketClass: String(ticketClass),
  };

  try {
    const data = await api("/bookings", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    UI.toast(`Đã tạo ${data.booking?.booking_code || "phiếu đặt"}`, "success");

    // refresh list + seats
    await loadBookingsFromApi();
    await loadFlightsFromApi(false, false);
  } finally {
    createBookingInFlight = false;
    validateCreateBookingForm(true);
  }
}

function bindUI() {
  // Mặc định: không chọn ngày => coi như tất cả các ngày
  const dateEl = document.getElementById("flightDate");
  if (dateEl) dateEl.value = "";

  document.getElementById("ticketClass")?.addEventListener("change", applySelected);

  // validate inputs before enabling "Tạo phiếu đặt"
  const nameEl = document.getElementById("cusName");
  const cccdEl = document.getElementById("cusCccd");
  const phoneEl = document.getElementById("cusPhone");

  const revalidate = () => validateCreateBookingForm(attemptedCreateBooking);

  nameEl?.addEventListener("input", revalidate);
  nameEl?.addEventListener("blur", revalidate);

  ["input", "blur"].forEach((evt) => {
    cccdEl?.addEventListener(evt, (e) => {
      if (evt === "input") e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 12);
      revalidate();
    });
  });

  ["input", "blur"].forEach((evt) => {
    phoneEl?.addEventListener(evt, (e) => {
      if (evt === "input") e.target.value = String(e.target.value || "").replace(/\D/g, "").slice(0, 10);
      revalidate();
    });
  });

  document.getElementById("btnFind")?.addEventListener("click", async () => {
    try {
      UI.toast("Đang tìm chuyến...", "warn");
      await loadFlightsFromApi(true, false);
    } catch (e) {
      UI.toast(`${e.message}`, "warn");
    }
  });

  document.getElementById("btnCreate")?.addEventListener("click", async () => {
    try {
      await createBooking();
    } catch (e) {
      UI.toast(`${e.message}`, "warn");
    }
  });

  document.getElementById("btnReset")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("cusName").value = "";
    document.getElementById("cusCccd").value = "";
    document.getElementById("cusPhone").value = "";
    document.getElementById("ticketClass").value = "1";
    attemptedCreateBooking = false;
    applySelected();
    validateCreateBookingForm(false);
    UI.toast("Đã làm mới", "success");
  });

  // initial state
  validateCreateBookingForm(false);
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
    UI.toast("Đã hủy phiếu", "success");
    selectedBookingId = null;
    await loadBookingsFromApi();     // refresh list
    const from = document.getElementById("fromAirport")?.value || "";
    const to = document.getElementById("toAirport")?.value || "";
    if (from && to) {
      await loadFlightsFromApi(false, false);      // refresh ghế trống chỉ khi đã chọn sân bay
    }
  } catch (e) {
    UI.toast(`${e.message}`, "warn");
  }
});

document.getElementById("btnSellBooking")?.addEventListener("click", async () => {
  if (sellFromBookingInFlight) return;
  if (!selectedBookingId) return;

  const btn = document.getElementById("btnSellBooking");
  sellFromBookingInFlight = true;
  if (btn) btn.disabled = true;

  const yes = await UI.confirm({
    title: "Bán vé từ phiếu đặt",
    message: `Bạn có chắc muốn <b>bán vé</b> từ phiếu <b>ID=${selectedBookingId}</b> không?`,
    confirmText: "Bán vé",
    cancelText: "Không",
    type: "primary",
    icon: "fa-ticket",
  });
  if (!yes) {
    sellFromBookingInFlight = false;
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const data = await api(`/bookings/${selectedBookingId}/sell`, { method: "POST" });
    const code = data.ticket?.ma_ve ? ` ${data.ticket.ma_ve}` : "";
    UI.toast(`Đã bán vé${code}`, "success");
    selectedBookingId = null;
    await loadBookingsFromApi();
    await loadFlightsFromApi(false, false);
  } catch (e) {
    UI.toast(`${e.message}`, "warn");
  } finally {
    sellFromBookingInFlight = false;
    if (btn) btn.disabled = false;
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
      UI.toast("Đã đổi chiều", "success");
    });
  }

  // booking list tools
  document.getElementById("statusFilter")?.addEventListener("change", () => {
    loadBookingsFromApi().catch(() => {});
    updateCancelBtn();
    updateSellBtn();
  });

  const btnSearch = document.getElementById("btnSearchBooking");
  if (btnSearch) {
    btnSearch.addEventListener("click", async () => {
    const q = String(document.getElementById("bookingSearchInput")?.value || "").trim();
    lastBookingQuery = q;
    try {
      await loadBookingsFromApi();
      UI.toast("Đã tìm kiếm", "success");
    } catch (e) {
      UI.toast(`${e.message}`, "warn");
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

  // Deadline đặt vé: chậm nhất 1 ngày trước giờ bay (QĐ3)
let deadline = "—";
if (b.depart_at) {
  const d = new Date(b.depart_at);
  if (!isNaN(d.getTime())) {
    d.setDate(d.getDate() - 1);
    deadline = fmtDateOnly(d.toISOString());
  }
}

const statusText = (s) => {
  if (s === "Đặt chỗ") return "Đặt chỗ";
  if (s === "Đã hủy") return "Đã hủy";
  if (s === "Hết hạn") return "Bị hủy (ngày bay)";
  return s || "—";
};

const statusPill = (s) => {
  if (s === "Đã hủy") return "pill blue";
  if (s === "Hết hạn") return "pill gray";
  return "pill mint"; // Đặt chỗ
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
  if (e.key === "Enter") document.getElementById("btnSearchBooking")?.click();
});

  const btnClear = document.querySelector('.icon-mini[title="Xóa lọc"]');
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      lastBookingQuery = "";
      UI.toast("Đã xoá lọc", "success");
      try { await loadBookingsFromApi(); } catch {}
    });
  }

  const btnRefresh = document.querySelector('.icon-mini[title="Làm mới"]');
  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      try {
        await loadBookingsFromApi();
        UI.toast("Đã làm mới", "success");
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

  // Không hiển thị dữ liệu mẫu; chỉ hiện khi người dùng chọn chuyến
  clearSelectedUI();

  

  // Normal mode
  const ok = await verifyOrRedirect();
  if (!ok) return;

  try {
    await loadBookingsFromApi();
  } catch (e) {
    UI.toast(`${e.message}`, "warn");
  }
});
