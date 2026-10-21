/**
 * ADNA Moments — Core Application Controller & PWA Lifecycle
 */

const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbxNX1MZ3OwOg6-bCfHqMBrVyCOSKhtDCYurbHoQIHmFMvsVSgYrDv0K0IS7Y0Fy3D-YRg/exec";
const STORAGE_KEY_API_URL = "adna_moments_api_url";

const App = {
  deferredPrompt: null,

  init() {
    // Intercept native browser alert to use custom pop-up modal
    window.alert = (msg) => {
      this.showAlert({ message: String(msg) });
    };

    this.initRouter();
    this.initPWA();
    this.initNetworkListeners();
    this.initSettingsModal();

    // Initialize Sub-Managers
    if (window.FavoritesManager) FavoritesManager.init();
    if (window.ModalManager) ModalManager.init();
    if (window.UploadManager) UploadManager.init();
    if (window.GalleryManager) GalleryManager.init();
    if (window.AlbumsManager) AlbumsManager.init();
    if (window.BucketListManager) BucketListManager.init();
  },

  /* ----------------------------------------------------
   * API CONFIGURATION & STORAGE
   * ---------------------------------------------------- */
  getApiUrl() {
    return localStorage.getItem(STORAGE_KEY_API_URL) || DEFAULT_API_URL;
  },

  setApiUrl(newUrl) {
    if (!newUrl || !newUrl.trim()) {
      localStorage.removeItem(STORAGE_KEY_API_URL);
    } else {
      localStorage.setItem(STORAGE_KEY_API_URL, newUrl.trim());
    }
  },

  initSettingsModal() {
    const input = document.getElementById('settingApiUrlInput');
    if (input) {
      input.value = this.getApiUrl();
    }
  },

  openSettings() {
    const modal = document.getElementById('settingsModal');
    const input = document.getElementById('settingApiUrlInput');
    if (input) input.value = this.getApiUrl();
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  saveSettings() {
    const input = document.getElementById('settingApiUrlInput');
    if (!input) return;

    const val = input.value.trim();
    if (val && !val.includes('/exec')) {
      this.showToast('URL Google Apps Script harus berakhiran "/exec"', 'warning');
      return;
    }

    this.setApiUrl(val);
    this.closeSettings();
    this.showToast('Pengaturan API berhasil disimpan!', 'success');
    GalleryManager.fetchGallery();
    if (window.AlbumsManager) AlbumsManager.fetchAlbums();
  },

  resetSettings() {
    const input = document.getElementById('settingApiUrlInput');
    if (input) input.value = DEFAULT_API_URL;
    this.setApiUrl(DEFAULT_API_URL);
    this.closeSettings();
    this.showToast('URL Google Apps Script direset ke bawaan.', 'info');
    GalleryManager.fetchGallery();
    if (window.AlbumsManager) AlbumsManager.fetchAlbums();
  },

  /* ----------------------------------------------------
   * ROUTING & NAVIGATION
   * ---------------------------------------------------- */
  initRouter() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (['upload', 'gallery', 'albums', 'album-detail', 'bucketlist'].includes(hash)) {
        this.switchPage(hash, false);
      }
    });

    const initialHash = window.location.hash.replace('#', '');
    if (['upload', 'albums', 'album-detail', 'bucketlist'].includes(initialHash)) {
      this.switchPage(initialHash, false);
    } else {
      this.switchPage('gallery', false);
    }
  },

  switchPage(page, updateHash = true) {
    if (updateHash) {
      window.location.hash = page;
    }

    const galleryPage = document.getElementById('gallery-page');
    const albumsPage = document.getElementById('albums-page');
    const albumDetailPage = document.getElementById('album-detail-page');
    const uploadPage = document.getElementById('upload-page');
    const bucketlistPage = document.getElementById('bucketlist-page');

    const pages = {
      'gallery': galleryPage,
      'albums': albumsPage,
      'album-detail': albumDetailPage,
      'upload': uploadPage,
      'bucketlist': bucketlistPage
    };

    Object.keys(pages).forEach(key => {
      const el = pages[key];
      if (!el) return;
      if (key === page) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Pause/Resume Highlight Slideshow based on active page
    if (page === 'gallery') {
      if (window.GalleryManager && typeof GalleryManager.startHighlightTimer === 'function') {
        GalleryManager.startHighlightTimer();
      }
    } else {
      if (window.GalleryManager && typeof GalleryManager.stopHighlightTimer === 'function') {
        GalleryManager.stopHighlightTimer();
      }
    }

    // Desktop Nav Styling
    const dGallery = document.getElementById('nav-btn-gallery');
    const dAlbums = document.getElementById('nav-btn-albums');
    const dUpload = document.getElementById('nav-btn-upload');
    const dBucketlist = document.getElementById('nav-btn-bucketlist');
    const activeDesk = ['text-white', 'bg-brand-600/25', 'border-brand-500/30', 'shadow-[0_0_15px_rgba(225,29,72,0.3)]'];
    const inactiveDesk = ['text-slate-300', 'border-transparent', 'hover:text-white', 'hover:bg-white/5'];

    const setDeskNav = (btn, isActive) => {
      if (!btn) return;
      if (isActive) {
        btn.classList.remove(...inactiveDesk);
        btn.classList.add(...activeDesk);
      } else {
        btn.classList.remove(...activeDesk);
        btn.classList.add(...inactiveDesk);
      }
    };

    setDeskNav(dGallery, page === 'gallery');
    setDeskNav(dAlbums, page === 'albums' || page === 'album-detail');
    setDeskNav(dUpload, page === 'upload');
    setDeskNav(dBucketlist, page === 'bucketlist');

    // Mobile Bottom Nav Styling
    const mGallery = document.getElementById('mob-nav-gallery');
    const mAlbums = document.getElementById('mob-nav-albums');
    const mUpload = document.getElementById('mob-nav-upload');
    const mBucketlist = document.getElementById('mob-nav-bucketlist');
    const activeMob = ['text-brand-400', 'bg-brand-900/40'];
    const inactiveMob = ['text-slate-400'];

    const setMobNav = (btn, isActive) => {
      if (!btn) return;
      if (isActive) {
        btn.classList.remove(...inactiveMob);
        btn.classList.add(...activeMob);
      } else {
        btn.classList.remove(...activeMob);
        btn.classList.add(...inactiveMob);
      }
    };

    setMobNav(mGallery, page === 'gallery');
    setMobNav(mAlbums, page === 'albums' || page === 'album-detail');
    setMobNav(mUpload, page === 'upload');
    setMobNav(mBucketlist, page === 'bucketlist');

    if (page === 'bucketlist' && window.BucketListManager) {
      BucketListManager.render();
      BucketListManager.fetchFromCloud();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* ----------------------------------------------------
   * PWA LIFECYCLE & INSTALLATION
   * ---------------------------------------------------- */
  initPWA() {
    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker terdaftar dengan scope:', registration.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Pendaftaran Service Worker gagal:', err);
          });
      });
    }

    // 2. Handle beforeinstallprompt (Chrome, Edge, Android)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      // Show install buttons
      const deskInstallBtn = document.getElementById('pwaInstallBtnDesk');
      const banner = document.getElementById('pwaInstallBanner');

      if (deskInstallBtn) deskInstallBtn.classList.remove('hidden');
      if (banner) banner.classList.remove('hidden');
    });

    // 3. Handle appinstalled event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      const deskInstallBtn = document.getElementById('pwaInstallBtnDesk');
      const banner = document.getElementById('pwaInstallBanner');

      if (deskInstallBtn) deskInstallBtn.classList.add('hidden');
      if (banner) banner.classList.add('hidden');

      this.showToast('ADNA Moments berhasil dipasang ke perangkatmu!', 'success');
    });

    // 4. iOS Safari Check
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (isIos && !isStandalone) {
      const iosBanner = document.getElementById('iosInstallBanner');
      if (iosBanner) {
        // Show after 2 seconds if not previously dismissed
        if (!localStorage.getItem('adna_ios_install_dismissed')) {
          setTimeout(() => {
            iosBanner.classList.remove('hidden');
          }, 2000);
        }
      }
    }
  },

  async promptInstall() {
    if (!this.deferredPrompt) {
      this.showToast('Gunakan opsi "Tambahkan ke Layar Utama" di menu browsermu.', 'info');
      return;
    }

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('[PWA] User menyetujui instalasi aplikasi');
    }
    this.deferredPrompt = null;

    const deskInstallBtn = document.getElementById('pwaInstallBtnDesk');
    const banner = document.getElementById('pwaInstallBanner');
    if (deskInstallBtn) deskInstallBtn.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
  },

  dismissIosBanner() {
    const iosBanner = document.getElementById('iosInstallBanner');
    if (iosBanner) iosBanner.classList.add('hidden');
    localStorage.setItem('adna_ios_install_dismissed', 'true');
  },

  /* ----------------------------------------------------
   * NETWORK STATUS LISTENERS
   * ---------------------------------------------------- */
  initNetworkListeners() {
    window.addEventListener('online', () => {
      this.showToast('Koneksi internet kembali aktif.', 'success');
      GalleryManager.fetchGallery();
    });

    window.addEventListener('offline', () => {
      this.showToast('Koneksi internet terputus. Mode offline aktif.', 'warning');
    });
  },

  /* ----------------------------------------------------
   * TOAST NOTIFICATION SYSTEM
   * ---------------------------------------------------- */
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');

    let style = 'bg-brand-950/85 border-brand-500/50 text-brand-100';
    let iconSvg = `
      <svg class="w-5 h-5 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    `;

    if (type === 'success') {
      style = 'bg-emerald-950/85 border-emerald-500/50 text-emerald-100';
      iconSvg = `
        <svg class="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      `;
    } else if (type === 'error') {
      style = 'bg-red-950/85 border-red-500/50 text-red-100';
      iconSvg = `
        <svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      `;
    } else if (type === 'warning') {
      style = 'bg-amber-950/85 border-amber-500/50 text-amber-100';
      iconSvg = `
        <svg class="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
      `;
    }

    toast.className = `px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs sm:text-sm font-medium flex items-center gap-3 toast-enter ${style}`;
    toast.innerHTML = `
      ${iconSvg}
      <div class="flex-1 leading-snug">${message}</div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-active'));

    setTimeout(() => {
      toast.classList.remove('toast-active');
      setTimeout(() => toast.remove(), 320);
    }, duration);
  },

  /* ----------------------------------------------------
   * CUSTOM POP-UP CONFIRMATION / ALERT DIALOG
   * ---------------------------------------------------- */
  showConfirm({
    title = 'Konfirmasi',
    message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
    confirmText = 'Lanjutkan',
    cancelText = 'Batal',
    type = 'danger'
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmModalTitle');
      const messageEl = document.getElementById('confirmModalMessage');
      const iconWrapper = document.getElementById('confirmModalIconWrapper');
      const confirmBtn = document.getElementById('confirmModalConfirmBtn');
      const cancelBtn = document.getElementById('confirmModalCancelBtn');

      if (!modal || !confirmBtn || !cancelBtn) {
        resolve(window.confirm(message));
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;
      cancelBtn.style.display = '';

      if (type === 'danger') {
        iconWrapper.className = 'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg bg-rose-500/20 text-rose-400 border border-rose-500/30';
        iconWrapper.innerHTML = `
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        `;
        confirmBtn.className = 'flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-lg transition bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 hover:shadow-rose-500/25 active:scale-95';
      } else if (type === 'warning') {
        iconWrapper.className = 'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg bg-amber-500/20 text-amber-400 border border-amber-500/30';
        iconWrapper.innerHTML = `
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        `;
        confirmBtn.className = 'flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-lg transition bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 hover:shadow-amber-500/25 active:scale-95';
      } else {
        iconWrapper.className = 'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg bg-brand-500/20 text-brand-400 border border-brand-500/30';
        iconWrapper.innerHTML = `
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        `;
        confirmBtn.className = 'flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-lg transition bg-gradient-to-r from-brand-600 to-rose-600 hover:from-brand-500 hover:to-rose-500 hover:shadow-brand-500/25 active:scale-95';
      }

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
      });

      const cleanup = (result) => {
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0');
        setTimeout(() => {
          modal.classList.add('hidden');
          modal.classList.remove('flex');
        }, 220);

        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (e) => {
        if (e.target === modal) cleanup(false);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') cleanup(false);
      };

      confirmBtn.addEventListener('click', onConfirm, { once: true });
      cancelBtn.addEventListener('click', onCancel, { once: true });
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  },

  showAlert({
    title = 'Pemberitahuan',
    message = '',
    confirmText = 'Mengerti',
    type = 'info'
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmModalTitle');
      const messageEl = document.getElementById('confirmModalMessage');
      const iconWrapper = document.getElementById('confirmModalIconWrapper');
      const confirmBtn = document.getElementById('confirmModalConfirmBtn');
      const cancelBtn = document.getElementById('confirmModalCancelBtn');

      if (!modal || !confirmBtn) {
        window.alert(message);
        resolve();
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;
      confirmBtn.textContent = confirmText;
      if (cancelBtn) cancelBtn.style.display = 'none';

      if (type === 'danger' || type === 'error') {
        iconWrapper.className = 'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg bg-rose-500/20 text-rose-400 border border-rose-500/30';
        iconWrapper.innerHTML = `
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        `;
        confirmBtn.className = 'flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-lg transition bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-95';
      } else if (type === 'warning') {
        iconWrapper.className = 'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg bg-amber-500/20 text-amber-400 border border-amber-500/30';
        iconWrapper.innerHTML = `
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        `;
        confirmBtn.className = 'flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-lg transition bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 active:scale-95';
      } else {
        iconWrapper.className = 'w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg bg-brand-500/20 text-brand-400 border border-brand-500/30';
        iconWrapper.innerHTML = `
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        `;
        confirmBtn.className = 'flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-lg transition bg-gradient-to-r from-brand-600 to-rose-600 hover:from-brand-500 hover:to-rose-500 active:scale-95';
      }

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
      });

      const cleanup = () => {
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0');
        setTimeout(() => {
          modal.classList.add('hidden');
          modal.classList.remove('flex');
          if (cancelBtn) cancelBtn.style.display = '';
        }, 220);

        confirmBtn.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve();
      };

      const onConfirm = () => cleanup();
      const onBackdrop = (e) => {
        if (e.target === modal) cleanup();
      };
      const onKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') cleanup();
      };

      confirmBtn.addEventListener('click', onConfirm, { once: true });
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }
};

// Global Exposure
window.App = App;

// Bootstrap Application
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
