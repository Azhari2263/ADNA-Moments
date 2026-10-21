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
  filterFavorite: false,
  currentPage: 1,
  itemsPerPage: 20, // Default 20 momen per halaman untuk performa ringan
  isLoading: false,

  // Netflix-style Highlight Slideshow
  highlightItems: [],
  currentHighlightIndex: 0,
  highlightTimer: null,
  isHighlightHovered: false,

  // Batch Select Mode untuk assign ke album
  isSelectMode: false,
  selectedIds: new Set(),

  init() {
    this.populateYearOptions();
    this.bindEvents();
    this.bindHighlightEvents();
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

  toggleFavoriteFilter() {
    this.filterFavorite = !this.filterFavorite;
    this.updateFavoriteFilterUI();
    this.applyFilters();
  },

  updateFavoriteFilterUI() {
    const btn = document.getElementById('filterFavoriteBtn');
    const icon = document.getElementById('filterFavoriteIcon');
    if (!btn) return;
    if (this.filterFavorite) {
      btn.className = 'w-full sm:w-auto px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-rose-500/20 border border-rose-500/60 text-rose-200 shadow-lg shadow-rose-950/40 transition inline-flex items-center justify-center gap-1.5 active:scale-95';
      if (icon) icon.classList.add('fill-rose-500');
    } else {
      btn.className = 'w-full sm:w-auto px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl glass-input text-slate-300 hover:text-white hover:border-rose-500/50 transition inline-flex items-center justify-center gap-1.5 active:scale-95';
      if (icon) icon.classList.remove('fill-rose-500');
    }
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
        if (window.FavoritesManager) FavoritesManager.mergeFromApi(this.allMedia);
        const years = this.allMedia.map(item => item.year).filter(Boolean);
        this.populateYearOptions(years);

        this.initHighlights();
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

      // Favorite match
      let matchFavorite = true;
      if (this.filterFavorite) {
        matchFavorite = window.FavoritesManager ? FavoritesManager.isFavorite(item.id) : false;
      }

      return matchType && matchYear && matchDate && matchSearch && matchFavorite;
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
      const emptyTitle = empty.querySelector('h3');
      const emptyText = empty.querySelector('p');
      if (this.filterFavorite) {
        if (emptyTitle) emptyTitle.textContent = 'Belum Ada Momen Favorit';
        if (emptyText) emptyText.textContent = 'Kamu belum menandai foto atau video sebagai favorit. Ketuk tanda hati (❤️) pada momen apa pun untuk menjadikannya favorit.';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'Belum Ada Momen';
        if (emptyText) emptyText.textContent = 'Tidak ada foto atau video yang sesuai dengan filter ini. Mulai abadikan momen sekarang.';
      }
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
      const isFav = window.FavoritesManager ? FavoritesManager.isFavorite(item.id) : false;

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
            <span>${this.formatShortDate(item.date || item.createdAt)}</span>
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
          <div class="absolute top-2.5 ${this.isSelectMode ? 'left-10' : 'left-2.5'} bg-black/60 backdrop-blur-md p-1.5 rounded-full z-10 shadow-lg border border-white/15">
            <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white ml-[1px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        ` : ''}

        <!-- Favorite Button -->
        <button 
          type="button"
          data-fav-id="${item.id}"
          data-is-fav="${isFav ? 'true' : 'false'}"
          onclick="event.stopPropagation(); FavoritesManager.toggle('${item.id}', this);"
          class="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full backdrop-blur-md border transition-all active:scale-90 ${
            isFav 
              ? 'bg-rose-500/25 border-rose-500/50 text-rose-500 shadow-lg shadow-rose-950/50' 
              : 'bg-black/50 border-white/10 text-white/70 hover:text-rose-400 hover:bg-black/70'
          }"
          title="${isFav ? 'Hapus dari favorit' : 'Tandai favorit'}"
          aria-label="${isFav ? 'Hapus dari favorit' : 'Tandai favorit'}">
          ${isFav ? `
            <svg class="w-4 h-4 fill-rose-500 text-rose-500" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          ` : `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
            </svg>
          `}
        </button>
      `;

      grid.appendChild(card);
    });

    this.renderPaginationUI(totalItems, totalPages, startIndex, endIndex);
  },

  renderPaginationUI(totalItems, totalPages, startIndex, endIndex) {
    const pagControls = document.getElementById('pagination-controls');
    if (!pagControls) return;

    if (totalItems === 0) {
      pagControls.classList.add('hidden');
      return;
    }

    pagControls.classList.remove('hidden');

    const startEl = document.getElementById('page-info-start');
    const endEl = document.getElementById('page-info-end');
    const totalEl = document.getElementById('page-info-total');
    if (startEl) startEl.textContent = totalItems > 0 ? startIndex + 1 : 0;
    if (endEl) endEl.textContent = endIndex;
    if (totalEl) totalEl.textContent = totalItems;

    const btnFirst = document.getElementById('btn-first-page');
    const btnLast = document.getElementById('btn-last-page');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const numbersContainer = document.getElementById('page-numbers');

    if (btnFirst) btnFirst.disabled = this.currentPage <= 1;
    if (btnPrev) btnPrev.disabled = this.currentPage <= 1;
    if (btnNext) btnNext.disabled = this.currentPage >= totalPages;
    if (btnLast) btnLast.disabled = this.currentPage >= totalPages;

    if (numbersContainer) {
      numbersContainer.innerHTML = '';

      if (totalPages > 1) {
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
              ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 border border-brand-500 scale-105'
              : 'bg-black/40 text-slate-400 border border-white/5 hover:border-brand-500/40 hover:text-white'
          }`;
          btn.textContent = i;
          numbersContainer.appendChild(btn);
        }
      }
    }
  },

  changePage(delta) {
    const totalPages = Math.ceil(this.filteredMedia.length / this.itemsPerPage) || 1;
    this.currentPage = Math.max(1, Math.min(totalPages, this.currentPage + delta));
    this.renderPaginated();
    this.scrollToGallery();
  },

  goToPage(page) {
    const totalPages = Math.ceil(this.filteredMedia.length / this.itemsPerPage) || 1;
    if (page === 'last') {
      this.currentPage = totalPages;
    } else {
      this.currentPage = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
    }
    this.renderPaginated();
    this.scrollToGallery();
  },

  setItemsPerPage(count) {
    this.itemsPerPage = parseInt(count, 10) || 20;
    this.currentPage = 1;
    this.renderPaginated();
    this.scrollToGallery();
  },

  scrollToGallery() {
    const grid = document.getElementById('gallery-grid');
    if (grid) {
      const topOffset = grid.getBoundingClientRect().top + window.pageYOffset - 90;
      window.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' });
    }
  },

  /* ====================================================
   * NETFLIX-STYLE HIGHLIGHT SPOTLIGHT SLIDESHOW
   * ==================================================== */
  initHighlights() {
    if (!this.allMedia || this.allMedia.length === 0) {
      const container = document.getElementById('galleryHighlightContainer');
      if (container) container.classList.add('hidden');
      return;
    }

    const container = document.getElementById('galleryHighlightContainer');
    if (container) container.classList.remove('hidden');

    // Filter kandidat foto terbaik (utamakan tipe foto atau media dengan thumbnail valid)
    const photos = this.allMedia.filter(m => m.type === 'photo');
    const pool = photos.length >= 5 ? photos : (this.allMedia.filter(m => m.highResUrl || m.thumbnailUrl || m.type === 'photo').length > 0 ? this.allMedia.filter(m => m.highResUrl || m.thumbnailUrl || m.type === 'photo') : this.allMedia);

    if (pool.length === 0) {
      if (container) container.classList.add('hidden');
      return;
    }

    // Prioritaskan foto dengan catatan kenangan agar tampilan spotlight kaya cerita
    const withNotes = pool.filter(m => m.notes && m.notes.trim());
    const withoutNotes = pool.filter(m => !m.notes || !m.notes.trim());

    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

    // Ambil foto ber-catatan lebih dulu, lalu penuhi sisa slot dari foto lain hingga target 5 foto
    const targetCount = Math.min(5, pool.length);
    const combined = [...shuffle(withNotes), ...shuffle(withoutNotes)];

    // Hilangkan kemungkinan duplikasi ID
    const uniquePool = [];
    const seenIds = new Set();
    for (const item of combined) {
      if (item && item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniquePool.push(item);
      }
    }

    // Ambil tepat targetCount (5 foto jika total foto >= 5) lalu acak urutan tampilnya
    this.highlightItems = shuffle(uniquePool.slice(0, targetCount));
    this.currentHighlightIndex = 0;

    this.renderHighlightSlide(0);
    this.renderHighlightIndicators();
    this.startHighlightTimer();
  },

  renderHighlightSlide(index) {
    if (!this.highlightItems || this.highlightItems.length === 0) return;
    if (index < 0) index = this.highlightItems.length - 1;
    if (index >= this.highlightItems.length) index = 0;
    this.currentHighlightIndex = index;

    const item = this.highlightItems[index];
    const wrapper = document.getElementById('highlightSlidesWrapper');
    const titleEl = document.getElementById('highlightTitle');
    const notesEl = document.getElementById('highlightNotes');
    const albumEl = document.getElementById('highlightAlbumBadge');
    const dateEl = document.getElementById('highlightDate');
    const counterEl = document.getElementById('highlightCounter');

    if (counterEl) {
      counterEl.textContent = `${index + 1} / ${this.highlightItems.length}`;
    }

    if (titleEl) {
      titleEl.textContent = item.name || 'Kenangan Terindah';
    }

    if (notesEl) {
      if (item.notes && item.notes.trim()) {
        notesEl.textContent = `“${item.notes}”`;
        notesEl.classList.remove('hidden');
      } else {
        notesEl.textContent = '';
        notesEl.classList.add('hidden');
      }
    }

    if (albumEl) {
      if (item.album) {
        albumEl.textContent = item.album;
        albumEl.classList.remove('hidden');
      } else {
        albumEl.classList.add('hidden');
      }
    }

    if (dateEl) {
      dateEl.textContent = this.formatShortDate(item.date || item.createdAt);
    }

    if (wrapper) {
      const imgUrl = item.highResUrl || item.thumbnailUrl || (item.id ? `https://drive.google.com/thumbnail?id=${item.id}&sz=w2000` : '');
      
      const newSlide = document.createElement('div');
      newSlide.className = 'absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-1000 ease-in-out opacity-0 highlight-slide-bg';
      newSlide.style.backgroundImage = `url("${imgUrl}")`;

      wrapper.appendChild(newSlide);

      requestAnimationFrame(() => {
        newSlide.classList.remove('opacity-0');
        newSlide.classList.add('opacity-100');
      });

      const oldSlides = wrapper.querySelectorAll('.highlight-slide-bg');
      if (oldSlides.length > 1) {
        setTimeout(() => {
          oldSlides.forEach((s, idx) => {
            if (idx < oldSlides.length - 1) s.remove();
          });
        }, 1100);
      }
    }

    this.updateHighlightIndicators();
  },

  nextHighlightSlide() {
    if (!this.highlightItems || this.highlightItems.length <= 1) return;
    const nextIdx = (this.currentHighlightIndex + 1) % this.highlightItems.length;
    this.renderHighlightSlide(nextIdx);
    this.startHighlightTimer();
  },

  prevHighlightSlide() {
    if (!this.highlightItems || this.highlightItems.length <= 1) return;
    const prevIdx = (this.currentHighlightIndex - 1 + this.highlightItems.length) % this.highlightItems.length;
    this.renderHighlightSlide(prevIdx);
    this.startHighlightTimer();
  },

  openCurrentHighlight() {
    const item = this.highlightItems[this.currentHighlightIndex];
    if (!item) return;
    const globalIndex = this.allMedia.findIndex(m => m.id === item.id);
    ModalManager.open(item, globalIndex !== -1 ? globalIndex : 0, this.allMedia);
  },

  renderHighlightIndicators() {
    const container = document.getElementById('highlightIndicators');
    if (!container) return;
    container.innerHTML = '';

    this.highlightItems.forEach((_, idx) => {
      const bar = document.createElement('div');
      bar.className = `highlight-bar ${idx === this.currentHighlightIndex ? 'active' : ''}`;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', `Lihat sorotan ${idx + 1}`);
      bar.innerHTML = '<div class="highlight-bar-fill"></div>';
      bar.onclick = (e) => {
        e.stopPropagation();
        this.renderHighlightSlide(idx);
        this.startHighlightTimer();
      };
      container.appendChild(bar);
    });
  },

  updateHighlightIndicators() {
    const container = document.getElementById('highlightIndicators');
    if (!container) return;
    const bars = container.querySelectorAll('.highlight-bar');
    bars.forEach((bar, idx) => {
      if (idx === this.currentHighlightIndex) {
        bar.classList.add('active');
        const fill = bar.querySelector('.highlight-bar-fill');
        if (fill) {
          fill.style.animation = 'none';
          void fill.offsetWidth;
          fill.style.animation = '';
        }
      } else {
        bar.classList.remove('active');
      }
    });
  },

  startHighlightTimer() {
    this.stopHighlightTimer();
    if (!this.highlightItems || this.highlightItems.length <= 1) return;

    this.highlightTimer = setInterval(() => {
      if (!this.isHighlightHovered) {
        this.nextHighlightSlide();
      }
    }, 5000); // Berganti otomatis setiap 5 detik
  },

  stopHighlightTimer() {
    if (this.highlightTimer) {
      clearInterval(this.highlightTimer);
      this.highlightTimer = null;
    }
  },

  bindHighlightEvents() {
    const container = document.getElementById('galleryHighlightContainer');
    if (!container || container.dataset.eventsBound) return;
    container.dataset.eventsBound = 'true';

    // Jeda otomatis saat kursor berada di atas slideshow
    container.addEventListener('mouseenter', () => {
      this.isHighlightHovered = true;
    });

    container.addEventListener('mouseleave', () => {
      this.isHighlightHovered = false;
    });

    // Dukungan Touch Swipe untuk perangkat mobile
    let touchStartX = 0;
    container.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const diff = touchEndX - touchStartX;
      if (diff > 45) {
        this.prevHighlightSlide();
      } else if (diff < -45) {
        this.nextHighlightSlide();
      }
    }, { passive: true });
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

    this.filterFavorite = false;
    this.updateFavoriteFilterUI();

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
