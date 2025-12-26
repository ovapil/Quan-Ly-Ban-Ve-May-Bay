/**
 * PASSENGER.JS - Quản lý hành khách
 * Lấy dữ liệu từ giao_dich_ve + ve, gộp theo CMND hoặc SĐT
 */

const API_BASE_URL = 'http://localhost:3000/api';

// ============================================
// TOAST
// ============================================
const UI = {
  toast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.setAttribute('data-type', type);
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toast.style.display = 'none'), 2500);
  }
};

// ============================================
// HELPER
// ============================================
function getToken() {
  return localStorage.getItem('uiticket_token') || localStorage.getItem('token');
}

// ============================================
// STATE
// ============================================
const PassengerState = {
  passengers: [],
  filteredPassengers: [],
  selectedPassenger: null,
  currentPage: 1,
  itemsPerPage: 10,
  searchQuery: '',
  filterStatus: '',
  sortBy: 'newest',
  isLoading: false,
  editMode: false,
  maskState: { cmnd: true, phone: true }
};

// ============================================
// SAMPLE DATA (Fallback)
// ============================================
const SAMPLE_PASSENGERS = [
  {
    id: 1,
    ho_ten: 'Nguyễn Văn An',
    cmnd: '079123456789',
    sdt: '0901234567',
    created_at: '2025-12-01',
    status: 'paid',
    tickets: 5,
    total_spent: 12500000,
    transactions: [
      { ma_gd: 'GD001', ma_chuyen: 'VN123', ngay: '2025-12-20', trang_thai: 'paid', so_tien: 2500000 },
      { ma_gd: 'GD002', ma_chuyen: 'VJ456', ngay: '2025-12-15', trang_thai: 'paid', so_tien: 3200000 },
      { ma_gd: 'GD003', ma_chuyen: 'VN789', ngay: '2025-12-10', trang_thai: 'paid', so_tien: 2800000 },
      { ma_gd: 'GD004', ma_chuyen: 'QH101', ngay: '2025-12-05', trang_thai: 'paid', so_tien: 2000000 },
      { ma_gd: 'GD005', ma_chuyen: 'VN202', ngay: '2025-12-01', trang_thai: 'paid', so_tien: 2000000 }
    ]
  },
  {
    id: 2,
    ho_ten: 'Trần Thị Bình',
    cmnd: '079987654321',
    sdt: '0912345678',
    created_at: '2025-12-10',
    status: 'booked',
    tickets: 3,
    total_spent: 7800000,
    transactions: [
      { ma_gd: 'GD006', ma_chuyen: 'VN303', ngay: '2025-12-22', trang_thai: 'booked', so_tien: 2600000 },
      { ma_gd: 'GD007', ma_chuyen: 'VJ404', ngay: '2025-12-18', trang_thai: 'paid', so_tien: 2700000 },
      { ma_gd: 'GD008', ma_chuyen: 'QH505', ngay: '2025-12-12', trang_thai: 'paid', so_tien: 2500000 }
    ]
  },
  {
    id: 3,
    ho_ten: 'Lê Minh Châu',
    cmnd: '026123789456',
    sdt: '0923456789',
    created_at: '2025-12-15',
    status: 'cancelled',
    tickets: 1,
    total_spent: 0,
    transactions: [
      { ma_gd: 'GD009', ma_chuyen: 'VN606', ngay: '2025-12-20', trang_thai: 'cancelled', so_tien: 0 }
    ]
  }
];

// ============================================
// PASSENGER MODULE
// ============================================
const Passenger = {
  // Khởi tạo
  init() {
    this.bindEvents();
    this.loadPassengers();
    console.log('✅ Passenger module initialized');
  },

  // Bind events
  bindEvents() {
    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        PassengerState.searchQuery = e.target.value.trim().toLowerCase();
        PassengerState.currentPage = 1;
        this.applyFilters();
      });
    }

    // Clear search
    const btnClear = document.getElementById('btnClearSearch');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        PassengerState.searchQuery = '';
        this.applyFilters();
      });
    }

    // Filter status
    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        PassengerState.filterStatus = e.target.value;
        PassengerState.currentPage = 1;
        this.applyFilters();
      });
    }

    // Sort
    const filterSort = document.getElementById('filterSort');
    if (filterSort) {
      filterSort.addEventListener('change', (e) => {
        PassengerState.sortBy = e.target.value;
        this.applyFilters();
      });
    }

    // Refresh
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => this.loadPassengers());
    }

    // Add new
    // add-new button removed from UI

    // Edit button
    const btnEdit = document.getElementById('btnEdit');
    if (btnEdit) {
      btnEdit.addEventListener('click', () => {
        if (PassengerState.selectedPassenger) {
          this.openEditModal(PassengerState.selectedPassenger);
        }
      });
    }

    // Delete button
    const btnDelete = document.getElementById('btnDelete');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        if (PassengerState.selectedPassenger) {
          this.openDeleteModal(PassengerState.selectedPassenger);
        }
      });
    }

    // Pagination
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    if (btnPrevPage) btnPrevPage.addEventListener('click', () => this.prevPage());
    if (btnNextPage) btnNextPage.addEventListener('click', () => this.nextPage());

    // Modal close on outside click
    const passengerModal = document.getElementById('passengerModal');
    if (passengerModal) {
      passengerModal.addEventListener('click', (e) => {
        if (e.target === passengerModal) this.closeModal();
      });
    }

    // More transactions button opens modal
    const btnMore = document.getElementById('btnMoreTrans');
    if (btnMore) btnMore.addEventListener('click', () => this.openTransactionsModal());

    // Transactions modal close
    const transactionsModal = document.getElementById('transactionsModal');
    if (transactionsModal) {
      transactionsModal.addEventListener('click', (e) => {
        if (e.target === transactionsModal) this.closeTransactionsModal();
      });
    }
    const closeTransactionsBtn = document.getElementById('closeTransactionsModal');
    if (closeTransactionsBtn) closeTransactionsBtn.addEventListener('click', () => this.closeTransactionsModal());

    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
      deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) this.closeDeleteModal();
      });
    }
  },

  // Load passengers from API
  async loadPassengers() {
    this.setLoading(true);

    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const res = await fetch(`${API_BASE_URL}/passengers`, { headers });

      if (res.ok) {
        const data = await res.json();
        let passengers = (data.passengers || []).map(p => ({
          id: p.id,
          ho_ten: p.ho_ten,
          cmnd: p.cmnd,
          sdt: p.sdt,
          tickets: p.tickets || 0,
          total_spent: p.total_spent || 0,
          status: p.last_status || null,
          created_at: p.last_time || null,
          transactions: []
        }));
        PassengerState.passengers = passengers;
        console.log(`✅ Loaded ${passengers.length} passengers from API`);
      } else {
        throw new Error(`API error: ${res.status}`);
      }
    } catch (e) {
      console.error('Failed to load passengers:', e);
      UI.toast('Không thể tải danh sách hành khách', 'error');
      PassengerState.passengers = [];
    } finally {
      this.setLoading(false);
      this.applyFilters();
      this.updateStats();
    }
  },

  // Set loading state
  setLoading(loading) {
    PassengerState.isLoading = loading;
    const loadingState = document.getElementById('loadingState');
    const tableContainer = document.querySelector('.table-container');
    
    if (loading) {
      if (loadingState) loadingState.style.display = 'block';
      if (tableContainer) tableContainer.style.opacity = '0.5';
    } else {
      if (loadingState) loadingState.style.display = 'none';
      if (tableContainer) tableContainer.style.opacity = '1';
    }
  },

  // Apply filters and sort
  applyFilters() {
    let results = [...PassengerState.passengers];

    // Search
    if (PassengerState.searchQuery) {
      const q = PassengerState.searchQuery;
      results = results.filter(p => 
        (p.ho_ten || '').toLowerCase().includes(q) ||
        (p.cmnd || '').includes(q) ||
        (p.sdt || '').includes(q)
      );
    }

    // Filter by status
    if (PassengerState.filterStatus) {
      results = results.filter(p => p.status === PassengerState.filterStatus);
    }

    // Sort
    switch (PassengerState.sortBy) {
      case 'newest':
        results.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
      case 'oldest':
        results.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        break;
      case 'name-asc':
        results.sort((a, b) => (a.ho_ten || '').localeCompare(b.ho_ten || ''));
        break;
      case 'name-desc':
        results.sort((a, b) => (b.ho_ten || '').localeCompare(a.ho_ten || ''));
        break;
      case 'most-tickets':
        results.sort((a, b) => (b.tickets || 0) - (a.tickets || 0));
        break;
    }

    PassengerState.filteredPassengers = results;
    this.renderTable();
    this.renderPagination();
  },

  // Update stats
  updateStats() {
    const passengers = PassengerState.passengers;
    
    document.getElementById('statTotal').textContent = passengers.length;
    document.getElementById('statPaid').textContent = passengers.filter(p => p.status === 'paid').length;
    document.getElementById('statBooked').textContent = passengers.filter(p => p.status === 'booked').length;
    
    const cancelledExpired = passengers.filter(p => p.status === 'cancelled' || p.status === 'expired').length;
    document.getElementById('statCancelled').textContent = cancelledExpired;
  },

  // Render table
  renderTable() {
    const tbody = document.getElementById('passengerBody');
    const emptyState = document.getElementById('emptyState');
    
    if (!tbody) return;

    const results = PassengerState.filteredPassengers;
    const start = (PassengerState.currentPage - 1) * PassengerState.itemsPerPage;
    const end = start + PassengerState.itemsPerPage;
    const pageResults = results.slice(start, end);

    if (results.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = pageResults.map((p, index) => this.renderRow(p, start + index + 1)).join('');

    // Add click handlers
    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox' || e.target.closest('.action-btns')) return;
        const id = row.dataset.id;
        this.selectPassenger(id);
      });
    });
  },

  // Render single row
  renderRow(p, stt) {
    const initials = this.getInitials(p.ho_ten);
    const statusClass = p.status || 'booked';
    const statusText = this.getStatusText(statusClass);
    const isSelected = PassengerState.selectedPassenger?.id == p.id;

    return `
      <tr data-id="${p.id}" class="${isSelected ? 'selected' : ''}">
        <td class="col-stt">${stt}</td>
        <td class="col-name">
          <div class="passenger-name-cell">
            <div class="passenger-avatar">${initials}</div>
            <div class="passenger-name-info">
              <span class="passenger-name">${p.ho_ten || '—'}</span>
            </div>
          </div>
        </td>
        <td class="col-cmnd">${this.maskCMND(p.cmnd)}</td>
        <td class="col-tickets">
          <span class="tickets-badge">${p.tickets || 0}</span>
        </td>
        <td class="col-status">
          <span class="status-badge ${statusClass}">
            <i class="fa-solid fa-circle"></i>
            ${statusText}
          </span>
        </td>
        <td class="col-actions">
          <div class="action-btns">
            <button class="btn-action edit" title="Sửa" onclick="Passenger.openEditModal(${p.id})">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-action delete" title="Xóa" onclick="Passenger.openDeleteModal(${p.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  // Render pagination
  renderPagination() {
    const total = PassengerState.filteredPassengers.length;
    const totalPages = Math.ceil(total / PassengerState.itemsPerPage);
    const currentPage = PassengerState.currentPage;

    // Update info
    const start = Math.min((currentPage - 1) * PassengerState.itemsPerPage + 1, total);
    const end = Math.min(currentPage * PassengerState.itemsPerPage, total);
    
    document.getElementById('showingFrom').textContent = total > 0 ? start : 0;
    document.getElementById('showingTo').textContent = end;
    document.getElementById('totalRecords').textContent = total;

    // Update buttons
    document.getElementById('btnPrevPage').disabled = currentPage === 1;
    document.getElementById('btnNextPage').disabled = currentPage >= totalPages;

    // Page numbers
    const pageNumbers = document.getElementById('pageNumbers');
    if (!pageNumbers) return;

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="Passenger.goToPage(${i})">${i}</button>`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += '<span style="padding: 0 8px;">...</span>';
      }
    }
    pageNumbers.innerHTML = html;
  },

  // Select passenger
  async selectPassenger(id) {
    const p = PassengerState.passengers.find(x => x.id == id);
    if (!p) return;

    PassengerState.selectedPassenger = p;

    // Update table selection
    document.querySelectorAll('#passengerBody tr').forEach(row => {
      row.classList.toggle('selected', row.dataset.id == id);
    });

    // Fetch transactions for this passenger
    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const key = p.cmnd || p.sdt || p.id;
      const res = await fetch(`${API_BASE_URL}/passengers/${encodeURIComponent(key)}/transactions`, { headers });
      if (res.ok) {
        const data = await res.json();
        const tx = (data.transactions || []).map(t => ({
          ma_gd: t.id,
          ma_chuyen: t.flight_code || '—',
          ngay: t.flight_date || t.created_at,
          trang_thai: t.status,
          so_tien: t.amount || 0
        }));
        p.transactions = tx;
        p.showAllTransactions = false; // default show only first 5
      } else {
        p.transactions = [];
      }
    } catch (e) {
      console.warn('Failed to load transactions:', e);
      p.transactions = [];
    }

    // Show detail
    this.showDetail(p);

    // Expand detail panel to show full content
    const detailPanel = document.querySelector('.passenger-detail-section .panel');
    if (detailPanel) detailPanel.classList.add('expanded');
  },

  // Show detail panel
  showDetail(p) {
    PassengerState.maskState = { cmnd: true, phone: true };

    document.getElementById('noSelection').style.display = 'none';
    document.getElementById('detailContent').style.display = 'block';

    document.getElementById('detailName').textContent = p.ho_ten || '—';
    document.getElementById('detailCmnd').textContent = this.maskCMND(p.cmnd);
    document.getElementById('detailPhone').textContent = this.maskPhone(p.sdt);
    document.getElementById('detailCreated').textContent = this.formatDate(p.created_at);

    const statusEl = document.getElementById('detailStatus');
    statusEl.textContent = this.getStatusText(p.status);
    statusEl.className = `detail-status ${p.status || 'booked'}`;

    document.getElementById('detailTotalTickets').textContent = p.tickets || 0;
    document.getElementById('detailTotalSpent').textContent = this.formatPriceFull(p.total_spent || 0);

    // Avatar initials
    const avatar = document.getElementById('detailAvatar');
    avatar.innerHTML = `<span style="font-size:24px;font-weight:700;">${this.getInitials(p.ho_ten)}</span>`;

    // Reset toggle buttons
    document.querySelectorAll('.btn-toggle-mask i').forEach(icon => {
      icon.className = 'fa-solid fa-eye';
    });

    // Render transactions table
    this.renderTransactions(p.transactions || []);
  },

  // Toggle showing more transactions
  // Open modal with full transactions list
  openTransactionsModal() {
    const p = PassengerState.selectedPassenger;
    if (!p) return;
    // populate modal title and stats
    const title = document.getElementById('transactionsModalTitle');
    if (title) title.textContent = `Lịch sử giao dịch — ${p.ho_ten || ''}`;
    const totalTicketsEl = document.getElementById('modalTotalTickets');
    if (totalTicketsEl) totalTicketsEl.textContent = p.tickets || 0;
    const totalSpentEl = document.getElementById('modalTotalSpent');
    if (totalSpentEl) totalSpentEl.textContent = this.formatPriceFull(p.total_spent || 0);

    // fill rows
    const tbody = document.getElementById('transactionsModalBody');
    if (tbody) {
      tbody.innerHTML = (p.transactions || []).map(t => `
        <tr>
          <td class="trans-icon"><i class="fa-solid fa-ticket"></i></td>
          <td><span class="trans-code">${t.ma_gd}</span></td>
          <td>
            <div class="trans-flight-info">
              <span class="trans-flight">${t.ma_chuyen}</span>
              <span class="trans-date">${this.formatDateShort(t.ngay)}</span>
            </div>
          </td>
          <td><span class="status-mini ${t.trang_thai}">${this.getStatusShort(t.trang_thai)}</span></td>
          <td class="trans-amount">${this.formatPriceShort(t.so_tien)}</td>
        </tr>
      `).join('');
    }

    const modal = document.getElementById('transactionsModal');
    if (modal) modal.classList.remove('hidden');
  },

  closeTransactionsModal() {
    const modal = document.getElementById('transactionsModal');
    if (modal) modal.classList.add('hidden');
  },

  // Render transactions table
  renderTransactions(transactions) {
    const tbody = document.getElementById('transactionBody');
    const noTrans = document.getElementById('noTransactions');
    const table = document.querySelector('.transaction-table');

    if (!transactions || transactions.length === 0) {
      if (table) table.style.display = 'none';
      if (noTrans) noTrans.style.display = 'block';
      return;
    }

    if (table) table.style.display = 'table';
    if (noTrans) noTrans.style.display = 'none';

    const p = PassengerState.selectedPassenger;
    const showAll = p && p.showAllTransactions;
    const list = showAll ? transactions : transactions.slice(0, 5);

    tbody.innerHTML = list.map(t => `
      <tr>
        <td class="trans-icon"><i class="fa-solid fa-ticket"></i></td>
        <td><span class="trans-code">${t.ma_gd}</span></td>
        <td>
          <div class="trans-flight-info">
            <span class="trans-flight">${t.ma_chuyen}</span>
            <span class="trans-date">${this.formatDateShort(t.ngay)}</span>
          </div>
        </td>
        <td><span class="status-mini ${t.trang_thai}">${this.getStatusShort(t.trang_thai)}</span></td>
        <td class="trans-amount">${this.formatPriceShort(t.so_tien)}</td>
      </tr>
    `).join('');

    // Update more button text and visibility
    const btn = document.getElementById('btnMoreTrans');
    if (btn) {
      if (transactions.length <= 5) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'inline-block';
        btn.textContent = (p && p.showAllTransactions) ? 'Thu gọn' : 'Xem thêm';
      }
    }
  },

  // Open add modal
  openAddModal() {
    PassengerState.editMode = false;
    document.getElementById('modalTitle').textContent = 'Thêm hành khách mới';
    document.getElementById('passengerForm').reset();
    document.getElementById('passengerId').value = '';
    this.clearErrors();
    document.getElementById('passengerModal').classList.remove('hidden');
  },

  // Open edit modal
  openEditModal(idOrPassenger) {
    const p = typeof idOrPassenger === 'object' 
      ? idOrPassenger 
      : PassengerState.passengers.find(x => x.id == idOrPassenger);
    
    if (!p) return;

    PassengerState.editMode = true;
    document.getElementById('modalTitle').textContent = 'Sửa thông tin hành khách';
    document.getElementById('passengerId').value = p.id;
    document.getElementById('inputName').value = p.ho_ten || '';
    document.getElementById('inputCmnd').value = p.cmnd || '';
    document.getElementById('inputPhone').value = p.sdt || '';
    this.clearErrors();
    document.getElementById('passengerModal').classList.remove('hidden');
  },

  // Close modal
  closeModal() {
    document.getElementById('passengerModal').classList.add('hidden');
  },

  // Open delete modal
  openDeleteModal(idOrPassenger) {
    const p = typeof idOrPassenger === 'object' 
      ? idOrPassenger 
      : PassengerState.passengers.find(x => x.id == idOrPassenger);
    
    if (!p) return;

    document.getElementById('deletePassengerName').textContent = p.ho_ten;
    document.getElementById('btnConfirmDelete').onclick = () => this.deletePassenger(p.id);
    document.getElementById('deleteModal').classList.remove('hidden');
  },

  // Close delete modal
  closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
  },

  // Save passenger
  async savePassenger() {
    this.clearErrors();

    const id = document.getElementById('passengerId').value;
    const name = document.getElementById('inputName').value.trim();
    const cmnd = document.getElementById('inputCmnd').value.trim();
    const phone = document.getElementById('inputPhone').value.trim();

    // Validate
    let hasError = false;

    if (!name) {
      document.getElementById('errName').textContent = 'Vui lòng nhập họ tên';
      hasError = true;
    }

    if (!cmnd || !/^(\d{9}|\d{12})$/.test(cmnd)) {
      document.getElementById('errCmnd').textContent = 'CMND phải có 9 hoặc 12 chữ số';
      hasError = true;
    }

    if (!phone || !/^\d{10}$/.test(phone)) {
      document.getElementById('errPhone').textContent = 'Số điện thoại phải có 10 chữ số';
      hasError = true;
    }

    if (hasError) return;

    try {
      const token = getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const body = {
        ho_ten: name,
        cmnd: cmnd,
        sdt: phone
      };

      const url = id ? `${API_BASE_URL}/passengers/${id}` : `${API_BASE_URL}/passengers`;
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });

      if (res.ok) {
        UI.toast(id ? 'Cập nhật thành công!' : 'Thêm hành khách thành công!', 'success');
        this.closeModal();
        this.loadPassengers();
      } else {
        const data = await res.json().catch(() => ({}));
        UI.toast(data.error || 'Có lỗi xảy ra!', 'error');
      }
    } catch (e) {
      // Fallback for demo
      if (PassengerState.editMode && id) {
        const idx = PassengerState.passengers.findIndex(p => p.id == id);
        if (idx >= 0) {
          PassengerState.passengers[idx] = {
            ...PassengerState.passengers[idx],
            ho_ten: name,
            cmnd: cmnd,
            sdt: phone
          };
        }
        UI.toast('Cập nhật thành công!', 'success');
      } else {
        const newId = Math.max(...PassengerState.passengers.map(p => p.id || 0), 0) + 1;
        PassengerState.passengers.push({
          id: newId,
          ho_ten: name,
          cmnd: cmnd,
          sdt: phone,
          created_at: new Date().toISOString().split('T')[0],
          status: 'active',
          tickets: 0,
          total_spent: 0,
          transactions: []
        });
        UI.toast('Thêm hành khách thành công!', 'success');
      }
      this.closeModal();
      this.applyFilters();
      this.updateStats();
    }
  },

  // Delete passenger
  async deletePassenger(id) {
    try {
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const res = await fetch(`${API_BASE_URL}/passengers/${id}`, { 
        method: 'DELETE', 
        headers 
      });

      if (!res.ok) {
        throw new Error(`Failed to delete: ${res.status}`);
      }
    } catch (e) {
      console.warn('API delete failed:', e);
    }

    // Remove from local state
    PassengerState.passengers = PassengerState.passengers.filter(p => p.id != id);
    PassengerState.selectedPassenger = null;
    
    document.getElementById('noSelection').style.display = 'block';
    document.getElementById('detailContent').style.display = 'none';
    // collapse detail panel
    const detailPanel = document.querySelector('.passenger-detail-section .panel');
    if (detailPanel) detailPanel.classList.remove('expanded');
    
    this.closeDeleteModal();
    this.applyFilters();
    this.updateStats();
    UI.toast('Xóa hành khách thành công!', 'success');
  },

  // Clear form errors
  clearErrors() {
    ['errName', 'errCmnd', 'errPhone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  },

  // Pagination
  goToPage(page) {
    PassengerState.currentPage = page;
    this.renderTable();
    this.renderPagination();
  },

  prevPage() {
    if (PassengerState.currentPage > 1) {
      PassengerState.currentPage--;
      this.renderTable();
      this.renderPagination();
    }
  },

  nextPage() {
    const totalPages = Math.ceil(PassengerState.filteredPassengers.length / PassengerState.itemsPerPage);
    if (PassengerState.currentPage < totalPages) {
      PassengerState.currentPage++;
      this.renderTable();
      this.renderPagination();
    }
  },

  // Helpers
  getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ').filter(p => p);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  },

  getStatusText(status) {
    const texts = {
      'paid': 'Đã thanh toán',
      'booked': 'Đặt chỗ',
      'cancelled': 'Đã hủy',
      'expired': 'Hết hạn'
    };
    return texts[status] || 'Chờ xử lý';
  },

  getStatusShort(status) {
    const texts = {
      'paid': 'Đã TT',
      'booked': 'Đặt chỗ',
      'cancelled': 'Đã hủy',
      'expired': 'Hết hạn'
    };
    return texts[status] || '—';
  },

  formatCMND(cmnd) {
    if (!cmnd) return '—';
    if (cmnd.length === 12) {
      return cmnd.replace(/(\d{3})(\d{3})(\d{6})/, '$1 $2 $3');
    }
    return cmnd.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  },

  maskCMND(cmnd) {
    if (!cmnd) return '—';
    if (cmnd.length === 12) {
      return cmnd.substring(0, 3) + '******' + cmnd.substring(10);
    }
    return cmnd.substring(0, 3) + '****' + cmnd.substring(7);
  },

  formatPhone(phone) {
    if (!phone) return '—';
    return phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  },

  maskPhone(phone) {
    if (!phone) return '—';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return phone;
    return cleaned.substring(0, 4) + '***' + cleaned.substring(7);
  },

  toggleMask(field) {
    const p = PassengerState.selectedPassenger;
    if (!p) return;

    const state = PassengerState.maskState || { cmnd: true, phone: true };
    state[field] = !state[field];
    PassengerState.maskState = state;

    if (field === 'cmnd') {
      const el = document.getElementById('detailCmnd');
      const btn = el.nextElementSibling?.querySelector('i');
      if (state.cmnd) {
        el.textContent = this.maskCMND(p.cmnd);
        if (btn) btn.className = 'fa-solid fa-eye';
      } else {
        el.textContent = this.formatCMND(p.cmnd);
        if (btn) btn.className = 'fa-solid fa-eye-slash';
      }
    } else if (field === 'phone') {
      const el = document.getElementById('detailPhone');
      const btn = el.nextElementSibling?.querySelector('i');
      if (state.phone) {
        el.textContent = this.maskPhone(p.sdt);
        if (btn) btn.className = 'fa-solid fa-eye';
      } else {
        el.textContent = this.formatPhone(p.sdt);
        if (btn) btn.className = 'fa-solid fa-eye-slash';
      }
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateShort(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  },

  formatPrice(price) {
    return new Intl.NumberFormat('vi-VN').format(price || 0);
  },

  formatPriceFull(price) {
    if (!price || price === 0) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(price) + ' ₫';
  },

  formatPriceShort(price) {
    if (!price || price === 0) return '0 ₫';
    if (price >= 1000000) {
      return (price / 1000000).toFixed(1).replace('.0', '') + 'tr';
    }
    if (price >= 1000) {
      return Math.round(price / 1000) + 'k';
    }
    return price + ' ₫';
  }
};

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  Passenger.init();
});
