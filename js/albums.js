/**
 * ============================================================================
 * ADNA MOMENTS — ALBUMS MANAGER v2.5
 * ============================================================================
 * Mengelola album dalam hierarki: ADNA Moments / [Tahun] / [Bulan] / [Nama Album]
 * Mendukung:
 * 1. Pembuatan album baru berdasarkan Tahun & Bulan tertentu.
 * 2. Memilih foto/video dari galeri yang sudah ada untuk dimasukkan ke album.
 * 3. Mengunggah file baru langsung ke dalam album yang baru dibuat.
 * 4. Buka album dan melihat detail kenangan di dalamnya.
 * ============================================================================
 */

const AlbumsManager = {
  allAlbums: [],
  currentAlbum: null,
  currentAlbumMedia: [],
  isLoading: false,

  // State untuk Pemilih Foto di Modal Buat Album
  selectedGalleryIds: new Set(),
  newFilesToUpload: [],
  activePickerTab: 'gallery', // 'gallery' | 'upload'

  init() {
    this.bindEvents();
    this.fetchAlbums();
  },

  bindEvents() {
    // Search album input
    const searchInput = document.getElementById('albumSearchInput');
    if (searchInput) {
      let debounceTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          this.applyCombinedFilter();
        }, 200);
      });
    }

    const dateFilter = document.getElementById('albumFilterDate');
    if (dateFilter) {
      dateFilter.addEventListener('change', () => {
        this.applyCombinedFilter();
      });
    }
  },

  applyDateFilter() {
    this.applyCombinedFilter();
  },

  applyCombinedFilter() {
    const searchVal = (document.getElementById('albumSearchInput')?.value || '').trim().toLowerCase();
    const dateVal = document.getElementById('albumFilterDate')?.value || '';

    const filtered = this.allAlbums.filter(a => {
      let matchQuery = true;
      if (searchVal) {
        matchQuery = (a.title && a.title.toLowerCase().includes(searchVal)) ||
                     (a.description && a.description.toLowerCase().includes(searchVal)) ||
                     (a.year && String(a.year).includes(searchVal)) ||
                     (a.month && String(a.month).toLowerCase().includes(searchVal));
      }

      let matchDate = true;
      if (dateVal) {
        const aDate = a.date || (a.createdAt ? a.createdAt.split('T')[0] : '');
        const [filterY, filterM] = dateVal.split('-');
        matchDate = (aDate === dateVal) || (String(a.year) === filterY && String(a.month || '').startsWith(filterM));
      }

      return matchQuery && matchDate;
    });

    this.renderAlbums(filtered);
  },

  /**
   * Mengambil daftar seluruh album dari Google Apps Script
   */
  async fetchAlbums() {
    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) return;

    const grid = document.getElementById('albums-grid');
    const loading = document.getElementById('albums-loading');
    const empty = document.getElementById('albums-empty');

    if (loading) loading.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (grid) grid.innerHTML = '';

    try {
      this.isLoading = true;
      const response = await fetch(apiUrl + '?action=albums');
      const result = await response.json();

      if (result.status === 'success') {
        this.allAlbums = result.data || [];
        this.renderAlbums(this.allAlbums);
        this.populateDropdowns();
      } else {
        App.showToast(result.message || 'Gagal memuat album.', 'error');
        if (empty) empty.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Fetch Albums Error:', error);
      if (empty) empty.classList.remove('hidden');
    } finally {
      this.isLoading = false;
      if (loading) loading.classList.add('hidden');
    }
  },

  /**
   * Render kartu-kartu album pada halaman Album
   */
  renderAlbums(albumsToRender) {
    const grid = document.getElementById('albums-grid');
    const empty = document.getElementById('albums-empty');
    if (!grid) return;

    grid.innerHTML = '';

    if (!albumsToRender || albumsToRender.length === 0) {
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    albumsToRender.forEach((album, index) => {
      const delay = (index % 6) * 0.05;
      const card = document.createElement('div');
      card.className = 'album-card cursor-pointer group rounded-3xl overflow-hidden glass-panel glass-panel-hover animate-fadeInScale flex flex-col';
      card.style.animationDelay = `${delay}s`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      card.onclick = () => this.openAlbumDetail(album);
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openAlbumDetail(album);
        }
      };

      const coverSrc = album.coverUrl || 'icons/icon-512.png';
      const momentDate = album.date ? this.formatDate(album.date) : this.formatDate(album.createdAt);
      const timeBadge = album.date ? this.formatDate(album.date) : (album.year ? `${album.year} • ${album.month || ''}` : momentDate);

      card.innerHTML = `
        <div class="relative w-full aspect-[4/3] overflow-hidden bg-black/60">
          <img 
            src="${coverSrc}" 
            alt="${album.title}" 
            loading="lazy" 
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            onerror="this.onerror=null; this.src='icons/icon-512.png'"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-[#09060a] via-black/30 to-transparent"></div>
          
          <!-- Tombol Hapus Album di Kartu -->
          <div class="absolute top-3 left-3 z-20">
            <button 
              type="button" 
              onclick="event.stopPropagation(); AlbumsManager.deleteAlbum('${album.id}', '${album.title.replace(/'/g, "\\'")}')" 
              class="p-2 rounded-full bg-black/60 hover:bg-rose-600 text-rose-300 hover:text-white backdrop-blur-md transition border border-white/10 shadow-lg" 
              title="Hapus Album '${album.title}' secara permanen">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>

          <!-- Badges -->
          <div class="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[11px] text-rose-200">
            <svg class="w-3.5 h-3.5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span class="font-semibold">${album.totalCount || 0} Kenangan</span>
          </div>

          <!-- Timeline Location Badge -->
          <div class="absolute bottom-3 left-3 bg-brand-950/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-brand-500/30 text-[10px] text-brand-300 font-semibold">
            ${timeBadge}
          </div>
        </div>

        <div class="p-5 flex-1 flex flex-col justify-between">
          <div>
            <h3 class="font-serif font-bold text-base sm:text-lg text-white group-hover:text-brand-300 transition-colors line-clamp-1 mb-1.5">
              ${album.title}
            </h3>
            <p class="text-xs text-rose-100/70 line-clamp-2 leading-relaxed">
              ${album.description ? `“${album.description}”` : 'Belum ada catatan pembuka untuk album ini.'}
            </p>
          </div>

          <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Tanggal Momen: <strong class="text-rose-200 font-medium">${momentDate}</strong></span>
            <span class="text-brand-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              Buka <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </span>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });
  },

  filterAlbums(query) {
    this.applyCombinedFilter();
  },

  /**
   * Buka Halaman Detail Album
   */
  async openAlbumDetail(album) {
    this.currentAlbum = album;
    App.switchPage('album-detail');

    const titleEl = document.getElementById('detailAlbumTitle');
    const descEl = document.getElementById('detailAlbumDesc');
    const dateEl = document.getElementById('detailAlbumDate');
    const countEl = document.getElementById('detailAlbumCount');
    const coverBackdrop = document.getElementById('detailAlbumBackdrop');

    if (titleEl) titleEl.textContent = album.title;
    if (descEl) descEl.textContent = album.description ? `“${album.description}”` : 'Belum ada catatan pengantar untuk album ini.';
    if (dateEl) {
      const loc = album.date ? `Tanggal Momen: ${this.formatDate(album.date)}` : (album.year ? `${album.year} • ${album.month || ''}` : this.formatDate(album.createdAt));
      dateEl.textContent = loc;
    }
    if (countEl) countEl.textContent = `${album.totalCount || 0} Momen Tersimpan`;

    if (coverBackdrop) {
      coverBackdrop.style.backgroundImage = album.coverUrl ? `url('${album.coverUrl}')` : '';
    }

    await this.fetchAlbumMedia(album);
  },

  /**
   * Mengambil seluruh foto/video di dalam album yang sedang dibuka
   */
  async fetchAlbumMedia(album) {
    const apiUrl = App.getApiUrl();
    const grid = document.getElementById('detailAlbumGrid');
    const loading = document.getElementById('detailAlbumLoading');
    const empty = document.getElementById('detailAlbumEmpty');

    if (loading) loading.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (grid) grid.innerHTML = '';

    try {
      const queryParam = album.id ? `?albumId=${encodeURIComponent(album.id)}` : `?album=${encodeURIComponent(album.title)}`;
      const response = await fetch(apiUrl + queryParam);
      const result = await response.json();

      if (result.status === 'success') {
        this.currentAlbumMedia = result.data || [];
        this.renderAlbumMedia(this.currentAlbumMedia);
        
        // Update album counter
        const countEl = document.getElementById('detailAlbumCount');
        if (countEl) countEl.textContent = `${this.currentAlbumMedia.length} Momen Tersimpan`;
      } else {
        App.showToast(result.message || 'Gagal memuat isi album.', 'error');
        if (empty) empty.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Fetch album media error:', err);
      if (empty) empty.classList.remove('hidden');
    } finally {
      if (loading) loading.classList.add('hidden');
    }
  },

  /**
   * Render foto/video di dalam halaman detail album
   */
  renderAlbumMedia(mediaList) {
    const grid = document.getElementById('detailAlbumGrid');
    const empty = document.getElementById('detailAlbumEmpty');
    if (!grid) return;

    grid.innerHTML = '';

    if (!mediaList || mediaList.length === 0) {
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    mediaList.forEach((item, index) => {
      const isVideo = item.type === 'video';
      const delay = (index % 8) * 0.04;

      const card = document.createElement('div');
      card.className = 'media-card cursor-pointer animate-fadeInScale aspect-[3/4] sm:aspect-[4/5]';
      card.style.animationDelay = `${delay}s`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      card.onclick = () => {
        ModalManager.open(item, index, this.currentAlbumMedia);
      };

      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ModalManager.open(item, index, this.currentAlbumMedia);
        }
      };

      const thumbUrl = item.thumbnailUrl || 'icons/icon-512.png';
      const notePreview = item.notes ? `<p class="text-[11px] text-rose-100/90 italic line-clamp-1 mt-0.5">“${item.notes}”</p>` : '';

      card.innerHTML = `
        <img 
          src="${thumbUrl}" 
          alt="${item.name}" 
          loading="lazy" 
          class="w-full h-full object-cover transition-transform duration-700 ease-out"
          onerror="this.onerror=null; this.src='icons/icon-512.png'"
        />

        <div class="card-overlay absolute inset-0 flex flex-col justify-end p-3 sm:p-4 z-10">
          <h3 class="text-white font-serif text-xs sm:text-sm md:text-base font-semibold truncate drop-shadow-md">
            ${item.name}
          </h3>
          ${notePreview}
          <div class="flex items-center justify-between text-[10px] sm:text-xs text-rose-200/80 mt-1.5">
            <span>${GalleryManager.formatShortDate(item.date || item.createdAt)}</span>
            <span class="capitalize px-1.5 py-0.5 rounded-full bg-black/40 text-[9px] border border-white/10">
              ${isVideo ? 'Video' : 'Foto'}
            </span>
          </div>
        </div>

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
  },

  /**
   * Modal Pembuatan Album Baru (dengan Pemilih Foto Galeri & Upload Baru)
   */
  openCreateModal(defaultDate = null, defaultTitle = null) {
    const modal = document.getElementById('albumFormModal');
    const modalTitle = document.getElementById('albumModalHeading');
    const titleInput = document.getElementById('albumTitleInput');
    const descInput = document.getElementById('albumDescInput');
    const editModeInput = document.getElementById('albumIsEditMode');
    const timelineSection = document.getElementById('albumTimelineSelects');
    const yearMonthRow = document.getElementById('albumYearMonthRow');
    const mediaPickerSection = document.getElementById('albumMediaPickerSection');
    const deleteBtn = document.getElementById('deleteAlbumInEditBtn');

    if (modalTitle) modalTitle.textContent = 'Buat Album Kenangan Baru';
    if (editModeInput) editModeInput.value = 'create';
    if (titleInput) titleInput.value = defaultTitle || '';
    if (descInput) descInput.value = '';

    // Reset pilihan foto
    this.selectedGalleryIds.clear();
    this.newFilesToUpload = [];
    this.updatePickerBadge();

    // Tampilkan pemilihan timeline & media picker di mode create
    const syncDatesContainer = document.getElementById('albumSyncDatesContainer');
    const syncDatesCheckbox = document.getElementById('albumSyncDatesCheckbox');
    if (syncDatesContainer) syncDatesContainer.classList.add('hidden');
    if (syncDatesCheckbox) syncDatesCheckbox.checked = false;

    if (timelineSection) timelineSection.classList.remove('hidden');
    if (yearMonthRow) yearMonthRow.classList.remove('hidden');
    if (mediaPickerSection) mediaPickerSection.classList.remove('hidden');
    if (deleteBtn) deleteBtn.classList.add('hidden');

    this.populateTimelineSelects(defaultDate);
    this.switchPickerTab('gallery');
    this.renderPickerGallery();

    const newFilesQueue = document.getElementById('albumNewFilesQueue');
    if (newFilesQueue) newFilesQueue.innerHTML = '';

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  /**
   * Mengisi pilihan Tanggal Momen, Tahun & Bulan untuk folder album
   */
  populateTimelineSelects(defaultDate = null) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = `${curYear}-${curMonth}-${String(now.getDate()).padStart(2, '0')}`;
    const initialDate = defaultDate || todayStr;

    const dateInput = document.getElementById('albumDateInput');
    const yearSelect = document.getElementById('albumYearInput');
    const monthSelect = document.getElementById('albumMonthInput');

    if (dateInput) {
      dateInput.value = initialDate;
      dateInput.onchange = () => {
        const val = dateInput.value;
        if (val) {
          const [y, m] = val.split('-');
          if (yearSelect) yearSelect.value = y;
          if (monthSelect) monthSelect.value = m;
        }
      };
    }

    if (yearSelect) {
      yearSelect.innerHTML = '';
      for (let y = curYear + 1; y >= curYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        if (y === curYear) opt.selected = true;
        yearSelect.appendChild(opt);
      }
    }

    if (initialDate) {
      const parts = initialDate.split('-');
      if (parts.length >= 2) {
        if (yearSelect) yearSelect.value = parts[0];
        if (monthSelect) monthSelect.value = parts[1];
      }
    } else if (monthSelect) {
      monthSelect.value = curMonth;
    }
  },

  /**
   * Switch antara tab "Pilih dari Galeri" vs "Unggah Foto Baru" di modal
   */
  switchPickerTab(tab) {
    this.activePickerTab = tab;
    const btnGallery = document.getElementById('pickerTabGalleryBtn');
    const btnUpload = document.getElementById('pickerTabUploadBtn');
    const secGallery = document.getElementById('pickerGalleryContainer');
    const secUpload = document.getElementById('pickerUploadContainer');

    if (tab === 'gallery') {
      if (btnGallery) btnGallery.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white transition';
      if (btnUpload) btnUpload.className = 'flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition';
      if (secGallery) secGallery.classList.remove('hidden');
      if (secUpload) secUpload.classList.add('hidden');
    } else {
      if (btnUpload) btnUpload.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white transition';
      if (btnGallery) btnGallery.className = 'flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition';
      if (secUpload) secUpload.classList.remove('hidden');
      if (secGallery) secGallery.classList.add('hidden');
    }
  },

  /**
   * Render grid foto yang sudah ada di galeri untuk dipilih masuk album
   */
  renderPickerGallery() {
    const grid = document.getElementById('pickerGalleryGrid');
    const emptyEl = document.getElementById('pickerGalleryEmpty');
    if (!grid) return;

    grid.innerHTML = '';

    const allMedia = (window.GalleryManager && GalleryManager.allMedia) ? GalleryManager.allMedia : [];

    if (!allMedia.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    allMedia.forEach(item => {
      const isSelected = this.selectedGalleryIds.has(item.id);
      const isVideo = item.type === 'video';

      const thumbItem = document.createElement('div');
      thumbItem.className = `relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${
        isSelected ? 'border-brand-500 scale-[0.96] ring-2 ring-brand-500/50' : 'border-white/10 opacity-75 hover:opacity-100 hover:border-white/30'
      }`;

      thumbItem.onclick = () => this.togglePickerItem(item.id, thumbItem);

      thumbItem.innerHTML = `
        <img src="${item.thumbnailUrl || 'icons/icon-512.png'}" alt="${item.name}" class="w-full h-full object-cover" />
        
        <!-- Selection Checkbox Badge -->
        <div class="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
          isSelected ? 'bg-brand-500 text-white' : 'bg-black/50 text-transparent border border-white/30'
        }">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
        </div>

        <div class="absolute bottom-0 inset-x-0 p-1 bg-gradient-to-t from-black/90 to-transparent">
          <p class="text-[9px] text-white truncate">${item.name}</p>
        </div>
      `;

      grid.appendChild(thumbItem);
    });
  },

  togglePickerItem(fileId, element) {
    if (this.selectedGalleryIds.has(fileId)) {
      this.selectedGalleryIds.delete(fileId);
    } else {
      this.selectedGalleryIds.add(fileId);
    }
    this.updatePickerBadge();
    this.renderPickerGallery();
  },

  handleNewFilesSelected(files) {
    if (!files || !files.length) return;
    this.newFilesToUpload = Array.from(files);
    this.updatePickerBadge();

    const queueEl = document.getElementById('albumNewFilesQueue');
    if (!queueEl) return;

    queueEl.innerHTML = '';
    this.newFilesToUpload.forEach(f => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between text-[11px] p-2 rounded-xl bg-black/40 border border-white/5 text-slate-300';
      item.innerHTML = `
        <span class="truncate max-w-[200px] text-white">${f.name}</span>
        <span class="text-rose-300 font-semibold">${UploadManager.formatFileSize(f.size)}</span>
      `;
      queueEl.appendChild(item);
    });
  },

  updatePickerBadge() {
    const badge = document.getElementById('albumSelectedCountBadge');
    if (!badge) return;

    const fromGallery = this.selectedGalleryIds.size;
    const newFiles = this.newFilesToUpload.length;

    let text = `${fromGallery} dari Galeri`;
    if (newFiles > 0) {
      text += ` + ${newFiles} Baru`;
    }
    badge.textContent = text;
  },

  /**
   * Modal Edit Album
   */
  openEditModal() {
    if (!this.currentAlbum) return;

    const modal = document.getElementById('albumFormModal');
    const modalTitle = document.getElementById('albumModalHeading');
    const titleInput = document.getElementById('albumTitleInput');
    const descInput = document.getElementById('albumDescInput');
    const editModeInput = document.getElementById('albumIsEditMode');
    const timelineSection = document.getElementById('albumTimelineSelects');
    const yearMonthRow = document.getElementById('albumYearMonthRow');
    const mediaPickerSection = document.getElementById('albumMediaPickerSection');
    const deleteBtn = document.getElementById('deleteAlbumInEditBtn');
    const dateInput = document.getElementById('albumDateInput');

    if (modalTitle) modalTitle.textContent = 'Edit Informasi Album';
    if (editModeInput) editModeInput.value = 'edit';
    if (titleInput) titleInput.value = this.currentAlbum.title || '';
    if (descInput) descInput.value = this.currentAlbum.description || '';

    // Tanggal Momen tetap dapat diatur saat edit album
    const curDate = this.currentAlbum.date || (this.currentAlbum.createdAt ? this.currentAlbum.createdAt.split('T')[0] : '');
    if (dateInput) dateInput.value = curDate;

    // Tampilkan opsi samakan tanggal momen foto di mode edit
    const editSyncContainer = document.getElementById('albumSyncDatesContainer');
    const editSyncCheckbox = document.getElementById('albumSyncDatesCheckbox');
    if (editSyncContainer) editSyncContainer.classList.remove('hidden');
    if (editSyncCheckbox) editSyncCheckbox.checked = false;

    // Tampilkan bagian tanggal momen tetapi sembunyikan pemilihan folder tahun/bulan dan media picker saat edit info
    if (timelineSection) timelineSection.classList.remove('hidden');
    if (yearMonthRow) yearMonthRow.classList.add('hidden');
    if (mediaPickerSection) mediaPickerSection.classList.add('hidden');
    if (deleteBtn) deleteBtn.classList.remove('hidden');

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeModal() {
    const modal = document.getElementById('albumFormModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  /**
   * Simpan Album (Buat baru atau Edit)
   */
  async saveAlbum() {
    const titleInput = document.getElementById('albumTitleInput');
    const descInput = document.getElementById('albumDescInput');
    const yearSelect = document.getElementById('albumYearInput');
    const monthSelect = document.getElementById('albumMonthInput');
    const editModeInput = document.getElementById('albumIsEditMode');
    const saveBtn = document.getElementById('saveAlbumBtn');

    const title = titleInput ? titleInput.value.trim() : '';
    const desc = descInput ? descInput.value.trim() : '';
    const dateInput = document.getElementById('albumDateInput');
    const dateVal = dateInput ? dateInput.value : '';
    let year = yearSelect ? yearSelect.value : '';
    let month = monthSelect ? monthSelect.value : '';
    if (dateVal) {
      const parts = dateVal.split('-');
      if (parts.length >= 2) {
        year = year || parts[0];
        month = month || parts[1];
      }
    }
    year = year || String(new Date().getFullYear());
    month = month || String(new Date().getMonth() + 1).padStart(2, '0');
    const isEdit = editModeInput && editModeInput.value === 'edit';

    if (!title) {
      App.showToast('Nama album tidak boleh kosong.', 'warning');
      return;
    }

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('URL API belum diatur.', 'error');
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Menyimpan...';
    }

    try {
      const selectedIds = Array.from(this.selectedGalleryIds);

      const syncCheckbox = document.getElementById('albumSyncDatesCheckbox');
      const syncMediaDates = (isEdit && syncCheckbox) ? syncCheckbox.checked : false;

      const payload = isEdit ? {
        action: 'update_album',
        albumId: this.currentAlbum ? this.currentAlbum.id : '',
        title: title,
        date: dateVal,
        description: desc,
        syncMediaDates: syncMediaDates
      } : {
        action: 'create_album',
        title: title,
        date: dateVal,
        year: year,
        month: month,
        description: desc,
        selectedFileIds: selectedIds
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status === 'success') {
        App.showToast(data.message || 'Album berhasil disimpan!', 'success');
        this.closeModal();

        const createdData = data.data;
        const createdId = createdData ? createdData.id : '';
        const createdTitle = createdData ? createdData.title : title;

        // Segera sinkronkan daftar album agar dropdown mengenali album baru
        await this.fetchAlbums();
        if (window.GalleryManager) GalleryManager.fetchGallery();

        // Pilih album yang baru dibuat pada form Unggah
        const uploadAlbumSelect = document.getElementById('uploadAlbum');
        if (uploadAlbumSelect && createdTitle) {
          uploadAlbumSelect.value = createdTitle;
        }

        // Jika ada file baru yang dipilih di modal album, masukkan langsung dengan target album yang tepat
        if (this.newFilesToUpload.length > 0) {
          App.showToast(`Mengunggah ${this.newFilesToUpload.length} foto baru ke album...`, 'info');
          UploadManager.handleFiles(this.newFilesToUpload, { id: createdId, title: createdTitle });
          this.newFilesToUpload = [];
        }

        // Jika sedang di detail album, perbarui tampilan detail
        if (isEdit && this.currentAlbum) {
          this.currentAlbum.title = title;
          this.currentAlbum.description = desc;
          this.currentAlbum.date = dateVal;
          const detailTitle = document.getElementById('detailAlbumTitle');
          const detailDesc = document.getElementById('detailAlbumDesc');
          const detailDate = document.getElementById('detailAlbumDate');
          if (detailTitle) detailTitle.textContent = title;
          if (detailDesc) detailDesc.textContent = desc ? `“${desc}”` : '';
          if (detailDate) {
            detailDate.textContent = dateVal ? `Tanggal Momen: ${this.formatDate(dateVal)}` : (this.currentAlbum.year ? `${this.currentAlbum.year} • ${this.currentAlbum.month || ''}` : this.formatDate(this.currentAlbum.createdAt));
          }
          if (syncMediaDates) {
            await this.fetchAlbumMedia(this.currentAlbum);
          }
        }
      } else {
        App.showToast(data.message || 'Gagal menyimpan album.', 'error');
      }
    } catch (e) {
      console.error('Save Album Error:', e);
      App.showToast('Gagal menghubungi server.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan Album';
      }
    }
  },

  /**
   * Buka Halaman Upload dan otomatis pilih album saat ini
   */
  openUploadForCurrentAlbum() {
    if (!this.currentAlbum) {
      App.switchPage('upload');
      return;
    }
    const albumTitle = this.currentAlbum.title;
    App.switchPage('upload');
    setTimeout(() => {
      const uploadAlbumSelect = document.getElementById('uploadAlbum');
      if (uploadAlbumSelect) {
        uploadAlbumSelect.value = albumTitle;
      }
    }, 50);
  },

  /**
   * Menyamakan tanggal momen seluruh foto/video di album saat ini dengan tanggal momen albumnya
   */
  async syncAlbumDateToAllMedia() {
    if (!this.currentAlbum) {
      App.showToast('Buka salah satu album terlebih dahulu.', 'warning');
      return;
    }

    const album = this.currentAlbum;
    const albumDate = album.date || (album.createdAt ? album.createdAt.split('T')[0] : '');

    if (!albumDate) {
      App.showToast('Album ini belum memiliki tanggal momen. Silakan atur tanggal momen album terlebih dahulu melalui menu Edit Album.', 'warning');
      return;
    }

    const formattedDate = this.formatDate(albumDate);
    const mediaCount = this.currentAlbumMedia ? this.currentAlbumMedia.length : 0;

    const confirmed = await App.showConfirm({
      title: 'Samakan Tanggal Momen Foto?',
      message: `Ubah tanggal momen ${mediaCount > 0 ? mediaCount + ' ' : ''}foto dan video di dalam album "${album.title}" menjadi "${formattedDate}" (${albumDate}) mengikuti tanggal momen album?`,
      confirmText: 'Ya, Samakan Tanggal',
      cancelText: 'Batal',
      type: 'info'
    });
    if (!confirmed) return;

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('URL API belum diatur.', 'error');
      return;
    }

    App.showToast('Menyamakan tanggal momen foto & video di album...', 'info');

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync_album_date_to_media',
          albumId: album.id,
          date: albumDate
        })
      });
      const data = await res.json();

      if (data.status === 'success') {
        App.showToast(data.message || 'Tanggal momen seluruh foto berhasil disamakan!', 'success');

        // Segera perbarui data isi album & galeri
        await this.fetchAlbumMedia(album);
        if (window.GalleryManager) GalleryManager.fetchGallery();
      } else {
        App.showToast(data.message || 'Gagal menyamakan tanggal momen foto.', 'error');
      }
    } catch (err) {
      console.error('Sync album date error:', err);
      App.showToast('Gagal menghubungi server Google Drive.', 'error');
    }
  },

  /**
   * Menghapus album beserta seluruh isinya secara permanen dari Google Drive
   */
  async deleteAlbum(albumId = null, albumTitle = null) {
    const targetAlbum = albumId ? this.allAlbums.find(a => a.id === albumId) : this.currentAlbum;
    const id = albumId || (targetAlbum ? targetAlbum.id : null);
    const title = albumTitle || (targetAlbum ? targetAlbum.title : 'Album Kenangan');

    if (!id) {
      App.showToast('ID Album tidak ditemukan.', 'error');
      return;
    }

    const confirmed = await App.showConfirm({
      title: 'Hapus Album Kenangan?',
      message: `Hapus album "${title}" secara permanen dari Google Drive? Seluruh foto dan video di dalam folder album ini juga akan dihapus secara permanen dan tidak dapat dipulihkan.`,
      confirmText: 'Ya, Hapus Album',
      cancelText: 'Batal',
      type: 'danger'
    });
    if (!confirmed) return;

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('URL API belum diatur.', 'error');
      return;
    }

    App.showToast(`Menghapus album "${title}" dari Google Drive...`, 'info');

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_album',
          albumId: id
        })
      });
      const data = await res.json();

      if (data.status === 'success') {
        App.showToast(data.message || `Album "${title}" berhasil dihapus permanen dari Google Drive.`, 'success');
        
        this.closeModal();

        // Hapus dari allAlbums lokal
        this.allAlbums = this.allAlbums.filter(a => a.id !== id);

        // Jika sedang membuka album yang dihapus di halaman detail, kembalikan ke halaman daftar album
        if (this.currentAlbum && this.currentAlbum.id === id) {
          this.currentAlbum = null;
          this.currentAlbumMedia = [];
          App.switchPage('albums');
        }

        await this.fetchAlbums();
        if (window.GalleryManager) GalleryManager.fetchGallery();
        if (window.BucketListManager) BucketListManager.fetchFromCloud();
      } else {
        App.showToast(data.message || 'Gagal menghapus album dari Google Drive.', 'error');
      }
    } catch (e) {
      console.error('Delete Album Error:', e);
      App.showToast('Gagal menghubungi server Google Drive.', 'error');
    }
  },

  /**
   * Mengisi dropdown album di form Unggah, form Edit Media, dan Modal Assign Batch
   */
  populateDropdowns() {
    const uploadSelect = document.getElementById('uploadAlbum');
    const editSelect = document.getElementById('editMediaAlbumSelect');
    const assignSelect = document.getElementById('assignTargetAlbumSelect');

    const updateSelect = (selectEl, defaultLabel) => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = `<option value="">${defaultLabel}</option>`;

      this.allAlbums.forEach(album => {
        const opt = document.createElement('option');
        opt.value = album.title;
        opt.dataset.albumId = album.id;
        opt.dataset.year = album.year || '';
        opt.dataset.month = album.month || '';
        const timeInfo = album.year ? ` (${album.year})` : '';
        opt.textContent = `${album.title}${timeInfo}`;
        selectEl.appendChild(opt);
      });

      if (currentVal) selectEl.value = currentVal;
    };

    updateSelect(uploadSelect, 'Tanpa Album (Galeri Umum)');
    updateSelect(editSelect, 'Tidak Masuk Album / Galeri Umum');
    updateSelect(assignSelect, '-- Pilih Album Tujuan --');
  },

  /* ====================================================
   * NOMOR 6: BUKU KENANGAN DIGITAL (PHOTOBOOK / SCRAPBOOK PDF)
   * ==================================================== */
  openPhotobookModal() {
    if (!this.currentAlbum) {
      App.showToast('Buka salah satu album terlebih dahulu.', 'warning');
      return;
    }

    const modal = document.getElementById('photobookModal');
    const container = document.getElementById('photobookPrintContainer');
    if (!modal || !container) return;

    this.renderPhotobook(container);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
  },

  closePhotobookModal() {
    const modal = document.getElementById('photobookModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.body.style.overflow = '';
    }
  },

  renderPhotobook(container) {
    const album = this.currentAlbum;
    const media = this.currentAlbumMedia || [];
    const formattedDate = album.date ? this.formatDate(album.date) : `${album.month || ''} ${album.year || ''}`.trim();

    let html = `
      <!-- Cover Page -->
      <div class="photobook-page-break p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-[#180a14] via-[#0d070b] to-[#180a14] text-center border border-amber-500/30 shadow-2xl relative overflow-hidden mb-10">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-semibold mb-6 uppercase tracking-widest">
          📖 Buku Kisah Cinta & Kenangan
        </div>
        <h1 class="font-serif text-3xl sm:text-5xl font-bold text-white mb-3 tracking-wide leading-tight">
          ${album.title}
        </h1>
        <p class="text-amber-200/90 font-medium text-sm sm:text-base mb-6">
          ${formattedDate} &bull; ${media.length} Momen Kasih
        </p>
        <div class="max-w-xl mx-auto my-6 p-6 rounded-2xl bg-black/40 border border-amber-500/20">
          <p class="font-serif italic text-sm sm:text-base text-rose-100/90 leading-relaxed">
            "${album.description || 'Setiap detik bersamamu adalah lembaran indah yang takkan pernah pudar oleh waktu.'}"
          </p>
        </div>
        <p class="text-xs text-rose-300/70 tracking-widest uppercase mt-6 font-serif">
          ADNA Moments &bull; Diabadikan dengan Cinta
        </p>
      </div>

      <!-- Memory Items Grid (Scrapbook Layout) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mb-10">
    `;

    if (media.length === 0) {
      html += `
        <div class="col-span-2 py-12 text-center text-slate-400">
          Belum ada foto yang tersimpan dalam album ini.
        </div>
      `;
    } else {
      media.forEach((item, idx) => {
        const itemDate = item.date ? this.formatDate(item.date) : (item.createdAt ? this.formatDate(item.createdAt) : '');
        const thumbUrl = item.highResUrl || item.thumbnailUrl;
        const notes = item.notes ? item.notes.trim() : '';

        html += `
          <div class="photobook-card bg-[#150a12] p-4 sm:p-5 rounded-2xl border border-white/10 shadow-xl flex flex-col justify-between">
            <div class="rounded-xl overflow-hidden bg-black/50 aspect-[4/3] flex items-center justify-center mb-3.5 border border-white/5">
              ${item.type === 'video' ? `
                <div class="text-center p-4 text-slate-300 text-xs flex flex-col items-center gap-2">
                  <svg class="w-8 h-8 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span>Video Momen: ${item.name}</span>
                </div>
              ` : `
                <img src="${thumbUrl}" alt="${item.name}" class="w-full h-full object-cover" loading="lazy" />
              `}
            </div>
            <div>
              <div class="flex items-center justify-between text-[11px] text-amber-300/90 font-medium mb-1.5">
                <span>#${idx + 1} Momen</span>
                <span>${itemDate}</span>
              </div>
              <h3 class="text-xs sm:text-sm font-semibold text-white truncate mb-2">
                ${item.name}
              </h3>
              ${notes ? `
                <div class="bg-black/40 rounded-xl p-3 border border-brand-500/15">
                  <p class="font-serif italic text-xs text-rose-200/90 leading-relaxed">
                    "${notes}"
                  </p>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });
    }

    html += `
      </div>
      <!-- Closing Note -->
      <div class="text-center py-8 border-t border-white/10">
        <p class="font-serif italic text-sm text-amber-200">
          "Terima kasih telah menemani setiap langkah dan membuat setiap momen begitu berharga."
        </p>
        <p class="text-xs text-slate-400 mt-2 font-light">
          ADNA Moments &bull; Dicetak pada ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    `;

    container.innerHTML = html;
  },

  printPhotobook() {
    window.print();
  },

  formatDate(isoString) {
    if (!isoString) return '';
    try {
      const cleanStr = String(isoString).split('T')[0];
      const parts = cleanStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
      const date = new Date(isoString);
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  }
};

window.AlbumsManager = AlbumsManager;
