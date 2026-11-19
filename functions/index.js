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
