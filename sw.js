// Service worker: uygulama kabuğunu önbelleğe alır → internet olmadan elle giriş, simülasyon ve
// optimizasyon çalışır. Strateji: önce ağ (güncel sürüm), ağ yoksa önbellek.
const CACHE = 'teuton-oasis-v3';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'src/ui/app.js', 'src/ui/store.js', 'src/i18n.js', 'src/data/units.js', 'src/data/nature.js', 'src/data/references.js',
  'src/engine/battle.js', 'src/engine/travel.js', 'src/optimizer/optimizer.js', 'src/optimizer/worker.js',
  'src/vision/parse.js', 'src/vision/claude.js', 'src/vision/icons.js', 'src/data/icon-templates.js',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('teuton-oasis-')).map((k) => caches.delete(k))  /* hun/ ve roma/ araçlarının önbelleğine dokunma */)).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API/CDN istekleri önbelleğe alınmaz
  if (url.pathname.startsWith(new URL('hun/', self.registration.scope).pathname)) return; // hun/ altındaki Hun aracı kendi service worker'ını kullanır
  if (url.pathname.startsWith(new URL('roma/', self.registration.scope).pathname)) return; // roma/ altındaki Romalı aracı kendi service worker'ını kullanır
  if (url.pathname.startsWith(new URL('radyoloji/', self.registration.scope).pathname)) return; // radyoloji/ kart uygulaması önbelleğe alınmaz
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
