// Network first, cache fallback: online visits always fetch the latest
// files, offline visits use the last copy. Bump VERSION to force refresh.
const VERSION = 'bt-9';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'src/ui/style.css',
  'fonts/baloo2-latin.woff2', 'fonts/baloo2-latin-ext.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(
      () => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) {
    return;
  }
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req)
        .then((hit) => hit || caches.match('./'))));
});
