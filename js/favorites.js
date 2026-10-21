/**
 * ADNA Moments — Favorites Manager v1.0
 * Handles marking photos/videos as favorites (❤️),
 * LocalStorage persistence, instant UI synchronization,
 * and background cloud synchronization with Google Apps Script.
 */

const FavoritesManager = {
  STORAGE_KEY: 'adna_favorite_ids',
  favoriteIds: new Set(),

  init() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.favoriteIds = new Set(parsed.map(String));
        }
      }
    } catch (e) {
      console.warn('[FavoritesManager] Gagal memuat data dari localStorage:', e);
      this.favoriteIds = new Set();
    }
  },

  isFavorite(id) {
    if (!id) return false;
    return this.favoriteIds.has(String(id));
  },

  save() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(this.favoriteIds)));
    } catch (e) {
      console.warn('[FavoritesManager] Gagal menyimpan ke localStorage:', e);
    }
  },

  toggle(id, targetBtn = null) {
    if (!id) return false;
    const strId = String(id);
    const willBeFav = !this.favoriteIds.has(strId);

    if (willBeFav) {
      this.favoriteIds.add(strId);
    } else {
      this.favoriteIds.delete(strId);
    }
    this.save();

    // 1. Update all matching card heart buttons in DOM
    this.updateCardHearts(strId, willBeFav);

    // 2. Update Modal heart button if currently open & showing this item
    if (window.ModalManager && ModalManager.currentList) {
      const current = ModalManager.currentList[ModalManager.currentIndex];
      if (current && String(current.id) === strId) {
        ModalManager.updateFavoriteBtn(willBeFav);
      }
    }

    // 3. If Gallery is filtering by favorites, refresh view
    if (window.GalleryManager && GalleryManager.filterFavorite) {
      GalleryManager.applyFilters();
    }

    // 4. If Album Detail is filtering by favorites, refresh view
    if (window.AlbumsManager && AlbumsManager.filterFavorite) {
      AlbumsManager.renderPaginatedMedia();
    }

    // 5. Update Highlight Slideshow in Gallery automatically
    if (window.GalleryManager && typeof GalleryManager.updateHighlightsOnFavoriteChange === 'function') {
      GalleryManager.updateHighlightsOnFavoriteChange();
    }

    // 6. Background sync to Google Apps Script cloud
    this.syncToBackend(strId, willBeFav);

    // 6. User feedback toast
    if (window.App && typeof App.showToast === 'function') {
      App.showToast(
        willBeFav ? 'Ditambahkan ke Favorit ❤️' : 'Dihapus dari Favorit',
        willBeFav ? 'success' : 'info'
      );
    }

    return willBeFav;
  },

  updateCardHearts(id, isFav) {
    const btns = document.querySelectorAll(`[data-fav-id="${id}"]`);
    btns.forEach(btn => {
      btn.setAttribute('data-is-fav', isFav ? 'true' : 'false');
      btn.setAttribute('aria-label', isFav ? 'Hapus dari favorit' : 'Tandai favorit');
      btn.setAttribute('title', isFav ? 'Hapus dari favorit' : 'Tandai favorit');
      if (isFav) {
        btn.className = 'absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full backdrop-blur-md border transition-all active:scale-90 bg-rose-500/25 border-rose-500/50 text-rose-500 shadow-lg shadow-rose-950/50';
        btn.innerHTML = '<svg class="w-4 h-4 fill-rose-500 text-rose-500" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
      } else {
        btn.className = 'absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full backdrop-blur-md border transition-all active:scale-90 bg-black/50 border-white/10 text-white/70 hover:text-rose-400 hover:bg-black/70';
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>';
      }
    });
  },

  async syncToBackend(fileIdOrIds, isFav) {
    if (!window.App || typeof App.getApiUrl !== 'function') return;
    const apiUrl = App.getApiUrl();
    if (!apiUrl) return;
    try {
      const payload = {
        action: 'toggle_favorite',
        favorite: isFav
      };
      if (Array.isArray(fileIdOrIds)) {
        payload.fileIds = fileIdOrIds;
      } else {
        payload.fileId = fileIdOrIds;
      }
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('[FavoritesManager] Gagal sync ke cloud (tetap tersimpan di perangkat):', e);
    }
  },

  mergeFromApi(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    let changed = false;

    // Periksa apakah cloud backend sudah aktif mendukung field 'favorite' boolean
    const serverSupportsFavorite = items.some(item => item && typeof item.favorite === 'boolean');

    if (serverSupportsFavorite) {
      // Cloud sync aktif: sinkronkan data server ke perangkat ini
      items.forEach(item => {
        if (!item || !item.id) return;
        const idStr = String(item.id);
        if (item.favorite === true) {
          if (!this.favoriteIds.has(idStr)) {
            this.favoriteIds.add(idStr);
            changed = true;
          }
        } else if (item.favorite === false) {
          // Jika di cloud sudah bukan favorit dan perangkat ini sudah sinkron dengan cloud
          if (this.favoriteIds.has(idStr) && localStorage.getItem('adna_fav_cloud_synced')) {
            this.favoriteIds.delete(idStr);
            changed = true;
          }
        }
      });

      // Migrasi awal otomatis: Jika ada favorit lokal lama yang belum tercatat di Google Drive
      if (!localStorage.getItem('adna_fav_cloud_synced') && this.favoriteIds.size > 0) {
        const unsyncedIds = [];
        this.favoriteIds.forEach(id => {
          const match = items.find(m => String(m.id) === id);
          if (match && match.favorite !== true) {
            unsyncedIds.push(id);
            match.favorite = true;
          }
        });
        if (unsyncedIds.length > 0) {
          this.syncToBackend(unsyncedIds, true);
        }
        localStorage.setItem('adna_fav_cloud_synced', 'true');
      } else {
        localStorage.setItem('adna_fav_cloud_synced', 'true');
      }
    } else {
      // Backend versi lama (sebelum update code.gs dideploy): pertahankan status lokal
      items.forEach(item => {
        if (!item || !item.id) return;
        const idStr = String(item.id);
        if (this.favoriteIds.has(idStr)) {
          item.favorite = true;
        }
      });
    }

    if (changed) {
      this.save();
      if (window.GalleryManager && typeof GalleryManager.updateHighlightsOnFavoriteChange === 'function') {
        GalleryManager.updateHighlightsOnFavoriteChange();
      }
    }
  }
};

// Initialize immediately on load
if (typeof window !== 'undefined') {
  window.FavoritesManager = FavoritesManager;
  FavoritesManager.init();
}
