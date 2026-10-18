// GT Hub service worker: lets the app open offline and install as an app.
const VERSION="mould-log-v106";
const LIBS="mould-log-libs"; // Firebase and fonts: kept across app versions (their addresses change when they do)
const SHELL=["./","index.html","report.js","diarium.js","config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/favicon.svg","icons/favicon-32.png","icons/apple-touch-icon.png"];
// Each release changes VERSION, so the browser installs this worker afresh and it downloads the new app files here
// (bypassing the browser's HTTP cache). Opening the app then never waits on the network.
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION&&k!==LIBS).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Photos shared to GT Hub from another app (e.g. Google Photos) arrive here; they wait in the
// "mouldlog-share" store until the app shows the "pick a work order" screen
function shareDb(){return new Promise((res,rej)=>{const r=indexedDB.open("mouldlog-share",1);r.onupgradeneeded=()=>r.result.createObjectStore("inbox",{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function receiveShare(req){
  try{
    const form=await req.formData(),files=form.getAll("media").filter(f=>f&&f.size);
    const db=await shareDb();
    await new Promise((res,rej)=>{const t=db.transaction("inbox","readwrite"),st=t.objectStore("inbox");
      files.forEach((f,i)=>st.put({id:Date.now().toString(36)+"-"+i,name:f.name||("shared_"+i),type:f.type||"",lastModified:f.lastModified||Date.now(),blob:f}));
      t.oncomplete=res;t.onerror=()=>rej(t.error)});
  }catch(err){}
  return Response.redirect("./?share=1",303);
}
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method==="POST"&&new URL(req.url).pathname.endsWith("/share-target")){e.respondWith(receiveShare(req));return}
  if(req.method!=="GET")return;
  const url=new URL(req.url);
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
