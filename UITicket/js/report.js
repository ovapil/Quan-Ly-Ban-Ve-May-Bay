// ============================================
// REPORT.JS - Lập báo cáo (Theo tháng / Theo năm)
// - Theo tháng: nhóm theo chuyến bay
// - Theo năm: nhóm theo tháng
// Backend endpoints (nếu có backend):
//   GET /api/reports/month?month=YYYY-MM&status=paid|all
//   GET /api/reports/year?year=YYYY&status=paid|all
//
// ✅ Không có DB vẫn chạy được:
// - Mở report.html?preview=1  -> luôn dùng dữ liệu demo
// - Hoặc khi gọi API lỗi/không có token -> tự fallback demo
// ============================================

// ?preview hoặc ?preview=1 -> true ; ?preview=0 -> false
const __qs = new URLSearchParams(window.location.search);
const PREVIEW_MODE = __qs.has("preview") && __qs.get("preview") !== "0";

// Demo data (không cần DB)
function demoMonthly(month) {
  // trả về list { flight_code, tickets, revenue }
  const base = (month || "2024-01").replace("-", "");
  const k = Number(base.slice(-2)) || 1;
  return [
    { flight_code: "VN1512", tickets: 34, revenue: 12000000 + k * 100000 },
    { flight_code: "VJ212", tickets: 28, revenue: 8400000 + k * 80000 },
    { flight_code: "QH319", tickets: 23, revenue: 4300000 + k * 60000 },
  ];
}

function demoYearly(year) {
  // trả về 12 tháng { month, flight_count, revenue }
  const y = Number(year) || 2024;
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const revenue = Math.max(0, Math.round((Math.sin((m + y) % 7) + 1.2) * 9500000));
    const flight_count = revenue > 0 ? 3 + (m % 5) : 0;
    rows.push({ month: m, flight_count, revenue });
  }
  return rows;
}

// Nếu bạn chạy backend port khác thì sửa ở đây
const API_BASE_URL = "http://localhost:3000/api";

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
};

function getToken() {
  return localStorage.getItem("uiticket_token");
}

async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (body != null) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function fmtVnd(n) {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("vi-VN").format(v) + " đ";
  } catch {
    return v.toLocaleString() + " đ";
  }
}

function fmtInt(n) {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("vi-VN").format(v);
  } catch {
    return String(v);
  }
}

function monthName(m) {
  const mm = Number(m || 0);
  return mm >= 1 && mm <= 12 ? `Tháng ${mm}` : `Tháng ${mm}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function currentYear() {
  return new Date().getFullYear();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const ReportPage = {
  el: {},
  mode: "month", // month | year
  rawRows: [],
  filteredRows: [],
  lastPayload: null,

  cacheEls() {
    this.el.reportType = document.getElementById("reportType");
    this.el.yearWrap = document.getElementById("yearWrap");
    this.el.monthWrap = document.getElementById("monthWrap");
    this.el.yearInput = document.getElementById("yearInput");
    this.el.monthInput = document.getElementById("monthInput");

    this.el.btnGenerate = document.getElementById("btnGenerate");
    this.el.btnReset = document.getElementById("btnReset");
    this.el.btnBack = document.getElementById("btnBack");

    this.el.statusFilter = document.getElementById("statusFilter");
    this.el.quickSearch = document.getElementById("quickSearch");
    this.el.quickLabel = document.getElementById("quickLabel");

    this.el.tableTitle = document.getElementById("tableTitle");
    this.el.tableSearch = document.getElementById("tableSearch");
    this.el.reportTable = document.getElementById("reportTable");

    this.el.sumRevenue = document.getElementById("sumRevenue");
    this.el.sumMidLabel = document.getElementById("sumMidLabel");
    this.el.sumMidValue = document.getElementById("sumMidValue");
    this.el.sumRightLabel = document.getElementById("sumRightLabel");
    this.el.sumRightValue = document.getElementById("sumRightValue");

    this.el.btnExport = document.getElementById("btnExport");
    this.el.btnExportCaret = document.getElementById("btnExportCaret");
    this.el.exportMenu = document.getElementById("exportMenu");

    // header tabs
    this.el.tabHome = document.getElementById("tabHome");
    this.el.tabAccount = document.getElementById("tabAccount");
    this.el.tabSettings = document.getElementById("tabSettings");
    this.el.btnNoti = document.getElementById("btnNoti");
  },

  bind() {
    // header tabs
    this.el.tabHome?.addEventListener("click", () => (window.location.href = "dashboard.html"));
    this.el.tabAccount?.addEventListener("click", () => (window.location.href = "account.html"));
    this.el.tabSettings?.addEventListener("click", () => (window.location.href = "settings.html"));
    this.el.btnNoti?.addEventListener("click", () => UI.toast("🔔 Thông báo (demo)", "warn"));

    this.el.btnBack?.addEventListener("click", () => (window.location.href = "dashboard.html"));

    this.el.reportType?.addEventListener("change", () => {
      this.mode = this.el.reportType.value === "year" ? "year" : "month";
      this.applyModeUI();
      this.resetTableOnly();
    });

    this.el.btnGenerate?.addEventListener("click", () => this.generate());

    this.el.btnReset?.addEventListener("click", () => {
      this.el.tableSearch.value = "";
      this.el.quickSearch.value = "";
      this.resetTableOnly();
      UI.toast("🔄 Đã làm mới", "success");
    });

    // client-side filtering
    this.el.tableSearch?.addEventListener("input", () => this.applyTableFilter());
    this.el.quickSearch?.addEventListener("input", () => {
      // đồng bộ với ô lọc bảng để người dùng thấy đang lọc gì
      this.el.tableSearch.value = this.el.quickSearch.value;
      this.applyTableFilter();
    });

    // export menu (menu có class "hidden" theo CSS của bạn)
    const closeMenu = () => this.el.exportMenu?.classList.add("hidden");

    this.el.btnExportCaret?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.el.exportMenu?.classList.toggle("hidden");
    });

    this.el.btnExport?.addEventListener("click", () => {
      // mặc định export CSV
      this.exportCSV();
    });

    this.el.exportMenu?.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".menu-item");
      if (!btn) return;
      const type = btn.getAttribute("data-export");
      closeMenu();
      if (type === "csv") this.exportCSV();
      if (type === "print") this.print();
    });

    document.addEventListener("click", closeMenu);
  },

  applyModeUI() {
    const isYear = this.mode === "year";

    // show/hide inputs
    if (this.el.yearWrap) this.el.yearWrap.style.display = isYear ? "" : "none";
    if (this.el.monthWrap) this.el.monthWrap.style.display = isYear ? "none" : "";

    // labels + title
    if (this.el.tableTitle) {
      this.el.tableTitle.textContent = isYear ? "Báo cáo theo năm" : "Báo cáo theo tháng";
    }

    if (isYear) {
      this.el.sumMidLabel.textContent = "Tổng số chuyến bay";
      this.el.sumRightLabel.textContent = "Số tháng có doanh thu";
      this.el.quickLabel.textContent = "Tìm nhanh tháng";
      this.el.quickSearch.placeholder = "VD: Tháng 7";
    } else {
      this.el.sumMidLabel.textContent = "Tổng số vé";
      this.el.sumRightLabel.textContent = "Số chuyến bay";
      this.el.quickLabel.textContent = "Tìm nhanh chuyến bay";
      this.el.quickSearch.placeholder = "VD: VN123";
    }
  },

  resetTableOnly() {
    this.rawRows = [];
    this.filteredRows = [];
    this.lastPayload = null;

    this.el.reportTable.innerHTML = `
      <div class="empty">
        Chọn thời gian và bấm <b>Báo cáo</b> để xem dữ liệu.
      </div>
    `;

    this.el.sumRevenue.textContent = "—";
    this.el.sumMidValue.textContent = "—";
    this.el.sumRightValue.textContent = "—";
  },

  validateInputs() {
    if (this.mode === "month") {
      const m = String(this.el.monthInput.value || "").trim();
      if (!/^\d{4}-\d{2}$/.test(m)) {
        UI.toast("❌ Vui lòng chọn Tháng (YYYY-MM)", "warn");
        return null;
      }
      return { month: m };
    }

    const y = Number(this.el.yearInput.value);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      UI.toast("❌ Vui lòng nhập Năm hợp lệ", "warn");
      return null;
    }
    return { year: y };
  },

  // ✅ tạo payload demo dùng demoMonthly/demoYearly (không cần DB)
  buildDemoPayload(input, status) {
    if (this.mode === "month") {
      const month = input.month;
      const items = demoMonthly(month);
      const totalRevenue = items.reduce((s, x) => s + Number(x.revenue || 0), 0);
      const totalTickets = items.reduce((s, x) => s + Number(x.tickets || 0), 0);

      return {
        type: "month",
        month,
        status,
        totalRevenue,
        totalTickets,
        items,
      };
    }

    const year = input.year;
    const items = demoYearly(year);
    const totalRevenue = items.reduce((s, x) => s + Number(x.revenue || 0), 0);
    const totalFlights = items.reduce((s, x) => s + Number(x.flight_count || 0), 0);
    const monthsWithRevenue = items.filter((x) => Number(x.revenue || 0) > 0).length;

    return {
      type: "year",
      year,
      status,
      totalRevenue,
      totalFlights,
      monthsWithRevenue,
      items,
    };
  },

  async generate() {
    const status = String(this.el.statusFilter.value || "paid").trim();
    const input = this.validateInputs();
    if (!input) return;

    try {
      // ✅ Preview mode: luôn dùng demo, khỏi gọi backend
      if (PREVIEW_MODE) {
        const payload = this.buildDemoPayload(input, status);
        this.applyPayload(payload);
        UI.toast("✅ Đã tạo báo cáo (preview)", "success");
        return;
      }

      // ✅ Không có token: chạy demo luôn (đỡ phải login mới xem được UI)
      if (!getToken()) {
        const payload = this.buildDemoPayload(input, status);
        this.applyPayload(payload);
        UI.toast("✅ Đã tạo báo cáo (demo - chưa đăng nhập)", "success");
        return;
      }

      // ✅ Có token thì thử gọi API thật
      let payload;
      if (this.mode === "month") {
        payload = await api(`/reports/month?month=${encodeURIComponent(input.month)}&status=${encodeURIComponent(status)}`);
      } else {
        payload = await api(`/reports/year?year=${encodeURIComponent(input.year)}&status=${encodeURIComponent(status)}`);
      }

      this.applyPayload(payload);
      UI.toast("✅ Đã tạo báo cáo", "success");
    } catch (e) {
      // ✅ Backend/DB lỗi -> fallback demo
      console.error(e);
      const payload = this.buildDemoPayload(input, status);
      this.applyPayload(payload);
      UI.toast("⚠️ Không kết nối server/DB, hiển thị dữ liệu demo", "warn");
    }
  },

  applyPayload(payload) {
    this.lastPayload = payload;

    if (payload.type === "month") {
      this.mode = "month";
      if (this.el.reportType) this.el.reportType.value = "month";
      this.applyModeUI();

      this.rawRows = (payload.items || []).map((x) => ({
        flight_code: String(x.flight_code || "").trim(),
        tickets: Number(x.tickets || 0),
        revenue: Number(x.revenue || 0),
      }));

      const totalRevenue = Number(payload.totalRevenue || 0);
      const totalTickets = Number(payload.totalTickets || 0);
      const flights = new Set(this.rawRows.map((r) => r.flight_code).filter(Boolean)).size;

      this.el.sumRevenue.textContent = fmtVnd(totalRevenue);
      this.el.sumMidValue.textContent = fmtInt(totalTickets);
      this.el.sumRightValue.textContent = fmtInt(flights);

      this.el.tableTitle.textContent = `Báo cáo theo tháng (${payload.month || ""})`;
      this.applyTableFilter(true);
      return;
    }

    // year
    this.mode = "year";
    if (this.el.reportType) this.el.reportType.value = "year";
    this.applyModeUI();

    this.rawRows = (payload.items || []).map((x) => ({
      month: Number(x.month || 0),
      flight_count: Number(x.flight_count || 0),
      revenue: Number(x.revenue || 0),
    }));

    const totalRevenue = Number(payload.totalRevenue || 0);
    const totalFlights = Number(payload.totalFlights || 0);
    const monthsWithRevenue = Number(payload.monthsWithRevenue || 0);

    this.el.sumRevenue.textContent = fmtVnd(totalRevenue);
    this.el.sumMidValue.textContent = fmtInt(totalFlights);
    this.el.sumRightValue.textContent = fmtInt(monthsWithRevenue);

    this.el.tableTitle.textContent = `Báo cáo theo năm (${payload.year || ""})`;
    this.applyTableFilter(true);
  },

  applyTableFilter(reset = false) {
    if (reset) {
      this.el.tableSearch.value = "";
      this.el.quickSearch.value = "";
    }

    const q = String(this.el.tableSearch.value || "").trim().toLowerCase();

    if (!q) {
      this.filteredRows = [...this.rawRows];
    } else {
      if (this.mode === "month") {
        this.filteredRows = this.rawRows.filter((r) => String(r.flight_code || "").toLowerCase().includes(q));
      } else {
        this.filteredRows = this.rawRows.filter((r) => monthName(r.month).toLowerCase().includes(q));
      }
    }

    this.renderTable();
  },

  renderTable() {
    const rows = this.filteredRows || [];

    if (!rows.length) {
      this.el.reportTable.innerHTML = `<div class="empty">Không có dữ liệu phù hợp.</div>`;
      return;
    }

    // =========================
    // MONTH TABLE
    // =========================
    if (this.mode === "month") {
      // ratios theo dữ liệu đang hiển thị (filtered)
      const totalTickets = rows.reduce((s, r) => s + (r.tickets || 0), 0) || 1;
      const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0) || 1;

      const body = rows
        .map((r, idx) => {
          const pTickets = ((r.tickets || 0) / totalTickets) * 100;
          const pRevenue = ((r.revenue || 0) / totalRevenue) * 100;
          return `
            <tr>
              <td class="t-center">${idx + 1}</td>
              <td>${r.flight_code || "—"}</td>
              <td class="t-center">${fmtInt(r.tickets)}</td>
              <td class="t-right">${fmtVnd(r.revenue)}</td>
              <td class="t-center">${pTickets.toFixed(2)}%</td>
              <td class="t-center">${pRevenue.toFixed(2)}%</td>
            </tr>
          `;
        })
        .join("");

      const sumTickets = rows.reduce((s, r) => s + (r.tickets || 0), 0);
      const sumRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);

      const foot = `
        <tr>
          <td colspan="2"><b>Tổng</b></td>
          <td class="t-center"><b>${fmtInt(sumTickets)}</b></td>
          <td class="t-right"><b>${fmtVnd(sumRevenue)}</b></td>
          <td class="t-center"><b>100%</b></td>
          <td class="t-center"><b>100%</b></td>
        </tr>
      `;

      this.el.reportTable.innerHTML = `
        <table class="tbl">
          <thead>
            <tr>
              <th class="t-center" style="width:70px">STT</th>
              <th>Mã chuyến bay</th>
              <th class="t-center" style="width:140px">Số vé</th>
              <th class="t-right" style="width:190px">Doanh thu</th>
              <th class="t-center" style="width:170px">Tỉ lệ số vé</th>
              <th class="t-center" style="width:170px">Tỉ lệ doanh thu</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
          <tfoot>
            ${foot}
          </tfoot>
        </table>
      `;
      return;
    }

    // =========================
    // YEAR TABLE (✅ có tỉ lệ doanh thu)
    // =========================
    const yearTotalRevenue = Number(this.lastPayload?.totalRevenue || 0) || 1;

    const body = rows
      .map((r, idx) => {
        const ratioRevenue = (Number(r.revenue || 0) / yearTotalRevenue) * 100;
        return `
          <tr>
            <td class="t-center">${idx + 1}</td>
            <td>${monthName(r.month)}</td>
            <td class="t-center">${fmtInt(r.flight_count)}</td>
            <td class="t-right">${fmtVnd(r.revenue)}</td>
            <td class="t-center">${ratioRevenue.toFixed(2)}%</td>
          </tr>
        `;
      })
      .join("");

    const sumFlights = rows.reduce((s, r) => s + (r.flight_count || 0), 0);
    const sumRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const sumRatio = (sumRevenue / yearTotalRevenue) * 100;

    const foot = `
      <tr>
        <td colspan="2"><b>Tổng</b></td>
        <td class="t-center"><b>${fmtInt(sumFlights)}</b></td>
        <td class="t-right"><b>${fmtVnd(sumRevenue)}</b></td>
        <td class="t-center"><b>${sumRatio.toFixed(2)}%</b></td>
      </tr>
    `;

    this.el.reportTable.innerHTML = `
      <table class="tbl">
        <thead>
          <tr>
            <th class="t-center" style="width:70px">STT</th>
            <th>Tháng</th>
            <th class="t-center" style="width:180px">Số chuyến bay</th>
            <th class="t-right" style="width:220px">Doanh thu</th>
            <th class="t-center" style="width:170px">Tỉ lệ doanh thu</th>
          </tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
        <tfoot>
          ${foot}
        </tfoot>
      </table>
    `;
  },

  exportCSV() {
    if (!this.filteredRows?.length) {
      UI.toast("⚠️ Chưa có dữ liệu để xuất", "warn");
      return;
    }

    const rows = this.filteredRows;
    const lines = [];

    if (this.mode === "month") {
      lines.push(["STT", "MaChuyenBay", "SoVe", "DoanhThu"].join(","));
      rows.forEach((r, i) => {
        lines.push([i + 1, safeCSV(r.flight_code), r.tickets, r.revenue].join(","));
      });
      const totalTickets = rows.reduce((s, r) => s + (r.tickets || 0), 0);
      const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
      lines.push(["TONG", "", totalTickets, totalRevenue].join(","));

      const m = this.lastPayload?.month || todayISO();
      downloadText(`bao_cao_thang_${m}.csv`, lines.join("\n"));
      UI.toast("⬇️ Đã xuất CSV", "success");
      return;
    }

    lines.push(["STT", "Thang", "SoChuyenBay", "DoanhThu"].join(","));
    rows.forEach((r, i) => {
      lines.push([i + 1, r.month, r.flight_count, r.revenue].join(","));
    });

    const totalFlights = rows.reduce((s, r) => s + (r.flight_count || 0), 0);
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    lines.push(["TONG", "", totalFlights, totalRevenue].join(","));

    const y = this.lastPayload?.year || currentYear();
    downloadText(`bao_cao_nam_${y}.csv`, lines.join("\n"));
    UI.toast("⬇️ Đã xuất CSV", "success");
  },

  print() {
    if (!this.filteredRows?.length) {
      UI.toast("⚠️ Chưa có dữ liệu để in", "warn");
      return;
    }

    const title = this.el.tableTitle?.textContent || "Báo cáo";
    const tableHTML = this.el.reportTable?.innerHTML || "";

    const w = window.open("", "_blank", "width=960,height=720");
    if (!w) {
      UI.toast("❌ Trình duyệt chặn popup", "error");
      return;
    }

    w.document.write(`
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHTML(title)}</title>
        <style>
          body{ font-family: Arial, sans-serif; padding: 18px; }
          h2{ margin: 0 0 12px; }
          table{ width:100%; border-collapse:collapse; }
          th, td{ border:1px solid #e5e7eb; padding:8px; font-size: 13px; }
          th{ background:#f3f4f6; text-align:left; }
          .t-right{ text-align:right; }
          .t-center{ text-align:center; }
        </style>
      </head>
      <body>
        <h2>${escapeHTML(title)}</h2>
        ${tableHTML}
      </body>
      </html>
    `);

    w.document.close();
    w.focus();
    w.print();
  },

  init() {
    this.cacheEls();
    this.bind();

    // default values
    this.el.monthInput.value = todayISO();
    this.el.yearInput.value = String(currentYear());

    this.mode = this.el.reportType.value === "year" ? "year" : "month";
    this.applyModeUI();
    this.resetTableOnly();

    if (PREVIEW_MODE) {
      UI.toast("🧪 Preview mode: dùng dữ liệu demo", "warn");
    }
  },
};

function safeCSV(s) {
  const v = String(s ?? "");
  if (/[",\n]/.test(v)) return '"' + v.replaceAll('"', '""') + '"';
  return v;
}

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

document.addEventListener("DOMContentLoaded", () => ReportPage.init());
