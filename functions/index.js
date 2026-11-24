// GT Hub server functions: keep Google Drive connected without sign-in popups.
//
// The app normally gets a one-hour Drive pass in the browser, and a browser can't renew it on its own.
// Here, the app links Drive once (an authorization code), this function swaps it for Google's long-lived
// refresh token, stores it ENCRYPTED in Firestore (_private/drive_<uid>), and from then on hands the app
// a fresh one-hour pass whenever it asks. Only the signed-in owner can call these.
//
// Secrets (set once in Cloud Shell, never in this repo):
//   GOOGLE_CLIENT_SECRET  the OAuth web client's secret (Google Cloud → APIs & Services → Credentials)
//   DRIVE_TOKEN_KEY       32 random bytes (base64) used to encrypt the stored refresh token
//   ALLOWED_EMAILS        the Google account(s) allowed to use GT Hub, comma separated
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const crypto = require("node:crypto");

initializeApp();
const CLIENT_ID = "946935745198-hhimkr2nbouioci5grd3oj0epkn5kvjg.apps.googleusercontent.com"; // public, same as config.js
const CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const TOKEN_KEY = defineSecret("DRIVE_TOKEN_KEY");
const ALLOWED = defineSecret("ALLOWED_EMAILS");
const OPTS = {region: "australia-southeast1", cors: true, secrets: [CLIENT_SECRET, TOKEN_KEY, ALLOWED], maxInstances: 2, memory: "256MiB", timeoutSeconds: 30};
const docFor = uid => getFirestore().collection("_private").doc("drive_" + uid);

function owner(req) {
  const a = req.auth;
  if (!a || !a.token || !a.token.email || a.token.email_verified === false) throw new HttpsError("unauthenticated", "Sign in to GT Hub first.");
  const ok = ALLOWED.value().split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!ok.includes(a.token.email.toLowerCase())) throw new HttpsError("permission-denied", "This account can't use GT Hub.");
  return {uid: a.uid, email: a.token.email.toLowerCase()};
}
function key() {
  const k = Buffer.from(TOKEN_KEY.value().trim(), "base64");
  if (k.length !== 32) throw new HttpsError("internal", "DRIVE_TOKEN_KEY must be 32 bytes (base64).");
  return k;
}
function seal(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return {iv: iv.toString("base64"), enc: enc.toString("base64"), tag: c.getAuthTag().toString("base64")};
}
function open(d) {
  const c = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(d.iv, "base64"));
  c.setAuthTag(Buffer.from(d.tag, "base64"));
  return Buffer.concat([c.update(Buffer.from(d.enc, "base64")), c.final()]).toString("utf8");
}
async function google(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({client_id: CLIENT_ID, client_secret: CLIENT_SECRET.value().trim(), ...params})});
  const j = await r.json().catch(() => ({}));
  return {ok: r.ok, j};
}
const emailOf = idt => {try {return JSON.parse(Buffer.from(String(idt).split(".")[1], "base64url").toString()).email || ""} catch (e) {return ""}};
const pass = j => ({linked: true, access_token: j.access_token, expires_in: j.expires_in || 3600, scope: j.scope || ""});

// Link Drive: swap the one-time code from the app for Google's long-lived refresh token
exports.driveLink = onCall(OPTS, async req => {
  const me = owner(req), code = String((req.data && req.data.code) || ""), origin = String((req.data && req.data.origin) || "");
  if (!code) throw new HttpsError("invalid-argument", "No authorization code.");
  let r = await google({code, grant_type: "authorization_code", redirect_uri: "postmessage"});
  if (!r.ok && /redirect_uri/i.test(JSON.stringify(r.j)) && origin) r = await google({code, grant_type: "authorization_code", redirect_uri: origin});
  if (!r.ok) throw new HttpsError("failed-precondition", "Google refused the link: " + (r.j.error_description || r.j.error || "unknown error"));
  const got = emailOf(r.j.id_token).toLowerCase();
  if (got && got !== me.email) throw new HttpsError("permission-denied", `That was ${got}. Link the Google account you sign in to GT Hub with (${me.email}).`);
  if (!r.j.refresh_token) {
    // Google only hands out a long-lived token on a fresh approval. Clear the old approval so the next try gets one.
    await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(r.j.access_token), {method: "POST"}).catch(() => {});
    return {linked: false, again: true};
  }
  await docFor(me.uid).set({...seal(r.j.refresh_token), email: me.email, scope: r.j.scope || "", linkedAt: FieldValue.serverTimestamp()});
  return pass(r.j);
});

// A fresh one-hour Drive pass, no popup
exports.driveToken = onCall(OPTS, async req => {
  const me = owner(req), snap = await docFor(me.uid).get();
  if (!snap.exists) return {linked: false};
  let rt;
  try {rt = open(snap.data())} catch (e) {return {linked: false}}
  const r = await google({refresh_token: rt, grant_type: "refresh_token"});
  if (!r.ok) {
    // revoked, password changed, or approval removed in the Google account: forget it so the app offers to link again
    if (r.j.error === "invalid_grant") {await docFor(me.uid).delete(); return {linked: false}}
    throw new HttpsError("unavailable", "Google didn't renew the Drive pass: " + (r.j.error_description || r.j.error || "try again"));
  }
  return pass(r.j);
});

// Unlink: revoke the long-lived token and delete it
exports.driveUnlink = onCall(OPTS, async req => {
  const me = owner(req), ref = docFor(me.uid), snap = await ref.get();
  if (snap.exists) {
    try {const rt = open(snap.data()); await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(rt), {method: "POST"})} catch (e) {}
    await ref.delete();
  }
  return {linked: false};
});

// ---- Shared work orders: a view-only page for supervisors ----
// The owner's app writes shares/<random link id> = {uid, logId, sub, expires, revoked, snap, photoIds}: snap is the
// work order as it should be shown (built and kept up to date by the app), photoIds the Drive photos it may show.
// These two functions are the only way in: no sign-in, but only with the link's id, and never more than that.
const {onRequest} = require("firebase-functions/v2/https");
const SHARE_OPTS = {region: "australia-southeast1", cors: true, secrets: [CLIENT_SECRET, TOKEN_KEY], maxInstances: 4, memory: "256MiB", timeoutSeconds: 60};
const shareRef = t => getFirestore().collection("shares").doc(t);
const tokOk = t => typeof t === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(t);
async function liveShare(t) {
  if (!tokOk(t)) return null;
  const s = await shareRef(t).get();
  if (!s.exists) return null;
  const d = s.data();
  if (d.revoked || (d.expires && Date.parse(d.expires) < Date.now())) return {gone: true};
  return d;
}
// a Drive pass for the share owner's account (the stored, encrypted long-lived login)
const passCache = new Map();
async function ownerPass(uid) {
  const c = passCache.get(uid);
  if (c && c.exp > Date.now() + 60000) return c.tok;
  const snap = await docFor(uid).get();
  if (!snap.exists) return null;
  const r = await google({refresh_token: open(snap.data()), grant_type: "refresh_token"});
  if (!r.ok) return null;
  passCache.set(uid, {tok: r.j.access_token, exp: Date.now() + (r.j.expires_in || 3600) * 1000});
  return r.j.access_token;
}

exports.shareView = onRequest(SHARE_OPTS, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const t = String((req.body && req.body.t) || req.query.t || "");
  const d = await liveShare(t).catch(() => null);
  if (!d) return res.status(404).json({error: "This link doesn't exist."});
  if (d.gone) return res.status(410).json({error: "This link has expired or sharing was stopped."});
  res.json({snap: d.snap || null, expires: d.expires || null, updatedAt: d.updatedAt || null});
});

exports.sharePhoto = onRequest(SHARE_OPTS, async (req, res) => {
  const t = String(req.query.t || ""), id = String(req.query.id || ""), big = req.query.s === "l";
  const d = await liveShare(t).catch(() => null);
  if (!d || d.gone || !/^[A-Za-z0-9_-]{10,100}$/.test(id) || !(d.photoIds || []).includes(id)) return res.status(404).send("Not found");
  const tok = await ownerPass(d.uid).catch(() => null);
  if (!tok) return res.status(503).send("Photos are unavailable right now");
  const H = {Authorization: "Bearer " + tok};
  try {
    // a sized copy from Drive's thumbnail service; the original file if that isn't available
    const m = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=thumbnailLink,mimeType&supportsAllDrives=true`, {headers: H});
    const meta = m.ok ? await m.json() : {};
    let r = null;
    if (meta.thumbnailLink) {
      r = await fetch(meta.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, "") + (big ? "=s2000" : "=s800"), {headers: H});
      if (!r.ok || !String(r.headers.get("content-type") || "").startsWith("image/")) r = null;
    }
    if (!r) r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {headers: H});
    if (!r.ok) return res.status(404).send("Not found");
    res.set("Content-Type", r.headers.get("content-type") || meta.mimeType || "image/jpeg");
    res.set("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).send("Couldn't load the photo");
  }
});

// A shared video, streamed a piece at a time as the viewer plays it (the browser asks for byte ranges), so a long
// video never goes through in one go and only what's watched is sent. Only videos the owner chose for this link.
const {Readable} = require("stream");
const VID_PIECE = 4 * 1024 * 1024;
exports.shareVideo = onRequest({...SHARE_OPTS, maxInstances: 6, timeoutSeconds: 120}, async (req, res) => {
  const t = String(req.query.t || ""), id = String(req.query.id || "");
  const d = await liveShare(t).catch(() => null);
  if (!d || d.gone || !/^[A-Za-z0-9_-]{10,100}$/.test(id) || !(d.photoIds || []).includes(id)) return res.status(404).send("Not found");
  const tok = await ownerPass(d.uid).catch(() => null);
  if (!tok) return res.status(503).send("Videos are unavailable right now");
  const H = {Authorization: "Bearer " + tok}, url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  try {
    const m = await fetch(`${url}?fields=mimeType,size&supportsAllDrives=true`, {headers: H});
    const meta = m.ok ? await m.json() : {}, size = Number(meta.size);
    if (!String(meta.mimeType || "").startsWith("video/") || !(size > 0)) return res.status(404).send("Not found");
    // "bytes=a-b", "bytes=a-" or "bytes=-n" (the last n bytes); each answer is at most one piece
    const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || "").trim());
    let start = 0, end = size - 1;
    if (rg && rg[1] !== "") { start = +rg[1]; if (rg[2] !== "") end = Math.min(+rg[2], size - 1); }
    else if (rg && rg[2] !== "") { start = Math.max(0, size - +rg[2]); }
    if (start >= size || end < start) { res.set("Content-Range", `bytes */${size}`); return res.status(416).end(); }
    end = Math.min(end, start + VID_PIECE - 1);
    const r = await fetch(`${url}?alt=media&supportsAllDrives=true`, {headers: {...H, Range: `bytes=${start}-${end}`}});
    // Drive answers a range with 206; a whole-file 200 is only right when the whole file was asked for
    if (!r.ok || !r.body || (r.status !== 206 && !(start === 0 && end === size - 1))) return res.status(502).send("Couldn't load the video");
    res.status(206);
    res.set({"Content-Type": meta.mimeType, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1), "Cache-Control": "private, max-age=3600"});
    Readable.fromWeb(r.body).on("error", () => res.end()).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(502).send("Couldn't load the video");
  }
});
