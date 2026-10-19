/**
 * ADNA Moments — Upload Manager
 * Handles multi-file selection, client-side thumbnail previews,
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

      const payload = {
        fileName: nextItem.name,
        mimeType: nextItem.type,
        base64: base64Data,
        year: year,
        month: month
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

  fileToBase64(file) {
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

  renderQueue() {
    const container = document.getElementById('uploadQueue');
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (!container) return;

    container.innerHTML = '';

    const hasSuccess = this.queue.some(i => i.status === 'success');
    if (clearBtn) {
      clearBtn.style.display = hasSuccess ? 'inline-flex' : 'none';
    }

    if (this.queue.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 text-slate-500 text-xs sm:text-sm">
          Antrean unggahan kosong.
        </div>
      `;
      return;
    }

    this.queue.slice().reverse().forEach(item => {
      const isVideo = item.type.startsWith('video/');
      const card = document.createElement('div');
      
      let borderStyle = 'border-white/5 bg-black/35';
      if (item.status === 'uploading') borderStyle = 'border-brand-500/50 bg-brand-950/20';
      if (item.status === 'success') borderStyle = 'border-emerald-500/30 bg-emerald-950/10';
      if (item.status === 'error') borderStyle = 'border-red-500/30 bg-red-950/15';

      let statusBadge = '';
      if (item.status === 'pending') {
        statusBadge = `
          <span class="inline-flex items-center gap-1.5 text-xs text-amber-300">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span> Menunggu
          </span>
        `;
      } else if (item.status === 'uploading') {
        statusBadge = `
          <span class="inline-flex items-center gap-1.5 text-xs text-brand-300">
            <span class="w-3.5 h-3.5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin"></span> Mengunggah...
          </span>
        `;
      } else if (item.status === 'success') {
        statusBadge = `
          <span class="inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Selesai
          </span>
        `;
      } else {
        statusBadge = `
          <span class="inline-flex items-center gap-1.5 text-xs text-red-400" title="${item.errorMsg}">
            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg> Gagal
          </span>
        `;
      }

      card.className = `flex items-center gap-3 p-3 rounded-2xl border ${borderStyle} transition-all`;

      card.innerHTML = `
        <div class="relative w-12 h-12 rounded-xl overflow-hidden bg-black flex-shrink-0 border border-white/10">
          ${isVideo ? `
            <video src="${item.previewUrl}" class="w-full h-full object-cover"></video>
            <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
              <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          ` : `
            <img src="${item.previewUrl}" class="w-full h-full object-cover" alt="preview" />
          `}
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-xs sm:text-sm font-semibold text-white truncate">${item.name}</p>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[11px] text-slate-400">${this.formatFileSize(item.size)}</span>
            <span class="text-slate-600">•</span>
            ${statusBadge}
          </div>
        </div>

        ${item.status !== 'uploading' ? `
          <button onclick="UploadManager.removeItem('${item.id}')" class="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition" title="Hapus dari antrean">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        ` : ''}
      `;

      container.appendChild(card);
    });
  },

  updateBadge() {
    const badge = document.getElementById('mob-queue-badge');
    const deskBadge = document.getElementById('desk-queue-badge');
    const pendingCount = this.queue.filter(i => i.status === 'pending' || i.status === 'uploading').length;

    [badge, deskBadge].forEach(el => {
      if (!el) return;
      if (pendingCount > 0) {
        el.textContent = pendingCount;
        el.classList.remove('opacity-0', 'scale-0');
      } else {
        el.classList.add('opacity-0', 'scale-0');
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
