/**
 * ADNA Moments — Love Bucket List & Impian Bersama Manager (Feature #5)
 * Menyimpan data langsung ke Google Spreadsheet via Google Apps Script backend
 * sehingga otomatis tersinkronisasi antar-perangkat (HP Azhari, HP Luv, Laptop, dll).
 * Dilengkapi cache lokal untuk performa kilat dan dukungan offline PWA.
 * Mendukung pembuktian impian terwujud dengan album kenangan otomatis & foto kenangan.
 */

const BucketListManager = {
  items: [],
  currentFilter: 'all', // 'all' | 'pending' | 'completed'
  linkingItemId: null,
  isLoading: false,

  // State untuk Modal Wujudkan Impian (Fulfillment & Album Creation)
  fulfillingItem: null,
  fulfillSelectedGalleryIds: new Set(),
  fulfillNewFilesToUpload: [],
  activeFulfillTab: 'gallery', // 'gallery' | 'upload'

  STORAGE_KEY: 'adna_bucketlist_cache',

  CATEGORIES: {
    travel: { label: 'Liburan & Wisata', icon: '✈️', color: 'from-blue-600/20 to-sky-600/20 text-sky-300 border-sky-500/30' },
    date: { label: 'Kencan Romantis', icon: '☕', color: 'from-rose-600/20 to-pink-600/20 text-rose-300 border-rose-500/30' },
    milestone: { label: 'Langkah Hidup', icon: '💍', color: 'from-amber-600/20 to-yellow-600/20 text-amber-300 border-amber-500/30' },
    fun: { label: 'Petualangan & Hobi', icon: '🎡', color: 'from-emerald-600/20 to-teal-600/20 text-emerald-300 border-emerald-500/30' }
  },

  init() {
    this.loadFromCache();
    this.bindEvents();
    this.render();
    this.fetchFromCloud();
  },

  loadFromCache() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        this.items = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('BucketList cache error:', e);
      this.items = [];
    }
  },

  saveToCache() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
    } catch (e) {
      console.warn('Failed to cache bucket list:', e);
    }
  },

  /**
   * Mengambil data impian terkini dari Google Spreadsheet via Google Apps Script
   */
  async fetchFromCloud() {
    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) return;

    this.isLoading = true;
    try {
      const res = await fetch(`${apiUrl}?action=bucketlist`);
      const result = await res.json();

      if (result.status === 'success' && Array.isArray(result.data)) {
        this.items = result.data;
        this.saveToCache();
        this.render();
      }
    } catch (err) {
      console.warn('Gagal memuat impian dari Google Spreadsheet, menggunakan cache lokal:', err);
    } finally {
      this.isLoading = false;
    }
  },

  bindEvents() {
    const searchInput = document.getElementById('bucketSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.render();
      });
    }
  },

  setFilter(filter) {
    this.currentFilter = filter;
    ['all', 'pending', 'completed'].forEach(f => {
      const btn = document.getElementById(`bucket-tab-${f}`);
      if (!btn) return;
      if (f === filter) {
        btn.className = 'px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-all';
      } else {
        btn.className = 'px-4 py-1.5 text-xs sm:text-sm font-medium rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-all';
      }
    });
    this.render();
  },

  render() {
    const grid = document.getElementById('bucketlistGrid');
    const empty = document.getElementById('bucketlistEmpty');
    const totalEl = document.getElementById('bucketTotalCount');
    const completedEl = document.getElementById('bucketCompletedCount');
    const percentEl = document.getElementById('bucketProgressPercent');
    const progressBar = document.getElementById('bucketProgressBar');

    if (!grid) return;

    // Hitung progress
    const total = this.items.length;
    const completed = this.items.filter(i => i.completed === true || String(i.completed).toUpperCase() === 'TRUE').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    if (totalEl) totalEl.textContent = total;
    if (completedEl) completedEl.textContent = completed;
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;

    // Filter & Search
    const searchVal = (document.getElementById('bucketSearchInput')?.value || '').trim().toLowerCase();
    const filtered = this.items.filter(item => {
      const isDone = item.completed === true || String(item.completed).toUpperCase() === 'TRUE';
      const matchFilter = this.currentFilter === 'all' ? true :
                          this.currentFilter === 'completed' ? isDone :
                          !isDone;
      const matchSearch = !searchVal ? true :
                          (item.title && item.title.toLowerCase().includes(searchVal)) ||
                          (item.notes && item.notes.toLowerCase().includes(searchVal));
      return matchFilter && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    grid.innerHTML = '';

    filtered.forEach(item => {
      const card = document.createElement('div');
      const cat = this.CATEGORIES[item.category] || this.CATEGORIES.travel;
      const isDone = item.completed === true || String(item.completed).toUpperCase() === 'TRUE';

      card.className = `glass-panel rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between ${
        isDone ? 'border-amber-500/40 bg-amber-950/15' : 'border-white/10 hover:border-brand-500/40'
      }`;

      card.innerHTML = `
        <div>
          <!-- Header: Category & Checkbox Button -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cat.color}">
              <span>${cat.icon}</span>
              <span>${cat.label}</span>
            </span>

            <button onclick="BucketListManager.handleCompleteClick('${item.id}')" class="p-1.5 rounded-full transition-all group" title="${isDone ? 'Tandai Belum Tercapai' : 'Wujudkan Impian Ini! ✨'}">
              ${isDone ? `
                <div class="w-6 h-6 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-amber-500/30">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                </div>
              ` : `
                <div class="w-6 h-6 rounded-full border-2 border-slate-500 group-hover:border-amber-400 group-hover:scale-110 flex items-center justify-center transition"></div>
              `}
            </button>
          </div>

          <!-- Title -->
          <h3 class="font-semibold text-sm sm:text-base mb-2 text-white ${isDone ? 'line-through text-slate-300' : ''}">
            ${item.title}
          </h3>

          <!-- Notes -->
          ${item.notes ? `
            <p class="text-xs text-rose-200/80 font-serif italic mb-3 leading-relaxed">
              "${item.notes}"
            </p>
          ` : ''}

          <!-- Linked Proof Photo from Gallery -->
          ${item.photoUrl ? `
            <div class="relative group/photo mt-3 rounded-xl overflow-hidden aspect-video bg-black/50 border border-amber-500/30 mb-3 shadow-lg">
              <img src="${item.photoUrl}" alt="Bukti Impian" class="w-full h-full object-cover group-hover/photo:scale-105 transition-transform duration-500" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2.5">
                <span class="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                  ✨ Momen Terwujud!
                </span>
                <button onclick="BucketListManager.unlinkPhoto('${item.id}')" class="text-[10px] text-red-400 hover:text-red-300 bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-sm" title="Hapus Tautan Foto">
                  Lepas Foto
                </button>
              </div>
            </div>
          ` : `
            ${isDone ? `
              <div class="mt-2 mb-3">
                <button onclick="BucketListManager.openPhotoLinkModal('${item.id}')" class="w-full py-2 px-3 rounded-xl border border-dashed border-amber-500/40 hover:border-amber-400 bg-amber-950/20 text-amber-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span>+ Tautkan Foto Kenangan Bukti</span>
                </button>
              </div>
            ` : ''}
          `}

          <!-- Linked Album Kenangan Button (Jika Dibuatkan Album) -->
          ${(isDone && item.albumId) ? `
            <div class="mt-1 mb-3">
              <button onclick="BucketListManager.openLinkedAlbum('${item.albumId}')" class="w-full py-2 px-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 to-rose-950/40 hover:from-amber-900/50 hover:to-rose-900/50 text-amber-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md group/albumBtn">
                <svg class="w-4 h-4 text-amber-400 group-hover/albumBtn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                <span>📖 Buka Album Kenangan</span>
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Footer Card -->
        <div class="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 mt-2">
          <span>
            ${isDone ? `Terwujud: <span class="text-amber-400 font-medium">${item.completedDate || 'Selesai'}</span>` : 
              (item.targetDate ? `Target: <span class="text-rose-300">${item.targetDate}</span>` : 'Rencana Berdua')}
          </span>

          <div class="flex items-center gap-2">
            <button onclick="BucketListManager.openCreateModal('${item.id}')" class="p-1 hover:text-white transition" title="Edit Impian">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button onclick="BucketListManager.deleteItem('${item.id}')" class="p-1 hover:text-red-400 transition" title="Hapus Impian">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });
  },

  /**
   * Buka Album Kenangan terkait yang tersimpan di Google Drive
   */
  openLinkedAlbum(albumId) {
    if (!albumId) return;
    if (window.App) App.switchPage('albums');
    if (window.AlbumsManager) {
      const existing = AlbumsManager.allAlbums.find(a => a.id === albumId);
      if (existing) {
        AlbumsManager.openAlbumDetail(existing);
      } else {
        AlbumsManager.fetchAlbums().then(() => {
          const found = AlbumsManager.allAlbums.find(a => a.id === albumId);
          if (found) {
            AlbumsManager.openAlbumDetail(found);
          } else {
            // Fallback jika belum selesai sync
            const matchedItem = this.items.find(i => i.albumId === albumId);
            AlbumsManager.openAlbumDetail({
              id: albumId,
              title: matchedItem ? matchedItem.title : 'Album Kenangan',
              description: matchedItem ? matchedItem.notes : ''
            });
          }
        });
      }
    }
  },

  /**
   * Handler klik status checklist impian:
   * Jika belum selesai -> buka modal konfirmasi wujudkan impian + buat album kenangan
   * Jika sudah selesai -> konfirmasi pembatalan kembali ke belum selesai
   */
  handleCompleteClick(itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    const isDone = item.completed === true || String(item.completed).toUpperCase() === 'TRUE';
    if (isDone) {
      if (confirm(`Ubah status impian "${item.title}" kembali menjadi Belum Terwujud?`)) {
        this.toggleComplete(itemId, false);
      }
    } else {
      this.openFulfillModal(itemId);
    }
  },

  /**
   * Buka Modal Wujudkan Impian (Fulfill Modal)
   */
  openFulfillModal(itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    this.fulfillingItem = item;
    this.fulfillSelectedGalleryIds.clear();
    this.fulfillNewFilesToUpload = [];

    // Pre-select existing proof photo jika ada
    if (item.photoId) {
      this.fulfillSelectedGalleryIds.add(item.photoId);
    }

    const modal = document.getElementById('fulfillBucketModal');
    const titleEl = document.getElementById('fulfillModalItemTitle');
    const dateInput = document.getElementById('fulfillDateInput');
    const albumTitleInput = document.getElementById('fulfillAlbumTitleInput');
    const albumDescInput = document.getElementById('fulfillAlbumDescInput');
    const createAlbumCheckbox = document.getElementById('fulfillCreateAlbumCheckbox');
    const albumSection = document.getElementById('fulfillAlbumSection');
    const newFilesQueue = document.getElementById('fulfillNewFilesQueue');

    if (titleEl) titleEl.textContent = item.title;

    // Default tanggal terwujud = hari ini (YYYY-MM-DD)
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateInput) dateInput.value = todayStr;

    // Default nama album = nama impian
    if (albumTitleInput) albumTitleInput.value = item.title;
    if (albumDescInput) albumDescInput.value = item.notes || '';

    // Centang buat album kenangan secara default
    if (createAlbumCheckbox) createAlbumCheckbox.checked = true;
    if (albumSection) albumSection.classList.remove('hidden');

    if (newFilesQueue) newFilesQueue.innerHTML = '';

    // Siapkan tabs & grid media
    this.switchFulfillTab('gallery');
    this.renderFulfillGalleryGrid();
    this.updateFulfillCountBadge();

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeFulfillModal() {
    const modal = document.getElementById('fulfillBucketModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.fulfillingItem = null;
    this.fulfillSelectedGalleryIds.clear();
    this.fulfillNewFilesToUpload = [];
  },

  toggleFulfillAlbumOption(checked) {
    const albumSection = document.getElementById('fulfillAlbumSection');
    const submitBtn = document.getElementById('fulfillSubmitBtn');

    if (albumSection) {
      if (checked) {
        albumSection.classList.remove('hidden');
      } else {
        albumSection.classList.add('hidden');
      }
    }

    if (submitBtn) {
      submitBtn.innerHTML = checked 
        ? `<span>Wujudkan & Buat Album ✨</span>`
        : `<span>Wujudkan Impian ✨</span>`;
    }
  },

  switchFulfillTab(tab) {
    this.activeFulfillTab = tab;
    const btnGallery = document.getElementById('fulfillTabGalleryBtn');
    const btnUpload = document.getElementById('fulfillTabUploadBtn');
    const secGallery = document.getElementById('fulfillGalleryContainer');
    const secUpload = document.getElementById('fulfillUploadContainer');

    if (tab === 'gallery') {
      if (btnGallery) btnGallery.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white transition';
      if (btnUpload) btnUpload.className = 'flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition';
      if (secGallery) secGallery.classList.remove('hidden');
      if (secUpload) secUpload.classList.add('hidden');
    } else {
      if (btnUpload) btnUpload.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white transition';
      if (btnGallery) btnGallery.className = 'flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition';
      if (secUpload) secUpload.classList.remove('hidden');
      if (secGallery) secGallery.classList.add('hidden');
    }
  },

  renderFulfillGalleryGrid() {
    const grid = document.getElementById('fulfillGalleryGrid');
    const emptyEl = document.getElementById('fulfillGalleryEmpty');
    if (!grid) return;

    grid.innerHTML = '';
    const allMedia = (window.GalleryManager && GalleryManager.allMedia) ? GalleryManager.allMedia : [];

    if (!allMedia.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    allMedia.forEach(item => {
      const isSelected = this.fulfillSelectedGalleryIds.has(item.id);
      const thumbItem = document.createElement('div');
      thumbItem.className = `relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${
        isSelected ? 'border-amber-400 scale-[0.96] ring-2 ring-amber-400/50' : 'border-white/10 opacity-75 hover:opacity-100 hover:border-white/30'
      }`;

      thumbItem.onclick = () => this.toggleFulfillGallerySelect(item.id);

      thumbItem.innerHTML = `
        <img src="${item.thumbnailUrl || 'icons/icon-512.png'}" alt="${item.name}" class="w-full h-full object-cover" />
        
        <div class="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
          isSelected ? 'bg-amber-500 text-white shadow-md' : 'bg-black/50 text-transparent border border-white/30'
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

  toggleFulfillGallerySelect(fileId) {
    if (this.fulfillSelectedGalleryIds.has(fileId)) {
      this.fulfillSelectedGalleryIds.delete(fileId);
    } else {
      this.fulfillSelectedGalleryIds.add(fileId);
    }
    this.updateFulfillCountBadge();
    this.renderFulfillGalleryGrid();
  },

  handleNewFilesSelected(files) {
    if (!files || !files.length) return;
    this.fulfillNewFilesToUpload = Array.from(files);
    this.updateFulfillCountBadge();

    const queueEl = document.getElementById('fulfillNewFilesQueue');
    if (!queueEl) return;

    queueEl.innerHTML = '';
    this.fulfillNewFilesToUpload.forEach(f => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between text-[11px] p-2 rounded-xl bg-black/40 border border-white/5 text-slate-300';
      const sizeStr = (window.UploadManager && UploadManager.formatFileSize) ? UploadManager.formatFileSize(f.size) : `${Math.round(f.size/1024)} KB`;
      item.innerHTML = `
        <span class="truncate max-w-[200px] text-white">${f.name}</span>
        <span class="text-amber-300 font-semibold">${sizeStr}</span>
      `;
      queueEl.appendChild(item);
    });
  },

  updateFulfillCountBadge() {
    const badge = document.getElementById('fulfillSelectedCountBadge');
    if (!badge) return;

    const fromGallery = this.fulfillSelectedGalleryIds.size;
    const newFiles = this.fulfillNewFilesToUpload.length;

    let text = `${fromGallery} Foto Galeri`;
    if (newFiles > 0) {
      text += ` + ${newFiles} Baru`;
    }
    badge.textContent = text;
  },

  /**
   * Submit Wujudkan Impian:
   * @param {boolean} allowAlbumCreation Apakah akan memproses pembuatan album jika checkbox aktif
   */
  async submitFulfill(allowAlbumCreation = true) {
    if (!this.fulfillingItem) return;
    const item = this.fulfillingItem;

    const dateInput = document.getElementById('fulfillDateInput');
    const createAlbumCheckbox = document.getElementById('fulfillCreateAlbumCheckbox');
    const albumTitleInput = document.getElementById('fulfillAlbumTitleInput');
    const albumDescInput = document.getElementById('fulfillAlbumDescInput');
    const submitBtn = document.getElementById('fulfillSubmitBtn');

    const shouldCreateAlbum = allowAlbumCreation && createAlbumCheckbox && createAlbumCheckbox.checked;
    const dateVal = dateInput ? dateInput.value : '';
    const albumTitle = (albumTitleInput ? albumTitleInput.value.trim() : '') || item.title;
    const albumDesc = albumDescInput ? albumDescInput.value.trim() : (item.notes || '');

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('URL API belum diatur di menu Pengaturan.', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Menyimpan Impian...</span>`;
    }

    try {
      let createdAlbumId = '';

      // 1. Buat Album Kenangan di Google Drive jika dipilih
      if (shouldCreateAlbum) {
        let year = '';
        let month = '';
        if (dateVal) {
          const parts = dateVal.split('-');
          if (parts.length >= 2) {
            year = parts[0];
            month = parts[1];
          }
        }
        year = year || String(new Date().getFullYear());
        month = month || String(new Date().getMonth() + 1).padStart(2, '0');

        const selectedIds = Array.from(this.fulfillSelectedGalleryIds);

        const albumRes = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'create_album',
            title: albumTitle,
            date: dateVal,
            year: year,
            month: month,
            description: albumDesc,
            selectedFileIds: selectedIds
          })
        });

        const albumData = await albumRes.json();
        if (albumData.status === 'success' && albumData.data && albumData.data.id) {
          createdAlbumId = albumData.data.id;
          item.albumId = createdAlbumId;

          // Jika ada foto baru yang diunggah, arahkan ke album yang baru dibuat
          if (this.fulfillNewFilesToUpload.length > 0 && window.UploadManager) {
            const uploadAlbumSelect = document.getElementById('uploadAlbum');
            if (uploadAlbumSelect) {
              let opt = Array.from(uploadAlbumSelect.options).find(o => o.value === albumTitle);
              if (!opt) {
                opt = document.createElement('option');
                opt.value = albumTitle;
                opt.textContent = `📁 ${albumTitle}`;
                uploadAlbumSelect.appendChild(opt);
              }
              uploadAlbumSelect.value = albumTitle;
            }
            UploadManager.handleFiles(this.fulfillNewFilesToUpload);
          }

          // Otomatis tautkan foto pertama sebagai thumbnail bukti impian jika belum ada photoUrl
          if (!item.photoUrl && selectedIds.length > 0 && window.GalleryManager && GalleryManager.allMedia) {
            const firstMedia = GalleryManager.allMedia.find(m => selectedIds.includes(m.id));
            if (firstMedia) {
              item.photoUrl = firstMedia.thumbnailUrl || firstMedia.highResUrl;
              item.photoId = firstMedia.id;
            }
          }

          if (window.AlbumsManager) AlbumsManager.fetchAlbums();
          if (window.GalleryManager) GalleryManager.fetchGallery();
        } else {
          console.warn('Gagal membuat album:', albumData.message);
        }
      }

      // 2. Format Tanggal Terwujud
      let formattedDate = '';
      if (dateVal) {
        const parts = dateVal.split('-');
        if (parts.length === 3) {
          const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          formattedDate = dt.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
        }
      }
      if (!formattedDate) {
        formattedDate = new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }

      // 3. Update status item impian
      item.completed = true;
      item.completedDate = formattedDate;

      // Simpan ke local cache & perbarui UI
      this.saveToCache();
      this.render();
      this.closeFulfillModal();

      App.showToast(
        shouldCreateAlbum 
          ? `Selamat! Impian "${item.title}" terwujud & Album Kenangan berhasil dibuat! 🎉✨`
          : `Selamat! Impian "${item.title}" telah terwujud! 🎉✨`, 
        'success'
      );

      // 4. Sinkronisasi perubahan status & albumId ke Google Spreadsheet
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save_bucketlist_item',
          item: item
        })
      });

    } catch (err) {
      console.error('Submit fulfill error:', err);
      App.showToast('Terjadi kesalahan saat memproses impian.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Wujudkan & Buat Album ✨</span>`;
      }
    }
  },

  openCreateModal(itemId = null) {
    const modal = document.getElementById('bucketlistModal');
    const titleModal = document.getElementById('bucketModalTitle');
    const idInput = document.getElementById('bucketItemIdInput');
    const titleInput = document.getElementById('bucketTitleInput');
    const catInput = document.getElementById('bucketCategoryInput');
    const targetInput = document.getElementById('bucketTargetDateInput');
    const notesInput = document.getElementById('bucketNotesInput');

    if (!modal) return;

    if (itemId) {
      const item = this.items.find(i => i.id === itemId);
      if (item) {
        if (titleModal) titleModal.textContent = 'Edit Impian Bersama';
        if (idInput) idInput.value = item.id;
        if (titleInput) titleInput.value = item.title;
        if (catInput) catInput.value = item.category || 'travel';
        if (targetInput) targetInput.value = item.targetDate || '';
        if (notesInput) notesInput.value = item.notes || '';
      }
    } else {
      if (titleModal) titleModal.textContent = 'Tambah Impian Baru Kita';
      if (idInput) idInput.value = '';
      if (titleInput) titleInput.value = '';
      if (catInput) catInput.value = 'travel';
      if (targetInput) targetInput.value = '';
      if (notesInput) notesInput.value = '';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  closeModal() {
    const modal = document.getElementById('bucketlistModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async saveItem() {
    const idInput = document.getElementById('bucketItemIdInput');
    const titleInput = document.getElementById('bucketTitleInput');
    const catInput = document.getElementById('bucketCategoryInput');
    const targetInput = document.getElementById('bucketTargetDateInput');
    const notesInput = document.getElementById('bucketNotesInput');

    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
      App.showToast('Nama impian tidak boleh kosong.', 'warning');
      return;
    }

    const itemId = idInput && idInput.value ? idInput.value : ('bl_' + Date.now());
    const category = catInput ? catInput.value : 'travel';
    const targetDate = targetInput ? targetInput.value : '';
    const notes = notesInput ? notesInput.value.trim() : '';

    const existingIndex = this.items.findIndex(i => i.id === itemId);
    let itemToSave = null;

    if (existingIndex >= 0) {
      itemToSave = {
        ...this.items[existingIndex],
        title: title,
        category: category,
        targetDate: targetDate,
        notes: notes
      };
      this.items[existingIndex] = itemToSave;
      App.showToast('Impian berhasil diperbarui! ✨', 'success');
    } else {
      itemToSave = {
        id: itemId,
        title: title,
        category: category,
        targetDate: targetDate,
        completed: false,
        completedDate: '',
        notes: notes,
        photoUrl: '',
        photoId: '',
        albumId: '',
        createdAt: new Date().toISOString()
      };
      this.items.unshift(itemToSave);
      App.showToast('Impian baru berhasil ditambahkan! 💖', 'success');
    }

    this.saveToCache();
    this.closeModal();
    this.render();

    // Sinkronisasi ke Google Spreadsheet backend
    const apiUrl = App.getApiUrl();
    if (apiUrl && apiUrl.includes('/exec')) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_bucketlist_item',
            item: itemToSave
          })
        });
      } catch (e) {
        console.warn('Gagal sync ke Google Spreadsheet:', e);
      }
    }
  },

  async toggleComplete(id, forcedStatus = undefined) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    const currentStatus = item.completed === true || String(item.completed).toUpperCase() === 'TRUE';
    item.completed = (forcedStatus !== undefined) ? forcedStatus : !currentStatus;

    if (item.completed) {
      item.completedDate = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      App.showToast(`Selamat! Impian "${item.title}" telah terwujud! 🎉✨`, 'success');
    } else {
      item.completedDate = '';
    }

    this.saveToCache();
    this.render();

    // Sinkronisasi ke Google Spreadsheet
    const apiUrl = App.getApiUrl();
    if (apiUrl && apiUrl.includes('/exec')) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_bucketlist_item',
            item: item
          })
        });
      } catch (e) {
        console.warn('Gagal sync toggle ke Google Spreadsheet:', e);
      }
    }
  },

  async deleteItem(id) {
    if (!confirm('Hapus impian ini dari daftar rencana kalian?')) return;
    this.items = this.items.filter(i => i.id !== id);
    this.saveToCache();
    this.render();
    App.showToast('Impian telah dihapus.', 'info');

    // Sinkronisasi ke Google Spreadsheet
    const apiUrl = App.getApiUrl();
    if (apiUrl && apiUrl.includes('/exec')) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_bucketlist_item',
            id: id
          })
        });
      } catch (e) {
        console.warn('Gagal sync delete ke Google Spreadsheet:', e);
      }
    }
  },

  /* Link Photo Modal */
  openPhotoLinkModal(itemId) {
    this.linkingItemId = itemId;
    const modal = document.getElementById('bucketlinkPhotoModal');
    const grid = document.getElementById('bucketlinkPhotoGrid');
    if (!modal || !grid) return;

    const mediaList = (window.GalleryManager && GalleryManager.allMedia) ? GalleryManager.allMedia : [];

    if (mediaList.length === 0) {
      grid.innerHTML = '<div class="col-span-3 py-8 text-center text-slate-400 text-xs">Belum ada foto di galeri. Buka menu Galeri terlebih dahulu untuk memuat foto.</div>';
    } else {
      grid.innerHTML = '';
      mediaList.slice(0, 30).forEach(m => {
        const thumb = m.thumbnailUrl || m.highResUrl;
        const itemEl = document.createElement('div');
        itemEl.className = 'aspect-square rounded-xl overflow-hidden bg-black/40 border border-white/10 hover:border-amber-400 cursor-pointer relative group transition';
        itemEl.innerHTML = `
          <img src="${thumb}" alt="${m.name}" class="w-full h-full object-cover group-hover:scale-110 transition duration-300" loading="lazy" />
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center p-1 text-center">
            <span class="text-[10px] text-white font-semibold">Pilih Foto Ini</span>
          </div>
        `;
        itemEl.onclick = () => {
          this.linkPhoto(this.linkingItemId, thumb, m.id);
        };
        grid.appendChild(itemEl);
      });
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  closePhotoLinkModal() {
    const modal = document.getElementById('bucketlinkPhotoModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.linkingItemId = null;
  },

  async linkPhoto(itemId, photoUrl, photoId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    item.photoUrl = photoUrl;
    item.photoId = photoId;
    item.completed = true;
    if (!item.completedDate) {
      item.completedDate = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }

    this.saveToCache();
    this.closePhotoLinkModal();
    this.render();
    App.showToast('Foto kenangan berhasil ditautkan sebagai bukti impian! 📸💖', 'success');

    // Sinkronisasi ke Google Spreadsheet
    const apiUrl = App.getApiUrl();
    if (apiUrl && apiUrl.includes('/exec')) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_bucketlist_item',
            item: item
          })
        });
      } catch (e) {
        console.warn('Gagal sync linkPhoto ke Google Spreadsheet:', e);
      }
    }
  },

  async unlinkPhoto(itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    item.photoUrl = '';
    item.photoId = '';
    this.saveToCache();
    this.render();
    App.showToast('Tautan foto telah dilepas.', 'info');

    // Sinkronisasi ke Google Spreadsheet
    const apiUrl = App.getApiUrl();
    if (apiUrl && apiUrl.includes('/exec')) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_bucketlist_item',
            item: item
          })
        });
      } catch (e) {
        console.warn('Gagal sync unlinkPhoto ke Google Spreadsheet:', e);
      }
    }
  }
};

window.BucketListManager = BucketListManager;
