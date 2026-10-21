/**
 * ADNA Moments — Gallery Manager
 * Handles fetching, caching, dynamic filtering, search, sorting, and pagination.
 */

const GalleryManager = {
  allMedia: [],
  filteredMedia: [],
  filterType: 'all',
  filterYear: '',
  filterDate: '',
  searchQuery: '',
  sortBy: 'newest',
  currentPage: 1,
  itemsPerPage: 16,
  isLoading: false,

  // Batch Select Mode untuk assign ke album
  isSelectMode: false,
  selectedIds: new Set(),

  init() {
    this.populateYearOptions();
    this.bindEvents();
    this.fetchGallery();
  },

  bindEvents() {
    // Search input with debounce
    const searchInput = document.getElementById('gallerySearch');
    if (searchInput) {
      let debounceTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          this.searchQuery = e.target.value.trim().toLowerCase();
          this.applyFilters();
        }, 250);
      });
    }

    // Sort select
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.applyFilters();
      });
    }
  },

  populateYearOptions(detectedYears = []) {
    const yearSelect = document.getElementById('filterYear');
    if (!yearSelect) return;

    const currentYear = new Date().getFullYear();
    const yearsSet = new Set([
      currentYear,
      currentYear - 1,
      currentYear - 2,
      ...detectedYears.map(y => parseInt(y, 10)).filter(y => !isNaN(y))
    ]);

    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

    const savedSelected = yearSelect.value;
    yearSelect.innerHTML = '<option value="">Semua Tahun</option>';
    sortedYears.forEach(year => {
      const opt = document.createElement('option');
      opt.value = String(year);
      opt.textContent = String(year);
      yearSelect.appendChild(opt);
    });

    if (savedSelected) {
      yearSelect.value = savedSelected;
    }
  },

  setTypeFilter(type) {
    this.filterType = type;

    ['all', 'photo', 'video'].forEach(t => {
      const btn = document.getElementById(`filter-type-${t}`);
      if (!btn) return;
      if (t === type) {
        btn.className = 'flex-1 sm:flex-none px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-all text-center';
      } else {
        btn.className = 'flex-1 sm:flex-none px-4 py-1.5 text-xs sm:text-sm font-medium rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-all text-center';
      }
    });

    this.applyFilters();
  },

  async fetchGallery() {
    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('Silakan atur URL Google Apps Script yang valid di pengaturan.', 'warning');
      return;
    }

    const grid = document.getElementById('gallery-grid');
    const loading = document.getElementById('gallery-loading');
    const empty = document.getElementById('gallery-empty');
    const pagControls = document.getElementById('pagination-controls');

    this.isLoading = true;
    grid.innerHTML = '';
    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    pagControls.classList.add('hidden');

    try {
      const year = document.getElementById('filterYear')?.value || '';
      const dateVal = document.getElementById('filterDate')?.value || '';

      let query = '?type=all';
      if (year) query += `&year=${encodeURIComponent(year)}`;
      if (dateVal) query += `&date=${encodeURIComponent(dateVal)}`;

      const response = await fetch(apiUrl + query);
      const result = await response.json();

      if (result.status === 'success') {
        this.allMedia = result.data || [];

        // Discover all unique years from response
        const years = this.allMedia.map(item => item.year).filter(Boolean);
        this.populateYearOptions(years);

        this.applyFilters();
      } else {
        App.showToast(result.message || 'Gagal mengambil galeri', 'error');
        loading.classList.add('hidden');
        empty.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      App.showToast('Gagal terhubung ke Cloud. Pastikan internet aktif dan URL GAS benar.', 'error');
      loading.classList.add('hidden');
      empty.classList.remove('hidden');
    } finally {
      this.isLoading = false;
      loading.classList.add('hidden');
    }
  },

  applyFilters() {
    const yearSelect = document.getElementById('filterYear');
    const dateInput = document.getElementById('filterDate');

    this.filterYear = yearSelect ? yearSelect.value : '';
    this.filterDate = dateInput ? dateInput.value : '';

    this.filteredMedia = this.allMedia.filter(item => {
      // Type match
      const matchType = this.filterType === 'all' ? true : item.type === this.filterType;

      // Year match
      const matchYear = !this.filterYear ? true : String(item.year) === String(this.filterYear);

      // Date match (exact YYYY-MM-DD or matching date string)
      let matchDate = true;
      if (this.filterDate) {
        const itemDate = item.date || (item.createdAt ? item.createdAt.split('T')[0] : '');
        matchDate = itemDate === this.filterDate;
      }

      // Search query match
      let matchSearch = true;
      if (this.searchQuery) {
        const name = (item.name || '').toLowerCase();
        const notes = (item.notes || '').toLowerCase();
        const album = (item.album || '').toLowerCase();
        matchSearch = name.includes(this.searchQuery) || notes.includes(this.searchQuery) || album.includes(this.searchQuery);
      }

      return matchType && matchYear && matchDate && matchSearch;
    });

    // Sorting
    this.filteredMedia.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();

      if (this.sortBy === 'newest') return dateB - dateA;
      if (this.sortBy === 'oldest') return dateA - dateB;
      if (this.sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

    this.currentPage = 1;
    this.renderPaginated();
  },

  renderPaginated() {
    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');
    const pagControls = document.getElementById('pagination-controls');

    grid.innerHTML = '';

    if (this.filteredMedia.length === 0) {
      empty.classList.remove('hidden');
      pagControls.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');

    const totalItems = this.filteredMedia.length;
    const totalPages = Math.ceil(totalItems / this.itemsPerPage);

    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = Math.min(startIndex + this.itemsPerPage, totalItems);
    const pageItems = this.filteredMedia.slice(startIndex, endIndex);

    // Render cards
    pageItems.forEach((item, index) => {
      const globalIndex = startIndex + index;
      const isVideo = item.type === 'video';
      const delay = (index % 8) * 0.04;
      const isSelected = this.selectedIds.has(item.id);

      const card = document.createElement('div');
      card.className = `media-card cursor-pointer animate-fadeInScale aspect-[3/4] sm:aspect-[4/5] ${
        this.isSelectMode && isSelected ? 'ring-2 ring-brand-500 scale-[0.98]' : ''
      }`;
      card.style.animationDelay = `${delay}s`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Lihat ${item.name}`);

      card.onclick = () => {
        if (this.isSelectMode) {
          this.toggleItemSelect(item.id);
        } else {
          ModalManager.open(item, globalIndex, this.filteredMedia);
        }
      };

      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (this.isSelectMode) {
            this.toggleItemSelect(item.id);
          } else {
            ModalManager.open(item, globalIndex, this.filteredMedia);
          }
        }
      };

      const thumbUrl = item.thumbnailUrl || 'https://placehold.co/400x500/180a14/f43f5e?text=Media';

      card.innerHTML = `
        <img 
          src="${thumbUrl}" 
          alt="${item.name}" 
          loading="lazy" 
          class="w-full h-full object-cover transition-transform duration-700 ease-out"
          onerror="this.onerror=null; this.src='https://placehold.co/400x500/180a14/f43f5e?text=Preview+Error'"
        />

        <!-- Selection Checkbox in Select Mode -->
        ${this.isSelectMode ? `
          <div class="absolute top-2.5 left-2.5 w-6 h-6 rounded-full flex items-center justify-center z-20 transition-all ${
            isSelected ? 'bg-brand-500 text-white shadow-lg ring-2 ring-white/50' : 'bg-black/60 text-transparent border border-white/40'
          }">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
          </div>
        ` : ''}

        <!-- Gradient Overlay -->
        <div class="card-overlay absolute inset-0 flex flex-col justify-end p-3 sm:p-4 z-10">
          <h3 class="text-white font-serif text-xs sm:text-sm md:text-base font-semibold truncate drop-shadow-md">
            ${item.name}
          </h3>
          ${item.notes ? `<p class="text-[10px] sm:text-[11px] text-rose-100/90 italic line-clamp-1 mt-0.5">“${item.notes}”</p>` : ''}
          <div class="flex items-center justify-between text-[10px] sm:text-xs text-rose-200/80 mt-1">
            <span>${this.formatShortDate(item.createdAt)}</span>
            <div class="flex items-center gap-1">
              ${item.album ? `<span class="px-1.5 py-0.5 rounded-full bg-brand-950/70 text-[9px] text-brand-300 border border-brand-500/30 truncate max-w-[80px]">${item.album}</span>` : ''}
              <span class="capitalize px-1.5 py-0.5 rounded-full bg-black/40 text-[9px] border border-white/10">
                ${isVideo ? 'Video' : 'Foto'}
              </span>
            </div>
          </div>
        </div>

        <!-- Video Badge -->
        ${isVideo ? `
          <div class="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md p-1.5 rounded-full z-10 shadow-lg border border-white/15">
            <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white ml-[1px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        ` : ''}
      `;

      grid.appendChild(card);
    });

    this.renderPaginationUI(totalItems, totalPages, startIndex, endIndex);
  },

  renderPaginationUI(totalItems, totalPages, startIndex, endIndex) {
    const pagControls = document.getElementById('pagination-controls');
    if (totalPages <= 1) {
      pagControls.classList.add('hidden');
      return;
    }

    pagControls.classList.remove('hidden');
    document.getElementById('page-info-start').textContent = startIndex + 1;
    document.getElementById('page-info-end').textContent = endIndex;
    document.getElementById('page-info-total').textContent = totalItems;

    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const numbersContainer = document.getElementById('page-numbers');

    btnPrev.disabled = this.currentPage === 1;
    btnNext.disabled = this.currentPage === totalPages;

    numbersContainer.innerHTML = '';

    // Sliding window for page numbers (max 5 buttons)
    let startPage = Math.max(1, this.currentPage - 2);
    let endPage = Math.min(totalPages, this.currentPage + 2);

    if (this.currentPage <= 2) {
      endPage = Math.min(totalPages, 5);
    }
    if (this.currentPage >= totalPages - 1) {
      startPage = Math.max(1, totalPages - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.onclick = () => {
        this.currentPage = i;
        this.renderPaginated();
        this.scrollToGallery();
      };
      btn.className = `w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl text-xs sm:text-sm font-semibold transition-all ${
        i === this.currentPage
          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 border border-brand-500'
          : 'bg-black/40 text-slate-400 border border-white/5 hover:border-brand-500/40 hover:text-white'
      }`;
      btn.textContent = i;
      numbersContainer.appendChild(btn);
    }
  },

  changePage(delta) {
    this.currentPage += delta;
    this.renderPaginated();
    this.scrollToGallery();
  },

  scrollToGallery() {
    const el = document.getElementById('gallery-page');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  },

  resetFilters() {
    this.filterType = 'all';
    this.filterYear = '';
    this.filterDate = '';
    this.searchQuery = '';
    this.sortBy = 'newest';

    const searchInput = document.getElementById('gallerySearch');
    const yearSelect = document.getElementById('filterYear');
    const dateInput = document.getElementById('filterDate');
    const sortSelect = document.getElementById('sortSelect');

    if (searchInput) searchInput.value = '';
    if (yearSelect) yearSelect.value = '';
    if (dateInput) dateInput.value = '';
    if (sortSelect) sortSelect.value = 'newest';

    this.setTypeFilter('all');
  },

  /* ====================================================
   * BATCH SELECT & ASSIGN KE ALBUM
   * ==================================================== */
  toggleSelectMode(force) {
    if (typeof force === 'boolean') {
      this.isSelectMode = force;
    } else {
      this.isSelectMode = !this.isSelectMode;
    }

    if (!this.isSelectMode) {
      this.selectedIds.clear();
    }

    const btn = document.getElementById('btnToggleSelectMode');
    const label = document.getElementById('selectModeLabel');

    if (btn && label) {
      if (this.isSelectMode) {
        btn.classList.add('bg-brand-600', 'text-white', 'border-brand-500');
        btn.classList.remove('text-slate-300');
        label.textContent = 'Batal Pilih';
      } else {
        btn.classList.remove('bg-brand-600', 'text-white', 'border-brand-500');
        btn.classList.add('text-slate-300');
        label.textContent = 'Pilih Momen';
      }
    }

    this.updateBatchBar();
    this.renderPaginated();
  },

  toggleItemSelect(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.updateBatchBar();
    this.renderPaginated();
  },

  updateBatchBar() {
    const batchBar = document.getElementById('batchActionBar');
    const countEl = document.getElementById('batchCount');
    if (!batchBar) return;

    if (this.isSelectMode && this.selectedIds.size > 0) {
      batchBar.classList.remove('hidden');
      batchBar.classList.add('flex');
      if (countEl) countEl.textContent = this.selectedIds.size;
    } else {
      batchBar.classList.add('hidden');
      batchBar.classList.remove('flex');
    }
  },

  openAssignModal() {
    if (this.selectedIds.size === 0) {
      App.showToast('Pilih setidaknya satu momen terlebih dahulu.', 'warning');
      return;
    }

    if (window.AlbumsManager) {
      AlbumsManager.populateDropdowns();
    }

    const modal = document.getElementById('assignAlbumModal');
    const countSpan = document.getElementById('assignSelectedCount');
    if (countSpan) countSpan.textContent = this.selectedIds.size;

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeAssignModal() {
    const modal = document.getElementById('assignAlbumModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async confirmAssignAlbum() {
    const select = document.getElementById('assignTargetAlbumSelect');
    const btn = document.getElementById('confirmAssignBtn');
    const targetAlbumTitle = select ? select.value : '';

    if (!targetAlbumTitle) {
      App.showToast('Silakan pilih album tujuan.', 'warning');
      return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const targetAlbumId = selectedOption ? (selectedOption.dataset.albumId || '') : '';
    const targetYear = selectedOption ? (selectedOption.dataset.year || '') : '';
    const targetMonth = selectedOption ? (selectedOption.dataset.month || '') : '';

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('URL API belum diatur.', 'error');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
    }

    try {
      const payload = {
        action: 'assign_media_to_album',
        fileIds: Array.from(this.selectedIds),
        albumId: targetAlbumId,
        albumName: targetAlbumTitle,
        year: targetYear,
        month: targetMonth
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status === 'success') {
        App.showToast(data.message || 'Kenangan berhasil dimasukkan ke album!', 'success');
        this.closeAssignModal();
        this.toggleSelectMode(false);
        this.fetchGallery();
        if (window.AlbumsManager) AlbumsManager.fetchAlbums();
      } else {
        App.showToast(data.message || 'Gagal memasukkan ke album.', 'error');
      }
    } catch (e) {
      console.error('Assign to Album Error:', e);
      App.showToast('Gagal menghubungi server.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Masukkan ke Album';
      }
    }
  },

  /**
   * Menghapus batch momen terpilih secara permanen dari Google Drive
   */
  async deleteSelectedMedia() {
    if (this.selectedIds.size === 0) {
      App.showToast('Pilih setidaknya satu momen untuk dihapus.', 'warning');
      return;
    }

    const count = this.selectedIds.size;
    const confirmed = await App.showConfirm({
      title: 'Hapus Kenangan Terpilih?',
      message: `Hapus permanen ${count} foto/video terpilih dari Google Drive? File terkait akan dihapus secara permanen dan tidak dapat dipulihkan.`,
      confirmText: 'Ya, Hapus Semua',
      cancelText: 'Batal',
      type: 'danger'
    });
    if (!confirmed) return;

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('URL API belum diatur.', 'error');
      return;
    }

    App.showToast(`Menghapus ${count} file dari Google Drive...`, 'info');

    try {
      const fileIdsToDelete = Array.from(this.selectedIds);
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_media',
          fileIds: fileIdsToDelete
        })
      });
      const data = await res.json();

      if (data.status === 'success') {
        App.showToast(data.message || `${count} momen berhasil dihapus secara permanen.`, 'success');
        
        // Hapus dari allMedia lokal
        this.allMedia = this.allMedia.filter(m => !fileIdsToDelete.includes(m.id));
        this.toggleSelectMode(false);
        this.applyFilters();

        if (window.AlbumsManager) AlbumsManager.fetchAlbums();
        if (window.BucketListManager && BucketListManager.items) {
          BucketListManager.items.forEach(b => {
            if (fileIdsToDelete.includes(b.photoId)) {
              b.photoId = '';
              b.photoUrl = '';
            }
          });
          BucketListManager.saveToCache();
          BucketListManager.render();
        }
      } else {
        App.showToast(data.message || 'Gagal menghapus file terpilih.', 'error');
      }
    } catch (e) {
      console.error('Delete Selected Media Error:', e);
      App.showToast('Gagal menghubungi server.', 'error');
    }
  },

  formatShortDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  }
};

window.GalleryManager = GalleryManager;
