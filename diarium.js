// GT Hub: Diarium import (loaded only when used)
// ---- Import from Diarium (JSON export: [{date, heading, html, tags}]) ----
// Entries become unassigned updates; a work order is suggested from a work order number in the text, or from the
// tags/heading matching one of your moulds (never creates moulds) and a work order for it running on that date.
function htmlToText(html){const d=document.createElement("div");d.innerHTML=String(html||"").replace(/<br\s*\/?>/gi,"\n");
  const out=[];const walk=el=>{for(const n of el.childNodes){
    if(n.nodeType===3){const t=n.textContent;if(t.trim())out.push({t,inline:true});continue}
    if(n.nodeType!==1)continue;const tg=n.tagName;
    if(tg==="IMG"){out.push({img:n.getAttribute("src")||""});continue}
    if(/^H[1-6]$/.test(tg)){out.push({h:n.textContent.trim()});continue}
    if(tg==="LI"){out.push({t:"• "+n.textContent.trim()});continue}
    if(tg==="P"||tg==="DIV"){const only=n.children.length===1&&/^(B|STRONG)$/.test(n.children[0].tagName)&&n.textContent.trim()===n.children[0].textContent.trim();
      if(only&&n.textContent.trim().length<80){out.push({h:n.textContent.trim()});continue}
      if(n.querySelector("img,ul,ol,h1,h2,h3,h4,p")){walk(n);continue}
      out.push({t:n.textContent});continue}
    walk(n)}};
  walk(d);return out}
// An entry split at its headings (several work orders in one entry); text between headings stays with them
function diariumSections(e){const parts=htmlToText(e.html),secs=[];let cur={title:e.heading||"",lines:[],imgs:[]};
  for(const x of parts){
    if(x.h){if(cur.lines.some(l=>l.trim())||cur.imgs.length)secs.push(cur);cur={title:x.h,lines:[],imgs:[]};continue}
    if(x.img){cur.imgs.push(x.img);continue}
    cur.lines.push(x.t.replace(/\u00a0/g," ").replace(/[ \t]+$/g,""))}
  if(cur.lines.some(l=>l.trim())||cur.imgs.length||!secs.length)secs.push(cur);
  return secs.map(sc=>({title:sc.title,text:sc.lines.join("\n").replace(/\n{3,}/g,"\n\n").trim(),imgs:sc.imgs}))}
const normTok=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(" ").filter(Boolean);
// How well a Diarium tag/heading matches a mould: share of its words found in the mould's name/number/part (numbers exact)
function mouldMatch(label){const want=normTok(label);if(!want.length)return null;let best=null;
  for(const m of moulds){const have=new Set(normTok([mlabel(m),m.name,m.number,m.part,mAlias(m)].join(" ")));const joined=[...have].join("");
    let hit=0;for(const w of want){if(have.has(w)||(!/^\d+$/.test(w)&&w.length>3&&[...have].some(h=>h.length>3&&(h.startsWith(w)||w.startsWith(h))))||(/\d/.test(w)&&joined.includes(w)))hit++}
    const sc=hit/want.length;if(sc>=0.6&&(!best||sc>best.sc))best={m,sc}}
  return best&&best.m}
function diariumSuggest(title,text,tags,date){
  // 1) a work order number mentioned (2601, 2601-2, WO 2601, #T3)
  const hay=[title,...(tags||[]),text].join(" ");
  for(const mt of hay.matchAll(/(?:^|[^0-9A-Za-z])#?(?:WO\s*)?(T?\d{3,6})(?:-(\d{1,2}))?(?![0-9])/gi)){
    const l=logs.find(x=>normWo(x.wo)===normWo(mt[1]));if(!l)continue;
    let sub="";if(mt[2]){const sj=subJobs(l).find(x=>String(x.no)===mt[2]);if(sj)sub=sj.id}
    return {logId:l.id,sub,why:"number"}}
  // 2) the mould, then its work order running on that day (or the nearest one)
  let m=null;for(const t of [...(tags||[]),title]){m=mouldMatch(t);if(m)break}
  if(!m)return null;
  const cand=logs.filter(l=>jobIds(l).includes(m.id)&&l.date);if(!cand.length)return {mouldId:m.id,why:"mould"};
  const d=String(date||"");
  const running=cand.filter(l=>l.date<=d&&(!l.dateCompleted||l.dateCompleted>=d)).sort((a,b)=>b.date.localeCompare(a.date));
  const dist=l=>Math.abs((new Date(l.date)-new Date(d))/864e5);
  const l=running[0]||cand.slice().sort((a,b)=>dist(a)-dist(b))[0];if(!running[0]&&dist(l)>45)return {mouldId:m.id,why:"mould"};
  const sub=tabIdsFor(l.mouldId,l.extraMouldIds).includes(m.id)?m.id:"";
  return {logId:l.id,sub,why:running[0]?"mould":"near"}}
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function parseLooseDate(txt){const t=String(txt||"").toLowerCase();let m=t.match(/(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];
  let d,mo,y;m=t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})/);if(m){d=+m[1];mo=MONTHS[m[2].slice(0,4)]||MONTHS[m[2].slice(0,3)];y=+m[3]}
  else{m=t.match(/([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);if(m){mo=MONTHS[m[1].slice(0,4)]||MONTHS[m[1].slice(0,3)];d=+m[2];y=+m[3]}}
  if(!(y&&mo&&d)){m=t.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);if(m){d=+m[1];mo=+m[2];y=+m[3]}}
  return y&&mo&&d?`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`:""}
// Diarium HTML export: <div class="entry"> with .date, .heading .title, .tags, .content and .photos <img src="data:…" alt="file name">
function parseDiariumHtml(html){const doc=new DOMParser().parseFromString(html,"text/html");
  return [...doc.querySelectorAll(".entry")].map(en=>{
    const tagEls=[...en.querySelectorAll(".tags .tag")];let tags=tagEls.map(x=>x.textContent.replace(/^[●\s]+/,"").trim()).filter(Boolean);
    if(!tags.length){const tt=(en.querySelector(".tags")||{}).textContent||"";const i=tt.indexOf(":");if(i>=0)tags=tt.slice(i+1).split(",").map(x=>x.trim()).filter(Boolean)}
    const photos=[...en.querySelectorAll(".photos img, .content img")].map(im=>({src:im.getAttribute("src")||"",name:(im.getAttribute("alt")||"").trim()})).filter(x=>/^data:/.test(x.src));
    let date=parseLooseDate((en.querySelector(".date")||{}).textContent);
    if(!date){const f=photos.map(x=>x.name.match(/(20\d{2})(\d{2})(\d{2})/)).find(Boolean);if(f)date=`${f[1]}-${f[2]}-${f[3]}`}
    return {date,heading:((en.querySelector(".heading .title")||en.querySelector(".heading")||{}).textContent||"").trim(),html:(en.querySelector(".content")||{}).innerHTML||"",tags,photos}})}
function dataUrlFile(src,name,i){const m=src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);if(!m)return null;
  const type=(m[1]||"application/octet-stream").replace("image/jpg","image/jpeg");const bin=m[2]?atob(m[3]):decodeURIComponent(m[3]);
  const u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
  const ext=(type.split("/")[1]||"bin").replace("jpeg","jpg");return new File([u],name&&/\.[a-z0-9]{2,5}$/i.test(name)?name:`diarium_${Date.now().toString(36)}_${i}.${ext}`,{type})}
async function diariumImport(file){
  if(!file||!db)return;const res=$("#diarium-res");res.hidden=false;res.textContent="Reading…";
  try{
    const raw=await file.text(),isHtml=/^\s*(\ufeff)?\s*</.test(raw);
    let list;
    if(isHtml){list=parseDiariumHtml(raw);if(!list.length)throw {message:"That doesn't look like a Diarium HTML export"}}
    else{const data=JSON.parse(raw);list=Array.isArray(data)?data:(data.entries||data.items||[]);
      if(!list.length||!list.some(x=>x&&("html" in x||"text" in x||"heading" in x)))throw {message:"That doesn't look like a Diarium JSON export"}}
    const nPh=list.reduce((a,x)=>a+((x.photos||[]).length),0);
    if(nPh&&!driveRoot)throw {message:"Set your Drive Work Orders folder first (menu › Settings), so the photos have somewhere to go"};
    let photosQueued=0;const seen={};
    let have=new Set();try{const sd=await db.doc("settings/imports").get();if(sd&&sd.exists)have=new Set((sd.data()||{}).diarium||[])}catch(err){}
    inbox.forEach(n=>{if(n.src)have.add(n.src)});
    let added=0,skipped=0,withImg=0,suggested=0,empty=0;const newIds=[];const now=new Date().toISOString();
    for(const e2 of list){
      const date=String(e2.date||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){empty++;continue}
      const secs=diariumSections({heading:e2.heading,html:e2.html!=null?e2.html:("<p>"+esc(e2.text||"").replace(/\n/g,"</p><p>")+"</p>")});
      const ek=date+"|"+String(e2.heading||"").slice(0,40);seen[ek]=(seen[ek]||0)+1;
      let entryPhotos=(e2.photos||[]);
      for(let i=0;i<secs.length;i++){const sc=secs[i];
        const src="d:"+ek+"|"+seen[ek]+"|"+i+"|"+(sc.title||"").slice(0,40);
        if(have.has(src)||inbox.some(n=>n.source==="Diarium"&&n.date===date&&(n.title||"")===(sc.title||"")&&(n.text||"")===sc.text&&(!entryPhotos.length||(n.files||[]).length))){skipped++;entryPhotos=[];continue}
        // the entry's photos go with its first section (Diarium keeps them per entry, not per heading)
        let files=[];
        if(entryPhotos.length){const fl=entryPhotos.map((x,k)=>dataUrlFile(x.src,x.name,k)).filter(Boolean);entryPhotos=[];
          res.textContent=`Importing… ${added} updates · getting ${fl.length} photos ready`;
          files=(await enqueue(fl,INBOX_T,false))||[];photosQueued+=files.length}
        if(!sc.text&&!files.length){empty++;continue}
        if(sc.imgs.length&&!isHtml)withImg++;
        const sg=diariumSuggest(sc.title,sc.text,e2.tags,date);if(sg&&sg.logId)suggested++;
        const id=ibId();const doc={date,text:sc.text,title:sc.title||"",tags:(e2.tags||[]).slice(0,10),src,source:"Diarium",...(files.length?{files}:{}),...(sg?{suggest:sg}:{}),createdAt:now,updatedAt:now};
        await db.collection("inbox").doc(id).set(doc);have.add(src);newIds.push(src);added++;
        res.textContent=`Importing… ${added}`;
      }}
    try{await db.doc("settings/imports").set({diarium:[...have].slice(-5000)})}catch(err){}
    res.innerHTML=`<b>${added}</b> update${added===1?"":"s"} added to Unassigned updates${suggested?` · ${suggested} with a suggested work order`:""}${skipped?` · ${skipped} already imported`:""}${empty?` · ${empty} empty skipped`:""}.`+
      (photosQueued?` ${photosQueued} photo${photosQueued===1?"":"s"} uploading to the _Unassigned Drive folder.`:"")+
      (withImg?` ${withImg} had pictures, which Diarium's JSON export doesn't include: export as HTML to bring them across.`:"")+
      (added?` <button type="button" class="linkish" data-gotoinbox="1">Open Unassigned updates</button>`:"");
  }catch(err){res.textContent="Couldn't import: "+((err&&err.message)||"unreadable file")}
}
document.addEventListener("click",e=>{if(e.target.closest("[data-gotoinbox]")){pageReturn="open";goTab("inbox")}});
