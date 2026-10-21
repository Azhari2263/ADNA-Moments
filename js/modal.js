/**
 * ADNA Moments — Fullscreen Lightbox Modal Manager v2.0
 * Features: High-res preview, Video streaming, Next/Prev navigation,
 * Love notes (catatan kenangan), Edit nama & catatan, Album badges,
 * Keyboard shortcuts, Touch swipe gestures, and Drive links.
 */

const ModalManager = {
  currentList: [],
  currentIndex: -1,
  touchStartX: 0,
  touchStartY: 0,

  // Auto-slide: Dinonaktifkan untuk sementara sesuai kebutuhan
  isAutoSlideEnabled: false,
  autoSlideInterval: null,

  startAutoSlide() {
    // Fitur auto-slide dinonaktifkan sementara
    return;
  },

  stopAutoSlide() {
    if (this.autoSlideInterval) {
      clearInterval(this.autoSlideInterval);
      this.autoSlideInterval = null;
    }
  },

  init() {
    // Bind Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('mediaModal');
      const editModal = document.getElementById('editMediaModal');
      
      // Jangan trigger keyboard shortcut jika sedang mengetik di modal edit
      if (editModal && !editModal.classList.contains('hidden')) return;

      if (!modal || modal.classList.contains('hidden')) return;

      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowLeft') {
        this.prev();
      } else if (e.key === 'ArrowRight') {
        this.next();
      }
    });

    // Bind Touch Gestures for Mobile
    const modalEl = document.getElementById('mediaModal');
    if (modalEl) {
      modalEl.addEventListener('touchstart', (e) => {
        this.touchStartX = e.changedTouches[0].screenX;
        this.touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });

      modalEl.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        this.handleGesture(this.touchStartX, this.touchStartY, touchEndX, touchEndY);
      }, { passive: true });
    }
  },

  handleGesture(startX, startY, endX, endY) {
    const diffX = endX - startX;
    const diffY = endY - startY;

    // Minimum swipe threshold (50px)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX < 0) {
        this.next(); // Swiped left -> next
      } else {
        this.prev(); // Swiped right -> prev
      }
    } else if (diffY > 80 && Math.abs(diffX) < 40) {
      this.close(); // Swiped down -> close
    }
  },

  open(item, index = 0, list = []) {
    this.stopAutoSlide();
    this.currentList = list && list.length ? list : [item];
    this.currentIndex = index >= 0 ? index : this.currentList.findIndex(i => i.id === item.id);
    if (this.currentIndex === -1) this.currentIndex = 0;

    this.renderCurrent();

    const modal = document.getElementById('mediaModal');
    const content = document.getElementById('modalContent');

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0');
      content.classList.remove('scale-95');
    });
  },

  renderCurrent() {
    const item = this.currentList[this.currentIndex];
    if (!item) return;

    const content = document.getElementById('modalContent');
    const titleEl = document.getElementById('modalTitle');
    const dateEl = document.getElementById('modalDate');
    const notesEl = document.getElementById('modalNotes');
    const notesContainer = document.getElementById('modalNotesContainer');
    const albumBadge = document.getElementById('modalAlbumBadge');
    const counterEl = document.getElementById('modalCounter');
    const driveLink = document.getElementById('modalDriveLink');
    const downloadLink = document.getElementById('modalDownloadLink');

    // Update metadata
    if (titleEl) titleEl.textContent = item.name;
    if (dateEl) dateEl.textContent = this.formatDate(item.createdAt);
    if (counterEl) {
      counterEl.textContent = `${this.currentIndex + 1} / ${this.currentList.length}`;
    }

    // Catatan Kenangan (Love Notes)
    if (notesEl && notesContainer) {
      if (item.notes && item.notes.trim()) {
        notesEl.textContent = `“${item.notes}”`;
        notesContainer.classList.remove('hidden');
      } else {
        notesEl.textContent = '';
        notesContainer.classList.add('hidden');
      }
    }

    // Album Badge
    if (albumBadge) {
      if (item.album) {
        albumBadge.textContent = item.album;
        albumBadge.classList.remove('hidden');
      } else {
        albumBadge.classList.add('hidden');
      }
    }

    if (driveLink) driveLink.href = item.viewUrl || '#';
    if (downloadLink) downloadLink.href = item.streamUrl || item.viewUrl || '#';

    // Clear previous media
    content.innerHTML = '';

    const captionInner = document.getElementById('modalCaptionInner');

    if (item.type === 'photo') {
      if (captionInner) captionInner.classList.remove('video-caption-compact');
      const img = document.createElement('img');
      img.src = item.highResUrl || item.viewUrl || item.thumbnailUrl;
      img.alt = item.name;
      img.className = 'max-w-full max-h-[70vh] sm:max-h-[75vh] object-contain rounded-2xl shadow-2xl ring-1 ring-white/10 animate-fadeInScale';
      content.appendChild(img);
    } else {
      if (captionInner) captionInner.classList.add('video-caption-compact');

      const videoWrapper = document.createElement('div');
      videoWrapper.className = 'modal-video-card animate-fadeInScale';

      // Preloader spinner elegan saat iframe Google Drive sedang dimuat
      const loader = document.createElement('div');
      loader.className = 'absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm z-10 transition-opacity duration-300 pointer-events-none';
      loader.innerHTML = `
        <div class="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-brand-950/80 border border-brand-500/40 flex items-center justify-center mb-2 animate-pulse text-brand-400 shadow-xl shadow-brand-950/80">
          <svg class="w-5 h-5 sm:w-6 sm:h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        </div>
        <span class="text-[11px] sm:text-xs text-rose-200/90 font-medium tracking-wide">Menyiapkan video...</span>
      `;
      videoWrapper.appendChild(loader);

      const previewUrl = item.embedPreviewUrl || (item.id ? `https://drive.google.com/file/d/${item.id}/preview` : item.streamUrl);

      const iframe = document.createElement('iframe');
      iframe.src = previewUrl;
      iframe.className = 'w-full h-full border-0';
      iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.setAttribute('loading', 'eager');

      const removeLoader = () => {
        loader.classList.add('opacity-0');
        setTimeout(() => loader.remove(), 320);
      };

      iframe.onload = removeLoader;
      setTimeout(removeLoader, 2500);

      videoWrapper.appendChild(iframe);
      content.appendChild(videoWrapper);
    }

    // Update Prev/Next button states
    const btnPrev = document.getElementById('modalBtnPrev');
    const btnNext = document.getElementById('modalBtnNext');
    if (btnPrev) btnPrev.style.display = this.currentList.length > 1 ? 'flex' : 'none';
    if (btnNext) btnNext.style.display = this.currentList.length > 1 ? 'flex' : 'none';
  },

  next() {
    this.stopAutoSlide();
    if (!this.currentList.length) return;
    this.currentIndex = (this.currentIndex + 1) % this.currentList.length;
    this.renderCurrent();
  },

  prev() {
    this.stopAutoSlide();
    if (!this.currentList.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.currentList.length) % this.currentList.length;
    this.renderCurrent();
  },

  close() {
    this.stopAutoSlide();
    const modal = document.getElementById('mediaModal');
    const content = document.getElementById('modalContent');
    if (!modal) return;

    modal.classList.add('opacity-0');
    if (content) content.classList.add('scale-95');
    const captionInner = document.getElementById('modalCaptionInner');
    if (captionInner) captionInner.classList.remove('video-caption-compact');

    // Stop active video / iframe playback
    if (content) {
      const iframe = content.querySelector('iframe');
      if (iframe) {
        iframe.src = 'about:blank';
      }
      const video = content.querySelector('video');
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }

    setTimeout(() => {
      modal.classList.remove('flex');
      modal.classList.add('hidden');
      if (content) content.innerHTML = '';
    }, 280);
  },

  /* ====================================================
   * EDIT NAMA FOTO & CATATAN KENANGAN
   * ==================================================== */
  openEditModal() {
    const item = this.currentList[this.currentIndex];
    if (!item) return;

    const modal = document.getElementById('editMediaModal');
    const nameInput = document.getElementById('editMediaNameInput');
    const dateInput = document.getElementById('editMediaDateInput');
    const notesInput = document.getElementById('editMediaNotesInput');
    const albumSelect = document.getElementById('editMediaAlbumSelect');

    if (nameInput) nameInput.value = item.name || '';
    if (notesInput) notesInput.value = item.notes || '';
    if (dateInput) {
      dateInput.value = item.date || (item.createdAt ? item.createdAt.split('T')[0] : '');
    }

    // Pastikan dropdown album terisi
    if (window.AlbumsManager) {
      AlbumsManager.populateDropdowns();
    }
    if (albumSelect) {
      albumSelect.value = item.album || '';
    }

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeEditModal() {
    const modal = document.getElementById('editMediaModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async saveEdit() {
    const item = this.currentList[this.currentIndex];
    if (!item) return;

    const nameInput = document.getElementById('editMediaNameInput');
    const dateInput = document.getElementById('editMediaDateInput');
    const notesInput = document.getElementById('editMediaNotesInput');
    const albumSelect = document.getElementById('editMediaAlbumSelect');
    const saveBtn = document.getElementById('editMediaSaveBtn');

    const newName = nameInput ? nameInput.value.trim() : '';
    const newNotes = notesInput ? notesInput.value.trim() : '';
    const newDate = dateInput ? dateInput.value : '';
    const selectedOption = albumSelect ? albumSelect.options[albumSelect.selectedIndex] : null;
    const targetAlbum = albumSelect ? albumSelect.value : '';
    const targetAlbumId = selectedOption ? (selectedOption.dataset.albumId || '') : '';
    const targetYear = selectedOption ? (selectedOption.dataset.year || '') : item.year;
    const targetMonth = selectedOption ? (selectedOption.dataset.month || '') : item.month;
    const removeFromAlbum = !targetAlbum;

    if (!newName) {
      App.showToast('Nama kenangan tidak boleh kosong.', 'warning');
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
      const payload = {
        action: 'update_media',
        fileId: item.id,
        name: newName,
        notes: newNotes,
        date: newDate,
        album: targetAlbum,
        albumId: targetAlbumId,
        year: targetYear || item.year,
        month: targetMonth || item.month,
        removeFromAlbum: removeFromAlbum
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status === 'success') {
        // Perbarui item lokal secara reaktif
        item.name = newName;
        item.notes = newNotes;
        item.description = newNotes;
        if (newDate) {
          item.date = newDate;
          item.createdAt = newDate + 'T12:00:00.000Z';
        }
        item.album = targetAlbum;
        item.albumId = targetAlbumId;

        // Sinkronisasi data di GalleryManager jika ada
        if (window.GalleryManager && GalleryManager.allMedia) {
          const gItem = GalleryManager.allMedia.find(m => m.id === item.id);
          if (gItem) {
            gItem.name = newName;
            gItem.notes = newNotes;
            gItem.description = newNotes;
            if (newDate) {
              gItem.date = newDate;
              gItem.createdAt = newDate + 'T12:00:00.000Z';
            }
            gItem.album = targetAlbum;
            gItem.albumId = targetAlbumId;
            GalleryManager.applyFilters();
          }
        }

        // Sinkronisasi data di AlbumsManager jika ada
        if (window.AlbumsManager) {
          AlbumsManager.fetchAlbums();
          if (AlbumsManager.currentAlbumMedia) {
            const aItem = AlbumsManager.currentAlbumMedia.find(m => m.id === item.id);
            if (aItem) {
              aItem.name = newName;
              aItem.notes = newNotes;
              aItem.album = targetAlbum;
              aItem.albumId = targetAlbumId;
              AlbumsManager.renderAlbumMedia(AlbumsManager.currentAlbumMedia);
            }
          }
        }

        this.renderCurrent();
        this.closeEditModal();
        App.showToast('Kenangan berhasil diperbarui!', 'success');
      } else {
        App.showToast(data.message || 'Gagal memperbarui kenangan.', 'error');
      }
    } catch (e) {
      console.error('Update Media Error:', e);
      App.showToast('Gagal menghubungi server.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan Perubahan';
      }
    }
  },

  /**
   * Menghapus foto/video saat ini secara permanen dari Google Drive
   */
  async deleteCurrentMedia() {
    const item = this.currentList[this.currentIndex];
    if (!item) return;

    const confirmed = await App.showConfirm({
      title: 'Hapus Kenangan?',
      message: `Hapus permanen "${item.name}" dari Google Drive? File terkait akan dihapus secara permanen dan tidak dapat dipulihkan.`,
      confirmText: 'Ya, Hapus Permanen',
      cancelText: 'Batal',
      type: 'danger'
    });
    if (!confirmed) return;

    const apiUrl = App.getApiUrl();
    if (!apiUrl || !apiUrl.includes('/exec')) {
      App.showToast('URL API belum diatur.', 'error');
      return;
    }

    App.showToast('Menghapus kenangan dari Google Drive...', 'info');

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_media',
          fileId: item.id
        })
      });
      const data = await res.json();

      if (data.status === 'success') {
        App.showToast('Kenangan berhasil dihapus secara permanen dari Google Drive.', 'success');
        
        // Tutup modal edit jika terbuka
        this.closeEditModal();

        const deletedId = item.id;

        // Hapus dari antrean lokal modal
        this.currentList.splice(this.currentIndex, 1);

        // Hapus dari data GalleryManager
        if (window.GalleryManager && GalleryManager.allMedia) {
          GalleryManager.allMedia = GalleryManager.allMedia.filter(m => m.id !== deletedId);
          GalleryManager.applyFilters();
        }

        // Hapus dari data AlbumsManager jika sedang dalam album
        if (window.AlbumsManager) {
          if (AlbumsManager.currentAlbumMedia) {
            AlbumsManager.currentAlbumMedia = AlbumsManager.currentAlbumMedia.filter(m => m.id !== deletedId);
            AlbumsManager.renderAlbumMedia(AlbumsManager.currentAlbumMedia);
            const countEl = document.getElementById('detailAlbumCount');
            if (countEl) countEl.textContent = `${AlbumsManager.currentAlbumMedia.length} Momen Tersimpan`;
          }
          AlbumsManager.fetchAlbums();
        }

        // Sinkronisasi dengan BucketList
        if (window.BucketListManager && BucketListManager.items) {
          BucketListManager.items.forEach(b => {
            if (b.photoId === deletedId) {
              b.photoId = '';
              b.photoUrl = '';
            }
          });
          BucketListManager.saveToCache();
          BucketListManager.render();
        }

        // Jika semua item habis, tutup modal; jika ada sisa, render berikutnya
        if (this.currentList.length === 0) {
          this.close();
        } else {
          if (this.currentIndex >= this.currentList.length) {
            this.currentIndex = this.currentList.length - 1;
          }
          this.renderCurrent();
        }
      } else {
        App.showToast(data.message || 'Gagal menghapus file dari Google Drive.', 'error');
      }
    } catch (e) {
      console.error('Delete Media Error:', e);
      App.showToast('Gagal menghubungi server Google Drive.', 'error');
    }
  },

  formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  }
};

window.ModalManager = ModalManager;
