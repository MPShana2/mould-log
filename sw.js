// GT Hub service worker: lets the app open offline and install as an app.
const VERSION="mould-log-v137";
const LIBS="mould-log-libs"; // Firebase and fonts: kept across app versions (their addresses change when they do)
const THUMBS="gt-thumbs";    // small copies of Drive photo thumbnails, kept across app versions for offline use
const THUMB_MAX=5000;
const SHELL=["./","index.html","report.js","diarium.js","config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/favicon.svg","icons/favicon-32.png","icons/apple-touch-icon.png"];
// Each release changes VERSION, so the browser installs this worker afresh and it downloads the new app files here
// (bypassing the browser's HTTP cache). Opening the app then never waits on the network.
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION&&k!==LIBS&&k!==THUMBS).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Photos shared to GT Hub from another app (e.g. Google Photos) arrive here; they wait in the
// "mouldlog-share" store until the app shows the "pick a work order" screen
function shareDb(){return new Promise((res,rej)=>{const r=indexedDB.open("mouldlog-share",1);r.onupgradeneeded=()=>r.result.createObjectStore("inbox",{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function receiveShare(req){let batch="";
  try{
    const form=await req.formData(),files=form.getAll("media").filter(f=>f&&f.size);
    const db=await shareDb();
    // each share is its own batch, and replaces anything left over from an earlier share that was never finished
    batch=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    await new Promise((res,rej)=>{const t=db.transaction("inbox","readwrite"),st=t.objectStore("inbox");st.clear();
      files.forEach((f,i)=>st.put({id:batch+"-"+i,batch,name:f.name||("shared_"+i),type:f.type||"",lastModified:f.lastModified||Date.now(),blob:f}));
      t.oncomplete=res;t.onerror=()=>rej(t.error)});
  }catch(err){}
  return Response.redirect("./?share="+encodeURIComponent(batch||"1"),303);
}
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method==="POST"&&new URL(req.url).pathname.endsWith("/share-target")){e.respondWith(receiveShare(req));return}
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===self.location.origin&&url.pathname.includes("/gtthumb/")){e.respondWith(thumb(url));return}
  // App files: open instantly from the saved copy (new versions arrive through the worker update above);
  // anything not saved yet comes from the network and is kept for next time
  if(url.origin===self.location.origin){
    const nav=req.mode==="navigate";
    e.respondWith(caches.open(VERSION).then(c=>c.match(nav?"index.html":req,{ignoreSearch:nav}).then(hit=>hit||
      fetch(req).then(res=>{if(res.ok&&!nav)c.put(req,res.clone());return res}).catch(()=>c.match("index.html")))));
    return;
  }
  // Versioned libraries and fonts: use the saved copy, fetch once
  if(url.hostname==="www.gstatic.com"&&url.pathname.startsWith("/firebasejs/")||url.hostname==="fonts.googleapis.com"||url.hostname==="fonts.gstatic.com"){
    e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{if(res.ok||res.type==="opaque"){const copy=res.clone();caches.open(LIBS).then(c=>c.put(req,copy))}return res})));
  }
});

// ---- Drive photos: gtthumb/<file id>?u=<Google's image address>[&t=m] ----
// Two sizes, both kept on the phone: thumbnails (400px) and screen-sized copies for the photo viewer (t=m, 1600px).
// Each is shown from the phone if it's there; otherwise downloaded, kept and shown. With no signal and no
// screen-sized copy, the viewer gets the thumbnail.
const THUMB_MAX_M=1500;let thumbPuts=0;
async function thumb(url){
  const id=decodeURIComponent(url.pathname.split("/gtthumb/")[1]||""),u=url.searchParams.get("u"),mid=url.searchParams.get("t")==="m";
  const base=new URL("gtthumb/"+encodeURIComponent(id),self.registration.scope).href,key=mid?base+"/m":base,c=await caches.open(THUMBS);
  const hit=await c.match(key);if(hit)return hit;
  if(u){
    try{const res=await fetch(u,{mode:"cors",credentials:"omit",referrerPolicy:"no-referrer"});
      if(res.ok){await c.put(key,res.clone());if(++thumbPuts%40===0)trimThumbs(c);return res}
      if(mid){const sm=await c.match(base);if(sm)return sm}
      return res}
    catch(e){ // no signal, or the image server didn't allow a copy
      try{return await fetch(u,{mode:"no-cors",credentials:"omit",referrerPolicy:"no-referrer"})}catch(e2){}}
  }
  if(mid){const sm=await c.match(base);if(sm)return sm}
  return new Response("",{status:504,statusText:"Offline"});
}
async function trimThumbs(c){try{const ks=await c.keys(),m=ks.filter(k=>k.url.endsWith("/m")),s=ks.filter(k=>!k.url.endsWith("/m"));
  for(const k of m.slice(0,Math.max(0,m.length-THUMB_MAX_M)))await c.delete(k);
  for(const k of s.slice(0,Math.max(0,s.length-THUMB_MAX)))await c.delete(k)}catch(e){}}
// The app asks how many photos are saved, or to clear them
self.addEventListener("message",e=>{const d=e.data||{};
  if(d.type==="thumbs-count")e.waitUntil(caches.open(THUMBS).then(c=>c.keys()).then(ks=>{const m=ks.filter(k=>k.url.endsWith("/m")).length;e.source&&e.source.postMessage({type:"thumbs-count",n:ks.length-m,m})}));
  if(d.type==="thumbs-clear")e.waitUntil(caches.delete(THUMBS).then(()=>e.source&&e.source.postMessage({type:"thumbs-count",n:0})));
});
