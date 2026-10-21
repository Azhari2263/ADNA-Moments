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

    // 5. Background sync to Google Apps Script cloud
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

  async syncToBackend(fileId, isFav) {
    if (!window.App || typeof App.getApiUrl !== 'function') return;
    const apiUrl = App.getApiUrl();
    if (!apiUrl) return;
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'toggle_favorite',
          fileId: fileId,
          favorite: isFav
        })
      });
    } catch (e) {
      console.warn('[FavoritesManager] Gagal sync ke cloud (tetap tersimpan di perangkat):', e);
    }
  },

  mergeFromApi(items) {
    if (!Array.isArray(items)) return;
    let changed = false;
    items.forEach(item => {
      if (item && item.id) {
        const idStr = String(item.id);
        if (item.favorite) {
          if (!this.favoriteIds.has(idStr)) {
            this.favoriteIds.add(idStr);
            changed = true;
          }
        } else if (this.favoriteIds.has(idStr)) {
          item.favorite = true;
        }
      }
    });
    if (changed) this.save();
  }
};

// Initialize immediately on load
if (typeof window !== 'undefined') {
  window.FavoritesManager = FavoritesManager;
  FavoritesManager.init();
}
