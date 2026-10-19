/**
 * ADNA Moments — Gallery Manager
 * Handles fetching, caching, dynamic filtering, search, sorting, and pagination.
 */

const GalleryManager = {
  allMedia: [],
  filteredMedia: [],
  filterType: 'all',
  filterYear: '',
  filterMonth: '',
  searchQuery: '',
  sortBy: 'newest',
  currentPage: 1,
  itemsPerPage: 16,
  isLoading: false,

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
        btn.className = 'px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-all';
      } else {
        btn.className = 'px-4 py-1.5 text-xs sm:text-sm font-medium rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-all';
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
      const month = document.getElementById('filterMonth')?.value || '';

      let query = '?type=all';
      if (year) query += `&year=${encodeURIComponent(year)}`;
      if (month) query += `&month=${encodeURIComponent(month)}`;

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
    const monthSelect = document.getElementById('filterMonth');

    this.filterYear = yearSelect ? yearSelect.value : '';
    this.filterMonth = monthSelect ? monthSelect.value : '';

    this.filteredMedia = this.allMedia.filter(item => {
      // Type match
      const matchType = this.filterType === 'all' ? true : item.type === this.filterType;

      // Year match
      const matchYear = !this.filterYear ? true : String(item.year) === String(this.filterYear);

      // Month match (supports '10' or '10 - Oktober')
      let matchMonth = true;
      if (this.filterMonth) {
        matchMonth = String(item.month || '').startsWith(this.filterMonth);
      }

      // Search query match
      let matchSearch = true;
      if (this.searchQuery) {
        const name = (item.name || '').toLowerCase();
        matchSearch = name.includes(this.searchQuery);
      }

      return matchType && matchYear && matchMonth && matchSearch;
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

      const card = document.createElement('div');
      card.className = 'media-card cursor-pointer animate-fadeInScale aspect-[3/4] sm:aspect-[4/5]';
      card.style.animationDelay = `${delay}s`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Lihat ${item.name}`);

      card.onclick = () => {
        ModalManager.open(item, globalIndex, this.filteredMedia);
      };

      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ModalManager.open(item, globalIndex, this.filteredMedia);
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

        <!-- Gradient Overlay -->
        <div class="card-overlay absolute inset-0 flex flex-col justify-end p-3 sm:p-4 z-10">
          <h3 class="text-white font-serif text-xs sm:text-sm md:text-base font-semibold truncate drop-shadow-md">
            ${item.name}
          </h3>
          <div class="flex items-center justify-between text-[10px] sm:text-xs text-rose-200/80 mt-1">
            <span>${this.formatShortDate(item.createdAt)}</span>
            <span class="capitalize px-1.5 py-0.5 rounded-full bg-black/40 text-[9px] border border-white/10">
              ${isVideo ? 'Video' : 'Foto'}
            </span>
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
    this.filterMonth = '';
    this.searchQuery = '';
    this.sortBy = 'newest';

    const searchInput = document.getElementById('gallerySearch');
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    const sortSelect = document.getElementById('sortSelect');

    if (searchInput) searchInput.value = '';
    if (yearSelect) yearSelect.value = '';
    if (monthSelect) monthSelect.value = '';
    if (sortSelect) sortSelect.value = 'newest';

    this.setTypeFilter('all');
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
