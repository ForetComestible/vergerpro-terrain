// Service Worker — Mon Terrain
// Cache l'app shell + les tuiles satellite consultées pour un usage hors ligne partiel
const VERSION = 'vt-v1';
const APP_SHELL = [
  './verger-terrain.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
const TILE_CACHE = 'vt-tiles-v1';
const TILE_LIMIT = 600; // ~600 tuiles ≈ 15-30 MB, couvre largement un terrain de 7500 m²

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION && k !== TILE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function trimTileCache(){
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if(keys.length > TILE_LIMIT){
    // Supprimer les plus anciennes (FIFO)
    for(let i = 0; i < keys.length - TILE_LIMIT; i++){
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Tuiles satellite : cache-first avec mise en cache au passage
  if(url.includes('arcgisonline.com')){
    e.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if(cached) return cached;
          return fetch(e.request).then(resp => {
            if(resp.ok){ cache.put(e.request, resp.clone()); trimTileCache(); }
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Météo et Nominatim : network-only (données temps réel)
  if(url.includes('open-meteo.com') || url.includes('nominatim')) return;

  // App shell : cache-first, mise à jour en arrière-plan
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        if(resp.ok && e.request.method === 'GET'){
          caches.open(VERSION).then(c => c.put(e.request, resp.clone()));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
