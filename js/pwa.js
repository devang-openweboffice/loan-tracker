/* PWA glue: service worker, install prompt, update notice, shared-photo inbox, native share. */

const PWA = (() => {
  let installEvent = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !/android/i.test(navigator.userAgent));
  // One line of Home Screen steps for this iPhone browser (Chrome = CriOS, Edge = EdgiOS, Firefox = FxiOS).
  const iosSteps = () => /CriOS|EdgiOS|FxiOS/.test(navigator.userAgent)
    ? 'Tap <b>Share</b> <i class="ios-share"></i> at the right of the address bar, then <b>Add to Home Screen</b>.'
    : 'In Safari tap <b>Share</b> <i class="ios-share"></i>, then <b>Add to Home Screen</b>.';
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const canInstall = () => !!installEvent;

  function register() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js').then(reg => {
      const offer = w => showUpdate(() => w.postMessage('skipWaiting'));
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      // Check for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    // Ask the browser not to clear this app's data when the phone is low on space.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  function showUpdate(apply) {
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '<span>A new version of the app is ready.</span><button class="btn primary">Update</button>';
    bar.querySelector('button').onclick = apply;
    document.body.appendChild(bar);
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvent = e;
    document.dispatchEvent(new Event('pwa-installable'));
  });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('App installed'); document.dispatchEvent(new Event('pwa-installable')); });

  async function install() {
    if (!installEvent) return false;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    installEvent = null;
    return outcome === 'accepted';
  }

  /* Banner on the Files screen until the app is installed (or dismissed). */
  function installBanner() {
    if (standalone()) return '';
    try { if (localStorage.getItem('avani_install_dismissed')) return ''; } catch (e) {}
    if (canInstall()) return `<div class="install-banner"><img src="icons/icon-192.png" alt=""><div><b>Install as an app</b><span>Opens full screen from the home screen and works offline.</span></div>
      <button class="btn primary" data-pwa-install>Install</button><button class="icon-btn" data-pwa-dismiss aria-label="Dismiss">×</button></div>`;
    if (isIOS) return `<div class="install-banner"><img src="icons/icon-192.png" alt=""><div><b>Add to your Home Screen</b><span>${iosSteps()}</span></div>
      <button class="icon-btn" data-pwa-dismiss aria-label="Dismiss">×</button></div>`;
    if (/android/i.test(navigator.userAgent)) return `<div class="install-banner"><img src="icons/icon-192.png" alt=""><div><b>Install as an app</b><span>In Chrome tap the <b>⋮</b> menu, then <b>Install app</b> (or <b>Add to Home screen</b>).</span></div>
      <button class="icon-btn" data-pwa-dismiss aria-label="Dismiss">×</button></div>`;
    return '';
  }
  function bindBanner(root) {
    root.querySelectorAll('[data-pwa-install]').forEach(b => b.onclick = async () => { await install(); route(); });
    root.querySelectorAll('[data-pwa-dismiss]').forEach(b => b.onclick = () => {
      try { localStorage.setItem('avani_install_dismissed', '1'); } catch (e) {}
      b.closest('.install-banner').remove();
    });
  }
  document.addEventListener('pwa-installable', () => { if (/^#?\/?(files)?$/.test(location.hash.replace('#', ''))) route(); });

  /* Photos shared into the app (Android share sheet) wait in a cache until the New file screen picks them up. */
  async function takeShared() {
    if (!('caches' in window)) return [];
    const cache = await caches.open('share-inbox');
    const out = [];
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      const blob = await res.blob();
      out.push(new File([blob], decodeURIComponent(res.headers.get('X-File-Name') || 'photo.jpg'), { type: blob.type || 'image/jpeg' }));
      await cache.delete(req);
    }
    return out;
  }

  /* Native share sheet (WhatsApp, Gmail…) for the report file + summary text. */
  const canShareFiles = () => !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.html', { type: 'text/html' })] }));
  async function share({ title, text, fileName, content, type }) {
    const data = { title, text };
    if (content && canShareFiles()) data.files = [new File([content], fileName, { type })];
    try { await navigator.share(data); return true; }
    catch (e) { return e.name === 'AbortError'; }
  }

  return { register, install, canInstall, standalone, isIOS, iosSteps, installBanner, bindBanner, takeShared, share, canShare: () => !!navigator.share };
})();

PWA.register();
