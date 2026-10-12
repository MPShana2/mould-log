// Mould Log service worker: lets the app open offline and install as an app.
const VERSION="mould-log-v30";
const SHELL=["./","index.html","config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/favicon.svg","icons/favicon-32.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  // App files: always check the server for a newer copy (so updates arrive), fall back to the saved copy offline
  if(url.origin===self.location.origin){
    e.respondWith(fetch(req,{cache:"no-cache"}).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req).then(r=>r||caches.match("index.html"))));
    return;
  }
  // Versioned libraries and fonts: use the saved copy, fetch once
  if(url.hostname==="www.gstatic.com"&&url.pathname.startsWith("/firebasejs/")||url.hostname==="fonts.googleapis.com"||url.hostname==="fonts.gstatic.com"){
    e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{if(res.ok||res.type==="opaque"){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return res})));
  }
});
