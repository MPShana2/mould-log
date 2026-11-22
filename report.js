// GT Hub: work order reports, PDF and Word (loaded only when used)
// ---------- Work order report (PDF or Word) ----------
// Builds a report of everything filled in on a work order (or one sub-job), with photos from its Drive folder.
// Both files are made here in the app, so no extra libraries are needed and it works offline (photos aside).
function rptOrg(){try{const v=localStorage.getItem("ml_rpt_org");return v===null?"Group Tooling":v}catch(e){return "Group Tooling"}}
const rptHas=v=>v!==undefined&&v!==null&&String(v).trim()!=="";
// opt.updates=false leaves the updates out (hot runner readings taken with one stay, labelled with its date)
function reportModel(l,onlyId,opt){opt=opt||{};const withUpd=opt.updates!==false;
  const ids=jobIds(l),names=jobNames(l),tabs=tabIdsFor(l.mouldId,l.extraMouldIds);
  const nameOf=id=>names[ids.indexOf(id)]||"Unknown mould";
  const mOf=id=>moulds.find(x=>x.id===id);
  const scope=onlyId?[onlyId]:ids,sub=onlyId&&tabs.includes(onlyId)?subMeta(l,onlyId):null;
  const R={wo:l.wo||"",org:rptOrg(),created:new Date(),blocks:[]};
  R.title=onlyId&&sub&&sub.no?`Sub-job ${subLabel(l,onlyId)}`:`Work order #${l.wo||""}`;
  R.subtitle=onlyId?nameOf(onlyId):jobTool(l);
  R.status=sub?sub.status:(l.status||"Complete");
  R.short=onlyId&&sub&&sub.no?subLabel(l,onlyId):String(l.wo||"");
  const B=R.blocks,grid=[];
  const g=(k,v,full)=>{if(rptHas(v))grid.push({k,v:String(v),full})};
  const single=scope.length===1?scope[0]:null,sm=single?mOf(single):null;
  if(onlyId)g("Work order","#"+(l.wo||""));
  g("Client order no.",l.orderNo);
  if(!onlyId&&ids.length>1)g("Moulds / jobs",ids.map(id=>{const s=tabs.includes(id)?subMeta(l,id):null;return (s&&s.no?subLabel(l,id)+"  ":"")+nameOf(id)}).join("\n"),true);
  else g(sm&&isClient(sm)?"Client job":sm&&isGen(sm)?"General job":"Mould",single?nameOf(single):jobTool(l));
  if(sm&&isClient(sm)){g("Client",sm.company);g("Contact",sm.contact);g("Phone",sm.phone);g("Email",sm.email);if(rptHas(sm.address))grid.push({k:"Address",v:String(sm.address),full:true})}
  if(sm&&!isGen(sm)){g("Part / product",sm.part);g("Cavities",sm.cavities);g("Material",sm.material)}
  if(sm&&isGen(sm)&&!isClient(sm))g("Area",sm.area);
  g("Job type",sub?sub.type:l.type);
  if(typeof schedOf==="function"&&(single||onlyId))g("Mould stop",schedOf(l,onlyId||single)==="u"?"Unscheduled":"Scheduled");
  const d0=sub?sub.date:l.date,d1=sub?sub.dateCompleted:l.dateCompleted;
  g("Date started",d0?fmtDate(d0):"");g("Date completed",d1?fmtDate(d1):"");
  // hours logged so far (Work hours): the whole work order, and this sub-job's share in a sub-job report
  {const hs=rptHours(l);if(sub&&sub.no){const own=rptHours(l,sub.no);if(own)g("Hours logged (sub-job)",fmtH(own));if(hs)g("Hours logged (work order)",fmtH(hs))}else if(hs)g("Hours logged",fmtH(hs))}
  const showFields=id=>{const v=pmVal(l,id),m=mOf(id),out=[];
    if(!(m&&isGen(m))&&rptHas(v.shots))out.push({t:"field",label:"Shot count",text:fmtNum(v.shots)});
    if(rptHas(v.faults))out.push({t:"field",label:"Inspection / faults found",text:v.faults});
    if((v.defects||[]).length)out.push({t:"field",label:"Defects",text:v.defects.join(", "),tags:true});
    {const hz=hrzClean(v.hrz);if(hrzHasData(hz))out.push({t:"table",label:"Hot runner readings",cols:hrzCols(hz),rows:hrzRows(hz),flagged:hrzFlagged(hz),insp:true})}
    if(rptHas(v.work))out.push({t:"field",label:"Work done",text:v.work});
    if((v.actions||[]).length)out.push({t:"field",label:"Actions",text:v.actions.join(", "),tags:true});
    // Updates: each one dated, its text with its own line breaks, a photo count (the photos themselves are in
    // "Photos & files"), and any hot runner readings taken with it straight underneath
    updClean(v.updates).forEach((x,i)=>{
      if(withUpd)out.push({t:"upd",label:i?"":"Updates",date:fmtDate(x.date),text:x.text||"",n:(x.files||[]).length,files:x.files||[],owner:id});
      if(x.hrz)out.push({t:"table",label:withUpd?"Hot runner readings":"Hot runner readings · "+fmtDate(x.date),cols:hrzCols(x.hrz),rows:hrzRows(x.hrz),flagged:hrzFlagged(x.hrz)})});
    if(rptHas(v.notes))out.push({t:"field",label:"Notes",text:v.notes});
    const pl=cleanParts(v.partsList||partsFromText(v.parts)).map(p=>({...p,text:partLabel(p)}));if(pl.length)out.push({t:"parts",label:"Parts used",items:pl});
    setProcs(v).forEach(sn=>out.push({t:"check",label:sn.name,summary:procProgress(sn,sn.st||{}).txt,rows:procRptRows(sn),shots:v.shots}));
    return out};
  if(single){const v=pmVal(l,single),m=mOf(single);if(!(m&&isGen(m))&&rptHas(v.shots))g("Shot count",fmtNum(v.shots))}
  B.push({t:"grid",items:grid});
  if(sub&&rptHas(sub.description)){B.push({t:"h",text:"Description"});B.push({t:"field",text:sub.description});if(rptHas(l.description))B.push({t:"field",label:"Work order #"+(l.wo||""),text:l.description})}
  else if(rptHas(l.description)){B.push({t:"h",text:"Description"});B.push({t:"field",text:l.description})}
  if(rptHas(l.woNotes)){B.push({t:"h",text:sub?"Work order notes":"Notes"});B.push({t:"field",text:l.woNotes})}
  // the to-do list stays in the app; it isn't part of a report
  if(single){const f=showFields(single).filter(x=>x.label!=="Shot count"),insp=f.find(x=>x.label==="Inspection / faults found"),dfx=f.find(x=>x.label==="Defects"),tbl=f.find(x=>x.insp),rest=f.filter(x=>x!==insp&&x!==tbl&&x!==dfx);
    if(insp||tbl||dfx){B.push({t:"h",text:"Inspection / faults found"});if(insp)B.push({t:"field",text:insp.text});if(dfx)B.push(dfx);if(tbl)B.push(tbl)}
    if(rest.length){B.push({t:"h",text:"Work carried out"});B.push(...rest)}}
  else{
    B.push({t:"h",text:"Moulds & jobs"});
    for(const id of scope){
      const s=tabs.includes(id)?subMeta(l,id):null,m=mOf(id),f=showFields(id);
      const sh=s&&s.no?rptHours(l,s.no):0;
      const meta=[s&&s.type&&s.type!==l.type?s.type:"",s&&s.date?"Started "+fmtDate(s.date):"",s&&s.dateCompleted?"Completed "+fmtDate(s.dateCompleted):"",sh?fmtH(sh)+" logged":"",m&&!isGen(m)&&m.part?m.part:""].filter(Boolean).join("   ·   ");
      B.push({t:"sub",no:s&&s.no?subLabel(l,id):"",name:nameOf(id),status:s?s.status:"",meta});
      if(s&&rptHas(s.description))B.push({t:"field",label:"Description",text:s.description});
      if(f.length)B.push(...f);else if(!(s&&rptHas(s.description)))B.push({t:"note",text:"Nothing recorded yet."});
    }
  }
  return R;
}
// Hours logged against a work order (from Work hours), or against one of its sub-jobs by number
function rptHours(l,subNo){let t=0;for(const h of (typeof hoursList!=="undefined"?hoursList:[])){if(hrLog(h)!==l)continue;if(subNo!=null&&String(h.sub||"")!==String(subNo))continue;t+=Number(h.hours)||0}return Math.round(t*100)/100}
// The work order's Drive folder as sets of items (the folder itself, then one per sub-job folder), for a report of
// the whole order or of one sub-job (its folder and those of moulds that joined it). Cached while the dialog is open.
let rptListCache=null;
async function rptListing(l,onlyId){
  const key=l.id+"|"+(onlyId||"");if(rptListCache&&rptListCache.key===key)return rptListCache.v;
  const num=woNum(l.wo);if(!num||!hasToken())return null;
  const folder=await findWoFolder(num);let v={sets:[]};
  if(folder){
    const listAll=async id=>{let out=[],tok;do{const r=await dList(`'${dq(id)}' in parents and trashed=false`,tok);out=out.concat(r.files||[]);tok=r.nextPageToken}while(tok);return sortDriveItems(out)};
    const tabs=tabIdsFor(l.mouldId,l.extraMouldIds),root=await listAll(folder.id);
    const subTitle=name=>{const id=tabs.find(x=>subName(x)===name);return id?`${subLabel(l,id)}  ${jobNames(l)[jobIds(l).indexOf(id)]||name}`:name};
    if(onlyId&&tabs.includes(onlyId)){const mem=joinedOf(l,onlyId);
      for(const id of [onlyId,...mem]){const sf=root.find(f=>f.mimeType===FOLDER_MT&&f.name===subName(id));if(sf)v.sets.push({title:mem.length?mName(id):"",items:await listAll(sf.id)})}}
    else{v.sets.push({title:tabs.length?"Work order":"",items:root.filter(f=>f.mimeType!==FOLDER_MT)});
      const ord=sf=>{const i=tabs.findIndex(x=>subName(x)===sf.name);return i<0?999:i};
      for(const sf of root.filter(f=>f.mimeType===FOLDER_MT).sort((a,b)=>ord(a)-ord(b)))v.sets.push({title:subTitle(sf.name),items:await listAll(sf.id)})}}
  const skip=f=>/ Work order\.md$/i.test(f.name||"")||/ report\.(pdf|docx)$/i.test(f.name||"");
  v.images=[];v.other=[];
  v.sets.forEach(st=>st.items.forEach(f=>{if(f.mimeType===FOLDER_MT||skip(f))return;if(String(f.mimeType||"").startsWith("image/"))v.images.push({f,set:st});else v.other.push({f,set:st})}));
  // oldest first (Drive lists newest first), so figures and the picker run in the order the photos were taken
  {const ord=new Map(v.sets.map((st,i)=>[st,i]));v.images.sort((a,b)=>ord.get(a.set)-ord.get(b.set)||fileTaken(a.f).localeCompare(fileTaken(b.f))||String(a.f.name).localeCompare(String(b.f.name),undefined,{numeric:true}))}
  rptListCache={key,v};return v}
const rptPhotoDate=f=>{const t=(f.imageMediaMetadata&&f.imageMediaMetadata.time)||f.createdTime||"";const m=/^(\d{4})[:-](\d\d)[:-](\d\d)/.exec(t);return m?fmtDate(`${m[1]}-${m[2]}-${m[3]}`):""};
// The photos a report will hold: pick.mode is all / starred / chosen (pick.ids, Drive file ids) / none
function rptPicked(v,pick){if(!v||!pick||pick.mode==="none")return [];
  return v.images.filter(it=>pick.mode==="all"||(pick.mode==="starred"&&it.f.starred)||(pick.mode==="chosen"&&pick.ids.has(it.f.id)))}
// Downloads and shrinks the picked photos; the files that aren't photos (or couldn't be added) are listed as links
async function rptDriveFiles(l,onlyId,pick,progress){
  const v=await rptListing(l,onlyId);if(!v)return null;
  const files=v.other.map(({f,set})=>({other:true,name:(set.title&&set.title!=="Work order"?set.title.replace(/\s+/g," ")+" / ":"")+f.name,url:f.webViewLink||""}));
  const all=rptPicked(v,pick),MAX=80,todo=all.slice(0,MAX),skipped=Math.max(0,all.length-MAX),got=[];
  let done=0,next=0;const out=new Map();
  const worker=async()=>{while(next<todo.length){const it=todo[next++];
    try{const res=await driveFetch(DAPI+"files/"+encodeURIComponent(it.f.id)+"?alt=media&supportsAllDrives=true");out.set(it,await rptJpeg(await res.blob(),1400,.82))}
    catch(e){if(e&&(e.code==="needs_token"||e.code==="offline"))throw e;out.set(it,null)}
    done++;progress&&progress(`Adding photos… ${done} of ${todo.length}`)}};
  if(todo.length){progress&&progress(`Adding photos… 0 of ${todo.length}`);await Promise.all([worker(),worker(),worker()])}
  for(const it of todo){const im=out.get(it);if(im)got.push({name:it.f.name,date:rptPhotoDate(it.f),t:fileTaken(it.f),set:it.set.title,...im});else files.push({name:it.f.name,note:"photo couldn't be added",url:it.f.webViewLink||""})}
  return {imgs:got,files,skipped,inDrive:v.images.length}}
// Puts each photo with the update it belongs to (an update lists its photos by name); the rest go in the
// Photos section, by folder. Figures are numbered in the order they appear, and each update names its figures.
function rptPlace(R,photos){
  const pool=photos?photos.imgs.slice():[],used=new Set();let n=0;
  for(const b of R.blocks){if(b.t!=="upd"||!(b.files||[]).length)continue;
    b.figs=[];for(const name of b.files){const im=pool.find(x=>!used.has(x)&&x.name===name);if(im){used.add(im);b.figs.push(im)}}
    b.figs.sort((a,c)=>String(a.t||"").localeCompare(String(c.t||"")));b.figs.forEach(im=>im.fig=++n);
    b.more=b.files.length-b.figs.length}
  const groups=[];for(const im of pool){if(used.has(im))continue;im.fig=++n;let g=groups.find(x=>x.title===im.set);if(!g)groups.push(g={title:im.set,imgs:[]});g.imgs.push(im)}
  return photos?{groups,files:photos.files,skipped:photos.skipped}:null}
const rptFigRef=figs=>{const ns=figs.map(x=>x.fig);if(!ns.length)return "";
  const parts=[];for(let i=0;i<ns.length;){let j=i;while(j+1<ns.length&&ns[j+1]===ns[j]+1)j++;parts.push(j>i?`${ns[i]}–${ns[j]}`:String(ns[i]));i=j+1}
  return (ns.length>1?"Figs. ":"Fig. ")+parts.join(", ")};
const rptUpdNote=b=>{const r=b.figs&&b.figs.length?rptFigRef(b.figs):"",m=b.figs?b.more:b.n;return [r,m?(r?`${m} more in Drive`:rptPhotos(m)):""].filter(Boolean).join("  ·  ")};
// Any image the browser can open, shrunk to a sensible size and saved as JPEG (white behind transparency)
async function rptJpeg(blob,max,q,bg){
  let src,url;
  try{src=await createImageBitmap(blob)}catch(e){
    url=URL.createObjectURL(blob);
    src=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("decode"));im.src=url});
  }
  try{
    const w0=src.width||src.naturalWidth,h0=src.height||src.naturalHeight;if(!w0||!h0)throw new Error("decode");
    const s=Math.min(1,max/Math.max(w0,h0)),w=Math.max(1,Math.round(w0*s)),h=Math.max(1,Math.round(h0*s));
    const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");
    x.fillStyle=bg||"#ffffff";x.fillRect(0,0,w,h);x.drawImage(src,0,0,w,h);
    const out=await new Promise(r=>c.toBlob(r,"image/jpeg",q));
    return {bytes:new Uint8Array(await out.arrayBuffer()),w,h};
  }finally{if(url)URL.revokeObjectURL(url);if(src&&src.close)src.close()}
}
let rptLogoCache=null;
async function rptLogo(){if(rptLogoCache)return rptLogoCache;try{const r=await fetch("icons/icon-192.png");rptLogoCache=await rptJpeg(await r.blob(),192,.92,"#1c1c1c")}catch(e){rptLogoCache=null}return rptLogoCache}
const RPT_ST={"Complete":["23804f","e1f2e8"],"Cancelled":["7a3e8c","f1e6f4"],"In progress":["1d5fa8","e3ecf8"],"On hold":["b4530a","fbe9da"],"Pending":["5f5a52","eeebe5"]};
// Text lines of a field: bullets ("•", "-", "*") and numbered points keep a hanging indent
function rptLines(text){return String(text??"").replace(/\r/g,"").replace(/\s+$/,"").split("\n").map(s=>{
  const m=s.match(/^(\s*)(?:([•●◦▪\-*])|(\d+[.)]))\s+(.*)$/);
  if(m)return {lvl:Math.min(3,Math.floor(m[1].replace(/\t/g,"    ").length/2)),mark:m[3]||"•",text:m[4]};
  return {lvl:0,mark:"",text:s.trim()}})}

// In an update, a short line ending in ":" ("Moving half:") is a heading and shows in bold
const rptSec=L=>!L.mark&&/^.{1,40}:$/.test(L.text);
const rptPhotos=n=>n?n+" photo"+(n===1?"":"s"):"";

// ---- PDF ----
// Helvetica widths (1/1000 em) for WinAnsi codes 32-255
const HELV=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const HELVB=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
const WINX={0x20AC:128,0x201A:130,0x0192:131,0x201E:132,0x2026:133,0x2020:134,0x2021:135,0x02C6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017D:142,0x2018:145,0x2019:146,0x201C:147,0x201D:148,0x2022:149,0x2013:150,0x2014:151,0x02DC:152,0x2122:153,0x0161:154,0x203A:155,0x0153:156,0x017E:158,0x0178:159,0x25CF:149,0x25E6:149,0x25AA:149,0x2212:45,0x2010:45,0x2011:45,0x00A0:32,0x2009:32,0x202F:32};
const WINS={0x03A9:"ohm",0x2126:"ohm",0x2192:"->",0x2190:"<-",0x2264:"<=",0x2265:">=",0x2248:"~",0x2713:"v",0x2714:"v",0x2715:"x",0x2716:"x",0x2032:"'",0x2033:"\""};
function winBytes(s){let o="";for(const ch of String(s??"")){const c=ch.codePointAt(0);
  if(c===9)o+="    ";else if((c>=32&&c<127)||(c>=160&&c<=255))o+=String.fromCharCode(c===160?32:c);else if(WINX[c])o+=String.fromCharCode(WINX[c]);else if(WINS[c])o+=WINS[c];else if(c>=0xFE00&&c<=0xFE0F||c===0x200B||c===0x200D)continue;else o+="?"}return o}
function pdfW(s,font,size){const T=font==="B"?HELVB:HELV;let w=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);w+=T[c-32]||556}return w*size/1000}
function pdfWrap(str,font,size,width){
  const out=[];const words=str.split(/( +)/);let line="";
  const push=()=>{out.push(line.replace(/ +$/,""));line=""};
  for(const w of words){if(!w)continue;
    if(pdfW(line+w,font,size)<=width||(!line&&/^ +$/.test(w))){line+=w;continue}
    if(/^ +$/.test(w)){push();continue}
    if(line.trim())push();else line="";
    let rest=w;while(pdfW(rest,font,size)>width){let k=rest.length;while(k>1&&pdfW(rest.slice(0,k),font,size)>width)k--;out.push(rest.slice(0,k));rest=rest.slice(k)}
    line=rest}
  if(line||!out.length)push();return out}
const pdfStr=s=>"("+s.replace(/[\\()]/g,m=>"\\"+m).replace(/\r/g,"\\r").replace(/\n/g,"\\n")+")";
const hexRgb=h=>[0,2,4].map(i=>(parseInt(h.substr(i,2),16)/255).toFixed(3)).join(" ");
function buildPdf(R,photos,logo){
  const PW=595.28,PH=841.89,M=46,CW=PW-2*M,BOT=PH-52;
  const C={ink:"1f2328",muted:"6b6762",line:"dedad2",soft:"f5f4f1",amber:"e5970f",band:"1c1c1c",link:"1a5fb4"};
  const pages=[],images=[];let pg,y=0;
  const op=s=>pg.ops.push(s);
  const fill=(x,yy,w,h,col)=>op(`${hexRgb(col)} rg ${x.toFixed(2)} ${(PH-yy-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const hline=(x,yy,w,col,t)=>op(`${hexRgb(col)} RG ${t||.6} w ${x.toFixed(2)} ${(PH-yy).toFixed(2)} m ${(x+w).toFixed(2)} ${(PH-yy).toFixed(2)} l S`);
  const txt=(s,x,yy,font,size,col)=>{if(s)op(`BT /${font==="B"?"F2":font==="I"?"F3":"F1"} ${size} Tf ${hexRgb(col||C.ink)} rg ${x.toFixed(2)} ${(PH-yy).toFixed(2)} Td ${pdfStr(s)} Tj ET`)};
  const rrect=(x,yy,w,h,r,col)=>{const X=x,Y=PH-yy-h,k=r*.5523;op(`${hexRgb(col)} rg ${X+r} ${Y} m ${X+w-r} ${Y} l ${X+w-r+k} ${Y} ${X+w} ${Y+r-k} ${X+w} ${Y+r} c ${X+w} ${Y+h-r} l ${X+w} ${Y+h-r+k} ${X+w-r+k} ${Y+h} ${X+w-r} ${Y+h} c ${X+r} ${Y+h} l ${X+r-k} ${Y+h} ${X} ${Y+h-r+k} ${X} ${Y+h-r} c ${X} ${Y+r} l ${X} ${Y+r-k} ${X+r-k} ${Y} ${X+r} ${Y} c f`)};
  const img=(im,x,yy,w,h)=>{let i=images.indexOf(im);if(i<0){images.push(im);i=images.length-1}op(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(PH-yy-h).toFixed(2)} cm /Im${i} Do Q`)};
  const link=(x,yy,w,h,url)=>pg.annots.push({r:[x,PH-yy-h,x+w,PH-yy],url});
  const pill=(s,xr,yy)=>{const [fg,bg]=RPT_ST[s]||RPT_ST.Pending,t=winBytes(s),w=pdfW(t,"B",8.5)+16;rrect(xr-w,yy,w,16,8,bg);txt(t,xr-w+8,yy+11.2,"B",8.5,fg);return w};
  const short=winBytes(R.short?`Work order report  ·  ${R.title}`:R.title);
  function newPage(){pg={ops:[],annots:[]};pages.push(pg);
    if(pages.length===1){y=0;return}
    txt(winBytes(R.title+"  ·  "+R.subtitle).slice(0,95),M,M-10,"B",8.5,C.muted);
    const o=winBytes(R.org);txt(o,PW-M-pdfW(o,"",8.5),M-10,"",8.5,C.muted);hline(M,M-3,CW,C.line,.6);y=M+14}
  const need=h=>{if(y+h>BOT){newPage();return true}return false};
  newPage();
  // Header band
  fill(0,0,PW,84,C.band);fill(0,84,PW,3,C.amber);
  let tx=M;if(logo){img(logo,M,18,48,48);tx=M+62}
  const org=winBytes(R.org||"GT Hub");txt(org,tx,40,"B",16,"ffffff");
  txt(winBytes(R.kind||"Mould maintenance report"),tx,58,"",9.5,"f0a21c");
  const when=winBytes("Created "+R.created.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}));
  txt(when,PW-M-pdfW(when,"",9),40,"",9,"c9c5bd");
  const by=winBytes("GT Hub");txt(by,PW-M-pdfW(by,"",9),55,"",9,"8f8a82");
  y=87+34;
  const ttl=winBytes(R.title);txt(ttl,M,y,"B",22,C.ink);
  if(R.status)pill(R.status,PW-M,y-14);
  y+=8;
  for(const ln of pdfWrap(winBytes(R.subtitle),"",12,CW)){y+=16;txt(ln,M,y,"",12,C.muted)}
  y+=16;
  // Text blocks with bullets and links
  const LH=14.2,FS=10.3;
  function para(text,indent,sec){const x0=M+(indent||0),w0=CW-(indent||0);let first=true;
    for(const L of rptLines(text)){
      if(!L.text&&!L.mark){y+=LH*.55;continue}
      const f=sec&&rptSec(L)?"B":"";if(f&&!first)y+=LH*.35; // a little space above a heading
      const ind=L.mark?(L.lvl*14+14):0,lines=pdfWrap(winBytes(L.text),f,FS,w0-ind);first=false;
      lines.forEach((s,i)=>{need(LH);y+=LH;if(i===0&&L.mark){const mk=L.mark==="•"?(L.lvl%2?"-":"\u0095"):winBytes(L.mark);txt(mk,x0+L.lvl*14+1,y,"",FS,C.ink)}txt(s,x0+ind,y,f,FS,C.ink)});
    }}
  function label(s){need(LH+24);y+=14;txt(winBytes(s.toUpperCase()),M,y,"B",7.8,C.muted);y+=1}
  // photos two to a row, each numbered "Fig. n" with its date underneath
  function figs(list,indent){const x0=M+(indent||0),w0=CW-(indent||0),gap=12,cw=(w0-gap)/2,ch=cw*.75;
    for(let i=0;i<list.length;i+=2){need(ch+30);y+=8;
      list.slice(i,i+2).forEach((im,j)=>{const x=x0+j*(cw+gap);fill(x,y,cw,ch,C.soft);
        const s=Math.min(cw/im.w,ch/im.h),w=im.w*s,h=im.h*s;img(im,x+(cw-w)/2,y+(ch-h)/2,w,h);
        const lab=winBytes("Fig. "+im.fig),lw=pdfW(lab,"B",7.8);txt(lab,x,y+ch+11,"B",7.8,C.ink);
        const cap=pdfWrap(winBytes(im.date||""),"",7.8,cw-lw-8)[0];if(cap)txt(cap,x+lw+6,y+ch+11,"",7.8,C.muted)});
      y+=ch+14}}
  function box(x,yy,state){ // checkbox at baseline yy
    const s=9,top=yy-8;
    if(state==="done"){rrect(x,top,s,s,1.6,C.ink);op(`1 1 1 RG 1.3 w 1 J 1 j ${x+2} ${PH-top-4.6} m ${x+3.8} ${PH-top-6.6} l ${x+7.1} ${PH-top-2.4} l S`)}
    else{op(`${hexRgb("8f8a82")} RG .8 w ${x+.4} ${PH-top-s+.4} ${s-.8} ${s-.8} re S`)}}
  for(const b of R.blocks){
    if(b.t==="grid"){
      const rows=[];let cur=[];for(const it of b.items){if(it.full){if(cur.length)rows.push(cur);rows.push([it]);cur=[]}else{cur.push(it);if(cur.length===3){rows.push(cur);cur=[]}}}if(cur.length)rows.push(cur);
      const cw=CW/3,pad=10;
      for(const r of rows){
        const cells=r.map((it,i)=>{const w=(it.full?CW:cw)-2*pad;return {it,x:M+i*cw,w,lines:String(it.v).split("\n").flatMap(p=>pdfWrap(winBytes(p),"",10.3,w))}});
        const h=pad+10+Math.max(...cells.map(c=>c.lines.length))*13.6+pad-2;
        need(h+1);fill(M,y,CW,h,C.soft);
        for(const c of cells){txt(winBytes(c.it.k.toUpperCase()),c.x+pad,y+pad+6,"B",7.2,C.muted);c.lines.forEach((s,i)=>txt(s,c.x+pad,y+pad+19+i*13.6,"",10.3,C.ink))}
        y+=h;hline(M,y+.5,CW,"ffffff",1);y+=1}
      y+=4;continue}
    if(b.t==="h"){need(54);y+=26;fill(M,y-11,3,14,C.amber);txt(winBytes(b.text),M+10,y,"B",12.5,C.ink);y+=7;hline(M,y,CW,C.line,.6);y+=2;continue}
    if(b.t==="sub"){need(70);y+=16;const h=b.meta?40:28;fill(M,y,CW,h,"f3f1ec");fill(M,y,3,h,C.amber);
      const head=winBytes((b.no?b.no+"   ":"")+b.name);let pw=b.status?pdfW(winBytes(b.status),"B",8.5)+16:0;
      const hl=pdfWrap(head,"B",12,CW-30-pw)[0];txt(hl,M+12,y+18,"B",12,C.ink);if(b.status)pill(b.status,PW-M-8,y+6);
      if(b.meta)txt(winBytes(b.meta),M+12,y+32,"",8.8,C.muted);y+=h+2;continue}
    if(b.t==="field"){if(b.label)label(b.label);else y+=2;para(b.text);y+=4;continue}
    if(b.t==="upd"){
      // the "Updates" label and the date stay with the first line of text (and a short update with its photos)
      {const fh=b.figs&&b.figs.length?(CW-12-12)/2*.75+30:0,tl=b.text?rptLines(b.text).length:0,th=LH*(2+tl)+8+fh;
        need((fh&&th<(BOT-M)*.45?th:LH*2+8)+(b.label?LH+16:0))}
      if(b.label)label(b.label);
      y+=b.label?LH:LH+8;
      const d=winBytes(b.date);txt(d,M,y,"B",FS,C.ink);
      {const nt=rptUpdNote(b);if(nt)txt(winBytes(nt),M+pdfW(d,"B",FS)+10,y,"",8.8,C.muted)}
      if(b.text)para(b.text,12,true);
      if(b.figs&&b.figs.length){figs(b.figs,12);y+=2}
      y+=4;continue}
    if(b.t==="table"){if(b.label)label(b.label);const rh=17,c0=58;
      // column widths: given as fractions of the page width, or a narrow first column and the rest shared
      const ws=b.widths?b.widths.map(f=>f*CW):b.cols.map((_,i)=>i?(CW-c0)/(b.cols.length-1):c0),xs=ws.map((_,i)=>M+ws.slice(0,i).reduce((a,c)=>a+c,0));
      const fit=(v,w,f)=>{let t=winBytes(String(v??""));if(pdfW(t,f,9.6)<=w-14)return t;while(t.length>1&&pdfW(t+"...",f,9.6)>w-14)t=t.slice(0,-1);return t+"..."};
      const right=b.right||[],fs=b.fs||9.6;
      const head=()=>{fill(M,y,CW,rh,C.soft);b.cols.forEach((c,i)=>{const t=winBytes(c);txt(t,right.includes(i)?xs[i]+ws[i]-8-pdfW(t,"B",8.6):xs[i]+8,y+12,"B",8.6,C.muted)});y+=rh};
      need(rh*2+4);y+=4;head();
      if(b.wrap){
        // Wrapping table: every cell shows in full over as many lines as it needs; a very long row carries on over the page
        const lh=Math.round(fs*1.3*10)/10,pt=5,pb=6,bl=fs-.2;
        b.rows.forEach((r,ri)=>{const tot=b.total&&ri===b.rows.length-1;
          // a cell is text (newlines kept) or a list of lines, each text or {t, b: bold, m: muted}
          const cells=r.map((v,i)=>{const f0=tot||(b.bold||[]).includes(i)?"B":"",lines=[];
            (Array.isArray(v)?v:String(v??"").split(/\r?\n/)).forEach(par=>{const o=typeof par==="object"&&par?par:{t:par},f=o.b?"B":f0;
              pdfWrap(winBytes(String(o.t??"").trim()),f,fs,ws[i]-16).forEach(t=>lines.push({t,f,c:o.m?C.muted:C.ink}))});return {lines}});
          // the row as a list of printed lines: the cells side by side, then an optional full-width note under them (b.sub)
          const slots=[];const nCell=Math.max(1,...cells.map(c=>c.lines.length));
          for(let k=0;k<nCell;k++)slots.push(cells.map((c,i)=>{const L=c.lines[k];return L&&{...L,i}}).filter(Boolean));
          const sub=b.sub&&b.sub[ri];
          if(sub){const sx=xs[b.subFrom||1],sw=M+CW-sx-16,sf=9.2;
            String(sub).split(/\r?\n/).forEach(par=>pdfWrap(winBytes(par.trim()),"",sf,sw).forEach(t=>slots.push([{t,f:"",c:"3d3a35",x:sx+8,sz:sf}])))}
          let done=0;const total=slots.length;
          while(done<total){let fitN=Math.floor((BOT-y-pt-pb)/lh);
            const left=total-done;
            // short rows move to the next page whole; only tall rows are split, and never leaving a line on its own
            if(fitN<Math.min(2,left)||(fitN<left&&left*lh<(BOT-M)/3)){newPage();head();continue}
            const n=fitN>=left?left:(left-fitN===1&&fitN>2?fitN-1:fitN),h=pt+n*lh+pb-(done+n<total?pb-2:0);
            if(tot){fill(M,y,CW,h,"f3ede1");hline(M,y,CW,C.ink,.8)}else if(ri%2)fill(M,y,CW,h,"faf9f6");
            if(done&&!tot){txt(fit(r[0],ws[0],""),xs[0]+8,y+pt+bl,"",8.6,C.muted);txt("cont.",xs[0]+8,y+pt+bl+lh,"I",8.2,C.muted)}
            slots.slice(done,done+n).forEach((sl,k)=>sl.forEach(L=>{if(done&&L.i===0)return;const sz=L.sz||fs;
              txt(L.t,L.x!=null?L.x:right.includes(L.i)?xs[L.i]+ws[L.i]-8-pdfW(L.t,L.f,sz):xs[L.i]+8,y+pt+bl+k*lh,L.f,sz,L.c)}));
            y+=h;done+=n;if(!tot&&ri<b.rows.length-1&&done>=total)hline(M,y,CW,"ebe8e2",.5)}
        });
        hline(M,y,CW,C.line,.6);y+=6;continue}
      b.rows.forEach((r,ri)=>{if(need(rh))head();const tot=b.total&&ri===b.rows.length-1;
        if(tot){fill(M,y,CW,rh,"f3ede1");hline(M,y,CW,C.ink,.8)}else if((b.flagged||[]).includes(ri)){fill(M,y,CW,rh,"fbe9da");fill(M,y,3,rh,C.amber)}else if(ri%2)fill(M,y,CW,rh,"faf9f6");
        r.forEach((v,i)=>{const ol=/^ol$/i.test(v),f=tot||(i===0&&!b.widths)||ol||(b.bold||[]).includes(i)?"B":"",t=fit(v,ws[i],f);
          txt(t,right.includes(i)?xs[i]+ws[i]-8-pdfW(t,f,fs):xs[i]+8,y+12,f,fs,ol?"b3261e":C.ink)});y+=rh});
      hline(M,y,CW,C.line,.6);y+=6;continue}
    if(b.t==="note"){need(LH+6);y+=LH+4;txt(winBytes(b.text),M,y,"I",FS,C.muted);continue}
    if(b.t==="parts"){label(b.label);
      for(const p of b.items){const t=winBytes(p.text||p.url),lines=pdfWrap(t,"",FS,CW-14);
        lines.forEach((s,i)=>{need(LH);y+=LH;if(i===0)txt("\u0095",M+1,y,"",FS,C.ink);txt(s,M+14,y,"",FS,p.url?C.link:C.ink);
          if(p.url){const w=pdfW(s,"",FS);hline(M+14,y+1.6,w,C.link,.5);link(M+14,y-10,w,13,p.url)}})}
      y+=4;continue}
    if(b.t==="todo"){y+=2;for(const it of b.items){const lines=pdfWrap(winBytes(it.text||""),"",FS,CW-16);
        lines.forEach((s,i)=>{need(LH+1);y+=LH+1;if(i===0)box(M,y,it.done?"done":"");txt(s,M+16,y,"",FS,it.done?C.muted:C.ink)})}y+=4;continue}
    if(b.t==="check"){label(b.label);need(LH);y+=LH;txt(winBytes(b.summary),M,y,"B",FS,C.ink);
      for(const r of b.rows){
        if(r.note){const ls=pdfWrap(winBytes("Note: "+r.note),"B",9.6,CW-12);need(LH*ls.length+8);y+=6;fill(M,y,3,ls.length*13+4,C.amber);ls.forEach(l=>{y+=13;txt(l,M+10,y,"B",9.6,"b4530a")});y+=4;continue}
        if(r.sec){need(LH*3+6);y+=LH+4;txt(winBytes(r.sec),M,y,"B",9.2,C.muted);continue}
        const x=M+(r.lvl?16:0),w=CW-(x-M)-16;
        if(r.group){pdfWrap(winBytes(r.t),"",9.8,w+16).forEach(l=>{need(LH);y+=LH;txt(l,x,y,"",9.8,C.ink)});continue}
        const extra=r.counter&&rptHas(b.shots)?"   (reading: "+fmtNum(b.shots)+")":"";
        pdfWrap(winBytes(r.t+extra),"",9.8,w).forEach((l,i)=>{need(LH);y+=LH;
          if(i===0){if(r.st==="na")txt("N/A",x-1,y,"B",6.8,C.muted);else box(x,y,r.st)}
          txt(l,x+16,y,"",9.8,r.st==="done"?C.ink:C.muted)})}
      y+=4;continue}
  }
  // Photos
  if(photos&&(photos.groups.length||photos.files.length||photos.skipped)){
    need(photos.groups.length?54+(CW-12)/2*.75+46:54);y+=26;fill(M,y-11,3,14,C.amber);txt(photos.groups.length?"Photos & files":"Files",M+10,y,"B",12.5,C.ink);y+=7;hline(M,y,CW,C.line,.6);y+=6;
    const ch=(CW-12)/2*.75;
    for(const gr of photos.groups){
      if(gr.title){need(LH+ch+30);y+=16;txt(winBytes(gr.title),M,y,"B",9.5,C.muted);y+=2}
      figs(gr.imgs,0)}
    if(photos.files.length){label("Other files in the Drive folder");
      for(const f of photos.files){const s=pdfWrap(winBytes(f.name),"",FS,CW-14)[0];need(LH);y+=LH;txt("\u0095",M+1,y,"",FS,C.ink);txt(s,M+14,y,"",FS,f.url?C.link:C.ink);const w=pdfW(s,"",FS);if(f.url){hline(M+14,y+1.6,w,C.link,.5);link(M+14,y-10,w,13,f.url)}if(f.note)txt(winBytes("  ("+f.note+")"),M+14+w,y,"I",FS-1,C.muted)}}
    if(photos.skipped){need(LH+6);y+=LH+6;txt(winBytes(`${photos.skipped} more photo${photos.skipped===1?" is":"s are"} in the Drive folder.`),M,y,"I",9.5,C.muted)}
  }
  // Footer with page numbers
  pages.forEach((p,i)=>{pg=p;hline(M,PH-34,CW,C.line,.6);
    txt(winBytes("GT Hub  ·  "+R.title),M,PH-22,"",8,C.muted);
    const pn=`Page ${i+1} of ${pages.length}`;txt(pn,PW-M-pdfW(pn,"",8),PH-22,"",8,C.muted)});
  // Assemble the file
  const objs=[];const add=s=>{objs.push(s);return objs.length};
  const cat=add(null),pagesId=add(null);
  const f1=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const f3=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
  const imIds=images.map(im=>add({head:`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`,bytes:im.bytes}));
  const res=`<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> /XObject << ${imIds.map((id,i)=>`/Im${i} ${id} 0 R`).join(" ")} >> >>`;
  const kids=[];
  for(const p of pages){
    const body=p.ops.join("\n");const cs=add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    const an=p.annots.map(a=>add(`<< /Type /Annot /Subtype /Link /Rect [${a.r.map(v=>v.toFixed(2)).join(" ")}] /Border [0 0 0] /A << /S /URI /URI ${pdfStr(winBytes(a.url))} >> >>`));
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources ${res} /Contents ${cs} 0 R${an.length?` /Annots [${an.map(i=>i+" 0 R").join(" ")}]`:""} >>`))}
  objs[cat-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId-1]=`<< /Type /Pages /Kids [${kids.map(k=>k+" 0 R").join(" ")}] /Count ${kids.length} >>`;
  const info=add(`<< /Title ${pdfStr(winBytes(R.title+" - "+R.subtitle))} /Producer (GT Hub) /CreationDate (D:${R.created.toISOString().replace(/[-:T]/g,"").slice(0,14)}) >>`);
  const chunks=[];let len=0;const offs=[];
  const put=s=>{let b;if(typeof s==="string"){b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i)&255}else b=s;chunks.push(b);len+=b.length};
  put("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  objs.forEach((o,i)=>{offs.push(len);put(`${i+1} 0 obj\n`);if(typeof o==="string")put(o);else{put(o.head);put(o.bytes);put("\nendstream")}put("\nendobj\n")});
  const xref=len;
  put(`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join(""));
  put(`trailer\n<< /Size ${objs.length+1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:"application/pdf"});
}

// ---- Word (.docx) ----
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
// A plain (stored) zip, which is all a .docx needs
function zipStore(files){
  const enc=new TextEncoder(),parts=[],cen=[];let off=0;
  const d=new Date(),dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  for(const f of files){
    const name=enc.encode(f.name),data=typeof f.data==="string"?enc.encode(f.data):f.data,crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,dt,true);h.setUint16(12,dd,true);
    h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer),name,data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,dt,true);c.setUint16(14,dd,true);
    c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);
    cen.push(new Uint8Array(c.buffer),name);
    off+=30+name.length+data.length;
  }
  const csize=cen.reduce((a,b)=>a+b.length,0),e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,csize,true);e.setUint32(16,off,true);
  return [...parts,...cen,new Uint8Array(e.buffer)];
}
const xe=s=>String(s??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function buildDocx(R,photos,logo){
  const rels=[],media=[];let rid=1,pid=1;
  const relLink=url=>{const id="rId"+(100+rid++);rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xe(url)}" TargetMode="External"/>`);return id};
  const relImg=im=>{const n=media.length+1,id="rId"+(100+rid++);media.push({name:`word/media/image${n}.jpeg`,data:im.bytes});rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${n}.jpeg"/>`);return id};
  const run=(t,o={})=>{const rp=[o.font?`<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>`:"",o.b?"<w:b/>":"",o.i?"<w:i/>":"",o.caps?"<w:caps/>":"",o.color?`<w:color w:val="${o.color}"/>`:"",o.sz?`<w:sz w:val="${Math.round(o.sz*2)}"/><w:szCs w:val="${Math.round(o.sz*2)}"/>`:"",o.u?`<w:u w:val="single"/>`:"",o.spacing?`<w:spacing w:val="${o.spacing}"/>`:"",o.shd?`<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>`:""].join("");
    return String(t).split("\n").map((s,i)=>(i?"<w:r><w:br/></w:r>":"")+`<w:r>${rp?`<w:rPr>${rp}</w:rPr>`:""}<w:t xml:space="preserve">${xe(s)}</w:t></w:r>`).join("")};
  const P=(inner,o={})=>{const pp=[o.style?`<w:pStyle w:val="${o.style}"/>`:"",o.keep?"<w:keepNext/>":"",o.bdr||"",o.shd?`<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>`:"",o.tabs||"",`<w:spacing w:before="${o.before??0}" w:after="${o.after??0}"${o.line?` w:line="${o.line}" w:lineRule="auto"`:""}/>`,o.ind||"",o.jc?`<w:jc w:val="${o.jc}"/>`:""].join("");return `<w:p><w:pPr>${pp}</w:pPr>${inner}</w:p>`};
  const pic=(im,cx,cy)=>{const id=relImg(im),n=pid++;return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`};
  const W=9638,EMU=635; // text width in twips; EMU per twip
  const ink="1F2328",muted="6B6762",amber="E5970F";
  const cellM=`<w:tblCellMar><w:top w:w="110" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="110" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar>`;
  const noB=`<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>`;
  const tbl=(cols,rows,o={})=>`<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${o.borders||noB}${o.mar||cellM}</w:tblPr><w:tblGrid>${cols.map(c=>`<w:gridCol w:w="${c}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
  const tc=(w,inner,o={})=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.span?`<w:gridSpan w:val="${o.span}"/>`:""}${o.shd?`<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>`:""}${o.v?`<w:vAlign w:val="${o.v}"/>`:""}${o.bdr||""}</w:tcPr>${inner||P("")}</w:tc>`;
  const pillRun=s=>{const [fg,bg]=RPT_ST[s]||RPT_ST.Pending;return run(" "+s+" ",{b:true,sz:9,color:fg.toUpperCase(),shd:bg.toUpperCase()})};
  const body=[];
  // Header band: logo, organisation, date
  const created=R.created.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
  body.push(tbl([1100,5338,3200],[`<w:tr><w:trPr><w:trHeight w:val="1150"/></w:trPr>`+
    tc(1100,P(logo?pic(logo,Math.round(.62*914400),Math.round(.62*914400)):"",{}),{shd:"1C1C1C",v:"center"})+
    tc(5338,P(run(R.org||"GT Hub",{b:true,sz:16,color:"FFFFFF"}),{after:20})+P(run("Mould maintenance report",{sz:9.5,color:"F0A21C"})),{shd:"1C1C1C",v:"center"})+
    tc(3200,P(run("Created "+created,{sz:9,color:"C9C5BD"}),{jc:"right",after:20})+P(run("GT Hub",{sz:9,color:"8F8A82"}),{jc:"right"}),{shd:"1C1C1C",v:"center"})+`</w:tr>`],
    {borders:`<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="24" w:space="0" w:color="${amber}"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>`}));
  body.push(P(run(R.title,{b:true,sz:22,color:ink})+run("   ")+pillRun(R.status),{before:360,after:40}));
  body.push(P(run(R.subtitle,{sz:12,color:muted}),{after:240}));
  const lines=(text,o={})=>{const base=o.ind||0,bi=base?`<w:ind w:left="${base}"/>`:"";let first=true;return rptLines(text).map(L=>{
    if(!L.text&&!L.mark)return P("",{after:0,line:276});
    const sec=o.sec&&rptSec(L),top=sec&&!first?100:0;first=false;
    if(!L.mark)return P(run(L.text,{b:sec,sz:10.5,color:ink}),{before:top,after:40,line:276,ind:bi,keep:sec});
    const left=base+360+L.lvl*280;return P(run((L.mark==="•"?(L.lvl%2?"–":"•"):L.mark)+"\t",{sz:10.5,color:ink})+run(L.text,{sz:10.5,color:ink}),{after:40,line:276,ind:`<w:ind w:left="${left}" w:hanging="260"/>`,tabs:`<w:tabs><w:tab w:val="left" w:pos="${left}"/></w:tabs>`})}).join("")};
  const label=s=>P(run(s,{b:true,caps:true,sz:8,color:muted,spacing:10}),{before:200,after:60,keep:true});
  const heading=s=>P(run(s,{b:true,sz:13,color:ink}),{before:360,after:120,keep:true,bdr:`<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${amber}"/><w:bottom w:val="single" w:sz="4" w:space="6" w:color="DEDAD2"/></w:pBdr>`});
  // photos two to a row, numbered, with their dates
  const figTbl=(list,indent)=>{const tw=W-(indent||0),cw=Math.floor(tw/2),maxW=(cw-240)*EMU,maxH=Math.round(maxW*.75),rows=[];
    for(let i=0;i<list.length;i+=2)rows.push("<w:tr><w:trPr><w:cantSplit/></w:trPr>"+[0,1].map(j=>{const im=list[i+j];if(!im)return tc(j?tw-cw:cw,P(""));
      const s=Math.min(maxW/im.w,maxH/im.h);
      return tc(j?tw-cw:cw,P(pic(im,Math.round(im.w*s),Math.round(im.h*s)),{jc:"center",after:60})+P(run("Fig. "+im.fig,{b:true,sz:8,color:ink})+(im.date?run("   "+im.date,{sz:8,color:muted}):""),{after:120}))}).join("")+"</w:tr>");
    return `<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/>${indent?`<w:tblInd w:w="${indent}" w:type="dxa"/>`:""}<w:tblLayout w:type="fixed"/>${noB}<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${cw}"/><w:gridCol w:w="${tw-cw}"/></w:tblGrid>${rows.join("")}</w:tbl>`};
  const box=st=>st==="done"?run("☑",{font:"Segoe UI Symbol",sz:11,color:ink}):st==="na"?run("N/A",{b:true,sz:7,color:muted}):run("☐",{font:"Segoe UI Symbol",sz:11,color:"8F8A82"});
  for(const b of R.blocks){
    if(b.t==="grid"){
      const rows=[];let cur=[];for(const it of b.items){if(it.full){if(cur.length)rows.push(cur);rows.push([it]);cur=[]}else{cur.push(it);if(cur.length===3){rows.push(cur);cur=[]}}}if(cur.length)rows.push(cur);
      const cw=3212,cell=it=>P(run(it.k,{b:true,caps:true,sz:7.5,color:muted,spacing:8}),{after:40})+P(run(it.v,{sz:10.5,color:ink}),{});
      const bd=`<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="8" w:space="0" w:color="FFFFFF"/><w:insideV w:val="nil"/></w:tblBorders>`;
      body.push(tbl([cw,cw,W-2*cw],rows.map(r=>"<w:tr><w:trPr><w:cantSplit/></w:trPr>"+(r[0].full?tc(W,cell(r[0]),{span:3,shd:"F5F4F1"}):[0,1,2].map(i=>tc(i<2?cw:W-2*cw,r[i]?cell(r[i]):P(""),{shd:"F5F4F1"})).join(""))+"</w:tr>"),{borders:bd}));
      continue}
    if(b.t==="h"){body.push(heading(b.text));continue}
    if(b.t==="sub"){body.push(P(run((b.no?b.no+"   ":"")+b.name,{b:true,sz:12,color:ink})+(b.status?run("   ")+pillRun(b.status):""),{before:280,after:b.meta?0:80,keep:true,shd:"F3F1EC",bdr:`<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${amber}"/></w:pBdr>`,ind:`<w:ind w:left="170"/>`}));
      if(b.meta)body.push(P(run(b.meta,{sz:9,color:muted}),{after:80,keep:true,shd:"F3F1EC",bdr:`<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${amber}"/></w:pBdr>`,ind:`<w:ind w:left="170"/>`}));continue}
    if(b.t==="field"){if(b.label)body.push(label(b.label));body.push(lines(b.text));continue}
    if(b.t==="upd"){if(b.label)body.push(label(b.label));
      {const nt=rptUpdNote(b);body.push(P(run(b.date,{b:true,sz:10.5,color:ink})+(nt?run("    "+nt,{sz:9,color:muted}):""),{before:b.label?0:200,after:40,keep:true}))}
      if(b.text)body.push(lines(b.text,{ind:240,sec:true}));
      if(b.figs&&b.figs.length){body.push(figTbl(b.figs,240));body.push(P("",{after:60}))}
      continue}
    if(b.t==="note"){body.push(P(run(b.text,{i:true,sz:10.5,color:muted}),{before:80}));continue}
    if(b.t==="table"){body.push(label(b.label));const c0=1100,cw=Math.floor((W-c0)/(b.cols.length-1)),ws=b.cols.map((_,i)=>i?cw:c0);
      const bd=`<w:tblBorders><w:top w:val="single" w:sz="4" w:color="DEDAD2"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:color="DEDAD2"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="4" w:color="EEEBE5"/><w:insideV w:val="nil"/></w:tblBorders>`;
      const mar=`<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>`;
      body.push(tbl(ws,[`<w:tr><w:trPr><w:tblHeader/></w:trPr>`+b.cols.map((c,i)=>tc(ws[i],P(run(c,{b:true,sz:9,color:muted})),{shd:"F5F4F1"})).join("")+`</w:tr>`,
        ...b.rows.map((r,ri)=>`<w:tr><w:trPr><w:cantSplit/></w:trPr>`+r.map((v,i)=>{const ol=/^ol$/i.test(v);return tc(ws[i],P(run(v,{b:i===0||ol,sz:10,color:ol?"B3261E":ink})),(b.flagged||[]).includes(ri)?{shd:"FBE9DA"}:{})}).join("")+`</w:tr>`)],{borders:bd,mar}));
      if((b.flagged||[]).length)body.push(P(run("Shaded rows are flagged zones.",{i:true,sz:8.5,color:muted}),{before:40}));
      continue}
    if(b.t==="parts"){body.push(label(b.label));
      b.items.forEach(p=>{const t=run("•\t",{sz:10.5,color:ink})+(p.url?`<w:hyperlink r:id="${relLink(p.url)}">${run(p.text||p.url,{sz:10.5,color:"1A5FB4",u:true})}</w:hyperlink>`:run(p.text,{sz:10.5,color:ink}));
        body.push(P(t,{after:40,line:276,ind:`<w:ind w:left="360" w:hanging="260"/>`,tabs:`<w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs>`}))});continue}
    if(b.t==="todo"){b.items.forEach(it=>body.push(P(box(it.done?"done":"")+run("  "+(it.text||""),{sz:10.5,color:it.done?muted:ink}),{after:40,line:276,ind:`<w:ind w:left="340" w:hanging="340"/>`})));continue}
    if(b.t==="check"){body.push(label(b.label));body.push(P(run(b.summary,{b:true,sz:10.5,color:ink}),{after:60}));
      for(const r of b.rows){
        if(r.note){body.push(P(run("Note: ",{b:true,sz:9.5,color:"B4530A"})+run(r.note,{b:true,sz:9.5,color:ink}),{before:60,after:60,shd:"FBE9DA",bdr:`<w:pBdr><w:left w:val="single" w:sz="24" w:space="6" w:color="${amber}"/></w:pBdr>`,ind:`<w:ind w:left="140"/>`}));continue}
        if(r.sec){body.push(P(run(r.sec,{b:true,sz:9.5,color:muted}),{before:120,after:40,keep:true}));continue}
        const left=r.lvl?340:0;
        if(r.group){body.push(P(run(r.t,{sz:10,color:ink}),{after:30,keep:true,ind:`<w:ind w:left="${left}"/>`}));continue}
        const extra=r.counter&&rptHas(b.shots)?"   (reading: "+fmtNum(b.shots)+")":"";
        body.push(P(box(r.st)+run("  "+r.t+extra,{sz:10,color:r.st==="done"?ink:muted}),{after:30,ind:`<w:ind w:left="${left+340}" w:hanging="340"/>`}))}
      continue}
  }
  if(photos&&(photos.groups.length||photos.files.length||photos.skipped)){
    body.push(heading(photos.groups.length?"Photos & files":"Files"));
    for(const gr of photos.groups){
      if(gr.title)body.push(P(run(gr.title,{b:true,sz:9.5,color:muted}),{before:160,after:80,keep:true}));
      body.push(figTbl(gr.imgs,0))}
    if(photos.files.length){body.push(label("Other files in the Drive folder"));
      photos.files.forEach(f=>body.push(P(run("•\t",{sz:10.5})+(f.url?`<w:hyperlink r:id="${relLink(f.url)}">${run(f.name,{sz:10.5,color:"1A5FB4",u:true})}</w:hyperlink>`:run(f.name,{sz:10.5}))+(f.note?run("  ("+f.note+")",{i:true,sz:9.5,color:muted}):""),{after:40,ind:`<w:ind w:left="360" w:hanging="260"/>`,tabs:`<w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs>`})))}
    if(photos.skipped)body.push(P(run(`${photos.skipped} more photo${photos.skipped===1?" is":"s are"} in the Drive folder.`,{i:true,sz:9.5,color:muted}),{before:120}));
  }
  const NS=`xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
  const fld=c=>`<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="${muted}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="${muted}"/></w:rPr><w:instrText xml:space="preserve"> ${c} </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="${muted}"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="${muted}"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="${muted}"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const footer=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>`+P(run("GT Hub  ·  "+R.title,{sz:8,color:muted})+run("\t",{sz:8})+run("Page ",{sz:8,color:muted})+fld("PAGE")+run(" of ",{sz:8,color:muted})+fld("NUMPAGES"),{bdr:`<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="DEDAD2"/></w:pBdr>`,tabs:`<w:tabs><w:tab w:val="right" w:pos="${W}"/></w:tabs>`})+`</w:ftr>`;
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join("")}<w:sectPr><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1134" w:bottom="1000" w:left="1134" w:header="567" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-AU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1A5FB4"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`;
  const docRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${rels.join("")}</Relationships>`;
  const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const root=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const iso=R.created.toISOString().replace(/\.\d+Z$/,"Z");
  const core=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(R.title+" - "+R.subtitle)}</dc:title><dc:creator>GT Hub</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
  return new Blob(zipStore([{name:"[Content_Types].xml",data:ct},{name:"_rels/.rels",data:root},{name:"word/document.xml",data:doc},{name:"word/styles.xml",data:styles},{name:"word/footer1.xml",data:footer},{name:"word/_rels/document.xml.rels",data:docRels},{name:"docProps/core.xml",data:core},...media]),{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}

// ---- Export dialog ----
let rptFor=null,rptFile=null,rptSel=new Set(),rptCan=false;
const rptMode=()=>segVal("#rpt-pmode")||"all";
const rptScopeId=()=>rptFor&&rptFor.sub&&segVal("#rpt-scope")==="sub"?rptFor.sub:null;
// names of the photos on updates in the report's scope, with the update's date (to show where a photo will go)
function rptUpdNames(l,only){const m=new Map(),R=reportModel(l,only);for(const b of R.blocks)if(b.t==="upd")(b.files||[]).forEach(n=>{if(!m.has(n))m.set(n,b.date)});return m}
async function rptRefresh(){
  const l=logs.find(x=>x.id===(rptFor&&rptFor.id));if(!l)return;
  const mode=rptMode(),h=$("#rpt-photos-h"),pk=$("#rpt-pick");
  pk.hidden=mode!=="chosen";
  if(!rptCan){h.textContent="Connect Google Drive to include photos";return}
  if(mode==="none"){h.textContent="No photos in the report";return}
  if(!hasToken()){h.textContent="Checking the Drive folder…";const ok=typeof srvRenew==="function"?await srvRenew():false;if(!ok){h.textContent=mode==="chosen"?"Connect Google Drive to choose photos":"Photos come from the work order's Drive folder";return}}
  h.textContent="Checking the Drive folder…";
  let v;try{v=await rptListing(l,rptScopeId())}catch(e){h.textContent="Couldn't reach Google Drive";return}
  if(rptMode()!==mode)return;
  const n=v?v.images.length:0,picked=rptPicked(v,{mode,ids:rptSel}).length;
  h.textContent=!n?"No photos in the Drive folder":mode==="all"?`All ${n} photo${n===1?"":"s"}${n>80?" (the first 80)":""}. Photos on an update go under it; the rest go in a Photos section.`
    :mode==="starred"?(picked?`The ${picked} starred photo${picked===1?"":"s"}`:"None of the photos are starred. Star them in the gallery, or use Choose.")
    :"Tap photos to put them in the report. Ones on an update go under it; the rest go in a Photos section.";
  if(mode==="chosen")rptPickRender(l,v)}
function rptPickRender(l,v,root,only){root=root||$("#rpt-pick");if(only===undefined)only=rptScopeId();const grid=root.querySelector(".rpk-grid"),cnt=root.querySelector(".rpk-n");
  if(!v||!v.images.length){grid.innerHTML=`<div class="small">No photos in the Drive folder.</div>`;cnt.textContent="0 chosen";return}
  const names=rptUpdNames(l,only),bySet=new Map();v.images.forEach(it=>{if(!bySet.has(it.set))bySet.set(it.set,[]);bySet.get(it.set).push(it)});
  grid.innerHTML=[...bySet].map(([st,list])=>`<div class="rpk-grp">${bySet.size>1||st.title?`<span class="label">${esc(st.title||"Work order")}</span>`:""}${list.map(({f})=>{const on=rptSel.has(f.id),u=names.get(f.name);
    return `<button type="button" class="rpk-t${on?" on":""}" data-pkid="${esc(f.id)}" aria-pressed="${on}" title="${esc(f.name)}">${thumbUrl(f,240)?`<img src="${esc(thumbUrl(f,240))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span class="nm">${esc(f.name)}</span>`}<span class="ck">${on?"✓":""}</span>${f.starred?'<span class="st">★</span>':""}${u?`<span class="up">Update ${esc(u)}</span>`:""}</button>`}).join("")}</div>`).join("");
  cnt.textContent=`${rptSel.size} chosen`}
$("#rpt-files").addEventListener("change",()=>{try{localStorage.setItem("ml_rpt_files",$("#rpt-files").checked?"1":"0")}catch(e){}});
$("#rpt-pmode").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;segSet("#rpt-pmode",b.dataset.v);try{localStorage.setItem("ml_rpt_pmode",b.dataset.v)}catch(err){}rptRefresh()});
$("#rpt-scope").addEventListener("click",e=>{if(e.target.closest("button"))setTimeout(rptRefresh,0)});
async function rpkClick(e,root,l,only){
  const t=e.target.closest("[data-pkid]");if(t){const id=t.dataset.pkid;rptSel.has(id)?rptSel.delete(id):rptSel.add(id);const on=rptSel.has(id);t.classList.toggle("on",on);t.setAttribute("aria-pressed",on);t.querySelector(".ck").textContent=on?"✓":"";root.querySelector(".rpk-n").textContent=`${rptSel.size} chosen`;return true}
  const q=e.target.closest("[data-pk]");if(!q)return false;const v=await rptListing(l,only).catch(()=>null);if(!v)return false;
  if(q.dataset.pk==="none")rptSel.clear();
  else if(q.dataset.pk==="starred")v.images.forEach(({f})=>{if(f.starred)rptSel.add(f.id)});
  else if(q.dataset.pk==="upd"){const names=rptUpdNames(l,only);v.images.forEach(({f})=>{if(names.has(f.name))rptSel.add(f.id)})}
  rptPickRender(l,v,root,only);return true}
$("#rpt-pick").addEventListener("click",e=>{const l=logs.find(x=>x.id===(rptFor&&rptFor.id));if(l)rpkClick(e,$("#rpt-pick"),l,rptScopeId())});
function openReport(){
  if(!editingId){toast("Save the work order first");return}
  const l=logs.find(x=>x.id===editingId);if(!l)return;
  rptFor={id:l.id,sub:subPage||null};rptFile=null;
  $("#rpt-for").textContent=subPage?`Sub-job ${$("#f-wo").value.trim().toUpperCase()}-${formSubNo[subPage]} · ${$("#b-title").textContent}`:`Work order #${l.wo} · ${jobTool(l)}`;
  $("#rpt-scope-f").hidden=!subPage;segSet("#rpt-scope","sub");
  const can=!!woNum(l.wo)&&!!driveRoot&&(hasToken()||driveEver()||(typeof srvOn==="function"&&srvOn()));rptCan=can;rptListCache=null;
  $("#rpt-drive").disabled=!can;$("#rpt-drive").checked=false;$("#rpt-upd").checked=true;
  let lf=true;try{lf=localStorage.getItem("ml_rpt_files")!=="0"}catch(e){}$("#rpt-files").disabled=!can;$("#rpt-files").checked=can&&lf;
  // the photos chosen last time for this work order are kept with it
  rptSel=new Set(Array.isArray(l.rptPhotos)?l.rptPhotos:[]);
  let pm="all";try{pm=localStorage.getItem("ml_rpt_pmode")||"all"}catch(e){}if(rptSel.size)pm="chosen";if(!can)pm="none";
  segSet("#rpt-pmode",pm);$("#rpt-pmode").querySelectorAll("button").forEach(b=>b.disabled=!can&&b.dataset.v!=="none");
  $("#rpt-pk-grid").innerHTML="";rptRefresh();
  $("#rpt-status").textContent="";$("#rpt-done").hidden=true;$("#rpt-go").hidden=false;$("#rpt-go").disabled=false;
  $("#rptm").hidden=false;try{history.pushState({ml:"rpt"},"")}catch(e){}
}
function closeReport(fromBack){if($("#rptm").hidden)return;$("#rptm").hidden=true;rptFile=null;if(fromBack!==true){try{if(history.state&&history.state.ml==="rpt"){skipPop++;history.back()}}catch(e){}}}
segBind("#rpt-scope");segBind("#rpt-fmt");
$("#rpt-org").value=rptOrg();$("#rpt-org").addEventListener("input",()=>{try{localStorage.setItem("ml_rpt_org",$("#rpt-org").value.trim())}catch(e){}});
$("#rpt-cancel").onclick=()=>closeReport();
$("#rptm").addEventListener("click",e=>{if(e.target.id==="rptm")closeReport()});
$("#rpt-go").onclick=async()=>{
  const l=logs.find(x=>x.id===(rptFor&&rptFor.id));if(!l)return;
  const st=$("#rpt-status"),go=$("#rpt-go");go.disabled=true;
  const fmt=segVal("#rpt-fmt")||"pdf",only=rptFor.sub&&segVal("#rpt-scope")==="sub"?rptFor.sub:null;
  const pmode=rptCan?rptMode():"none",wantPhotos=pmode!=="none",wantFiles=$("#rpt-files").checked&&!$("#rpt-files").disabled,toDrive=$("#rpt-drive").checked&&!$("#rpt-drive").disabled,withUpd=$("#rpt-upd").checked;
  // keep this work order's chosen photos for next time (only that field changes)
  if(pmode==="chosen"){const ids=[...rptSel],old=Array.isArray(l.rptPhotos)?l.rptPhotos:[];if(ids.length!==old.length||ids.some(x=>!old.includes(x)))db.collection("logs").doc(l.id).update({rptPhotos:ids}).catch(()=>{})}
  try{
    if((wantPhotos||wantFiles||toDrive)&&!hasToken()){st.textContent="Connecting to Google Drive…";try{await requestToken("")}catch(e){}}
    const R=reportModel(l,only,{updates:withUpd});
    let photos=null;
    if(hasToken()&&(wantPhotos||wantFiles||toDrive)){st.textContent="Checking the Drive folder…";try{photos=await rptDriveFiles(l,only,{mode:pmode,ids:rptSel},s=>st.textContent=s)}catch(e){photos=null;st.textContent="Couldn't reach Google Drive, so photos are left out."}}
    if(wantPhotos&&pmode!=="all"&&photos&&!photos.imgs.length&&photos.inDrive)st.textContent=pmode==="chosen"?"No photos chosen":"No starred photos";
    if(photos&&!wantFiles)photos.files=photos.files.filter(f=>!f.other);
    photos=rptPlace(R,photos);
    st.textContent="Making the report…";
    const logo=await rptLogo();
    const blob=fmt==="docx"?buildDocx(R,photos,logo):buildPdf(R,photos,logo);
    const name=`#${R.short} ${R.subtitle}`.replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim().slice(0,90)+` report.${fmt}`;
    rptFile=new File([blob],name,{type:blob.type});
    let msg=`Ready: ${name} (${fmtSize(blob.size)})`;
    if(toDrive){
      try{if(!hasToken())throw {code:"needs_token"};const num=woNum(l.wo),tabs=tabIdsFor(l.mouldId,l.extraMouldIds);
        let folder=(await findWoFolder(num))||(await createWoFolder(num,jobTool(l)));
        if(only&&tabs.includes(only))folder=(await findSubFolder(num,folder.id,subName(only)))||(await createSubFolder(num,folder.id,subName(only)));
        const old=await dList(`'${dq(folder.id)}' in parents and name='${dq(name)}' and trashed=false`);
        const ex=old.files&&old.files[0];
        if(ex)await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(ex.id)}?uploadType=media&supportsAllDrives=true`,{method:"PATCH",headers:{"Content-Type":blob.type},body:blob});
        else await dUpload(folder.id,blob,name,blob.type);
        delete driveState[num];msg+=" · saved to the Drive folder"}
      catch(e){msg+=" · couldn't save to Drive"}
    }
    st.textContent=msg;go.hidden=true;$("#rpt-done").hidden=false;
    $("#rpt-share").hidden=!(navigator.canShare&&navigator.canShare({files:[rptFile]}));
  }catch(e){st.textContent="Couldn't make the report"+(e&&e.message?": "+e.message:"");go.disabled=false}
};
$("#rpt-dl").onclick=()=>{if(!rptFile)return;const a=document.createElement("a");a.href=URL.createObjectURL(rptFile);a.download=rptFile.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)};
$("#rpt-share").onclick=async()=>{if(!rptFile)return;try{await navigator.share({files:[rptFile],title:rptFile.name})}catch(e){if(e&&e.name!=="AbortError")toast("Couldn't share. Try Download instead.")}};


// ---- Share: a view-only link to this work order (view.html, served through the GT Hub server functions) ----
let shFor=null;
const shUrl=id=>location.origin+location.pathname.replace(/[^/]*$/,"")+"view.html#"+id;
const shScopeId=()=>shFor&&shFor.sub&&segVal("#sh-scope")==="sub"?shFor.sub:null;
const shExisting=()=>shares.find(s=>shareLive(s)&&s.logId===(shFor&&shFor.id)&&(s.sub||null)===shScopeId());
function shToken(){const b=new Uint8Array(24);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
// What a shared link shows: the report's content (with the chosen photos placed under their updates), as plain data
function shareSnap(l,sh){
  const R=reportModel(l,sh.sub||null,{updates:true});
  const ids=new Set(sh.photos==="none"?[]:(l.rptPhotos||[])),meta=(sh.pm||[]).filter(m=>ids.has(m.id)).map(m=>({...m}));
  const ph=rptPlace(R,{imgs:meta,files:[],skipped:0});
  const fig=im=>({id:im.id,fig:im.fig,date:im.date||""});
  const blocks=R.blocks.map(b=>{const o={...b};delete o.files;delete o.owner;if(b.figs)o.figs=b.figs.map(fig);return o});
  // a work order with sub-jobs gets a summary at the top: each sub-job's status, description, inspection and work done
  const summary=[];let cur=null;
  for(const b of R.blocks){if(b.t==="sub"){cur={no:b.no,name:b.name,status:b.status};summary.push(cur);continue}
    if(cur&&b.t==="field"&&b.text){const k={"Description":"desc","Inspection / faults found":"insp","Work done":"work"}[b.label];if(k)cur[k]=b.text}}
  const sumOut=summary.filter(x=>x.desc||x.insp||x.work);
  return {snap:{title:R.title,subtitle:R.subtitle,status:R.status,org:R.org,wo:R.wo,summary:sumOut.length?sumOut:null,blocks,groups:(ph.groups||[]).map(g=>({title:g.title||"",imgs:g.imgs.map(fig)}))},photoIds:meta.map(m=>m.id)}}
const shLabel=(l,sh)=>{const sub=sh.sub&&tabIdsFor(l.mouldId,l.extraMouldIds).includes(sh.sub)?subMeta(l,sh.sub):null;return "#"+(sub&&sub.no?subLabel(l,sh.sub):l.wo)+" · "+(sh.sub?mName(sh.sub):jobTool(l))};
// Photo details (names, dates, folders) for the work order's photos, from the Drive listing
async function sharePhotoMeta(l,sub){const v=await rptListing(l,sub);return v?v.images.map(({f,set})=>({id:f.id,name:f.name,t:fileTaken(f),date:rptPhotoDate(f),set:set.title||""})):null}
let shareBusy=false;
async function shareSyncAll(){if(shareBusy)return;shareBusy=true;
  try{for(const sh of shares.filter(shareLive)){const l=logs.find(x=>x.id===sh.logId);if(!l)continue;
      let pm=sh.pm||[];
      // photos chosen since the last listing need their details from Drive
      if(sh.photos!=="none"&&(l.rptPhotos||[]).some(id=>!pm.some(m=>m.id===id))&&hasToken()){rptListCache=null;const m=await sharePhotoMeta(l,sh.sub||null).catch(()=>null);if(m)pm=m}
      const {snap,photoIds}=shareSnap(l,{...sh,pm}),label=shLabel(l,sh);
      if(JSON.stringify(snap)===JSON.stringify(sh.snap||null)&&JSON.stringify(photoIds)===JSON.stringify(sh.photoIds||[])&&pm===sh.pm&&label===sh.label)continue;
      await db.collection("shares").doc(sh.id).update({snap,photoIds,pm,label,updatedAt:new Date().toISOString()}).catch(()=>{})}}
  finally{shareBusy=false}}
function shRender(){const l=logs.find(x=>x.id===(shFor&&shFor.id));if(!l)return;const ex=shExisting();
  $("#sh-live").hidden=!ex;$("#sh-go").textContent=ex?"Save changes":"Create link";$("#sh-exp-f").hidden=!!ex;
  if(ex){$("#sh-url").value=shUrl(ex.id);$("#sh-open").href=shUrl(ex.id);$("#sh-exp").textContent=`The link works until ${fmtDate(String(ex.expires).slice(0,10))}.`;segSet("#sh-pmode",ex.photos==="none"?"none":"chosen")}
  shPhotos()}
async function shPhotos(){const l=logs.find(x=>x.id===(shFor&&shFor.id));if(!l)return;const mode=segVal("#sh-pmode"),h=$("#sh-photos-h");
  $("#sh-pick").hidden=mode!=="chosen";if(mode!=="chosen"){h.textContent="Photos aren't shown.";return}
  if(!hasToken()){const ok=typeof srvRenew==="function"?await srvRenew():false;if(!ok){h.textContent="Connect Google Drive to choose photos.";return}}
  h.textContent="Checking the Drive folder…";let v;try{v=await rptListing(l,shScopeId())}catch(e){h.textContent="Couldn't reach Google Drive";return}
  h.textContent="Tap photos to show them. These are also the photos chosen for this work order's reports. Ones on an update show under it.";rptPickRender(l,v,$("#sh-pick"),shScopeId())}
function openShare(){
  if(!editingId){toast("Save the work order first");return}
  const l=logs.find(x=>x.id===editingId);if(!l)return;
  if(!woNum(l.wo)){toast("Give the work order a number first");return}
  shFor={id:l.id,sub:subPage||null};rptListCache=null;rptSel=new Set(Array.isArray(l.rptPhotos)?l.rptPhotos:[]);
  $("#sh-for").textContent=subPage?`Sub-job ${$("#f-wo").value.trim().toUpperCase()}-${formSubNo[subPage]} · ${$("#b-title").textContent}`:`Work order #${l.wo} · ${jobTool(l)}`;
  $("#sh-scope-f").hidden=!subPage;segSet("#sh-scope","sub");segSet("#sh-days","30");segSet("#sh-pmode","chosen");
  $("#sh-status").textContent="";$("#sh-go").disabled=false;
  $("#shm").hidden=false;try{history.pushState({ml:"shm"},"")}catch(e){}
  shRender()}
function closeShare(fromBack){if($("#shm").hidden)return;$("#shm").hidden=true;shFor=null;if(fromBack!==true){try{if(history.state&&history.state.ml==="shm"){skipPop++;history.back()}}catch(e){}}}
segBind("#sh-scope");segBind("#sh-days");segBind("#sh-pmode");
$("#sh-scope").addEventListener("click",e=>{if(e.target.closest("button"))setTimeout(()=>{rptListCache=null;shRender()},0)});
$("#sh-pmode").addEventListener("click",e=>{if(e.target.closest("button"))setTimeout(shPhotos,0)});
$("#sh-pick").addEventListener("click",e=>{const l=logs.find(x=>x.id===(shFor&&shFor.id));if(l)rpkClick(e,$("#sh-pick"),l,shScopeId())});
$("#sh-close").onclick=()=>closeShare();
$("#shm").addEventListener("click",e=>{if(e.target.id==="shm")closeShare()});
$("#sh-go").onclick=async()=>{const l=logs.find(x=>x.id===(shFor&&shFor.id));if(!l)return;const st=$("#sh-status"),go=$("#sh-go");go.disabled=true;
  try{
    const sub=shScopeId(),photos=segVal("#sh-pmode")==="none"?"none":"chosen",ids=[...rptSel];
    // the chosen photos belong to the work order (they're the report's too); only that field changes
    const old=Array.isArray(l.rptPhotos)?l.rptPhotos:[];
    if(photos==="chosen"&&(ids.length!==old.length||ids.some(x=>!old.includes(x)))){await db.collection("logs").doc(l.id).update({rptPhotos:ids});l.rptPhotos=ids}
    st.textContent="Preparing the shared view…";
    let pm=[];if(photos==="chosen"&&ids.length){if(!hasToken())await requestToken("");pm=(await sharePhotoMeta(l,sub))||[]}
    const ex=shExisting(),now=new Date().toISOString(),sh={sub,photos,pm},{snap,photoIds}=shareSnap(l,sh),label=shLabel(l,sh);
    if(ex){await db.collection("shares").doc(ex.id).update({photos,pm,snap,photoIds,label,updatedAt:now});Object.assign(ex,{photos,pm,snap,photoIds,label});st.textContent="Saved. The link shows the changes now."}
    else{const id=shToken(),days=+(segVal("#sh-days")||30),expires=new Date(Date.now()+days*864e5).toISOString();
      const doc={uid:(currentUser&&currentUser.uid)||"",logId:l.id,wo:l.wo,sub,photos,pm,snap,photoIds,label,createdAt:now,updatedAt:now,expires,revoked:false};
      await db.collection("shares").doc(id).set(doc);if(!shares.some(x=>x.id===id))shares.push({id,...doc});
      st.textContent="Link created. Share or copy it below."}
    shRender()}
  catch(e){st.textContent="Couldn't share: "+((e&&e.message)||e.code||"error")}
  go.disabled=false};
$("#sh-copy").onclick=async()=>{try{await navigator.clipboard.writeText($("#sh-url").value);toast("Link copied")}catch(e){$("#sh-url").select();toast("Select the link and copy it")}};
$("#sh-send").onclick=async()=>{const l=logs.find(x=>x.id===(shFor&&shFor.id)),url=$("#sh-url").value,ttl=`Work order #${l?l.wo:""}`;
  if(navigator.share){try{await navigator.share({title:ttl,text:`${ttl}: view-only link from GT Hub`,url})}catch(e){}}else location.href=`mailto:?subject=${encodeURIComponent(ttl)}&body=${encodeURIComponent(ttl+": view-only link\n"+url)}`};
$("#sh-extend").onclick=async()=>{const ex=shExisting();if(!ex)return;const base=Math.max(Date.now(),Date.parse(ex.expires)||0),expires=new Date(base+30*864e5).toISOString();
  try{await db.collection("shares").doc(ex.id).update({expires,updatedAt:new Date().toISOString()});ex.expires=expires;shRender();toast("Extended by 30 days")}catch(e){toast("Couldn't extend")}};
$("#sh-stop").onclick=async()=>{const ex=shExisting(),b=$("#sh-stop");if(!ex)return;
  if(!b.classList.contains("armed")){b.classList.add("armed");b.textContent="Tap again to stop sharing";setTimeout(()=>{b.classList.remove("armed");b.textContent="Stop sharing"},4000);return}
  b.classList.remove("armed");b.textContent="Stop sharing";
  try{await db.collection("shares").doc(ex.id).update({revoked:true,updatedAt:new Date().toISOString()});ex.revoked=true;shRender();toast("Sharing stopped. The link no longer works.")}catch(e){toast("Couldn't stop sharing")}};
