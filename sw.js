// GT Hub service worker: lets the app open offline and install as an app.
const VERSION="mould-log-v160";
const LIBS="mould-log-libs"; // Firebase and fonts: kept across app versions (their addresses change when they do)
const THUMBS="gt-thumbs";    // small copies of Drive photo thumbnails, kept across app versions for offline use
const THUMB_MAX=5000;
const SHELL=["./","index.html","report.js","diarium.js","config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/favicon.svg","icons/favicon-32.png","icons/apple-touch-icon.png","icons/badge-96.png"];
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

// ---- Uploads carrying on after GT Hub is minimised (Chrome on Android) ----
// The app hands its upload list over when it goes into the background (and Chrome wakes this up again when the
// signal comes back). Chrome only allows a few minutes at a time, so it works through the list until then and
// asks to be woken again. The moment the app is on screen again it takes back over, so the two never upload at once.
// Same steps as the app's own uploader (folders, names, "already in Drive" check, resumable pieces).
const BG_TAG="gt-upload",DAPI="https://www.googleapis.com/drive/v3/",UPAPI="https://www.googleapis.com/upload/drive/v3/files",FOLDER_MT="application/vnd.google-apps.folder";
const INBOX_NUM="_UNASSIGNED",INBOX_FOLDER="_Unassigned";
function idbOpen(name,store,key){return new Promise((res,rej)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store,key?{keyPath:key}:undefined);r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>d.close();res(d)};r.onerror=()=>rej(r.error)})}
function idbDo(dbp,store,mode,fn){return dbp.then(d=>new Promise((res,rej)=>{const t=d.transaction(store,mode),r=fn(t.objectStore(store));t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)}))}
const upDb=()=>idbOpen("mouldlog-uploads","q","id"),kvDb=()=>idbOpen("mouldlog-bg","kv");
const qAllBg=()=>idbDo(upDb(),"q","readonly",s=>s.getAll()).then(a=>(a||[]).sort((x,y)=>String(x.addedAt).localeCompare(String(y.addedAt))));
const qGetBg=id=>idbDo(upDb(),"q","readonly",s=>s.get(id));
const qPutBg=it=>idbDo(upDb(),"q","readwrite",s=>s.put(it));
const qDelBg=id=>idbDo(upDb(),"q","readwrite",s=>s.delete(id));
const kvGet=k=>idbDo(kvDb(),"kv","readonly",s=>s.get(k)).catch(()=>null);
const kvPut=(k,v)=>idbDo(kvDb(),"kv","readwrite",s=>s.put(v,k)).catch(()=>{});
const kvDel=k=>idbDo(kvDb(),"kv","readwrite",s=>s.delete(k)).catch(()=>{});
const dq=s=>String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
async function appOnScreen(){return (await self.clients.matchAll({type:"window",includeUncontrolled:true})).some(c=>c.visibilityState==="visible")}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function bgSession(auth,deadline){
  const folders={},subs={};let stop=null;
  // every request stops when the app comes back on screen (it takes over) or Chrome's time is nearly up
  async function df(url,o={},raw){
    const ac=new AbortController(),left=deadline-Date.now()-4000;
    if(left<=0)throw {code:"time"};
    let why="";const tm=setTimeout(()=>{why="time";ac.abort()},Math.min(left,o.timeout||45000));
    const watch=setInterval(async()=>{if(await appOnScreen()){why="app";ac.abort()}},1000);
    let res;
    try{res=await fetch(url,{...o,signal:ac.signal,headers:{...(o.headers||{}),Authorization:"Bearer "+auth.token}})}
    catch(e){throw why==="app"?{code:"app"}:why==="time"?{code:"time"}:{code:"offline"}}
    finally{clearTimeout(tm);clearInterval(watch)}
    if(raw)return res;
    if(res.status===401)throw {code:"needs_token"};
    if(res.ok)return res;
    let m="",reason="";try{const j=(await res.json()).error||{};m=j.message||"";reason=((j.errors||[])[0]||{}).reason||""}catch(e){}
    if(res.status===403&&/insufficient/i.test(m))throw {code:"needs_token"};
    if([408,429,500,502,503,504].includes(res.status)||(res.status===403&&/rate ?limit/i.test(reason+" "+m)))throw {code:"retry"};
    throw {code:"drive_error",message:m||("Google Drive error "+res.status)};
  }
  const list=async q=>(await df(DAPI+"files?"+new URLSearchParams({q,pageSize:"100",fields:"files(id,name)",supportsAllDrives:"true",includeItemsFromAllDrives:"true"}))).json();
  const mk=async(name,parent)=>(await df(DAPI+"files?fields=id,name&supportsAllDrives=true",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:FOLDER_MT,parents:[parent]})})).json();
  async function woFolder(num,label){
    if(folders[num])return folders[num];
    let f;
    if(num===INBOX_NUM)f=((await list(`'${dq(auth.root)}' in parents and mimeType='${FOLDER_MT}' and trashed=false and name='${INBOX_FOLDER}'`)).files||[])[0];
    else{const r=await list(`'${dq(auth.root)}' in parents and mimeType='${FOLDER_MT}' and trashed=false and name contains '${dq(num)}'`);
      const re=/^T/.test(num)?new RegExp(`^#?${num}([^0-9A-Za-z]|$)`,"i"):new RegExp(`(^|[^0-9])${num}([^0-9]|$)`);
      f=(r.files||[]).find(x=>re.test(x.name||""))}
    if(!f)f=await mk(num===INBOX_NUM?INBOX_FOLDER:`#${num} - ${label||"Job"}`.replace(/[\\/]/g,"-").slice(0,120),auth.root);
    return folders[num]=f;
  }
  async function folderFor(it){const f=await woFolder(it.num,it.label);if(!it.sub)return f;const k=it.num+"/"+it.sub;if(subs[k])return subs[k];
    const s=((await list(`'${dq(f.id)}' in parents and mimeType='${FOLDER_MT}' and trashed=false and name='${dq(it.sub)}'`)).files||[])[0]||await mk(it.sub,f.id);return subs[k]=s}
  // one photo or file; uploaded in 1 MB pieces so each wake-up keeps what it sent
  async function upload(it){
    const folder=await folderFor(it);
    // the app was sending it in one go when it went into the background: give Drive a moment to finish that first
    if(!it.loc&&it.hand&&Date.now()-it.hand<10000)await sleep(10000-(Date.now()-it.hand));
    if(!it.loc&&((await list(`'${dq(folder.id)}' in parents and name='${dq(it.name)}' and trashed=false`)).files||[]).length)return "skipped";
    const total=it.blob.size,CH=1024*1024,resumed=!!it.loc;
    if(!it.loc){const meta={name:it.name,parents:[folder.id],mimeType:it.type};
      if(it.taken){const d=new Date(it.taken);if(!isNaN(d)&&d<Date.now()+864e5)meta.createdTime=d.toISOString()}
      const init=await df(UPAPI+"?uploadType=resumable&fields=id,name&supportsAllDrives=true",{method:"POST",headers:{"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":it.type,"X-Upload-Content-Length":String(total)},body:JSON.stringify(meta)});
      const loc=init.headers.get("Location");if(!loc)throw {code:"drive_error",message:"Google Drive didn't accept the upload"};
      it.loc=loc;it.locAt=Date.now();it.sent=0;await qPutBg(it)}
    let at=0;
    if(resumed){const r=await df(it.loc,{method:"PUT",headers:{"Content-Range":`bytes */${total}`}},true);
      if(r.ok)return "done";if(r.status===404||r.status===410){it.loc=null;it.sent=0;await qPutBg(it);throw {code:"retry"}}
      const rg=r.headers.get("Range");at=rg?+rg.split("-")[1]+1:0}
    while(at<total){const end=Math.min(total,at+CH);
      if(await appOnScreen())throw {code:"app"};
      const r=await df(it.loc,{method:"PUT",headers:{"Content-Range":`bytes ${at}-${end-1}/${total}`},body:it.blob.slice(at,end),timeout:60000+Math.round((end-at)/15)},true);
      if(r.ok)return "done";
      if(r.status===308){const rg=r.headers.get("Range");at=rg?+rg.split("-")[1]+1:0;it.sent=at;await qPutBg(it);continue}
      if(r.status===404||r.status===410){it.loc=null;it.sent=0;await qPutBg(it);throw {code:"retry"}}
      if(r.status===401)throw {code:"needs_token"};
      if([408,429,500,502,503,504].includes(r.status))throw {code:"retry"};
      let m="";try{m=(await r.json()).error.message}catch(e){}throw {code:"drive_error",message:m||("Google Drive error "+r.status)}}
    throw {code:"retry"};
  }
  return {upload};
}

const destOf=it=>it.num===INBOX_NUM?"Unassigned":"#"+it.num+(it.sub?" / "+it.sub:"");
const plural=(n,w)=>n+" "+w+(n===1?"":"s");
async function bgNotify(title,body){
  try{if(self.Notification&&Notification.permission!=="granted")return;if((await kvGet("notify"))===false)return;
    await self.registration.showNotification(title,{body,tag:"gt-upload",icon:"icons/icon-192.png",badge:"icons/badge-96.png",data:{url:"./"}})}catch(e){}
}
let bgBusy=false;
// how: "away" (the app just went into the background) or "sync" (Chrome woke this up); lastChance: Chrome won't try again
async function bgRun(how,lastChance){
  if(bgBusy||await appOnScreen())return;
  if(!(self.navigator&&navigator.locks))return;
  bgBusy=true;
  try{
    // the app lets go of the list a moment after it goes into the background
    const got=await navigator.locks.request(BG_TAG,{signal:AbortSignal.timeout(20000)},()=>bgWork(how,lastChance)).catch(e=>e&&e.name==="AbortError"?"busy":Promise.reject(e));
    if(got==="again")throw new Error("Uploads still waiting");   // Chrome tries again later (with its own back-off)
  }finally{bgBusy=false}
}
async function bgWork(how,lastChance){
  const started=Date.now(),deadline=started+(how==="sync"?150000:240000);   // Chrome allows sync about 3 minutes
  const pending=async()=>(await qAllBg()).filter(x=>!x.err||x.retry);
  if(!(await pending()).length||await appOnScreen())return "";
  const auth=await kvGet("auth");
  const waitingNote=async why=>{const n=(await pending()).length;if(n)await bgNotify("Uploads paused",`${plural(n,"file")} waiting. ${why}`)};
  if(!auth||!auth.token||!auth.root||!(auth.exp>Date.now()+60000)){await waitingNote("Open GT Hub to reconnect Google Drive and finish uploading.");return ""}
  const S=bgSession(auth,deadline),done=(await kvGet("done"))||{};let ended="",failed=0,sent=0;
  // anything the app was halfway through sending in one go waits till last (see upload)
  for(const first of (await pending()).sort((a,b)=>(a.hand?1:0)-(b.hand?1:0))){
    if(await appOnScreen()){ended="app";break}
    const it=await qGetBg(first.id);if(!it||(it.err&&!it.retry))continue;   // removed or moved meanwhile
    try{
      await S.upload(it);
      await qDelBg(it.id);sent++;
      const k=it.num+"|"+(it.sub||"");done[k]={n:((done[k]||{}).n||0)+1,dest:destOf(it),num:it.num,sub:it.sub||"",name:it.name};await kvPut("done",done);
    }catch(err){const c=err&&err.code;
      if(c==="app"||c==="time"||c==="offline"){ended=c;break}
      if(c==="needs_token"){ended="token";await kvDel("auth");break}
      if(c==="retry"){it.tries=(it.tries||0)+1;
        if(it.tries<6){await qPutBg(it);const w=Math.min(30000,5000*Math.pow(2,it.tries-1));if(Date.now()+w<deadline-20000){await sleep(w);continue}ended="time";break}}
      it.err=(err&&err.message)||"Upload failed";it.retry=false;it.tries=0;await qPutBg(it);failed++}
  }
  if(ended==="app")return "";
  const left=(await pending()).length,all=Object.values(done),n=all.reduce((a,x)=>a+x.n,0);
  if(!left){
    if(n)await bgNotify(failed?"Some uploads didn't work":"Photos uploaded",(all.length===1?`${plural(n,"file")} uploaded to ${all[0].dest}`:`${plural(n,"file")} uploaded to ${all.length} places`)+(failed?` · ${plural(failed,"file")} couldn't upload. Open GT Hub to try again.`:""));
    else if(failed)await bgNotify("Some uploads didn't work",`${plural(failed,"file")} couldn't upload. Open GT Hub to try again.`);
    return "";
  }
  if(ended==="token"){await waitingNote("Open GT Hub to reconnect Google Drive and finish uploading.");return ""}
  // out of time but getting somewhere: ask to be woken straight away for the rest
  if(ended==="time"&&sent){try{await self.registration.sync.register(BG_TAG);return ""}catch(e){}}
  if(how==="sync"&&lastChance){await waitingNote("Open GT Hub to finish uploading.");return ""}
  if(how==="away"){try{await self.registration.sync.register(BG_TAG)}catch(e){}return ""}
  return "again";
}
self.addEventListener("sync",e=>{if(e.tag===BG_TAG)e.waitUntil(bgRun("sync",e.lastChance))});
self.addEventListener("message",e=>{if((e.data||{}).type==="bg-upload")e.waitUntil(bgRun("away",false).catch(()=>{}))});
self.addEventListener("notificationclick",e=>{e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{const c=cs.find(x=>"focus" in x);return c?c.focus():self.clients.openWindow("./")}))});
