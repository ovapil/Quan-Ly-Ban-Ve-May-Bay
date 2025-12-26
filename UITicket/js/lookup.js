/**
 * LOOKUP.JS - Tra cứu chuyến bay (UPDATED)
 * - Fixed double scrollbar in modal
 * - Removed booking tab
 * - Removed quick search
 * - Updated airline to "UITK23 Airlines"
 * - Updated aircraft to "N19"
 * - Added stopover count display
 * - Added stopover details with duration and notes
 * - Added "Đặt chỗ ngay" button
 */

// ============================================
// CONFIG
// ============================================
const API_BASE_URL = 'http://localhost:3000/api';

// ============================================
// Toast Helper
// ============================================
function showToast(message, type = 'success') {
  if (typeof UI !== 'undefined' && UI.toast) {
    UI.toast(message, type);
    return;
  }
  const toast = document.getElementById('toast');
  if (!toast) {
    console.log(`[${type}] ${message}`);
    return;
  }
  toast.textContent = message;
  toast.setAttribute('data-type', type);
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toast.style.display = 'none'), 2500);
}

// ============================================
// HELPER
// ============================================
function getToken() {
  return localStorage.getItem('uiticket_token') || localStorage.getItem('token');
}

// ============================================
// DATA
// ============================================
let AIRPORTS = [];
let ALL_FLIGHTS = [];

// ============================================
// GLOBAL STATE
// ============================================
const LookupState = {
  currentTab: 'flight',
  searchResults: [],
  filteredResults: [],
  currentPage: 1,
  itemsPerPage: 5,
  sortBy: '',
  isLoading: false,
  selectedFlight: null
};

// ============================================
// LOOKUP MODULE
// ============================================
const Lookup = {
  async init() {
    try {
      await this.loadAirports();
      this.setDefaultDate();
      this.bindEvents();
      await this.loadAllFlights();
      console.log('✅ Lookup module initialized');
    } catch (e) {
      console.error('❌ Init error:', e);
      showToast('Lỗi khởi tạo!', 'error');
    }
  },

  async loadAirports() {
    const fromSelect = document.getElementById('fromAirport');
    const toSelect = document.getElementById('toAirport');

    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const res = await fetch(`${API_BASE_URL}/airports`, { headers });

      if (res.ok) {
        const data = await res.json();
        const list = data.airports || data.items || data || [];
        AIRPORTS = Array.isArray(list) ? list.map(a => ({
          code: a.ma_san_bay || a.code,
          name: a.ten_san_bay || a.name,
          city: a.thanh_pho || a.city
        })) : [];
        console.log(`✅ Loaded ${AIRPORTS.length} airports from API`);
      } else {
        throw new Error(`API error: ${res.status}`);
      }
    } catch (e) {
      console.warn('⚠️ Could not load airports from API, using defaults:', e);
      AIRPORTS = [
        { code: 'SGN', name: 'Tân Sơn Nhất', city: 'TP. Hồ Chí Minh' },
        { code: 'HAN', name: 'Nội Bài', city: 'Hà Nội' },
        { code: 'DAD', name: 'Đà Nẵng', city: 'Đà Nẵng' },
        { code: 'CXR', name: 'Cam Ranh', city: 'Nha Trang' },
        { code: 'PQC', name: 'Phú Quốc', city: 'Phú Quốc' }
      ];
    }

    // Populate dropdowns
    if (fromSelect && toSelect && AIRPORTS.length > 0) {
      const options = AIRPORTS.map(a => 
        `<option value="${a.code}">${a.city || a.name} (${a.code})</option>`
      ).join('');

      fromSelect.innerHTML = '<option value="">Chọn sân bay đi</option>' + options;
      toSelect.innerHTML = '<option value="">Chọn sân bay đến</option>' + options;
    }
  },

  async loadAllFlights() {
    this.setLoading(true);
    
    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const res = await fetch(`${API_BASE_URL}/chuyen-bay`, { headers });

      if (res.status === 401) {
        showToast('Vui lòng đăng nhập để xem chuyến bay!', 'warn');
        this.displayResults([]);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const flights = data.flights || data || [];
        const flightList = Array.isArray(flights) ? flights : Array.isArray(data) ? data : [];
        
        if (flightList.length > 0) {
          ALL_FLIGHTS = flightList.map(f => this.mapFlight(f));
          console.log(`✅ Loaded ${ALL_FLIGHTS.length} flights from API`);
          this.displayResults(ALL_FLIGHTS);
        } else {
          throw new Error('Không có dữ liệu chuyến bay từ API');
        }
      } else {
        throw new Error(`API error: ${res.status}`);
      }
    } catch (e) {
      console.error('❌ Error loading flights from API:', e);
      console.warn('⚠️ Using sample data...');
      
      // Fallback: Use sample data
      const sampleData = [
        {
          ma_chuyen_bay: 'VN123',
          ma_san_bay_di: 'SGN',
          san_bay_di: 'TP. Hồ Chí Minh',
          ma_san_bay_den: 'HAN',
          san_bay_den: 'Hà Nội',
          ngay_gio_bay: new Date(Date.now() + 86400000).toISOString(),
          thoi_gian_bay: 130,
          gia_ve: 2500000,
          hang_ve: [
            { ma_hang_ve: 'ECO', so_luong_ghe: 100, con_lai: 45, ti_le_gia: 1.0 },
            { ma_hang_ve: 'BUS', so_luong_ghe: 50, con_lai: 12, ti_le_gia: 1.5 }
          ],
          stopovers: []
        },
        {
          ma_chuyen_bay: 'VJ456',
          ma_san_bay_di: 'SGN',
          san_bay_di: 'TP. Hồ Chí Minh',
          ma_san_bay_den: 'DAD',
          san_bay_den: 'Đà Nẵng',
          ngay_gio_bay: new Date(Date.now() + 172800000).toISOString(),
          thoi_gian_bay: 80,
          gia_ve: 1800000,
          hang_ve: [
            { ma_hang_ve: 'ECO', so_luong_ghe: 120, con_lai: 55, ti_le_gia: 1.0 },
            { ma_hang_ve: 'BUS', so_luong_ghe: 40, con_lai: 8, ti_le_gia: 1.6 }
          ],
          stopovers: []
        },
        {
          ma_chuyen_bay: 'QH101',
          ma_san_bay_di: 'HAN',
          san_bay_di: 'Hà Nội',
          ma_san_bay_den: 'SGN',
          san_bay_den: 'TP. Hồ Chí Minh',
          ngay_gio_bay: new Date(Date.now() + 259200000).toISOString(),
          thoi_gian_bay: 135,
          gia_ve: 2200000,
          hang_ve: [
            { ma_hang_ve: 'ECO', so_luong_ghe: 90, con_lai: 35, ti_le_gia: 1.0 },
            { ma_hang_ve: 'BUS', so_luong_ghe: 45, con_lai: 15, ti_le_gia: 1.4 }
          ],
          stopovers: [
            { ma_san_bay: 'DAD', ten_san_bay: 'Đà Nẵng', thanh_pho: 'Đà Nẵng', thoi_gian_dung: 60, ghi_chu: 'Dừng chuyên tải' }
          ]
        }
      ];
      
      ALL_FLIGHTS = sampleData.map(f => this.mapFlight(f));
      console.log(`✅ Using ${ALL_FLIGHTS.length} sample flights`);
      this.displayResults(ALL_FLIGHTS);
      showToast('Sử dụng dữ liệu mẫu (API chưa khả dụng)', 'warn');
    } finally {
      this.setLoading(false);
    }
  },

  mapFlight(row) {
    // Parse hang_ve array from backend
    let classes = [];
    try {
      if (Array.isArray(row.hang_ve)) {
        classes = row.hang_ve;
      } else if (typeof row.hang_ve === 'string' && row.hang_ve) {
        classes = JSON.parse(row.hang_ve);
      }
    } catch (e) {
      console.warn('Failed to parse hang_ve:', e);
      classes = [];
    }
    
    // Sort by ti_le_gia descending (Business first, then Economy)
    classes.sort((a, b) => (Number(b.ti_le_gia) || 0) - (Number(a.ti_le_gia) || 0));

    const departAt = new Date(row.ngay_gio_bay);
    const durationMinutes = Number(row.thoi_gian_bay || 0);
    const arriveAt = new Date(departAt.getTime() + durationMinutes * 60000);
    const basePrice = Number(row.gia_ve || 0);

    // Map classes to UI format
    const seats = {};
    const availableSeats = {};
    const prices = {};

    classes.forEach(cls => {
      const maHangVe = String(cls.ma_hang_ve || '').toUpperCase();
      const uiClass = maHangVe === 'BUS' ? 'Business' : maHangVe === 'ECO' ? 'Eco' : maHangVe;
      
      seats[uiClass] = Number(cls.so_luong_ghe || 0);
      availableSeats[uiClass] = Number(cls.con_lai || 0);
      prices[uiClass] = Math.round(basePrice * Number(cls.ti_le_gia || 1));
    });

    // Ensure Business and Eco exist
    if (!seats.Business) { seats.Business = 0; availableSeats.Business = 0; prices.Business = 0; }
    if (!seats.Eco) { seats.Eco = 0; availableSeats.Eco = 0; prices.Eco = basePrice; }
    seats.First = 0;
    availableSeats.First = 0;
    prices.First = 0;

    // Process stopovers
    let stopovers = [];
    try {
      const rawStops = row.stopovers || row.chi_tiet_san_bay_trung_gian || row.stopover || row.stop_over || row.trung_gian || null;
      if (Array.isArray(rawStops)) {
        stopovers = rawStops;
      } else if (typeof rawStops === 'string' && rawStops.trim()) {
        stopovers = JSON.parse(rawStops);
      }
      if (!Array.isArray(stopovers)) stopovers = [];
      stopovers = stopovers.map(s => ({
        airport: s.ma_san_bay || s.airport,
        name: s.ten_san_bay || s.name,
        city: s.thanh_pho || s.city,
        duration: Number(s.thoi_gian_dung || s.duration || 0),
        note: s.ghi_chu || s.note || ''
      }));
    } catch (e) {
      console.warn('Failed to parse stopovers for flight', row.ma_chuyen_bay, e);
      stopovers = [];
    }

    return {
      id: row.ma_chuyen_bay,
      code: row.ma_chuyen_bay,
      airline: 'UITK23 Airlines',
      aircraft: 'N19',
      from: row.ma_san_bay_di || row.from_code,
      to: row.ma_san_bay_den || row.to_code,
      fromCity: row.san_bay_di || row.from_city,
      toCity: row.san_bay_den || row.to_city,
      date: departAt.toISOString().split('T')[0],
      departTime: departAt.toTimeString().slice(0, 5),
      arriveTime: arriveAt.toTimeString().slice(0, 5),
      duration: this.formatDuration(durationMinutes),
      durationMinutes: durationMinutes,
      stopovers: stopovers,
      seats: seats,
      availableSeats: availableSeats,
      prices: prices,
      // Prefer server-provided flag (handles DB timezone), otherwise compute locally
      departed: (row.departed === true) || (departAt.getTime() < Date.now()),
      basePrice: basePrice,
      classes: classes,
      raw: row
    };
  },

  formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h <= 0) return `${m}m`;
    if (m <= 0) return `${h}h`;
    return `${h}h ${m}m`;
  },

  setDefaultDate() {
    // Leave date inputs empty initially so user can search by code or by date
    ['flightDateInput', 'routeDateInput'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
  },

  bindEvents() {
    const modal = document.getElementById('flightDetailModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeDetail();
      });
    }

    document.querySelectorAll('.search-form input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const tab = LookupState.currentTab;
          if (tab === 'flight') this.searchByFlight();
          else if (tab === 'route') this.searchByRoute();
        }
      });
    });

    // Initialize all filter checkboxes as checked by default
    // Initialize filter checkboxes (exclude sort-checkboxes)
    document.querySelectorAll('.filter-group input[type="checkbox"]:not(.sort-checkbox)').forEach(cb => {
      if (!cb.hasAttribute('data-init')) {
        cb.checked = true;
        cb.setAttribute('data-init', 'true');
        cb.addEventListener('change', () => this.applyFilter());
      }
    });

    // Ensure sort-checkbox inputs are not auto-checked and have their change handler
    document.querySelectorAll('input.sort-checkbox').forEach(cb => {
      cb.checked = false;
      if (!cb._bound) {
        cb.addEventListener('change', () => this.toggleSortCheckbox(cb));
        cb._bound = true;
      }
    });

    // Close price sort menu when clicking outside
    document.addEventListener('click', (e) => {
      try {
        const menu = document.getElementById('priceSortMenu');
        const btn = document.getElementById('priceSortBtn');
        if (!menu || !btn) return;
        if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
          menu.classList.add('hidden');
        }
      } catch (err) { /* ignore */ }
    });
  },

  setLoading(loading) {
    LookupState.isLoading = loading;
    const container = document.getElementById('resultsList');
    const emptyState = document.getElementById('emptyState');

    if (loading && container) {
      container.innerHTML = `
        <div class="loading-state">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <p>Đang tải dữ liệu chuyến bay...</p>
        </div>
      `;
      if (emptyState) emptyState.style.display = 'none';
    }
  },

  switchTab(tab) {
    LookupState.currentTab = tab;

    document.querySelectorAll('.search-tab').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === tab) btn.classList.add('active');
    });

    document.querySelectorAll('.search-form').forEach(form => {
      form.classList.add('hidden');
    });

    const formId = { 'flight': 'searchFlight', 'route': 'searchRoute' }[tab];
    const form = document.getElementById(formId);
    if (form) form.classList.remove('hidden');

    if (tab === 'flight') {
      if (ALL_FLIGHTS.length === 0) {
        this.loadAllFlights();
      } else {
        this.displayResults(ALL_FLIGHTS);
      }
    }
  },

  swapAirports() {
    const from = document.getElementById('fromAirport');
    const to = document.getElementById('toAirport');
    
    if (from && to) {
      const temp = from.value;
      from.value = to.value;
      to.value = temp;
      showToast('🔁 Đã đổi chiều', 'success');
    }
  },

  async searchByFlight() {
    const code = document.getElementById('flightCodeInput')?.value.trim().toUpperCase();
    const date = document.getElementById('flightDateInput')?.value;

    if (!code && !date) {
      await this.loadAllFlights();
      return;
    }

    this.setLoading(true);

    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      let url = `${API_BASE_URL}/chuyen-bay`;
      if (date) url += `?date=${date}`;

      const res = await fetch(url, { headers });

      if (res.ok) {
        const data = await res.json();
        let results = (data.flights || []).map(f => this.mapFlight(f));

        if (code) {
          results = results.filter(f => f.code.toUpperCase().includes(code));
        }

        this.displayResults(results);

        if (results.length === 0) {
          showToast('Không tìm thấy chuyến bay phù hợp!', 'warn');
        }
      }
    } catch (e) {
      console.error('Search error:', e);
      showToast('Lỗi tìm kiếm!', 'error');
    } finally {
      this.setLoading(false);
    }
  },

  async searchByRoute() {
    const from = document.getElementById('fromAirport')?.value;
    const to = document.getElementById('toAirport')?.value;
    const date = document.getElementById('routeDateInput')?.value;

    if (!from && !to) {
      showToast('Vui lòng chọn ít nhất sân bay đi hoặc đến!', 'warn');
      return;
    }

    if (from && to && from === to) {
      showToast('Sân bay đi và đến không được trùng nhau!', 'warn');
      return;
    }

    this.setLoading(true);

    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (date) qs.set('date', date);

      const res = await fetch(`${API_BASE_URL}/chuyen-bay?${qs.toString()}`, { headers });

      if (res.ok) {
        const data = await res.json();
        const results = (data.flights || []).map(f => this.mapFlight(f));
        this.displayResults(results);

        if (results.length === 0) {
          showToast('Không tìm thấy chuyến bay trên tuyến này!', 'warn');
        }
      }
    } catch (e) {
      console.error('Search error:', e);
      showToast('Lỗi tìm kiếm!', 'error');
    } finally {
      this.setLoading(false);
    }
  },

  displayResults(results) {
    LookupState.searchResults = results;
    LookupState.currentPage = 1;
    
    // Initialize filter checkboxes if not already done
    const filterCheckboxes = document.querySelectorAll('.filter-group input[type="checkbox"]:not(.sort-checkbox)');
    if (filterCheckboxes.length > 0 && !filterCheckboxes[0].hasAttribute('data-init')) {
      filterCheckboxes.forEach(cb => {
        cb.checked = true;
        cb.setAttribute('data-init', 'true');
      });
    }
    
    console.log(`📊 Display results: ${results.length} flights`);
    // Default initial ordering: upcoming (not departed) first by datetime, departed ones last
    if (!LookupState.sortBy) {
      LookupState.searchResults = [...LookupState.searchResults].sort((a, b) => {
        if ((a.departed ? 1 : 0) !== (b.departed ? 1 : 0)) return (a.departed ? 1 : -1);
        const da = new Date(`${a.date}T${a.departTime}`);
        const db = new Date(`${b.date}T${b.departTime}`);
        return da - db;
      });
    }
    this.applyFilter();
  },

  applyFilter() {
    let results = [...LookupState.searchResults];

    const classFilters = Array.from(document.querySelectorAll('.filter-group:nth-child(1) input:checked')).map(cb => cb.value);
    if (classFilters.length > 0 && classFilters.length < 3) {
      results = results.filter(f => classFilters.some(cls => f.availableSeats[cls] > 0 || f.seats[cls] > 0));
    }

    // Departed status filters (replaced previous time-of-day filters)
    const departedFilters = Array.from(document.querySelectorAll('.filter-group:nth-child(2) input:checked')).map(cb => cb.value);
    // If exactly one of the two is selected, filter accordingly. If both or none selected, do not filter.
    if (departedFilters.length === 1) {
      if (departedFilters[0] === 'not-departed') {
        results = results.filter(f => !f.departed);
      } else if (departedFilters[0] === 'departed') {
        results = results.filter(f => f.departed);
      }
    }

    const typeFilters = Array.from(document.querySelectorAll('.filter-group:nth-child(3) input:checked')).map(cb => cb.value);
    if (typeFilters.length > 0 && typeFilters.length < 2) {
      results = results.filter(f => {
        if (typeFilters.includes('direct') && f.stopovers.length === 0) return true;
        if (typeFilters.includes('stopover') && f.stopovers.length > 0) return true;
        return false;
      });
    }

    const availabilityFilters = Array.from(document.querySelectorAll('.filter-group:nth-child(4) input:checked')).map(cb => cb.value);
    if (availabilityFilters.length > 0 && availabilityFilters.length < 2) {
      results = results.filter(f => {
        const totalAvailable = Object.values(f.availableSeats).reduce((a, b) => a + b, 0);
        if (availabilityFilters.includes('available') && totalAvailable > 0) return true;
        if (availabilityFilters.includes('soldout') && totalAvailable === 0) return true;
        return false;
      });
    }

    LookupState.filteredResults = results;
    console.log(`📋 Filtered to ${results.length} flights`);
    this.sortResults();
  },

  sortResults() {
    // Prefer header price button, then filter panel sort (checkboxes), then legacy header
    const priceBtn = document.getElementById('priceSortBtn');
    const priceSort = priceBtn?.dataset?.sort || '';
    const sortBy = priceSort || document.querySelector('input.sort-checkbox:checked')?.value || document.getElementById('filterSort')?.value || document.getElementById('sortBy')?.value || LookupState.sortBy || '';
    LookupState.sortBy = sortBy;

    const results = [...LookupState.filteredResults];

    if (!sortBy) {
      // No explicit sort requested — keep order from API (server already orders upcoming first)
      LookupState.filteredResults = results;
      this.renderResults();
      return;
    }

    switch (sortBy) {
      case 'time-asc': results.sort((a, b) => a.departTime.localeCompare(b.departTime)); break;
      case 'time-desc': results.sort((a, b) => b.departTime.localeCompare(a.departTime)); break;
      case 'price-asc': results.sort((a, b) => this.getMinPrice(a) - this.getMinPrice(b)); break;
      case 'price-desc': results.sort((a, b) => this.getMinPrice(b) - this.getMinPrice(a)); break;
      case 'duration-asc': results.sort((a, b) => (a.durationMinutes || 0) - (b.durationMinutes || 0)); break;
    }

    LookupState.filteredResults = results;
    this.renderResults();
  },

  // Keep sort checkboxes mutually exclusive and re-apply filters
  toggleSortCheckbox(el) {
    try {
      const others = document.querySelectorAll('input.sort-checkbox');
      others.forEach(o => { if (o !== el) o.checked = false; });
      // If user unchecks the current, leave sort empty
      if (!el.checked) {
        LookupState.sortBy = '';
      }
      this.applyFilter();
    } catch (e) {
      console.warn('toggleSortCheckbox error', e);
    }
  },

  getMinPrice(flight) {
    const prices = Object.values(flight.prices).filter(p => p > 0);
    return prices.length > 0 ? Math.min(...prices) : flight.basePrice || 0;
  },

  renderResults() {
    const container = document.getElementById('resultsList');
    const countEl = document.getElementById('resultsCount');
    const emptyState = document.getElementById('emptyState');
    const pagination = document.getElementById('pagination');

    if (!container) return;

    const results = LookupState.filteredResults;
    const totalResults = results.length;

    if (countEl) countEl.textContent = `Tìm thấy ${totalResults} chuyến bay`;

    if (totalResults === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      if (pagination) pagination.classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const startIndex = (LookupState.currentPage - 1) * LookupState.itemsPerPage;
    const endIndex = startIndex + LookupState.itemsPerPage;
    const pageResults = results.slice(startIndex, endIndex);

    container.innerHTML = pageResults.map(flight => this.renderFlightCard(flight)).join('');

    const totalPages = Math.ceil(totalResults / LookupState.itemsPerPage);
    if (totalPages > 1) {
      pagination?.classList.remove('hidden');
      this.renderPagination(totalPages);
    } else {
      pagination?.classList.add('hidden');
    }
  },

  renderFlightCard(flight) {
    const fromAirport = AIRPORTS.find(a => a.code === flight.from);
    const toAirport = AIRPORTS.find(a => a.code === flight.to);
    const totalAvailable = Object.values(flight.availableSeats).reduce((a, b) => a + b, 0);
    const minPrice = this.getMinPrice(flight);

    const seatStatus = totalAvailable === 0 ? 'soldout' : totalAvailable < 10 ? 'low' : 'seats';
    const seatText = totalAvailable === 0 ? 'Hết ghế' : totalAvailable < 10 ? `Còn ${totalAvailable} ghế` : `${totalAvailable} ghế trống`;

    const fromCity = flight.fromCity || fromAirport?.city || fromAirport?.name || flight.from;
    const toCity = flight.toCity || toAirport?.city || toAirport?.name || flight.to;

    return `
      <div class="flight-card" data-id="${flight.id}">
        <div class="flight-card-content">
          <div class="flight-left">
            <div class="flight-code">${flight.code}</div>
            <div class="flight-airline">${flight.airline}</div>
            <div class="flight-date">
              <i class="fa-regular fa-calendar"></i>
              ${this.formatDate(flight.date)}
            </div>
          </div>

          <div class="route-visual">
            <div class="airport from">
              <span class="time">${flight.departTime}</span>
              <span class="code">${flight.from}</span>
              <span class="name">${fromCity}</span>
            </div>

            <div class="route-line">
              <div class="line"></div>
              <i class="fa-solid fa-plane"></i>
              <span class="duration">${flight.duration}</span>
              ${flight.stopovers.length > 0 ? `<span class="stopover-badge">${flight.stopovers.length} điểm dừng</span>` : ''}
            </div>

            <div class="airport to">
              <span class="time">${flight.arriveTime}</span>
              <span class="code">${flight.to}</span>
              <span class="name">${toCity}</span>
            </div>
          </div>

          <div class="flight-info">
            <span class="info-badge ${seatStatus}">
              <i class="fa-solid fa-couch"></i>
              ${seatText}
            </span>
            ${flight.stopovers.length === 0 ? '<span class="info-badge" style="background:#e0f2fe;color:#0369a1;"><i class="fa-solid fa-bolt"></i>Bay thẳng</span>' : ''}
            ${flight.departed ? '<span class="info-badge departed"><i class="fa-solid fa-plane-departed"></i>Đã cất cánh</span>' : ''}
          </div>

          <div class="flight-right">
            <div class="flight-price">
              <span class="price-from">Giá từ</span>
              <div class="price-amount">
                ${this.formatPrice(minPrice)} VNĐ
              </div>
            </div>
            <button class="btn-detail" onclick="Lookup.showDetail('${flight.id}')">
              <i class="fa-solid fa-eye"></i>
              Chi tiết
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderPagination(totalPages) {
    const container = document.getElementById('pageNumbers');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (!container) return;

    const currentPage = LookupState.currentPage;
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="Lookup.goToPage(${i})">${i}</button>`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += '<span style="padding: 0 8px;">...</span>';
      }
    }
    container.innerHTML = html;
  },

  goToPage(page) {
    const totalPages = Math.ceil(LookupState.filteredResults.length / LookupState.itemsPerPage);
    if (page >= 1 && page <= totalPages) {
      LookupState.currentPage = page;
      this.renderResults();
      window.scrollTo({ top: 400, behavior: 'smooth' });
    }
  },

  prevPage() { this.goToPage(LookupState.currentPage - 1); },
  nextPage() { this.goToPage(LookupState.currentPage + 1); },

  toggleFilter() {
    const panel = document.getElementById('filterPanel');
    if (panel) panel.classList.toggle('hidden');
  },

  resetFilter() {
    document.querySelectorAll('.filter-panel input[type="checkbox"]').forEach(cb => cb.checked = true);
    const soldoutCb = document.querySelector('input[value="soldout"]');
    if (soldoutCb) soldoutCb.checked = false;
    this.applyFilter();
  },

  refresh() { this.loadAllFlights(); },

  showDetail(flightId) {
    console.log(`🔍 Showing detail for flight: ${flightId}`);
    console.log(`📋 Filtered results count: ${LookupState.filteredResults.length}`);
    console.log(`📋 All flights count: ${ALL_FLIGHTS.length}`);
    
    const flight = LookupState.filteredResults.find(f => String(f.id) === String(flightId)) ||
                   ALL_FLIGHTS.find(f => String(f.id) === String(flightId));
    
    if (!flight) {
      console.error(`❌ Flight not found: ${flightId}`);
      showToast('Không tìm thấy chuyến bay!', 'error');
      return;
    }

    console.log('✅ Flight found, displaying detail...', flight);
    console.log('ℹ️ stopovers content:', flight.stopovers);
    LookupState.selectedFlight = flight;
    document.body.classList.add('modal-open');

    const fromAirport = AIRPORTS.find(a => a.code === flight.from);
    const toAirport = AIRPORTS.find(a => a.code === flight.to);
    const totalAvailable = Object.values(flight.availableSeats).reduce((a, b) => a + b, 0);

    const fromCity = flight.fromCity || fromAirport?.city || fromAirport?.name || flight.from;
    const toCity = flight.toCity || toAirport?.city || toAirport?.name || flight.to;

    document.getElementById('detailFlightCode').textContent = flight.code;
    document.getElementById('detailStatus').textContent = totalAvailable > 0 ? 'Còn chỗ' : 'Hết chỗ';
    document.getElementById('detailStatus').className = 'status ' + (totalAvailable > 0 ? 'available' : 'soldout');

    document.getElementById('detailFromCode').textContent = flight.from;
    document.getElementById('detailFromName').textContent = fromCity;
    document.getElementById('detailDepartTime').textContent = flight.departTime;

    document.getElementById('detailToCode').textContent = flight.to;
    document.getElementById('detailToName').textContent = toCity;
    document.getElementById('detailArriveTime').textContent = flight.arriveTime;

    document.getElementById('detailDuration').textContent = flight.duration;
    document.getElementById('detailDate').textContent = this.formatDate(flight.date);
    document.getElementById('detailAircraft').textContent = flight.aircraft;
    document.getElementById('detailAirline').textContent = flight.airline;

    // Normalize stopovers from multiple possible sources (flight.stopovers, flight.raw,...)
    let normalizedStops = [];
    try {
      if (Array.isArray(flight.stopovers) && flight.stopovers.length > 0) {
        normalizedStops = flight.stopovers;
      } else if (flight.raw) {
        const cand = flight.raw.stopovers || flight.raw.chi_tiet_san_bay_trung_gian || flight.raw.stop_over || flight.raw.trung_gian || null;
        if (Array.isArray(cand)) normalizedStops = cand;
        else if (typeof cand === 'string' && cand.trim()) normalizedStops = JSON.parse(cand);
      }
    } catch (e) {
      console.warn('Failed to normalize stops in showDetail()', e);
      normalizedStops = [];
    }

    const stopoverCount = Array.isArray(normalizedStops) ? normalizedStops.length : 0;
    const stopoverCountEl = document.getElementById('detailStopoverCount');
    if (stopoverCount === 0) {
      stopoverCountEl.innerHTML = '<span class="badge-direct"><i class="fa-solid fa-bolt"></i> Bay thẳng</span>';
    } else {
      stopoverCountEl.innerHTML = `<span class="badge-stopover"><i class="fa-solid fa-circle-stop"></i> ${stopoverCount} điểm dừng</span>`;
    }

    const seatsHtml = Object.entries(flight.seats).map(([cls, total]) => {
      const available = flight.availableSeats[cls];
      if (total === 0) return '';
      const statusClass = available === 0 ? 'soldout' : available < 5 ? 'low' : 'available';
      const statusText = available === 0 ? 'Hết' : `${available}/${total}`;
      return `
        <div class="seat-status-item">
          <span class="seat-class">${this.getTicketLabel(cls)}</span>
          <span class="seat-count ${statusClass}">${statusText}</span>
        </div>
      `;
    }).join('');
    document.getElementById('detailSeats').innerHTML = seatsHtml || '<span style="color:#64748b">Chưa có thông tin</span>';
    const stopoverSection = document.getElementById('detailStopoverSection');
    if (stopoverCount > 0) {
      stopoverSection.style.display = 'block';
      const stopoversHtml = normalizedStops.map(stop => {
        // stop may be object with ma_san_bay or ma_san_bay property names
        const code = (stop.ma_san_bay || stop.airport || stop.code || stop.maSanBay || '').toString().toUpperCase();
        const stopAirport = AIRPORTS.find(a => a.code === code);
        const cityName = stopAirport?.city || stop.ten_san_bay || stop.name || stop.city || code;
        const durationText = (Number(stop.thoi_gian_dung || stop.duration || 0) > 0) ? `${Number(stop.thoi_gian_dung || stop.duration)} phút` : '';
        const isSpecial = code === 'DAD';
        return `
          <div class="stopover-item${isSpecial ? ' special' : ''}">
            <div class="stopover-header">
              <i class="fa-solid fa-circle-stop"></i>
              <span class="stop-name">${cityName} (${code})</span>
              ${durationText ? `<span class="stop-duration">${durationText}</span>` : ''}
            </div>
            ${stop.ghi_chu || stop.note ? `<div class="stop-note"><span class="stop-note-label">Ghi chú:</span> <span class="stop-note-content">${stop.ghi_chu || stop.note}</span></div>` : ''}
          </div>
        `;
      }).join('');
      document.getElementById('detailStopovers').innerHTML = stopoversHtml;
    } else {
      // Show a muted placeholder when there are no stopovers instead of hiding the card
      stopoverSection.style.display = 'block';
      document.getElementById('detailStopovers').innerHTML = `
        <div class="stopover-placeholder">Không có điểm dừng</div>
      `;
    }

    // Toggle grid class so remaining two cards expand when there are no stopovers
    try {
      const grid = document.querySelector('.detail-grid.three-up');
      if (grid) {
        if (stopoverCount === 0) grid.classList.add('no-stopovers');
        else grid.classList.remove('no-stopovers');
      }
    } catch (e) {
      console.warn('Could not toggle no-stopovers class', e);
    }

    // Render price section
    const pricesHtml = Object.entries(flight.prices).map(([cls, price]) => {
      if (price === 0 || !flight.seats[cls] || flight.seats[cls] === 0) return '';
      const available = flight.availableSeats[cls];
      return `
        <div class="price-card">
          <span class="price-class">${this.getTicketLabel(cls)}</span>
          <span class="price-amount">${this.formatPrice(price)} VNĐ</span>
          <span class="price-availability">${available === 0 ? 'Hết' : `Còn ${available}`}</span>
        </div>
      `;
    }).filter(h => h).join('');
    document.getElementById('detailPrices').innerHTML = pricesHtml || '<span style="color:#64748b">Chưa có thông tin</span>';

    const modal = document.getElementById('flightDetailModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('open');
      console.log('✅ Modal opened with open class');
    } else {
      console.error('❌ Modal element not found');
    }
  },

  closeDetail() {
    const modal = document.getElementById('flightDetailModal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.add('hidden');
    }
    document.body.classList.remove('modal-open');
  },

  goToBooking() {
    if (LookupState.selectedFlight) {
      const f = LookupState.selectedFlight;
      const qs = new URLSearchParams();
      if (f.id) qs.set('flightId', f.id);
      if (f.from) qs.set('from', f.from);
      if (f.to) qs.set('to', f.to);
      if (f.date) qs.set('date', f.date);
      window.location.href = `booking.html?${qs.toString()}`;
    }
  },

  goToSell() {
    if (LookupState.selectedFlight) {
      const f = LookupState.selectedFlight;
      const qs = new URLSearchParams();
      if (f.id) qs.set('flightId', f.id);
      if (f.from) qs.set('from', f.from);
      if (f.to) qs.set('to', f.to);
      if (f.date) qs.set('date', f.date);
      window.location.href = `sell.html?${qs.toString()}`;
    }
  },

  formatDate(dateStr) { 
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', options);
  },

  formatPrice(price) {
    return new Intl.NumberFormat('vi-VN').format(price);
  },

  togglePriceSortMenu(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const menu = document.getElementById('priceSortMenu');
    if (!menu) return;
    menu.classList.toggle('hidden');
  },

  setPriceSort(mode) {
    const btn = document.getElementById('priceSortBtn');
    const menu = document.getElementById('priceSortMenu');
    if (!btn) return;
    if (!mode) {
      delete btn.dataset.sort;
      btn.classList.remove('active');
    } else {
      btn.dataset.sort = mode;
      btn.classList.add('active');
    }
    if (menu) menu.classList.add('hidden');
    // Clear legacy sort checkboxes
    document.querySelectorAll('input.sort-checkbox').forEach(cb => cb.checked = false);
    // Reapply filters which triggers sorting and rendering
    this.applyFilter();
  },

  getTicketLabel(code) {
    const c = String(code || '').toLowerCase();
    if (c === 'business' || c === 'bus' || c === 'buss') return 'Vé hạng 1 (Business)';
    if (c === 'eco' || c === 'economy' || c === 'e') return 'Vé hạng 2 (Economy)';
    if (c === 'first') return 'Vé hạng 0 (First)';
    // Fallback to readable label
    return `Vé hạng (${code})`;
  },

  getClassName(code) {       
    switch (code.toLowerCase()) {
      case 'business': return 'Hạng Thương gia';
      case 'eco': return 'Hạng Phổ thông';
      case 'first': return 'Hạng Nhất';
      default: return `Hạng ${code}`;
    }
  }
};

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  Lookup.init();
});