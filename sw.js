/* Hawaii Trip Companion — iOS Safari & Chrome Full-Offline Service Worker (v47) */
const CACHE_NAME = "hawaii-trip-pwa-v47";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./proto.html",
  "./manifest.webmanifest?v=r47",
  "./lib/three.min.js?v=r47",
  "./lib/island3d.js?v=r47",
  "./data/terrain/bi_dem.png",
  "./data/terrain/oahu_dem.png",
  "./art/pwa/apple-touch-icon.png",
  "./art/pwa/icon-192.png",
  "./art/pwa/icon-512.png",
  "./art/long/balanced_island_poster.jpg?v=r33",
  "./art/icons3d/plane.png",
  "./art/icons3d/coffee.png",
  "./art/icons3d/manta.png",
  "./art/icons3d/horse.png",
  "./art/icons3d/volcano.png",
  "./art/icons3d/turtle.png",
  "./art/icons3d/observatory.png",
  "./art/icons3d/beach.png",
  "./art/icons3d/uni.png",
  "./art/icons3d/house.png",
  "./art/map3d/bi_2k/k00.jpg?v=r32",
  "./art/map3d/oahu_2k/k00.jpg?v=r32"
];

function buildFullOfflineList(){
  const urls = [
    "./art/long/balanced_island.mp4?v=r33",
    "./data/terrain/bi_sat.jpg",
    "./data/terrain/oahu_sat.jpg",
    "./data/terrain/bi_meta.json",
    "./data/terrain/oahu_meta.json",
    "./art/hero_editorial_mag.png",
    "./art/hero_clay_tropical.png",
    "./art/hero_lumy_glow.png",
    "./art/hero_agency_graphic.png",
    "./art/hero_headspace_botanical.png",
    "./art/map3d/bi_2k/k00.jpg?v=r32",
    "./art/map3d/bi_2k/k07.jpg?v=r32",
    "./art/map3d/bi_2k/k15.jpg?v=r32",
    "./art/map3d/bi_2k/k22.jpg?v=r32",
    "./art/map3d/bi_2k/k37.jpg?v=r32",
    "./art/map3d/bi_2k/k45.jpg?v=r32",
    "./art/map3d/bi_2k/k52.jpg?v=r32",
    "./art/map3d/oahu_2k/k00.jpg?v=r32",
    "./art/map3d/oahu_2k/k15.jpg?v=r32",
    "./art/map3d/oahu_2k/k30.jpg?v=r32",
    "./art/map3d/oahu_2k/k45.jpg?v=r32"
  ];
  for(let i = 1; i <= 60; i++){
    const pad = String(i).padStart(2, "0");
    urls.push(`./art/map3d/bi/f${pad}.jpg?v=r32`);
    urls.push(`./art/map3d/oahu/f${pad}.jpg?v=r32`);
  }
  return urls;
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.allSettled(CORE_ASSETS.map(u => cache.add(u)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache live third-party APIs or version.json probe
  if(url.origin !== self.location.origin) return;
  if(url.pathname.endsWith("/version.json")) return;

  // Navigation requests (index.html / proto.html / root): network-first with no-cache, offline fallback
  if(req.mode === "navigate" || url.pathname.endsWith("/proto.html") || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")){
    event.respondWith(
      fetch(new Request(req.url, {cache: "no-cache"})).then(res => {
        if(res && res.ok){
          const c1 = res.clone();
          const c2 = res.clone();
          caches.open(CACHE_NAME).then(c => {
            c.put("./index.html", c1);
            c.put("./proto.html", c2);
          });
        }
        return res;
      }).catch(() => caches.match("./index.html", {ignoreSearch: true}).then(h => h || caches.match("./proto.html", {ignoreSearch: true})))
    );
    return;
  }

  // App logic JS (island3d.js): network-first so 3D routes/labels always stay in sync with HTML
  if(url.pathname.endsWith("/lib/island3d.js")){
    event.respondWith(
      fetch(new Request(req.url, {cache: "no-cache"})).then(res => {
        if(res && res.ok && res.status === 200){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req, {ignoreSearch: true}))
    );
    return;
  }

  // Safari Range requests for MP4: try network first, fallback to full cached blob if offline
  if(req.headers.has("range")){
    event.respondWith(
      fetch(req).catch(() => caches.match(req.url, {ignoreSearch: true}))
    );
    return;
  }

  // All local static assets: cache-first, then network + populate cache
  event.respondWith(
    caches.match(req, {ignoreSearch: false}).then(hit => {
      if(hit) return hit;
      return caches.match(req, {ignoreSearch: true}).then(looseHit => {
        if(looseHit) return looseHit;
        return fetch(req).then(res => {
          if(res && res.ok && res.status === 200){
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return res;
        });
      });
    })
  );
});

self.addEventListener("message", event => {
  if(!event.data || event.data.type !== "CACHE_ALL_OFFLINE") return;
  const port = event.source;
  const list = buildFullOfflineList();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let done = 0;
    const total = list.length;
    const BATCH = 6;
    for(let i = 0; i < list.length; i += BATCH){
      const chunk = list.slice(i, i + BATCH);
      await Promise.allSettled(chunk.map(async u => {
        const hit = await cache.match(u);
        if(!hit){
          const res = await fetch(u);
          if(res && res.ok && res.status === 200) await cache.put(u, res);
        }
        done++;
      }));
      if(port) port.postMessage({type: "OFFLINE_PROGRESS", done, total});
    }
    if(port) port.postMessage({type: "OFFLINE_DONE", done, total});
  })());
});
