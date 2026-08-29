/* install.js — small PWA install helper for Vinyl Quest
   - Shows native prompt on Android/Chrome via beforeinstallprompt
   - Shows instructional modal on iOS Safari
   - Shows message on Desktop when appropriate
*/
(function(){
  const installBtn = document.getElementById('installBtn');
  const installModal = document.getElementById('installModal');
  const closeModal = document.getElementById('closeInstallModal');
  let deferredPrompt = null;

  // Basic platform detection
  const isIos = (() => {
    // iOS detection that works on modern devices (covers iPadOS touch Macs too)
    const ua = navigator.userAgent || '';
    return /iP(ad|hone|od)/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  })();

  const isInStandalone = () => window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // Show the install UI unless already installed
  function showInstallButton() {
    if (isInStandalone()) return hideInstallUI();
    installBtn.style.display = 'inline-flex';
    installBtn.setAttribute('aria-hidden', 'false');
  }
  function hideInstallUI() {
    if (installBtn) {
      installBtn.style.display = 'none';
      installBtn.setAttribute('aria-hidden', 'true');
    }
  }

  // Android/Chrome: beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e; // save for later
    // show the button so user can trigger
    showInstallButton();
  });

  // If the app was installed, hide the button
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallUI();
    console.log('PWA installed');
  });

  // Click handler
  installBtn.addEventListener('click', async () => {
    // If we have the native prompt available (Chrome/Android)
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice; // accepted/ dismissed
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
      hideInstallUI();
      return;
    }

    // iOS flow: show modal with instructions
    if (isIos) {
      // Show modal
      installModal.style.display = 'flex';
      installModal.setAttribute('aria-hidden', 'false');
      return;
    }

    // Desktop or unsupported browsers: show short message
    try {
      // Create a lightweight ephemeral toast
      const toast = document.createElement('div');
      toast.textContent = 'Playable in your browser — for a native-like app, use the browser menu to "Install" or "Create shortcut".';
      Object.assign(toast.style, {
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '22px', zIndex: 10001,
        background: 'rgba(20,16,20,0.95)', color: '#fff', padding: '10px 14px', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.04)'
      });
      document.body.appendChild(toast);
      setTimeout(()=> toast.remove(), 4500);
    } catch (err) {
      console.warn('install message failed', err);
    }
  });

  // Close modal
  closeModal.addEventListener('click', () => {
    installModal.style.display = 'none';
    installModal.setAttribute('aria-hidden', 'true');
  });

  // On load, decide whether to show/hide the button
  function init() {
    // If beforeinstallprompt hasn't fired yet, still show button for iOS detection
    if (isIos) {
      // Show the button so players know installation is possible on iOS
      showInstallButton();
      // but keep behavior to open modal
    } else {
      // For others, wait for beforeinstallprompt or show a subtle affordance on Desktop
      // We'll reveal the button if beforeinstallprompt fires; otherwise keep it hidden
      // but give Desktop a visible but subtle affordance: show only when mouse moves up (optional)
    }

    // If already in standalone mode, hide
    if (isInStandalone()) hideInstallUI();
  }

  // Lightweight UX: show install button briefly on desktop when user moves pointer to top-right
  let pointerHandlerAttached = false;
  function attachPointerHint() {
    if (pointerHandlerAttached || isIos) return;
    pointerHandlerAttached = true;
    const hint = (ev) => {
      if (ev.clientX > window.innerWidth - 120 && ev.clientY < 120) {
        // show a one-time subtle hint
        showInstallButton();
        setTimeout(()=>{ if (!deferredPrompt && !isIos) hideInstallUI(); }, 3500);
        window.removeEventListener('mousemove', hint);
      }
    };
    window.addEventListener('mousemove', hint);
  }

  // initialize
  document.addEventListener('DOMContentLoaded', init);
  attachPointerHint();
})();