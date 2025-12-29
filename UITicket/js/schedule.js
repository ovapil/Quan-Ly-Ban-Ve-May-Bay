const API_BASE_URL = 'http://localhost:3000/api';
const ReceiveSchedule = {
    renderStopoverRows() {
      // Render số dòng sân bay trung gian theo tham số
      const stopoverRows = document.getElementById('stopoverRows');
      if (!stopoverRows) return;
      stopoverRows.innerHTML = '';
      const max = parseInt(this.thamSo.SoSanBayTrungGianToiDa) || 2;
      for (let i = 1; i <= max; i++) {
        stopoverRows.innerHTML += `
          <div class="stopover-row">
            <div class="stt">${i}</div>
            <div><select class="input" id="stopAirport${i}"></select></div>
            <div>
              <div class="inline compact">
                <select class="input" id="stopH${i}"></select>
                <span class="unit">giờ</span>
                <select class="input" id="stopM${i}"></select>
                <span class="unit">phút</span>
              </div>
            </div>
            <div><input class="input gray" id="stopNote${i}" /></div>
          </div>
        `;
      }
    },
  airports: [],
  hangVe: [],
  thamSo: {},
  seatQuantities: {},

  async init() {
    const token = localStorage.getItem('uiticket_token');
    if (!token) {
      window.location.href = "index.html";
      return;
    }

    this.bindHeader();
    await this.loadData();
    await this.loadNextFlightCode();
    this.buildSelects();
    this.bindActions();
  },

  async loadNextFlightCode() {
    const token = localStorage.getItem('uiticket_token');
    try {
      const res = await fetch(`${API_BASE_URL}/next-flight-code`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const flightCodeInput = document.getElementById('flightCode');
      if (flightCodeInput && data.nextFlightCode) {
        flightCodeInput.value = data.nextFlightCode;
        console.log(`✅ Mã chuyến bay tự động: ${data.nextFlightCode}`);
      }
    } catch (error) {
      console.error('Load next flight code error:', error);
    }
  },

  async loadData() {
    const token = localStorage.getItem('uiticket_token');

    try {
      UI.showLoading?.();

      const airportsRes = await fetch(`${API_BASE_URL}/airports`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const airportsData = await airportsRes.json();
      this.airports = airportsData.items;

      const hangVeRes = await fetch(`${API_BASE_URL}/hang-ve`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const hangVeData = await hangVeRes.json();
      this.hangVe = hangVeData.hangVe;

      const thamSoRes = await fetch(`${API_BASE_URL}/tham-so`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const thamSoData = await thamSoRes.json();
      this.thamSo = thamSoData.thamSo;

      console.log('✅ Loaded data:', { airports: this.airports.length, hangVe: this.hangVe.length, thamSo: this.thamSo });

      // Sau khi load xong tham số, render lại bảng stopover và select
      this.renderStopoverRows();
      this.buildSelects();
      UI.hideLoading?.();

    } catch (error) {
      UI.hideLoading?.();
      console.error('Load data error:', error);
      UI.toast('Không thể tải dữ liệu', 'warn');
    }
  },

  buildSelects() {
    const airportOpts = this.airports
      .map(a => `<option value="${a.ma_san_bay}">${a.ma_san_bay} - ${a.ten_san_bay}</option>`)
      .join("");

    ["fromAirport","toAirport"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value=\"\">-- Chọn --</option>${airportOpts}`;
    });
    // Gán option cho các sân bay trung gian động
    const max = parseInt(this.thamSo.SoSanBayTrungGianToiDa) || 2;
    for (let i = 1; i <= max; i++) {
      const el = document.getElementById(`stopAirport${i}`);
      if (el) el.innerHTML = `<option value=\"\">-- Chọn --</option>${airportOpts}`;
    }

    const $ = (id) => document.getElementById(id);
    const seatClass = $('seatClass');
    if (seatClass && this.hangVe.length > 0) {
      seatClass.innerHTML = this.hangVe
        .map(hv => `<option value="${hv.ma_hang_ve}">${hv.ten_hang_ve}</option>`)
        .join("");
    }

    this.fillNumberSelect("durationHours", 0, 23, true);
    this.fillNumberSelect("durationMinutes", 0, 59, true);
    for (let i = 1; i <= max; i++) {
      this.fillNumberSelect(`stopH${i}`, 0, 23, true);
      this.fillNumberSelect(`stopM${i}`, 0, 59, true);
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dateEl = $("flightDate");
    if (dateEl) dateEl.value = `${yyyy}-${mm}-${dd}`;

    $("departHH").value = "08";
    $("departMM").value = "00";
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

  bindHeader() {
    const $ = (id) => document.getElementById(id);
    $("tabHome")?.addEventListener("click", () => window.location.href = "dashboard.html");
    $("tabAccount")?.addEventListener("click", () => window.location.href = "account.html");
    $("tabSettings")?.addEventListener("click", () => window.location.href = "settings.html");
    $("btnNoti")?.addEventListener("click", () => {
      const badge = $("notifBadge");
      if (badge) badge.style.display = "none";
      UI.toast("Thông báo (demo)", "success");
    });
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

    $("btnMiniSave")?.addEventListener("click", () => {
      const seatClass = $("seatClass").value;
      const seatQty = parseInt($("seatQty").value || 0);

      if (!seatClass || seatQty <= 0) {
        UI.toast("Vui lòng nhập số lượng ghế hợp lệ", "warn");
        return;
      }

      this.seatQuantities[seatClass] = seatQty;

      // Lấy tên hạng vé
      const hangVe = this.hangVe.find(hv => hv.ma_hang_ve === seatClass);
      const tenHangVe = hangVe?.ten_hang_ve || seatClass;

      UI.toast(`Đã cho số ghế cho hạng ${tenHangVe}: ${seatQty} ghế`, "success");
      console.log('📋 Seat quantities:', this.seatQuantities);

      $("seatQty").value = "";
    });

    $("btnSeatInfo")?.addEventListener("click", () => {
      const modal = document.getElementById('seatGuideModal');
      if (modal) modal.style.display = 'flex';
    });

    $("btnCloseSeatGuideModal")?.addEventListener("click", () => {
      const modal = document.getElementById('seatGuideModal');
      if (modal) modal.style.display = 'none';
    });

    // Đóng modal khi click ngoài modal-content
    window.addEventListener("click", (event) => {
      const modal = document.getElementById('seatGuideModal');
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });

    $("btnDelete")?.addEventListener("click", () => this.clearForm());
    $("btnSave")?.addEventListener("click", () => this.saveFlight());
  },

  clearForm() {
    const $ = (id) => document.getElementById(id);
    ["flightCode","ticketPrice","departHH","departMM","seatQty"].forEach(id => {
      const el = $(id);
      if (el) el.value = "";
    });
    // Xóa các trường động sân bay trung gian
    const max = parseInt(this.thamSo.SoSanBayTrungGianToiDa) || 2;
    for (let i = 1; i <= max; i++) {
      [
        `stopNote${i}`,
        `stopAirport${i}`,
        `stopH${i}`,
        `stopM${i}`
      ].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
    }
    ["fromAirport","toAirport","seatClass"].forEach(id => {
      const el = $(id);
      if (el) el.value = "";
    });

    this.seatQuantities = {};

    // Tự động tạo lại mã chuyến bay mới
    this.loadNextFlightCode();

    UI.toast("Đã xoá thông tin", "warn");
  },

  async saveFlight() {
    const $ = (id) => document.getElementById(id);

    const ma_chuyen_bay = $("flightCode")?.value.trim();
    const gia_ve = parseFloat($("ticketPrice")?.value);
    const san_bay_di = $("fromAirport")?.value;
    const san_bay_den = $("toAirport")?.value;
    const flightDate = $("flightDate")?.value;
    const departHH = $("departHH")?.value;
    const departMM = $("departMM")?.value;
    const meridiem = $("meridiem")?.value;
    const durationHours = parseInt($("durationHours")?.value || 0);
    const durationMinutes = parseInt($("durationMinutes")?.value || 0);

    if (!ma_chuyen_bay) return UI.toast("Mã chuyến bay không được tạo. Vui lòng refresh lại trang", "warn");
    if (!san_bay_di) return UI.toast("Vui lòng chọn sân bay đi", "warn");
    if (!san_bay_den) return UI.toast("Vui lòng chọn sân bay đến", "warn");
    if (san_bay_di === san_bay_den) return UI.toast("Sân bay đi và đến phải khác nhau", "warn");
    if (!gia_ve || gia_ve <= 0) return UI.toast("Vui lòng nhập giá vé hợp lệ", "warn");
    if (!flightDate) return UI.toast("Vui lòng chọn ngày bay", "warn");
    if (!departHH || !departMM) return UI.toast("Vui lòng nhập giờ khởi hành", "warn");

    if (Object.keys(this.seatQuantities).length === 0) {
      return UI.toast("Vui lòng nhập số lượng ghế cho ít nhất 1 hạng vé", "warn");
    }

    let hour = parseInt(departHH);
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    
    const ngay_gio_bay = `${flightDate} ${String(hour).padStart(2, '0')}:${departMM}:00`;
    const thoi_gian_bay = durationHours * 60 + durationMinutes;

    // ========== VALIDATE THAM SỐ HỆ THỐNG ==========
    
    // ✅ 1. KIỂM TRA NGÀY BÁY PHẢI TRƯỚC ỐI THIỂU
    const thoiGianDatVeChamNhat = parseInt(this.thamSo.ThoiGianDatVeChamNhat) || 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minFlightDate = new Date(today);
    minFlightDate.setDate(minFlightDate.getDate() + thoiGianDatVeChamNhat);
    const flightDateObj = new Date(flightDate);
    
    if (flightDateObj < minFlightDate) {
      const minDateStr = minFlightDate.toLocaleDateString('vi-VN');
      return UI.toast(`Ngày bay phải từ ${minDateStr} trở lại (chậm nhất ${thoiGianDatVeChamNhat} ngày)`, "warn");
    }
    
    // ✅ 2. KIỂM TRA THỜI GIAN BAY TỐI THIỂU
    const thoiGianBayMin = parseInt(this.thamSo.ThoiGianBayToiThieu) || 0;
    if (thoi_gian_bay < thoiGianBayMin) {
      return UI.toast(`Thời gian bay tối thiểu là ${thoiGianBayMin} phút`, "warn");
    }

    // ✅ 3. LẤY THAM SỐ DỪNG (min/max) MỘT LẦN DUY NHẤT
    const thoiGianDungMin = parseInt(this.thamSo.ThoiGianDungToiThieu) || 0;
    const thoiGianDungMax = parseInt(this.thamSo.ThoiGianDungToiDa) || 999;
    
    console.log('Stopover validation:', {
      thamSo: this.thamSo,
      thoiGianDungMin,
      thoiGianDungMax
    });

    // ✅ 4. CHUẨN BỊ MẢNG HẠNG VÉ
    const mapHangVe = (ui) => ui === 'Business' ? 'BUS' : ui === 'Eco' ? 'ECO' : ui;
    const hang_ve = Object.keys(this.seatQuantities).map(ma_hang_ve => ({
      ma_hang_ve: mapHangVe(ma_hang_ve),
      so_luong_ghe: this.seatQuantities[ma_hang_ve]
    }));

    const san_bay_trung_gian = [];
    
    // Duyệt động các trường sân bay trung gian
    const maxStop = parseInt(this.thamSo.SoSanBayTrungGianToiDa) || 2;
    for (let i = 1; i <= maxStop; i++) {
      const stopVal = $("stopAirport" + i)?.value;
      if (stopVal) {
        const stopH = parseInt($("stopH" + i)?.value || 0);
        const stopM = parseInt($("stopM" + i)?.value || 0);
        const thoiGianDung = stopH * 60 + stopM;
        // Kiểm tra bắt buộc: nếu chọn sân bay thì phải có thời gian dừng > 0
        if (thoiGianDung <= 0) {
          return UI.toast(`Sân bay trung gian ${i}: bắt buộc nhập thời gian dừng`, "warn");
        }
        // Kiểm tra min/max
        if (thoiGianDung < thoiGianDungMin || thoiGianDung > thoiGianDungMax) {
          return UI.toast(`Sân bay ${i}: Thời gian dừng phải từ ${thoiGianDungMin} đến ${thoiGianDungMax} phút`, "warn");
        }
        san_bay_trung_gian.push({
          ma_san_bay: stopVal,
          thoi_gian_dung: thoiGianDung,
          ghi_chu: $("stopNote" + i)?.value || ''
        });
      }
    }

    // Validate số sân bay trung gian
    const soSanBayMax = parseInt(this.thamSo.SoSanBayTrungGianToiDa) || 2;
    if (san_bay_trung_gian.length > soSanBayMax) {
      return UI.toast(`Số sân bay trung gian tối đa là ${soSanBayMax}`, "warn");
    }

    const token = localStorage.getItem('uiticket_token');

    try {
      UI.showLoading?.();

      console.log('📤 Sending data:', {
        ma_chuyen_bay,
        san_bay_di,
        san_bay_den,
        gia_ve,
        ngay_gio_bay,
        thoi_gian_bay,
        hang_ve,
        san_bay_trung_gian
      });

      const response = await fetch(`${API_BASE_URL}/chuyen-bay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ma_chuyen_bay,
          san_bay_di,
          san_bay_den,
          gia_ve,
          ngay_gio_bay,
          thoi_gian_bay,
          hang_ve,
          san_bay_trung_gian
        })
      });

      const data = await response.json();

      UI.hideLoading?.();

      if (!response.ok) {
        return UI.toast(`${data.error}`, "warn");
      }

      UI.toast("Đã lưu lịch chuyến bay thành công!", "success");
      console.log('Response:', data);
      
      // Reset seat quantities nhưng không xóa form - để user xóa tay
      this.seatQuantities = {};

      // Refresh trang sau khi lưu thành công để tránh hiển thị dữ liệu cũ
      setTimeout(() => window.location.reload(), 600);

    } catch (error) {
      UI.hideLoading?.();
      console.error('Save flight error:', error);
      UI.toast("Lỗi kết nối server", "warn");
    }
  }
};

ReceiveSchedule.init();

