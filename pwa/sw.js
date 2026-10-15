// Cache name carries a content hash of the deploy (filled in by scripts/build_pwa.py), so each deploy gets a fresh cache.
// The page is cached as '/' only: Cloudflare redirects /index.html to /, and a redirected response cannot answer a navigation.
const CACHE='space-trader-/*VERSION*/';
const PRECACHE=['/','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).catch(()=>r.mode==='navigate'?caches.match('/'):Response.error())));
});
