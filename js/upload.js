/**
 * ADNA Moments — Upload Manager v2.0
 * Handles multi-file selection, client-side thumbnail previews,
 * album targeting, love notes assignment, canvas image compression,
 * queue management, base64 encoding, and uploading to Google Apps Script.
 */

const UploadManager = {
  queue: [],
  isProcessing: false,

  init() {
    this.setupDateSelectors();
    this.setupDropZone();
  },

  setupDateSelectors() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

    const yearSelect = document.getElementById('uploadYear');
    const monthSelect = document.getElementById('uploadMonth');

    if (yearSelect) {
      yearSelect.innerHTML = '';
      for (let y = currentYear + 1; y >= currentYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        if (y === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
      }
    }

    if (monthSelect) {
      monthSelect.value = currentMonth;
    }
  },

  setupDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (!dropZone || !fileInput) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('border-brand-500', 'bg-brand-900/20', 'scale-[1.01]');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-brand-500', 'bg-brand-900/20', 'scale-[1.01]');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length) {
        this.handleFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        this.handleFiles(e.target.files);
        e.target.value = '';
      }
    });
  },

  handleFiles(fileList) {
    const maxSizeBytes = 25 * 1024 * 1024; // 25 MB limit for GAS Base64 stability
    const selectedAlbum = document.getElementById('uploadAlbum')?.value || '';
    const initialNotes = document.getElementById('uploadNotes')?.value?.trim() || '';

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isVideo && !isImage) {
        App.showToast(`Format "${file.name}" tidak didukung. Harap pilih Foto atau Video.`, 'error');
        continue;
      }

      if (file.size > maxSizeBytes) {
        App.showToast(`Ukuran "${file.name}" (${this.formatFileSize(file.size)}) melebihi batas 25MB untuk Google Apps Script.`, 'warning');
        continue;
      }

      const id = 'upload_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const previewUrl = URL.createObjectURL(file);

      const queueItem = {
        id,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl,
        album: selectedAlbum,
        notes: initialNotes,
        status: 'pending', // pending | uploading | success | error
        errorMsg: ''
      };

      this.queue.push(queueItem);
    }

    this.renderQueue();
    this.updateBadge();
    this.processNextInQueue();
  },

  removeItem(id) {
    const idx = this.queue.findIndex(i => i.id === id);
    if (idx !== -1) {
      const item = this.queue[idx];
      if (item.status === 'uploading') {
        App.showToast('File sedang diunggah, tidak bisa dihapus.', 'warning');
        return;
      }
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      this.queue.splice(idx, 1);
      this.renderQueue();
      this.updateBadge();
    }
  },

  clearCompleted() {
    this.queue = this.queue.filter(item => {
      if (item.status === 'success') {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        return false;
      }
      return true;
    });
    this.renderQueue();
    this.updateBadge();
  },

  async processNextInQueue() {
    if (this.isProcessing) return;

    const nextItem = this.queue.find(item => item.status === 'pending');
    if (!nextItem) {
      // Check if all were finished
      const hasSuccess = this.queue.some(i => i.status === 'success');
      const hasPendingOrUploading = this.queue.some(i => i.status === 'pending' || i.status === 'uploading');
      
      if (hasSuccess && !hasPendingOrUploading) {
        App.showToast('Semua momen berhasil diunggah ke Google Drive!', 'success');
        GalleryManager.fetchGallery();
        if (window.AlbumsManager) {
          AlbumsManager.fetchAlbums();
        }

        // Reset input catatan
        const notesInput = document.getElementById('uploadNotes');
        if (notesInput) notesInput.value = '';

        setTimeout(() => {
          App.switchPage('gallery');
        }, 1200);
      }
      return;
    }

    this.isProcessing = true;
    nextItem.status = 'uploading';
    this.renderQueue();
    this.updateBadge();

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      nextItem.status = 'error';
      nextItem.errorMsg = 'URL Script belum valid';
      this.isProcessing = false;
      this.renderQueue();
      App.showToast('URL Google Apps Script belum dikonfigurasi.', 'error');
      return;
    }

    try {
      const base64Data = await this.fileToBase64(nextItem.file);

      const year = document.getElementById('uploadYear')?.value || String(new Date().getFullYear());
      const month = document.getElementById('uploadMonth')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
      const album = nextItem.album || document.getElementById('uploadAlbum')?.value || '';
      const notes = nextItem.notes || document.getElementById('uploadNotes')?.value?.trim() || '';

      const payload = {
        action: 'upload',
        fileName: nextItem.name,
        mimeType: nextItem.type,
        base64: base64Data,
        year: year,
        month: month,
        album: album,
        notes: notes
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.status === 'success') {
        nextItem.status = 'success';
      } else {
        nextItem.status = 'error';
        nextItem.errorMsg = result.message || 'Gagal menyimpan';
        App.showToast(result.message || 'Gagal mengunggah file', 'error');
      }
    } catch (err) {
      console.error('Upload Error:', err);
      nextItem.status = 'error';
      nextItem.errorMsg = 'Koneksi error';
      App.showToast('Gagal mengunggah. Periksa koneksi internet.', 'error');
    } finally {
      this.isProcessing = false;
      this.renderQueue();
      this.updateBadge();
      // Continue next item
      this.processNextInQueue();
    }
  },

  /**
   * Konversi File ke Base64 dengan kompresi Canvas otomatis untuk gambar
   */
  async fileToBase64(file) {
    if (file.type.startsWith('image/')) {
      try {
        return await this.compressImageToBase64(file);
      } catch (e) {
        console.warn('Canvas compression error, fallback ke original:', e);
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  },

  compressImageToBase64(file, maxWidth = 2048, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, quality);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = reject;
      img.src = url;
    });
  },

  renderQueue() {
    const queueContainer = document.getElementById('uploadQueue');
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (!queueContainer) return;

    queueContainer.innerHTML = '';

    const hasCompleted = this.queue.some(i => i.status === 'success');
    if (clearBtn) {
      if (hasCompleted) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }

    if (this.queue.length === 0) {
      queueContainer.innerHTML = `
        <div class="p-6 text-center text-slate-500 text-xs border border-white/5 rounded-2xl bg-black/20">
          Belum ada foto atau video dalam antrean unggah.
        </div>
      `;
      return;
    }

    this.queue.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'flex items-center gap-3 p-3 rounded-2xl bg-black/40 border border-white/5 transition';

      let statusBadge = '';
      if (item.status === 'pending') {
        statusBadge = '<span class="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">Menunggu</span>';
      } else if (item.status === 'uploading') {
        statusBadge = '<span class="text-[10px] text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse"><svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Mengunggah</span>';
      } else if (item.status === 'success') {
        statusBadge = '<span class="text-[10px] text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Selesai</span>';
      } else if (item.status === 'error') {
        statusBadge = `<span class="text-[10px] text-red-300 bg-red-500/20 px-2 py-0.5 rounded-full" title="${item.errorMsg}">Gagal</span>`;
      }

      const isVideo = item.type.startsWith('video/');

      itemEl.innerHTML = `
        <div class="w-12 h-12 rounded-xl overflow-hidden bg-black/80 flex-shrink-0 relative border border-white/10">
          ${isVideo ? `
            <div class="w-full h-full flex items-center justify-center bg-brand-950/60">
              <svg class="w-5 h-5 text-brand-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          ` : `
            <img src="${item.previewUrl}" alt="${item.name}" class="w-full h-full object-cover" />
          `}
        </div>

        <div class="flex-grow min-w-0">
          <div class="flex items-center justify-between gap-2 mb-0.5">
            <h5 class="text-xs font-medium text-white truncate">${item.name}</h5>
            ${statusBadge}
          </div>
          <div class="flex items-center gap-2 text-[10px] text-slate-400">
            <span>${this.formatFileSize(item.size)}</span>
            ${item.album ? `<span>• Album: <b class="text-brand-300">${item.album}</b></span>` : ''}
          </div>
        </div>

        ${item.status !== 'uploading' ? `
          <button onclick="UploadManager.removeItem('${item.id}')" class="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/5 transition" title="Hapus dari antrean">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        ` : ''}
      `;

      queueContainer.appendChild(itemEl);
    });
  },

  updateBadge() {
    const pendingCount = this.queue.filter(i => i.status === 'pending' || i.status === 'uploading').length;

    const deskBadge = document.getElementById('desk-queue-badge');
    const mobBadge = document.getElementById('mob-queue-badge');

    [deskBadge, mobBadge].forEach(badge => {
      if (!badge) return;
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.classList.remove('scale-0', 'opacity-0');
        badge.classList.add('scale-100', 'opacity-100');
      } else {
        badge.classList.remove('scale-100', 'opacity-100');
        badge.classList.add('scale-0', 'opacity-0');
      }
    });
  },

  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
};

window.UploadManager = UploadManager;
