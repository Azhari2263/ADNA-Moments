/**
 * ============================================================================
 * ADNA MOMENTS — ALBUMS MANAGER
 * ============================================================================
 * Mengelola daftar album, pembuatan album baru, detail isi album,
 * serta integrasi dengan upload dan lightbox modal.
 * ============================================================================
 */

const AlbumsManager = {
  allAlbums: [],
  currentAlbum: null,
  currentAlbumMedia: [],
  isLoading: false,

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
          this.filterAlbums(e.target.value.trim().toLowerCase());
        }, 200);
      });
    }
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
      const formattedDate = this.formatDate(album.createdAt);

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
          
          <!-- Badges -->
          <div class="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[11px] text-rose-200">
            <svg class="w-3.5 h-3.5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span class="font-semibold">${album.totalCount || 0} Kenangan</span>
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
            <span>Dibuat ${formattedDate}</span>
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
    if (!query) {
      this.renderAlbums(this.allAlbums);
      return;
    }
    const filtered = this.allAlbums.filter(a => 
      (a.title && a.title.toLowerCase().includes(query)) ||
      (a.description && a.description.toLowerCase().includes(query))
    );
    this.renderAlbums(filtered);
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
    if (dateEl) dateEl.textContent = `Dibuat pada ${this.formatDate(album.createdAt)}`;
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
      const response = await fetch(apiUrl + `?album=${encodeURIComponent(album.title)}`);
      const result = await response.json();

      if (result.status === 'success') {
        this.currentAlbumMedia = result.data || [];
        this.renderAlbumMedia(this.currentAlbumMedia);
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
            <span>${GalleryManager.formatShortDate(item.createdAt)}</span>
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
   * Modal Pembuatan Album Baru
   */
  openCreateModal() {
    const modal = document.getElementById('albumFormModal');
    const modalTitle = document.getElementById('albumModalHeading');
    const titleInput = document.getElementById('albumTitleInput');
    const descInput = document.getElementById('albumDescInput');
    const editModeInput = document.getElementById('albumIsEditMode');

    if (modalTitle) modalTitle.textContent = 'Buat Album Kenangan Baru';
    if (editModeInput) editModeInput.value = 'create';
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
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

    if (modalTitle) modalTitle.textContent = 'Edit Informasi Album';
    if (editModeInput) editModeInput.value = 'edit';
    if (titleInput) titleInput.value = this.currentAlbum.title || '';
    if (descInput) descInput.value = this.currentAlbum.description || '';

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
    const editModeInput = document.getElementById('albumIsEditMode');
    const saveBtn = document.getElementById('saveAlbumBtn');

    const title = titleInput ? titleInput.value.trim() : '';
    const desc = descInput ? descInput.value.trim() : '';
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
      const payload = isEdit ? {
        action: 'update_album',
        albumId: this.currentAlbum ? this.currentAlbum.id : '',
        currentTitle: this.currentAlbum ? this.currentAlbum.title : '',
        title: title,
        description: desc
      } : {
        action: 'create_album',
        title: title,
        description: desc
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

        // Jika sedang di detail album, perbarui tampilan detail
        if (isEdit && this.currentAlbum) {
          this.currentAlbum.title = title;
          this.currentAlbum.description = desc;
          const detailTitle = document.getElementById('detailAlbumTitle');
          const detailDesc = document.getElementById('detailAlbumDesc');
          if (detailTitle) detailTitle.textContent = title;
          if (detailDesc) detailDesc.textContent = desc ? `“${desc}”` : '';
        }

        await this.fetchAlbums();
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
   * Mengisi dropdown album di form Unggah dan form Edit Media
   */
  populateDropdowns() {
    const uploadSelect = document.getElementById('uploadAlbum');
    const editSelect = document.getElementById('editMediaAlbumSelect');

    const updateSelect = (selectEl, defaultLabel) => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = `<option value="">${defaultLabel}</option>`;

      this.allAlbums.forEach(album => {
        const opt = document.createElement('option');
        opt.value = album.title;
        opt.textContent = album.title;
        selectEl.appendChild(opt);
      });

      if (currentVal) selectEl.value = currentVal;
    };

    updateSelect(uploadSelect, 'Tanpa Album (Galeri Umum)');
    updateSelect(editSelect, 'Tidak Masuk Album');
  },

  formatDate(isoString) {
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

window.AlbumsManager = AlbumsManager;
