/**
 * ADNA Moments — Fullscreen Lightbox Modal Manager
 * Features: High-res preview, Video streaming, Next/Prev navigation,
 * Keyboard shortcuts, Touch swipe gestures, and Drive links.
 */

const ModalManager = {
  currentList: [],
  currentIndex: -1,
  touchStartX: 0,
  touchStartY: 0,

  init() {
    // Bind Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('mediaModal');
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
    const counterEl = document.getElementById('modalCounter');
    const driveLink = document.getElementById('modalDriveLink');
    const downloadLink = document.getElementById('modalDownloadLink');

    // Update metadata
    if (titleEl) titleEl.textContent = item.name;
    if (dateEl) dateEl.textContent = this.formatDate(item.createdAt);
    if (counterEl) {
      counterEl.textContent = `${this.currentIndex + 1} / ${this.currentList.length}`;
    }

    if (driveLink) driveLink.href = item.viewUrl || '#';
    if (downloadLink) downloadLink.href = item.streamUrl || item.viewUrl || '#';

    // Clear previous media
    content.innerHTML = '';

    if (item.type === 'photo') {
      const img = document.createElement('img');
      img.src = item.highResUrl || item.viewUrl || item.thumbnailUrl;
      img.alt = item.name;
      img.className = 'max-w-full max-h-[75vh] sm:max-h-[80vh] object-contain rounded-2xl shadow-2xl ring-1 ring-white/10 animate-fadeInScale';
      content.appendChild(img);
    } else {
      const videoWrapper = document.createElement('div');
      videoWrapper.className = 'w-full max-w-4xl max-h-[75vh] sm:max-h-[80vh] flex items-center justify-center';
      
      const video = document.createElement('video');
      video.src = item.streamUrl;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.className = 'max-w-full max-h-[75vh] sm:max-h-[80vh] w-full rounded-2xl shadow-2xl ring-1 ring-white/10 bg-black';
      
      videoWrapper.appendChild(video);
      content.appendChild(videoWrapper);
    }

    // Update Prev/Next button states
    const btnPrev = document.getElementById('modalBtnPrev');
    const btnNext = document.getElementById('modalBtnNext');
    if (btnPrev) btnPrev.style.display = this.currentList.length > 1 ? 'flex' : 'none';
    if (btnNext) btnNext.style.display = this.currentList.length > 1 ? 'flex' : 'none';
  },

  next() {
    if (!this.currentList.length) return;
    this.currentIndex = (this.currentIndex + 1) % this.currentList.length;
    this.renderCurrent();
  },

  prev() {
    if (!this.currentList.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.currentList.length) % this.currentList.length;
    this.renderCurrent();
  },

  close() {
    const modal = document.getElementById('mediaModal');
    const content = document.getElementById('modalContent');
    if (!modal) return;

    modal.classList.add('opacity-0');
    if (content) content.classList.add('scale-95');

    // Stop active video playback
    if (content) {
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
