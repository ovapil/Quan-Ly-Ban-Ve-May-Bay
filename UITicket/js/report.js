// ============================================
// REPORT.JS - Lập báo cáo (Theo tháng / Theo năm)
// - Theo tháng: nhóm theo chuyến bay
// - Theo năm: nhóm theo tháng
// ✅ Doanh thu CHỈ tính từ bảng VE (vé đã bán). Không cộng tiền phiếu đặt chỗ.
// Backend endpoints:
//   GET /api/reports/month?month=YYYY-MM&status=paid|all
//   GET /api/reports/year?year=YYYY&status=paid|all
// ============================================

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

function fmtMoneyVND(n) {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return "0 ₫";
  return num.toLocaleString("vi-VN") + " ₫";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowYyyyMm() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function nowYear() {
  return String(new Date().getFullYear());
}

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===== Simple line chart (no dependency) =====
function resizeCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(10, Math.floor(rect.width * dpr));
  const h = Math.max(10, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

function drawLineChart(canvas, labels, values, opts = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  resizeCanvasToDisplaySize(canvas);

  const W = canvas.width;
  const H = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  // clear
  ctx.clearRect(0, 0, W, H);

  const padding = {
    left: 56 * dpr,
    right: 14 * dpr,
    top: 14 * dpr,
    bottom: 56 * dpr,
  };

  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  // empty
  if (!values.length || Math.max(...values) <= 0) {
    ctx.save();
    ctx.font = `${14 * dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Chưa có dữ liệu để vẽ biểu đồ", W / 2, H / 2);
    ctx.restore();
    return;
  }

  const maxV = Math.max(...values);
  const maxY = maxV * 1.15;

  // grid
  ctx.save();
  ctx.strokeStyle = "rgba(100,116,139,0.20)";
  ctx.lineWidth = 1 * dpr;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }
  ctx.restore();

  // axes labels (y)
  ctx.save();
  ctx.fillStyle = "#334155";
  ctx.font = `${12 * dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= gridLines; i++) {
    const v = (maxY * (gridLines - i)) / gridLines;
    const y = padding.top + (plotH * i) / gridLines;
    const txt = (v >= 1e9)
      ? `${(v / 1e9).toFixed(1)}B`
      : (v >= 1e6)
      ? `${(v / 1e6).toFixed(1)}M`
      : (v >= 1e3)
      ? `${(v / 1e3).toFixed(0)}K`
      : `${Math.round(v)}`;
    ctx.fillText(txt, padding.left - 8 * dpr, y);
  }
  ctx.restore();

  // line points
  const n = values.length;
  const xs = [];
  const ys = [];

  for (let i = 0; i < n; i++) {
    const v = Number(values[i] || 0);
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = padding.left + t * plotW;
    const y = padding.top + plotH - (v / maxY) * plotH;
    xs.push(x);
    ys.push(y);
  }

  // area under line
  ctx.save();
  ctx.fillStyle = "rgba(46,74,168,0.10)";
  ctx.beginPath();
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.lineTo(xs[n - 1], padding.top + plotH);
  ctx.lineTo(xs[0], padding.top + plotH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // line stroke
  ctx.save();
  ctx.strokeStyle = "rgba(46,74,168,0.85)";
  ctx.lineWidth = 2.2 * dpr;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.stroke();
  ctx.restore();

  // points
  ctx.save();
  ctx.fillStyle = "rgba(46,74,168,0.95)";
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(xs[i], ys[i], 3.4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // x labels
  ctx.save();
  ctx.fillStyle = "#334155";
  ctx.font = `${12 * dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const angle = -Math.PI / 6; // -30deg

  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = padding.top + plotH + 20 * dpr;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const raw = String(labels[i] ?? "");
    const txt = raw.length > 14 ? raw.slice(0, 14) + "…" : raw;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // optional footer
  if (opts.footerText) {
    ctx.save();
    ctx.font = `${12 * dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(opts.footerText, padding.left, H - 10 * dpr);
    ctx.restore();
  }
}

const Report = {
  state: {
    type: "month", // month|year
    status: "paid", // paid|all
    rawItems: [],
    filteredItems: [],
    lastResponse: null,
  },

  els: {},

  bindEls() {
    const ids = [
      "tabHome",
      "tabAccount",
      "tabSettings",
      "btnGenerate",
      "btnExport",
      "btnPrint",
      "exportMenu",
      "btnReset",
      "btnBack",
      "reportType",
      "yearWrap",
      "monthWrap",
      "yearInput",
      "monthInput",
      "statusFilter",
      "quickLabel",
      "quickSearch",
      "tableTitle",
      "tableSearch",
      "reportTable",
      "emptyState",
      "sumRevenue",
      "sumMidLabel",
      "sumMidValue",
      "sumRightLabel",
      "sumRightValue",
      "chartTitle",
      "chartSub",
      "reportChart",
    ];
    ids.forEach((id) => (this.els[id] = document.getElementById(id)));
  },

  go(href) {
    window.location.href = href;
  },

  async init() {
    this.bindEls();

    // session check (nhẹ)
    const token = getToken();
    if (!token) {
      UI.toast("❌ Bạn chưa đăng nhập", "warn");
      this.go("index.html");
      return;
    }

    // default inputs
    if (this.els.monthInput && !this.els.monthInput.value) this.els.monthInput.value = nowYyyyMm();
    if (this.els.yearInput && !this.els.yearInput.value) this.els.yearInput.value = nowYear();

    // nav
    if (this.els.tabHome) this.els.tabHome.addEventListener("click", () => this.go("dashboard.html"));
    if (this.els.tabAccount) this.els.tabAccount.addEventListener("click", () => this.go("account.html"));
    if (this.els.tabSettings) this.els.tabSettings.addEventListener("click", () => this.go("settings.html"));
    if (this.els.btnBack) this.els.btnBack.addEventListener("click", () => this.go("dashboard.html"));

    // type/status
    if (this.els.reportType) {
      this.els.reportType.addEventListener("change", () => {
        this.state.type = this.els.reportType.value;
        this.applyTypeUI();
        this.render();
      });
    }
    if (this.els.statusFilter) {
      this.els.statusFilter.addEventListener("change", () => {
        this.state.status = this.els.statusFilter.value;
        this.render();
      });
    }

    // actions
    if (this.els.btnGenerate) {
      this.els.btnGenerate.addEventListener("click", () => this.generate());
    }
    if (this.els.btnReset) {
      this.els.btnReset.addEventListener("click", () => this.reset());
    }

    // search
    const onSearch = () => this.applyFilterAndRenderTable();
    if (this.els.quickSearch) this.els.quickSearch.addEventListener("input", onSearch);
    if (this.els.tableSearch) this.els.tableSearch.addEventListener("input", onSearch);

    // export menu
    // Print button
    if (this.els.btnPrint) {
      this.els.btnPrint.addEventListener("click", () => window.print());
    }
    // Export menu (still allow menu for CSV/print if needed)
    if (this.els.exportMenu) {
      this.els.exportMenu.querySelectorAll(".menu-item").forEach((btn) => {
        simulateButton(btn);
        btn.addEventListener("click", () => {
          const kind = btn.getAttribute("data-export");
          this.els.exportMenu.classList.add("hidden");
          if (kind === "csv") this.exportCSV();
          if (kind === "print") window.print();
        });
      });
    }
    if (this.els.btnExport) {
      this.els.btnExport.addEventListener("click", () => this.exportCSV());
    }

    // initial type UI
    this.state.type = this.els.reportType?.value || "month";
    this.state.status = this.els.statusFilter?.value || "paid";
    this.applyTypeUI();

    // draw empty chart
    this.renderChart([]);
    window.addEventListener("resize", () => this.renderChartFromState());
  },

  applyTypeUI() {
    const isYear = this.state.type === "year";
    if (this.els.yearWrap) this.els.yearWrap.style.display = isYear ? "" : "none";
    if (this.els.monthWrap) this.els.monthWrap.style.display = isYear ? "none" : "";

    if (this.els.tableTitle) this.els.tableTitle.textContent = isYear ? "Báo cáo theo năm" : "Báo cáo theo tháng";
    if (this.els.quickLabel) this.els.quickLabel.textContent = isYear ? "Tìm nhanh tháng" : "Tìm nhanh chuyến bay";
    if (this.els.quickSearch) this.els.quickSearch.placeholder = isYear ? "VD: 2025-07" : "VD: VN123";

    if (this.els.sumRightLabel) this.els.sumRightLabel.textContent = isYear ? "Số tháng có dữ liệu" : "Số chuyến bay";
    if (this.els.sumMidLabel) this.els.sumMidLabel.textContent = "Tổng số vé";
  },

  reset() {
    if (this.els.quickSearch) this.els.quickSearch.value = "";
    if (this.els.tableSearch) this.els.tableSearch.value = "";
    UI.toast("✅ Đã làm mới bộ lọc", "success");
    this.applyFilterAndRenderTable();
  },

  async generate() {
    const token = getToken();
    if (!token) {
      UI.toast("❌ Bạn chưa đăng nhập", "warn");
      this.go("index.html");
      return;
    }

    const status = this.els.statusFilter?.value || "paid";
    const type = this.els.reportType?.value || "month";

    let url = "";
    if (type === "month") {
      const month = String(this.els.monthInput?.value || "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        UI.toast("❌ Vui lòng chọn Tháng (YYYY-MM)", "warn");
        return;
      }
      url = `${API_BASE_URL}/reports/month?month=${encodeURIComponent(month)}&status=${encodeURIComponent(status)}`;
    } else {
      const year = String(this.els.yearInput?.value || "").trim();
      if (!/^\d{4}$/.test(year)) {
        UI.toast("❌ Vui lòng nhập Năm (YYYY)", "warn");
        return;
      }
      url = `${API_BASE_URL}/reports/year?year=${encodeURIComponent(year)}&status=${encodeURIComponent(status)}`;
    }

    try {
      UI.toast("⏳ Đang tải dữ liệu...", "warn");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      this.state.lastResponse = data;
      this.state.rawItems = Array.isArray(data.items) ? data.items : [];
      this.state.type = data.type || type;
      this.state.status = data.status || status;

      // sync selects
      if (this.els.reportType) this.els.reportType.value = this.state.type;
      if (this.els.statusFilter) this.els.statusFilter.value = this.state.status;
      this.applyTypeUI();

      UI.toast("✅ Đã tải báo cáo", "success");
      this.render();
    } catch (e) {
      console.error("Generate report error:", e);
      UI.toast(`❌ ${e.message}`, "warn");
    }
  },

  render() {
    const data = this.state.lastResponse;
    const items = this.state.rawItems || [];

    const sumRevenue = Number(data?.summary?.revenue || 0);
    const sumTickets = Number(data?.summary?.tickets_sold || 0);
    const rightVal = Number(data?.summary?.right_value || data?.summary?.flights_count || data?.summary?.months_count || 0);

    if (this.els.sumRevenue) this.els.sumRevenue.textContent = fmtMoneyVND(sumRevenue);
    if (this.els.sumMidValue) this.els.sumMidValue.textContent = sumTickets.toLocaleString("vi-VN");
    if (this.els.sumRightValue) this.els.sumRightValue.textContent = rightVal.toLocaleString("vi-VN");

    // Chart labels
    const isYear = this.state.type === "year";
    if (this.els.chartTitle) this.els.chartTitle.textContent = isYear ? "Doanh thu theo tháng" : "Doanh thu theo chuyến bay";

    // Apply filters and render table + chart
    this.applyFilterAndRenderTable();
    this.renderChartFromState();
  },

  applyFilterAndRenderTable() {
    const qQuick = String(this.els.quickSearch?.value || "").trim().toLowerCase();
    const qTable = String(this.els.tableSearch?.value || "").trim().toLowerCase();

    let items = [...(this.state.rawItems || [])];

    if (qQuick) {
      if (this.state.type === "month") {
        items = items.filter((it) => String(it.flight_code || "").toLowerCase().includes(qQuick));
      } else {
        items = items.filter((it) => String(it.month || it.ym || "").toLowerCase().includes(qQuick));
      }
    }
    if (qTable) {
      items = items.filter((it) => JSON.stringify(it).toLowerCase().includes(qTable));
    }

    this.state.filteredItems = items;
    this.renderTable(items);
  },

  renderTable(items) {
    const tableEl = this.els.reportTable;
    const emptyEl = this.els.emptyState;
    if (!tableEl) return;

    if (!items || items.length === 0) {
      tableEl.innerHTML = emptyEl ? emptyEl.outerHTML : `<div class="empty">Không có dữ liệu</div>`;
      return;
    }

    const status = this.state.status;
    const isYear = this.state.type === "year";
    const showBookingCols = status === "all";

    const headers = (() => {
      if (isYear) {
        const base = [
          { k: "month", t: "Tháng" },
          { k: "tickets_sold", t: "Số vé đã bán", cls: "t-center" },
          { k: "revenue", t: "Doanh thu", cls: "t-center" },
        ];
        if (showBookingCols) {
          base.push(
            { k: "booked_total", t: "Phiếu đặt (tổng)", cls: "t-center" },
            { k: "booked_active", t: "Đặt chỗ", cls: "t-center" },
            { k: "booked_cancelled", t: "Đã hủy", cls: "t-center" },
            { k: "booked_expired", t: "Hết hạn", cls: "t-center" }
          );
        }
        return base;
      }

      const base = [
        { k: "flight_code", t: "Mã chuyến bay" },
        { k: "route", t: "Tuyến bay" },
        { k: "tickets_sold", t: "Số vé đã bán", cls: "t-center" },
        { k: "revenue", t: "Doanh thu", cls: "t-center" },
      ];
      if (showBookingCols) {
        base.push(
          { k: "booked_total", t: "Phiếu đặt (tổng)", cls: "t-center" },
          { k: "booked_active", t: "Đặt chỗ", cls: "t-center" },
          { k: "booked_cancelled", t: "Đã hủy", cls: "t-center" },
          { k: "booked_expired", t: "Hết hạn", cls: "t-center" }
        );
      }
      return base;
    })();

    const rowsHtml = items
      .map((it) => {
        const route = it.from_code && it.to_code
          ? `${it.from_code} → ${it.to_code}`
          : (it.route || "—");

        const monthText = it.month || it.ym || it.label || "";
        const cells = headers
          .map((h) => {
            let v = it[h.k];
            if (h.k === "route") v = route;
            if (h.k === "revenue") v = fmtMoneyVND(v);
            if (h.k === "tickets_sold" || String(h.k).startsWith("booked_")) {
              const n = Number(v || 0);
              v = Number.isFinite(n) ? n.toLocaleString("vi-VN") : "0";
            }
            if (h.k === "month") v = monthText;
            return `<td class="${h.cls || ""}">${escHtml(v ?? "—")}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("\n");

    const totalRevenue = items.reduce((s, it) => s + Number(it.revenue || 0), 0);
    const totalTickets = items.reduce((s, it) => s + Number(it.tickets_sold || 0), 0);
    const totalBooked = items.reduce((s, it) => s + Number(it.booked_total || 0), 0);
    const totalBookedActive = items.reduce((s, it) => s + Number(it.booked_active || 0), 0);
    const totalBookedCancelled = items.reduce((s, it) => s + Number(it.booked_cancelled || 0), 0);
    const totalBookedExpired = items.reduce((s, it) => s + Number(it.booked_expired || 0), 0);

    const footerCells = headers
      .map((h) => {
        if (h.k === "flight_code" || h.k === "month") return `<td><b>Tổng</b></td>`;
        if (h.k === "route") return `<td>—</td>`;
        if (h.k === "tickets_sold") return `<td class="t-center"><b>${totalTickets.toLocaleString("vi-VN")}</b></td>`;
        if (h.k === "revenue") return `<td class="t-center"><b>${escHtml(fmtMoneyVND(totalRevenue))}</b></td>`;
        if (h.k === "booked_total") return `<td class="t-center"><b>${totalBooked.toLocaleString("vi-VN")}</b></td>`;
        if (h.k === "booked_active") return `<td class="t-center"><b>${totalBookedActive.toLocaleString("vi-VN")}</b></td>`;
        if (h.k === "booked_cancelled") return `<td class="t-center"><b>${totalBookedCancelled.toLocaleString("vi-VN")}</b></td>`;
        if (h.k === "booked_expired") return `<td class="t-center"><b>${totalBookedExpired.toLocaleString("vi-VN")}</b></td>`;
        return `<td class="${h.cls || ""}">—</td>`;
      })
      .join("");

    const headHtml = headers.map((h) => `<th class="${h.cls || ""}">${escHtml(h.t)}</th>`).join("");
    const html = `
      <table class="tbl">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>${footerCells}</tr></tfoot>
      </table>
    `;

    tableEl.innerHTML = html;
  },

  renderChartFromState() {
    this.renderChart(this.state.filteredItems || []);
  },

  renderChart(items) {
    const canvas = this.els.reportChart;
    if (!canvas) return;

    const isYear = this.state.type === "year";

    let pairs = [];
    if (isYear) {
      pairs = (items || []).map((it) => ({
        label: it.month || it.ym || "",
        value: Number(it.revenue || 0),
      }));
      pairs.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    } else {
      pairs = (items || []).map((it) => ({
        label: it.flight_code || "",
        value: Number(it.revenue || 0),
      }));
      pairs.sort((a, b) => (b.value || 0) - (a.value || 0));
    }

    // Limit bars for readability
    const limit = isYear ? 12 : 10;
    const sliced = pairs.slice(0, limit);
    const labels = sliced.map((p) => p.label);
    const values = sliced.map((p) => (Number.isFinite(p.value) ? p.value : 0));

    const footer = isYear
      ? "Đơn vị: ₫"
      : pairs.length > limit
      ? `Top ${limit} theo doanh thu (đơn vị: ₫)`
      : "Đơn vị: ₫";

    if (this.els.chartSub) {
      if (!items || items.length === 0) this.els.chartSub.textContent = "Chưa có dữ liệu";
      else if (!isYear && pairs.length > limit) this.els.chartSub.textContent = `Hiển thị Top ${limit} chuyến bay theo doanh thu`;
      else this.els.chartSub.textContent = "";
    }

    drawLineChart(canvas, labels, values, { footerText: footer });
  },

  exportCSV() {
    const items = this.state.filteredItems || [];
    if (!items.length) {
      UI.toast("❌ Không có dữ liệu để xuất", "warn");
      return;
    }

    const isYear = this.state.type === "year";
    const showBookingCols = this.state.status === "all";
    const cols = isYear
      ? [
          ["month", "Tháng"],
          ["tickets_sold", "So ve da ban"],
          ["revenue", "Doanh thu"],
        ]
      : [
          ["flight_code", "Ma chuyen bay"],
          ["route", "Tuyen bay"],
          ["tickets_sold", "So ve da ban"],
          ["revenue", "Doanh thu"],
        ];

    if (showBookingCols) {
      cols.push(
        ["booked_total", "Phieu dat (tong)"],
        ["booked_active", "Dat cho"],
        ["booked_cancelled", "Da huy"],
        ["booked_expired", "Het han"]
      );
    }

    const lines = [];
    lines.push(cols.map((c) => c[1]).join(","));

    for (const it of items) {
      const route = it.from_code && it.to_code ? `${it.from_code} -> ${it.to_code}` : (it.route || "");
      const row = cols
        .map(([key]) => {
          let v = it[key];
          if (key === "route") v = route;
          if (key === "month") v = it.month || it.ym || "";
          if (v === null || v === undefined) v = "";
          const s = String(v).replaceAll('"', '""');
          return `"${s}"`;
        })
        .join(",");
      lines.push(row);
    }

    const csv = lines.join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });

    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;

    const stamp = new Date();
    const name = isYear
      ? `bao_cao_${String(this.els.yearInput?.value || "").trim() || "nam"}.csv`
      : `bao_cao_${String(this.els.monthInput?.value || "").trim() || "thang"}.csv`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    UI.toast("✅ Đã xuất CSV", "success");
  },
};

function simulateButton(btn) {
  // no-op placeholder (giữ cho consistent nếu cần mở rộng)
  return btn;
}

document.addEventListener("DOMContentLoaded", () => {
  Report.init();
});
