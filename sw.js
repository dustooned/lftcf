// Network-first offline cache. Same-origin files are revalidated on every load ("no-cache" =
// ask the server, usually a cheap 304), so a release can never mix old and new files; when
// offline, the last good copy is served.
const CACHE = 'card-forge-0.8.1'; // keep in step with version.js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const same = new URL(req.url).origin === self.location.origin;
  const net = same ? fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }) : fetch(req);
  e.respondWith(net.then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
