/* Service worker: offline app shell, cached Claude SDK, and the "share photos to this app" target. */

const VERSION = 'v5';
const SHELL_CACHE = 'shell-' + VERSION;
const RUNTIME_CACHE = 'runtime-' + VERSION;
const INBOX = 'share-inbox';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './js/config.js', './js/data.js', './js/charts.js', './js/extract.js', './js/github.js', './js/lock.js', './js/app.js', './js/managers.js', './js/report.js', './js/pwa.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL_CACHE, RUNTIME_CACHE, INBOX];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page asks the waiting worker to take over when the user taps "Update".
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Photos shared from WhatsApp / Gallery (Android): park them, then open the New file screen.
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const cache = await caches.open(INBOX);
      const files = form.getAll('photos').filter(f => f && f.type && f.type.startsWith('image/'));
      await Promise.all(files.map((f, i) => cache.put(`./shared/${Date.now()}-${i}`,
        new Response(f, { headers: { 'Content-Type': f.type, 'X-File-Name': encodeURIComponent(f.name || `photo-${i + 1}.jpg`) } }))));
      return Response.redirect('./#new/shared', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  if (url.hostname === 'api.anthropic.com') return;           // always live

  // App pages: serve the cached shell so the app opens offline.
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => { cachePut(SHELL_CACHE, './index.html', res.clone()); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }

  // Own files and the Claude SDK from the CDN: cache first, refresh in the background.
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const network = fetch(req).then(res => {
        if (res.ok) cachePut(url.origin === location.origin ? SHELL_CACHE : RUNTIME_CACHE, req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })());
  }
});

function cachePut(name, key, res) { caches.open(name).then(c => c.put(key, res)).catch(() => {}); }
