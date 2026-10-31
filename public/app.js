import { firebaseConfig, APP_NAME } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
  signInAnonymously, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
  onSnapshot, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "tr";
const db = getFirestore(app);

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = "ABCDEF";
const OC = ["var(--o1)", "var(--o2)", "var(--o3)", "var(--o4)", "var(--o5)", "var(--o6)"];
const TIMES = [10, 15, 20, 30, 45, 60, 90, 120];
const ls = { get(k) { try { return localStorage.getItem("sh2q:" + k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem("sh2q:" + k, v) } catch (e) { } }, del(k) { try { localStorage.removeItem("sh2q:" + k) } catch (e) { } } };
const ms = t => t && typeof t.toMillis === "function" ? t.toMillis() : (typeof t === "number" ? t : null);
const fmtDate = t => { const m = ms(t); if (!m) return ""; return new Date(m).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) };
const isMember = u => !!u && !u.isAnonymous;
const joinUrl = pin => location.origin + location.pathname + "?pin=" + pin;
let tt; function toast(m) { let el = $("#toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el) } el.textContent = m; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => el.hidden = true, 3500) }
const errText = e => {
  const c = e && e.code || "";
  const map = {
    "auth/invalid-email": "E-posta adresi geçersiz.", "auth/user-not-found": "Bu e-postayla kayıtlı hesap yok.",
    "auth/wrong-password": "Şifre hatalı.", "auth/invalid-credential": "E-posta ya da şifre hatalı.",
    "auth/email-already-in-use": "Bu e-posta zaten kayıtlı. Giriş yapmayı dene.", "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/too-many-requests": "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.", "auth/network-request-failed": "İnternet bağlantısı yok gibi görünüyor.",
    "auth/popup-closed-by-user": "Google penceresi kapatıldı.", "auth/unauthorized-domain": "Bu alan adı Firebase'de yetkili değil (Authentication → Settings → Authorized domains).",
    "permission-denied": "Bu işlem için yetkin yok.", "unavailable": "Sunucuya ulaşılamadı. Bağlantını kontrol et."
  };
  return map[c] || (e && e.message) || "Bir hata oluştu.";
};

/* ---------------- state ---------------- */
const S = {
  user: null, authReady: false, route: { name: "home" },
  quizzes: [], quizzesLoaded: false, games: [], gamesLoaded: false,
  editing: null, editErr: null, confirmDel: null, authTab: "login", authErr: "", busy: false,
  // host
  game: null, gameId: null, players: [], secret: null, hostLocal: { qi: null, t0: 0 }, revealing: false,
  // player
  pGame: null, pGameId: null, me: null, received: {}, pendingPin: null,
  // report
  report: null
};
const unsubs = { quizzes: null, games: null, host: [], player: [] };
const clear = arr => { while (arr.length) { try { arr.pop()() } catch (e) { } } };

/* ---------------- routing ---------------- */
function parseRoute() {
  const h = (location.hash || "#/").slice(1);
  const parts = h.split("/").filter(Boolean);
  const [a, b] = parts;
  if (!a) return { name: "home" };
  if (a === "library") return { name: "library" };
  if (a === "edit") return { name: "edit", id: b || "new" };
  if (a === "host" && b) return { name: "host", id: b };
  if (a === "reports") return { name: "reports" };
  if (a === "report" && b) return { name: "report", id: b };
  if (a === "play") return { name: "play" };
  return { name: "home" };
}
function go(h) { if (location.hash === h) onRoute(); else location.hash = h; }
window.addEventListener("hashchange", onRoute);

async function onRoute() {
  S.route = parseRoute();
  S.confirmDel = null;
  const r = S.route;
  if (!S.authReady) return;
  if (["library", "edit", "host", "reports", "report"].includes(r.name) && !isMember(S.user)) { S.route = { name: "home" }; history.replaceState(null, "", "#/"); }
  if (S.route.name !== "host") { clear(unsubs.host); S.game = null; S.gameId = null; S.secret = null; }
  if (S.route.name !== "play") { clear(unsubs.player); }
  if (isMember(S.user)) subscribeOwner();
  if (S.route.name === "home" && isMember(S.user)) { history.replaceState(null, "", "#/library"); S.route = { name: "library" }; }
  if (S.route.name === "edit") openEditor(S.route.id);
  if (S.route.name === "host") openHost(S.route.id);
  if (S.route.name === "report") openReport(S.route.id);
  if (S.route.name === "play") openPlay();
  render();
  window.scrollTo(0, 0);
}

/* ---------------- auth ---------------- */
const params = new URLSearchParams(location.search);
if (params.get("pin")) {
  S.pendingPin = params.get("pin").replace(/\D/g, "").slice(0, 6);
  history.replaceState(null, "", location.pathname + "#/play");
}
getRedirectResult(auth).catch(e => { S.authErr = errText(e); render(); });
onAuthStateChanged(auth, async u => {
  S.user = u; S.authReady = true;
  if (!u) { clear(unsubs.host); clear(unsubs.player); if (unsubs.quizzes) unsubs.quizzes(); if (unsubs.games) unsubs.games(); unsubs.quizzes = unsubs.games = null; S.quizzes = []; S.games = []; S.quizzesLoaded = S.gamesLoaded = false; }
  if (isMember(u)) {
    setDoc(doc(db, "users", u.uid), { name: u.displayName || "", email: u.email || "", lastSeen: serverTimestamp() }, { merge: true }).catch(() => { });
  }
  onRoute();
});
async function googleLogin() {
  S.authErr = ""; const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") { await signInWithRedirect(auth, p); return; }
    S.authErr = errText(e); render();
  }
}
async function emailAuth(form) {
  const email = form.email.value.trim(), pass = form.password.value, name = form.dname ? form.dname.value.trim() : "";
  S.authErr = ""; S.busy = true; render();
  try {
    if (S.authTab === "signup") {
      if (!name) throw { message: "Adını yaz." };
      const c = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(c.user, { displayName: name });
      await setDoc(doc(db, "users", c.user.uid), { name, email, createdAt: serverTimestamp() }, { merge: true });
    } else await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) { S.authErr = errText(e); }
  S.busy = false; render();
}
async function resetPass() {
  const email = ($("#email") && $("#email").value.trim()) || "";
  if (!email) { S.authErr = "Şifre sıfırlama bağlantısı için önce e-postanı yaz."; render(); return; }
  try { await sendPasswordResetEmail(auth, email); toast("Şifre sıfırlama bağlantısı gönderildi."); } catch (e) { S.authErr = errText(e); render(); }
}

/* ---------------- owner data ---------------- */
function subscribeOwner() {
  const uid = S.user.uid;
  if (!unsubs.quizzes) {
    unsubs.quizzes = onSnapshot(query(collection(db, "quizzes"), where("ownerId", "==", uid)), s => {
      S.quizzes = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (ms(b.updatedAt) || 0) - (ms(a.updatedAt) || 0));
      S.quizzesLoaded = true; if (["library"].includes(S.route.name)) render(); else renderNav();
    }, e => { S.quizzesLoaded = true; toast(errText(e)); render(); });
  }
  if (!unsubs.games) {
    unsubs.games = onSnapshot(query(collection(db, "games"), where("hostId", "==", uid)), s => {
      S.games = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (ms(b.createdAt) || Date.now()) - (ms(a.createdAt) || Date.now()));
      S.gamesLoaded = true; if (["reports", "library"].includes(S.route.name)) render(); else renderNav();
    }, e => { S.gamesLoaded = true; render(); });
  }
}

/* ---------------- quiz validation & scoring ---------------- */
function qErrors(q) {
  const e = []; if (!q.q || !q.q.trim()) e.push("Soru metni boş");
  if (q.opts.filter(o => o && o.trim()).length < 2) e.push("En az 2 seçenek gerekli");
  if (!(q.correct >= 0) || !q.opts[q.correct] || !q.opts[q.correct].trim()) e.push("Doğru cevabı işaretle");
  return e;
}
function cleanQ(q) {
  const opts = [], map = {}; q.opts.forEach((o, i) => { if (o && o.trim()) { map[i] = opts.length; opts.push(o.trim()) } });
  return { q: q.q.trim(), opts, correct: map[q.correct] ?? -1, time: TIMES.includes(+q.time) ? +q.time : 20, exp: (q.exp || "").trim() };
}
const validQuiz = qz => qz && qz.questions && qz.questions.length > 0 && qz.questions.every(q => qErrors(q).length === 0);
const points = (ok, msTaken, T) => ok ? Math.round(500 + 500 * Math.max(0, 1 - msTaken / T)) : 0;

// Deterministic results from stored data: used live by the host and later by reports.
function computeResults(questions, game, players, upto) {
  const starts = game.starts || {};
  const rows = players.map(p => {
    const res = {}; let score = 0, correct = 0;
    for (let i = 0; i <= upto; i++) {
      const q = questions[i]; const a = p.a && p.a[i]; const st = ms(starts[i]);
      if (!q) continue;
      if (a && Number.isInteger(a.c)) {
        const T = (q.time || 20) * 1000;
        const taken = st && ms(a.at) ? Math.min(T, Math.max(0, ms(a.at) - st)) : T;
        const ok = a.c === q.correct; const pts = points(ok, taken, T);
        res[i] = { c: a.c, ok, pts, ms: taken }; score += pts; if (ok) correct++;
      } else res[i] = { c: null, ok: false, pts: 0, ms: null };
    }
    return { id: p.id, nick: p.nick, res, score, correct };
  });
  rows.sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick, "tr"));
  return rows;
}

/* ---------------- editor ---------------- */
const blankQ = () => ({ q: "", opts: ["", "", "", ""], correct: -1, time: 20, exp: "" });
async function openEditor(id) {
  S.editErr = null;
  if (id === "new") { S.editing = { _new: true, title: "", questions: [blankQ()] }; return; }
  const cached = S.quizzes.find(q => q.id === id);
  if (cached) { S.editing = structuredClone({ ...cached, updatedAt: null, createdAt: null }); return; }
  S.editing = null;
  try { const d = await getDoc(doc(db, "quizzes", id)); if (d.exists()) { const x = d.data(); S.editing = { id, title: x.title, questions: x.questions.map(q => ({ ...q, opts: q.opts.slice() })) }; } else toast("Test bulunamadı."); }
  catch (e) { toast(errText(e)); }
  render();
}
async function saveQuiz() {
  const e = S.editing; const errs = {};
  e.questions.forEach((q, i) => { const er = qErrors(cleanQ(q)); if (er.length) errs[i] = er; });
  if (!e.title.trim()) { toast("Teste bir ad ver."); $("#qtitle")?.focus(); return; }
  if (!e.questions.length) { toast("En az bir soru ekle."); return; }
  if (Object.keys(errs).length) { S.editErr = errs; render(); document.querySelector(".qed.err")?.scrollIntoView({ block: "center" }); toast("İşaretli sorularda eksik var."); return; }
  const data = { ownerId: S.user.uid, title: e.title.trim(), questions: e.questions.map(cleanQ), qCount: e.questions.length, updatedAt: serverTimestamp() };
  S.busy = true; render();
  try {
    if (e.id) await updateDoc(doc(db, "quizzes", e.id), data);
    else { const ref = doc(collection(db, "quizzes")); await setDoc(ref, { ...data, createdAt: serverTimestamp() }); }
    toast("Kaydedildi"); S.editing = null; S.busy = false; go("#/library");
  } catch (err) { S.busy = false; render(); toast(errText(err)); }
}

/* bulk text import */
function parseBulk(txt) {
  const out = []; let cur = null;
  const push = () => { if (cur && cur.q.trim()) out.push(cur); cur = null };
  const mark = /\s*(\*|\(doğru\)|\(dogru\)|✓|✔)\s*$/i;
  for (const raw of txt.replace(/\r/g, "").split("\n")) {
    const line = raw.trim(); if (!line) continue; let m;
    if ((m = line.match(/^(?:soru\s*)?(\d+)\s*[\.\)\-:]\s*(.+)$/i))) { push(); cur = { q: m[2], opts: [], correct: -1, time: 20, exp: "" }; continue; }
    if (cur && (m = line.match(/^([A-Fa-f])\s*[\)\.\-:]\s*(.+)$/))) { let t = m[2].trim(); if (mark.test(t)) { cur.correct = cur.opts.length; t = t.replace(mark, ""); } cur.opts.push(t); continue; }
    if (cur && (m = line.match(/^(?:doğru\s*cevap|dogru\s*cevap|cevap|yanıt|answer)\s*[:\-]\s*([A-Fa-f])\b/i))) { cur.correct = L.indexOf(m[1].toUpperCase()); continue; }
    if (cur && (m = line.match(/^(?:açıklama|aciklama|explanation)\s*[:\-]\s*(.+)$/i))) { cur.exp = m[1]; continue; }
    if (cur && (m = line.match(/^(?:süre|sure)\s*[:\-]\s*(\d+)/i))) { const t = +m[1]; cur.time = TIMES.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a); continue; }
    if (cur && !cur.opts.length) { cur.q += " " + line; continue; }
    if (cur && cur.exp) { cur.exp += " " + line; continue; }
    push(); cur = { q: line, opts: [], correct: -1, time: 20, exp: "" };
  }
  push();
  return out.map(q => { while (q.opts.length < 2) q.opts.push(""); return { ...q, opts: q.opts.slice(0, 6) } });
}
const BULK_EX = `1. Metformin kullanımında en sık görülen yan etki hangisidir?
A) Hipoglisemi
B) Gastrointestinal yakınmalar *
C) Kilo alımı
D) Ödem
Açıklama: Bulantı ve ishal en sık; dozu yavaş artırmak toleransı kolaylaştırır.

2. Kronik hiponatremide 24 saatte önerilen en fazla düzeltme?
A) 4–6 mmol/L
B) 8–10 mmol/L
C) 15 mmol/L
D) 20 mmol/L
Cevap: B
Süre: 30`;

/* ---------------- hosting a game ---------------- */
async function startGame(quiz) {
  if (!validQuiz(quiz)) { toast("Bu testte eksik sorular var. Önce düzenleyip kaydet."); return; }
  S.busy = true; render();
  try {
    let pin = null;
    for (let i = 0; i < 8 && !pin; i++) {
      const p = String(100000 + Math.floor(Math.random() * 900000));
      const d = await getDoc(doc(db, "pins", p));
      if (!d.exists() || d.data().active === false) pin = p;
    }
    if (!pin) throw { message: "Boş PIN bulunamadı, tekrar dene." };
    const gref = doc(collection(db, "games"));
    const b = writeBatch(db);
    b.set(gref, { hostId: S.user.uid, hostName: S.user.displayName || "", pin, title: quiz.title, quizId: quiz.id, total: quiz.questions.length, phase: "lobby", qi: -1, createdAt: serverTimestamp(), playerCount: 0, starts: {} });
    b.set(doc(db, "games", gref.id, "secret", "quiz"), { title: quiz.title, questions: quiz.questions });
    b.set(doc(db, "pins", pin), { gameId: gref.id, hostId: S.user.uid, active: true, createdAt: serverTimestamp() });
    await b.commit();
    S.busy = false; go("#/host/" + gref.id);
  } catch (e) { S.busy = false; render(); toast(errText(e)); }
}
function openHost(gid) {
  if (S.gameId === gid && unsubs.host.length) return;
  clear(unsubs.host); S.gameId = gid; S.game = null; S.players = []; S.secret = null; S.revealing = false;
  getDoc(doc(db, "games", gid, "secret", "quiz")).then(d => { S.secret = d.exists() ? d.data() : null; render(); }).catch(e => toast(errText(e)));
  unsubs.host.push(onSnapshot(doc(db, "games", gid), s => {
    const prev = S.game; S.game = s.exists() ? { ...s.data(), id: s.id } : null;
    const g = S.game;
    if (g && g.phase === "question" && S.hostLocal.qi !== g.qi) { S.hostLocal = { qi: g.qi, t0: ms(g.startedAt) || Date.now() }; }
    if (g && g.phase === "question" && ms(g.startedAt) && S.hostLocal.qi === g.qi && !S.hostLocal.fixed) { S.hostLocal.t0 = Math.min(S.hostLocal.t0, ms(g.startedAt)); S.hostLocal.fixed = true; }
    if (!prev || !g || prev.phase !== g.phase || prev.qi !== g.qi) render(); else liteHost();
  }, e => toast(errText(e))));
  unsubs.host.push(onSnapshot(collection(db, "games", gid, "players"), s => {
    S.players = s.docs.map(d => ({ ...d.data(), id: d.id }));
    liteHost();
  }, e => { }));
}
const G = () => doc(db, "games", S.gameId);
async function hostNext() {
  const g = S.game, qs = S.secret && S.secret.questions; if (!g || !qs) return;
  const qi = g.qi + 1;
  if (qi >= qs.length) return hostEnd();
  const q = qs[qi]; S.revealing = false;
  S.hostLocal = { qi, t0: Date.now() };
  try { await updateDoc(G(), { phase: "question", qi, question: { q: q.q, opts: q.opts, time: q.time || 20 }, startedAt: serverTimestamp(), reveal: null, playerCount: S.players.length }); }
  catch (e) { toast(errText(e)); }
}
async function hostReveal() {
  const g = S.game, qs = S.secret && S.secret.questions;
  if (!g || !qs || g.phase !== "question" || S.revealing) return;
  S.revealing = true;
  const qi = g.qi, q = qs[qi];
  const starts = { ...(g.starts || {}), [qi]: g.startedAt };
  try {
    // close answering first, so the results are computed from the final set
    await updateDoc(G(), { phase: "reveal", ["starts." + qi]: g.startedAt || serverTimestamp() });
    const snap = await getDocs(collection(db, "games", S.gameId, "players"));
    const players = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    const rows = computeResults(qs, { starts }, players, qi);
    const counts = q.opts.map(() => 0);
    for (const p of players) { const a = p.a && p.a[qi]; if (a && Number.isInteger(a.c) && counts[a.c] != null) counts[a.c]++; }
    const last = {}; rows.forEach((r, i) => { const x = r.res[qi]; last[r.id] = [x.ok ? 1 : 0, x.pts, r.score, i + 1]; });
    await updateDoc(G(), { reveal: { correct: q.correct, exp: q.exp || "", counts }, board: rows.slice(0, 10).map(r => ({ k: r.id, n: r.nick, s: r.score })), last, playerCount: players.length });
  } catch (e) { S.revealing = false; toast(errText(e)); }
}
async function hostBoard() { try { await updateDoc(G(), { phase: "board" }); } catch (e) { toast(errText(e)); } }
async function hostEnd() {
  const g = S.game; if (!g) return;
  try {
    const b = writeBatch(db);
    b.update(G(), { phase: "ended", endedAt: serverTimestamp() });
    b.set(doc(db, "pins", g.pin), { active: false }, { merge: true });
    await b.commit();
  } catch (e) { toast(errText(e)); }
}
async function hostCancel() {
  const g = S.game; if (!g) return;
  if (g.phase !== "lobby") return hostEnd();
  try { const b = writeBatch(db); b.update(G(), { phase: "ended", cancelled: true, endedAt: serverTimestamp() }); b.set(doc(db, "pins", g.pin), { active: false }, { merge: true }); await b.commit(); }
  catch (e) { toast(errText(e)); }
}
async function kick(pid) { try { await deleteDoc(doc(db, "games", S.gameId, "players", pid)); } catch (e) { toast(errText(e)); } }

/* ---------------- playing ---------------- */
async function ensureAnon() {
  if (auth.currentUser) return auth.currentUser;
  const c = await signInAnonymously(auth); return c.user;
}
function openPlay() {
  const gid = S.pGameId || ls.get("game");
  if (gid && !S.pendingPin && !unsubs.player.length && auth.currentUser) attachPlayer(gid);
}
async function joinByPin(pin) {
  pin = String(pin || "").replace(/\D/g, "");
  if (pin.length !== 6) { toast("PIN 6 haneli olmalı."); return; }
  S.busy = true; render();
  try {
    await ensureAnon();
    const d = await getDoc(doc(db, "pins", pin));
    if (!d.exists() || d.data().active === false) throw { message: "Bu PIN ile aktif oyun yok. Ekrandaki kodu kontrol et." };
    const gid = d.data().gameId;
    S.pendingPin = null; S.busy = false;
    attachPlayer(gid);
    go("#/play");
  } catch (e) { S.busy = false; render(); toast(errText(e)); }
}
function attachPlayer(gid) {
  clear(unsubs.player);
  S.pGameId = gid; ls.set("game", gid); S.pGame = null; S.me = undefined;
  const uid = auth.currentUser.uid;
  unsubs.player.push(onSnapshot(doc(db, "games", gid), s => {
    if (!s.exists()) { S.pGame = null; ls.del("game"); render(); return; }
    const prev = S.pGame; S.pGame = { ...s.data(), id: s.id };
    const g = S.pGame;
    if (g.phase === "question" && S.received[gid + ":" + g.qi] == null) S.received[gid + ":" + g.qi] = Date.now();
    if (!prev || prev.phase !== g.phase || prev.qi !== g.qi || g.phase !== "question") render();
  }, e => { ls.del("game"); S.pGameId = null; render(); }));
  unsubs.player.push(onSnapshot(doc(db, "games", gid, "players", uid), s => {
    const wasIn = S.me; S.me = s.exists() ? s.data() : null;
    if (wasIn && !S.me) toast("Oyundan çıkarıldın.");
    render();
  }, e => { S.me = null; render(); }));
}
async function joinWithNick(nick) {
  nick = nick.trim().slice(0, 30); if (!nick) return;
  ls.set("nick", nick);
  try { await setDoc(doc(db, "games", S.pGameId, "players", auth.currentUser.uid), { nick, joinedAt: serverTimestamp(), a: {} }); }
  catch (e) { toast(e.code === "permission-denied" ? "Oyun kapanmış ya da katılıma kapalı." : errText(e)); }
}
async function answer(j) {
  const g = S.pGame; if (!g || g.phase !== "question" || !S.me) return;
  const k = String(g.qi); if (S.me.a && S.me.a[k]) return;
  if (pRemaining() <= 0) return;
  S.me = { ...S.me, a: { ...(S.me.a || {}), [k]: { c: j, local: true } } }; render();
  try { await updateDoc(doc(db, "games", S.pGameId, "players", auth.currentUser.uid), { ["a." + k]: { c: j, at: serverTimestamp() } }); }
  catch (e) { const a = { ...S.me.a }; delete a[k]; S.me = { ...S.me, a }; render(); toast(e.code === "permission-denied" ? "Süre doldu, cevap alınamadı." : errText(e)); }
}
function leaveGame() { clear(unsubs.player); S.pGameId = null; S.pGame = null; S.me = undefined; ls.del("game"); go("#/play"); }

/* ---------------- timers ---------------- */
function hRemaining() { const g = S.game; if (!g || g.phase !== "question") return 0; return Math.max(0, (g.question.time || 20) * 1000 - (Date.now() - S.hostLocal.t0)); }
function pRemaining() { const g = S.pGame; if (!g || g.phase !== "question") return 0; const t0 = S.received[g.id + ":" + g.qi] || Date.now(); return Math.max(0, (g.question.time || 20) * 1000 - (Date.now() - t0)); }
let pExpired = false, lastTick = 0;
function loop() {
  const r = S.route.name;
  if (r === "host" && S.game && S.game.phase === "question") {
    const rem = hRemaining(), T = (S.game.question.time || 20) * 1000;
    paintTimer(rem, T);
    if (Date.now() - lastTick > 400) {
      lastTick = Date.now();
      const n = S.players.length, done = S.players.filter(p => p.a && p.a[S.game.qi]).length;
      if (rem <= 0 || (n > 0 && done >= n && Date.now() - S.hostLocal.t0 > 1500)) hostReveal();
    }
  } else if (r === "play" && S.pGame && S.pGame.phase === "question") {
    const rem = pRemaining(); paintTimer(rem, (S.pGame.question.time || 20) * 1000);
    if (rem <= 0 && !pExpired) { pExpired = true; render(); }
  } else pExpired = false;
  requestAnimationFrame(loop);
}
function paintTimer(rem, T) { const b = $("#tbar"), n = $("#tnum"); if (b) b.style.width = (rem / T * 100) + "%"; if (n) n.textContent = Math.ceil(rem / 1000); }

/* ---------------- reports ---------------- */
async function openReport(gid) {
  S.report = { loading: true, id: gid };
  try {
    const [g, sq, ps] = await Promise.all([getDoc(doc(db, "games", gid)), getDoc(doc(db, "games", gid, "secret", "quiz")), getDocs(collection(db, "games", gid, "players"))]);
    if (!g.exists()) { S.report = { error: "Rapor bulunamadı." }; render(); return; }
    const game = g.data(), quiz = sq.exists() ? sq.data() : { questions: [] };
    const players = ps.docs.map(d => ({ ...d.data(), id: d.id }));
    const played = Math.max(0, Math.min(quiz.questions.length, Object.keys(game.starts || {}).length));
    const rows = computeResults(quiz.questions, game, players, played - 1);
    S.report = { id: gid, game, quiz, rows, played };
  } catch (e) { S.report = { error: errText(e) }; }
  render();
}
function csvExport() {
  const R = S.report; if (!R || !R.rows) return;
  const qs = R.quiz.questions.slice(0, R.played);
  const head = ["Sıra", "Takma ad", "Doğru", "Puan", ...qs.map((q, i) => "S" + (i + 1))];
  const lines = [head, ...R.rows.map((r, i) => [i + 1, r.nick, r.correct, r.score, ...qs.map((q, j) => { const x = r.res[j]; return !x || x.c == null ? "" : (L[x.c] + (x.ok ? " ✓" : "")) })])];
  lines.push([]); lines.push(["Soru", "Doğru cevap", "Doğru oranı %"]);
  qs.forEach((q, i) => { const ok = R.rows.filter(r => r.res[i] && r.res[i].ok).length; lines.push(["S" + (i + 1) + " " + q.q, L[q.correct] + ") " + q.opts[q.correct], R.rows.length ? Math.round(ok / R.rows.length * 100) : 0]); });
  const csv = "﻿" + lines.map(l => l.map(v => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = (R.game.title || "rapor").replace(/[^\wğüşıöçĞÜŞİÖÇ -]/g, "") + " - " + new Date(ms(R.game.createdAt) || Date.now()).toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
}
async function deleteGame(gid) {
  try {
    const ps = await getDocs(collection(db, "games", gid, "players"));
    const b = writeBatch(db); ps.docs.slice(0, 450).forEach(d => b.delete(d.ref));
    b.delete(doc(db, "games", gid, "secret", "quiz")); b.delete(doc(db, "games", gid));
    await b.commit(); toast("Rapor silindi"); go("#/reports");
  } catch (e) { toast(errText(e)); }
}

/* ================= RENDER ================= */
const I = {
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  rep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="4"/><path d="M8 10v4M6 12h4"/><circle cx="16" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 14v6"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 6l-6 6 6 6"/></svg>',
  g: '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'
};
const activeGames = () => S.games.filter(g => g.phase !== "ended");

function shell(content) {
  const r = S.route.name, u = S.user;
  const nav = [["library", "Kütüphane", I.lib, "#/library", S.quizzes.length], ["reports", "Raporlar", I.rep, "#/reports", S.games.filter(g => g.phase === "ended" && !g.cancelled).length]];
  const act = activeGames();
  const initial = (u.displayName || u.email || "?").trim()[0].toUpperCase();
  return `<div class="app"><aside class="rail">
    <a class="brand" href="#/library" style="color:inherit;text-decoration:none"><div class="mark">SH2</div><div><b>${esc(APP_NAME)}</b><small>Canlı test stüdyosu</small></div></a>
    <nav class="nav" id="nav">${navItems(nav, r, act)}</nav>
    <div class="railfoot"><div class="userbox"><div class="avatar">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(initial)}</div><span title="${esc(u.email || "")}">${esc(u.displayName || u.email || "")}</span></div>
    <button class="btn ghost" data-act="logout" style="padding:4px 0;justify-content:flex-start">Çıkış yap</button></div>
  </aside><main><div class="wrap">${content}</div></main></div>`;
}
function navItems(nav, r, act) {
  return nav.map(([v, l, ic, h, n]) => `<button data-go="${h}" aria-current="${r === v || (v === "library" && r === "edit") || (v === "reports" && r === "report")}">${ic}<span>${l}</span><span class="count">${n}</span></button>`).join("")
    + act.map(g => `<button data-go="#/host/${g.id}" aria-current="${r === "host" && S.gameId === g.id}">${I.live}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px">${esc(g.title)}</span><span class="livepill" style="margin-left:auto">canlı</span></button>`).join("")
    + `<button data-go="#/play">${I.play}<span>PIN ile katıl</span></button>`;
}
function renderNav() { const n = $("#nav"); if (n && isMember(S.user)) { const r = S.route.name; const nav = [["library", "Kütüphane", I.lib, "#/library", S.quizzes.length], ["reports", "Raporlar", I.rep, "#/reports", S.games.filter(g => g.phase === "ended" && !g.cancelled).length]]; n.innerHTML = navItems(nav, r, activeGames()); } }

function render() {
  const root = $("#root");
  if (!S.authReady) return;
  const r = S.route.name;
  if (r === "play") { root.innerHTML = playView(); return; }
  if (!isMember(S.user)) { root.innerHTML = authView(); return; }
  let c = "";
  if (r === "edit") c = S.editing ? editorView() : `<p class="note">Yükleniyor…</p>`;
  else if (r === "host") c = hostView();
  else if (r === "reports") c = reportsView();
  else if (r === "report") c = reportView();
  else c = libraryView();
  root.innerHTML = shell(c);
  if (r === "host") drawQR();
}

/* auth / landing */
function authView() {
  const t = S.authTab;
  return `<div class="center"><div class="authgrid">
   <section class="hero" style="display:flex;flex-direction:column;gap:18px">
     <div class="brand" style="padding:0"><div class="mark">SH2</div><div><b>${esc(APP_NAME)}</b><small>Canlı test stüdyosu</small></div></div>
     <h1>Dersten sonra sınavı başlat, sonuçları anında gör.</h1>
     <p>Soruları kütüphanene ekle, QR kodu ekrana yansıt. Katılımcılar telefonlarından bağlanır; her soru, her cevap ve her puan kayıt altında kalır.</p>
     <div class="tiles" aria-hidden="true">${["Kütüphane", "QR ile katılım", "Canlı sıralama", "Raporlar"].map((x, i) => `<div class="tile" style="background:${OC[i]}"><span class="key">${L[i]}</span><span>${x}</span></div>`).join("")}</div>
   </section>
   <section style="display:flex;flex-direction:column;gap:16px">
     <form class="authcard" data-form="pin"><h2 style="font-size:20px">Bir oyuna katıl</h2>
       <div class="pinbox"><input type="tel" inputmode="numeric" id="pinIn" maxlength="6" placeholder="PIN" aria-label="Oyun PIN'i" autocomplete="off"><button class="btn primary" type="submit">Katıl</button></div></form>
     <form class="authcard" data-form="auth">
       <h2 style="font-size:20px">Test hazırlamak için giriş yap</h2>
       <button class="btn gbtn" type="button" data-act="google">${I.g} Google ile devam et</button>
       <div class="or">ya da e-posta</div>
       <div class="tabs" role="tablist"><button type="button" role="tab" aria-selected="${t === "login"}" data-act="tab" data-t="login">Giriş</button><button type="button" role="tab" aria-selected="${t === "signup"}" data-act="tab" data-t="signup">Yeni hesap</button></div>
       ${t === "signup" ? `<label class="field"><span>Ad Soyad</span><input type="text" id="dname" name="dname" autocomplete="name" required></label>` : ""}
       <label class="field"><span>E-posta</span><input type="email" id="email" name="email" autocomplete="email" required></label>
       <label class="field"><span>Şifre</span><input type="password" id="password" name="password" autocomplete="${t === "signup" ? "new-password" : "current-password"}" minlength="6" required></label>
       ${S.authErr ? `<div class="errmsg">${esc(S.authErr)}</div>` : ""}
       <button class="btn primary" type="submit" ${S.busy ? "disabled" : ""}>${t === "signup" ? "Hesap oluştur" : "Giriş yap"}</button>
       ${t === "login" ? `<button class="btn ghost" type="button" data-act="reset" style="align-self:flex-start;padding-left:0">Şifremi unuttum</button>` : ""}
     </form>
   </section></div></div>`;
}

/* library */
function libraryView() {
  const act = activeGames();
  const banner = act.map(g => `<div class="banner"><div><span class="livepill">Canlı</span> <b>${esc(g.title)}</b> · PIN <b style="font-family:var(--f-mono)">${esc(g.pin)}</b></div><button class="btn primary" data-go="#/host/${g.id}">Konsola git</button></div>`).join("");
  const cards = S.quizzes.map(q => {
    const n = (q.questions || []).length, ok = validQuiz(q);
    const del = S.confirmDel === q.id
      ? `<span class="note">Silinsin mi?</span><button class="btn danger" data-act="del-yes" data-id="${q.id}">Sil</button><button class="btn ghost" data-act="del-no">Vazgeç</button>`
      : `<button class="btn primary" data-act="start" data-id="${q.id}" ${ok && !S.busy ? "" : "disabled"}>Canlı başlat</button><button class="btn" data-go="#/edit/${q.id}">Düzenle</button><button class="btn ghost" data-act="del" data-id="${q.id}">Sil</button>`;
    const plays = S.games.filter(g => g.quizId === q.id && g.phase === "ended" && !g.cancelled).length;
    return `<article class="card"><div class="swatch">${(q.questions || []).slice(0, 12).map((x, i) => `<i style="background:${OC[i % 4]}"></i>`).join("")}</div>
      <div>${ok ? "" : '<span class="tag" style="color:var(--bad)">Eksik</span>'}<h3>${esc(q.title || "Adsız test")}</h3></div>
      <div class="meta"><span>${n} soru</span><span>~${Math.max(1, Math.ceil((q.questions || []).reduce((s, x) => s + (+x.time || 20) + 6, 0) / 60))} dk</span><span>${plays} kez oynandı</span><span>${fmtDate(q.updatedAt)}</span></div>
      <div class="row">${del}</div></article>`;
  }).join("");
  return `<div class="head"><div><h1>Kütüphane</h1><p class="sub">Testlerin sadece sana görünür. Canlı başlatınca katılımcılar PIN ya da QR ile bağlanır.</p></div>
    <button class="btn primary" data-go="#/edit/new">+ Yeni test</button></div>
    ${banner}
    ${!S.quizzesLoaded ? '<p class="note">Testler yükleniyor…</p>' : S.quizzes.length ? `<div class="grid">${cards}</div>` :
      `<div class="empty"><h3>İlk testini oluşturalım</h3><p class="note">Soruları tek tek yazabilir ya da hocanın sorularını metin olarak yapıştırabilirsin.</p><button class="btn primary" data-go="#/edit/new">+ Yeni test</button></div>`}`;
}

/* editor */
function editorView() {
  const e = S.editing, errs = S.editErr || {};
  const qs = e.questions.map((q, i) => {
    const er = errs[i];
    return `<section class="qed${er ? " err" : ""}">
     <div class="qhead"><span class="qnum">SORU ${i + 1}</span><div class="row">
       <button class="btn ghost" data-act="q-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Yukarı taşı">↑</button>
       <button class="btn ghost" data-act="q-down" data-i="${i}" ${i === e.questions.length - 1 ? "disabled" : ""} aria-label="Aşağı taşı">↓</button>
       <button class="btn ghost" data-act="q-dup" data-i="${i}">Kopyala</button>
       <button class="btn ghost danger" data-act="q-del" data-i="${i}">Sil</button></div></div>
     <textarea id="q${i}" data-f="q" data-i="${i}" placeholder="Soru metni" rows="2">${esc(q.q)}</textarea>
     <div class="opts">${q.opts.map((o, j) => `<div class="opt${q.correct === j ? " correct" : ""}"><span class="dot" style="background:${OC[j]}"></span>
        <input type="text" id="q${i}o${j}" data-f="opt" data-i="${i}" data-j="${j}" value="${esc(o)}" placeholder="Seçenek ${L[j]}">
        <label><input type="radio" name="c${i}" data-f="correct" data-i="${i}" data-j="${j}" ${q.correct === j ? "checked" : ""}>Doğru</label></div>`).join("")}</div>
     <div class="row">${q.opts.length < 6 ? `<button class="btn ghost" data-act="opt-add" data-i="${i}">+ Seçenek</button>` : ""}${q.opts.length > 2 ? `<button class="btn ghost" data-act="opt-del" data-i="${i}">− Son seçeneği kaldır</button>` : ""}</div>
     <div class="qfoot"><label class="field"><span>Süre</span><select id="q${i}t" data-f="time" data-i="${i}">${TIMES.map(t => `<option value="${t}" ${+q.time === t ? "selected" : ""}>${t} sn</option>`).join("")}</select></label>
     <label class="field"><span>Açıklama (cevaptan sonra gösterilir)</span><input type="text" id="q${i}e" data-f="exp" data-i="${i}" value="${esc(q.exp)}" placeholder="Neden doğru? Kısa bir not"></label></div>
     ${er ? `<div class="errmsg">${er.map(esc).join(" · ")}</div>` : ""}</section>`;
  }).join("");
  return `<div class="head"><div><button class="btn ghost" data-go="#/library" style="padding-left:0">${I.back} Kütüphane</button>
    <h1>${e._new ? "Yeni test" : "Testi düzenle"}</h1></div>
    <div class="row"><button class="btn" data-act="bulk">Metinden toplu ekle</button></div></div>
    <label class="field"><span>Test adı</span><input type="text" id="qtitle" data-f="title" value="${esc(e.title)}" placeholder="Örn. Nefroloji – Asit-baz"></label>
    ${qs || '<div class="empty"><p class="note">Henüz soru yok.</p></div>'}
    <div><button class="btn" data-act="q-add">+ Soru ekle</button></div>
    <div class="sticky"><span class="note" style="margin-right:auto;align-self:center">${e.questions.length} soru</span><button class="btn ghost" data-go="#/library">Vazgeç</button><button class="btn primary" data-act="save" ${S.busy ? "disabled" : ""}>Kaydet</button></div>`;
}
function openBulk() {
  $("#dlgBody").innerHTML = `<h2 style="font-size:22px">Metinden toplu ekle</h2>
   <p class="note" style="margin:0">Numaralı soru, harfli seçenekler. Doğru seçeneğin sonuna <b>*</b> koy ya da altına <b>Cevap: B</b> yaz. <b>Açıklama:</b> ve <b>Süre: 30</b> satırları isteğe bağlı. Word ya da PDF'ten kopyalayıp yapıştırabilirsin.</p>
   <textarea id="bulkTxt" placeholder="${esc(BULK_EX)}"></textarea>
   <div class="row"><span class="note" id="bulkInfo" style="margin-right:auto"></span><button class="btn ghost" data-act="bulk-ex">Örneği yükle</button><button class="btn ghost" data-act="dlg-close">Vazgeç</button><button class="btn primary" data-act="bulk-add">Ekle</button></div>`;
  $("#dlg").showModal();
}

/* host */
function tilesHTML(q, { counts, correct, clickable, picked, answered } = {}) {
  const tot = counts ? counts.reduce((a, b) => a + b, 0) || 1 : 1;
  return `<div class="tiles">${q.opts.map((o, j) => {
    const dim = (correct != null && j !== correct) || (picked != null && picked !== j && correct == null);
    const tag = clickable ? "button" : "div";
    return `<${tag} class="tile${dim ? " dim" : ""}${picked === j ? " picked" : ""}" style="background:${OC[j]}" ${clickable ? `data-act="answer" data-j="${j}" ${answered ? "disabled" : ""}` : ""}>
      <span class="key">${L[j]}</span><span>${esc(o)}</span>
      ${counts ? `<span class="cnt">${counts[j]}</span><span class="bar" style="width:${counts[j] / tot * 100}%"></span>` : ""}
      ${correct === j ? '<span class="ck" aria-label="Doğru">✓</span>' : ""}</${tag}>`;
  }).join("")}</div>`;
}
function boardHTML(board, meKey) {
  return `<div class="board">${(board || []).map((p, i) => `<div class="brow${i === 0 ? " p1" : ""}${p.k === meKey ? " me" : ""}"><span class="rk">${i + 1}</span><span class="nm">${esc(p.n)}</span><span class="sc">${p.s}</span></div>`).join("") || '<span class="note">Katılımcı yok.</span>'}</div>`;
}
function podiumHTML(board) {
  const b = board || [];
  return `<div class="podium">${[1, 0, 2].map(i => b[i] ? `<div class="pod g${i + 1}"><span class="medal">${i + 1}</span><b>${esc(b[i].n)}</b><span class="sc">${b[i].s} puan</span></div>` : "<div></div>").join("")}</div>`;
}
function hostView() {
  const g = S.game;
  if (!g || !S.secret) return `<div class="head"><h1>Canlı oyun</h1></div><div class="stage"><p class="note">Oyun yükleniyor…</p></div>`;
  return `<div class="head"><div><h1>${esc(g.title)}</h1><p class="sub">PIN <b style="font-family:var(--f-mono)">${esc(g.pin)}</b> · ${g.total} soru</p></div>
     ${g.phase !== "ended" ? '<button class="btn ghost danger" data-act="h-cancel">Oyunu bitir</button>' : ""}</div>
     <div class="stage" id="hostBody">${hostBody()}</div>`;
}
function hostBody() {
  const g = S.game, P = S.players;
  if (g.phase === "lobby") {
    return `<div class="joinhost"><div class="qr" id="qr" aria-label="Katılım QR kodu"></div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0"><span class="tag" style="align-self:start">Telefonla QR'ı okut ya da PIN gir</span>
      <div class="pin">${esc(g.pin.slice(0, 3) + " " + g.pin.slice(3))}</div><div class="url">${esc(location.host + location.pathname)} → PIN</div>
      <div class="row"><button class="btn" data-act="copy-link">Katılım linkini kopyala</button></div></div></div>
      <div class="stagehead"><h2 style="font-size:22px">Katılımcılar</h2><span class="big-n" style="font-size:40px">${P.length}</span></div>
      <div class="chips" id="lobbyChips">${lobbyChips(true)}</div>
      <div class="row"><button class="btn primary big" data-act="h-next" ${P.length ? "" : "disabled"}>Oyunu başlat</button>${P.length ? "" : '<span class="note">En az bir katılımcı bekleniyor.</span>'}</div>`;
  }
  if (g.phase === "question") {
    const done = P.filter(p => p.a && p.a[g.qi]).length;
    return `<div class="stagehead"><span class="tag">Soru ${g.qi + 1} / ${g.total}</span><span class="tnum" id="tnum">${Math.ceil(hRemaining() / 1000)}</span></div>
      <div class="timer"><i id="tbar"></i></div><div class="qtext">${esc(g.question.q)}</div>${tilesHTML(g.question)}
      <div class="row" style="justify-content:space-between"><span id="answered"><b class="tnum" style="font-size:18px">${done}</b> / ${P.length} cevapladı</span><button class="btn" data-act="h-reveal">Süreyi bitir</button></div>`;
  }
  if (g.phase === "reveal") {
    if (!g.reveal) return `<p class="note">Cevaplar toplanıyor…</p>`;
    const last = g.qi + 1 >= g.total;
    return `<div class="stagehead"><span class="tag">Soru ${g.qi + 1} / ${g.total} · cevap</span><span class="note">${g.reveal.counts.reduce((a, b) => a + b, 0)} / ${g.playerCount || 0} cevap</span></div>
      <div class="qtext">${esc(g.question.q)}</div>${tilesHTML(g.question, { counts: g.reveal.counts, correct: g.reveal.correct })}
      ${g.reveal.exp ? `<div class="exp"><b>Açıklama.</b> ${esc(g.reveal.exp)}</div>` : ""}
      <div class="row"><button class="btn" data-act="h-board">Sıralamayı göster</button>${last ? '<button class="btn primary" data-act="h-end">Sonuçları göster</button>' : '<button class="btn primary" data-act="h-next">Sonraki soru</button>'}</div>`;
  }
  if (g.phase === "board") {
    const last = g.qi + 1 >= g.total;
    return `<div class="stagehead"><h2 style="font-size:26px">Sıralama</h2><span class="tag">${g.qi + 1} / ${g.total} soru sonrası</span></div>${boardHTML(g.board)}
      <div class="row">${last ? '<button class="btn primary" data-act="h-end">Sonuçları göster</button>' : '<button class="btn primary" data-act="h-next">Sonraki soru</button>'}</div>`;
  }
  return `<div class="stagehead"><span class="tag">Bitti</span><span class="note">${g.playerCount || P.length} katılımcı</span></div>
    ${g.cancelled ? '<p class="note">Oyun başlamadan kapatıldı.</p>' : podiumHTML(g.board) + boardHTML(g.board)}
    <div class="row">${g.cancelled ? "" : `<button class="btn primary" data-go="#/report/${g.id}">Raporu aç</button>`}<button class="btn" data-go="#/library">Kütüphaneye dön</button></div>`;
}
function lobbyChips(host) {
  const P = host ? S.players : [];
  if (!P.length) return '<span class="note">Henüz kimse katılmadı.</span>';
  return P.slice().sort((a, b) => (ms(a.joinedAt) || 0) - (ms(b.joinedAt) || 0)).map(p => `<span class="chip">${esc(p.nick)}${host ? `<button class="kick" data-act="kick" data-id="${esc(p.id)}" aria-label="${esc(p.nick)} adlı katılımcıyı çıkar">×</button>` : ""}</span>`).join("");
}
function liteHost() {
  if (S.route.name !== "host" || !S.game) return;
  const g = S.game;
  if (g.phase === "lobby") { const el = $("#hostBody"); if (el) { el.innerHTML = hostBody(); drawQR(); } }
  else if (g.phase === "question") { const el = $("#answered"); const done = S.players.filter(p => p.a && p.a[g.qi]).length; if (el) el.innerHTML = `<b class="tnum" style="font-size:18px">${done}</b> / ${S.players.length} cevapladı`; }
  else { const el = $("#hostBody"); if (el) el.innerHTML = hostBody(); }
}
function drawQR() {
  const el = $("#qr"); if (!el || !S.game || !window.qrcode) return;
  const q = window.qrcode(0, "M"); q.addData(joinUrl(S.game.pin)); q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}

/* player */
function playView() {
  const u = auth.currentUser, g = S.pGame;
  const back = isMember(S.user) ? `<a class="btn ghost" href="#/library" style="position:absolute;top:calc(12px + env(safe-area-inset-top,0px));left:max(12px, env(safe-area-inset-left,0px))">${I.back} Kütüphane</a>` : "";
  if (!S.pGameId || !u) {
    return `${back}<div class="center"><form class="joincard" data-form="pin" style="margin:0"><div class="mark" style="width:46px;height:46px;font-size:18px">SH2</div>
      <h1>Oyuna katıl</h1><p class="note" style="margin:0">Ekrandaki 6 haneli PIN'i yaz.</p>
      <input type="tel" inputmode="numeric" id="pinIn" maxlength="6" value="${esc(S.pendingPin || "")}" placeholder="123456" aria-label="Oyun PIN'i" autocomplete="off" style="font:600 26px var(--f-mono);letter-spacing:.2em;text-align:center">
      <button class="btn primary big" type="submit" ${S.busy ? "disabled" : ""}>${S.busy ? "Bağlanıyor…" : "Devam"}</button>
      ${isMember(S.user) ? "" : '<p class="note" style="margin:0;text-align:center">Test mi hazırlayacaksın? <a href="#/" style="color:var(--accent)">Giriş yap</a></p>'}</form></div>`;
  }
  if (S.me === undefined || g === null && S.pGameId && !unsubs.player.length) return `<div class="center"><div class="spin"></div></div>`;
  if (!g) return `<div class="center"><div class="joincard"><h1>Oyun bulunamadı</h1><button class="btn primary" data-act="leave">Başka PIN gir</button></div></div>`;
  if (!S.me) {
    if (g.phase === "ended") return `<div class="center"><div class="joincard"><h1>Bu oyun bitti</h1><button class="btn primary" data-act="leave">Başka PIN gir</button></div></div>`;
    return `<div class="center"><form class="joincard" data-form="nick" style="margin:0"><span class="tag" style="align-self:start">${esc(g.title)}</span><h1>Adın ne?</h1>
      <p class="note" style="margin:0">Sıralamada ve raporda bu isim görünür.</p>
      <input type="text" id="nickIn" maxlength="30" autocomplete="name" value="${esc(ls.get("nick") || "")}" placeholder="Ad Soyad" required>
      <button class="btn primary big" type="submit">Katıl</button><button class="btn ghost" type="button" data-act="leave">Başka PIN</button></form></div>`;
  }
  const uid = u.uid, mine = g.last && g.last[uid];
  const top = `<div class="stagehead" style="padding-top:8px"><span class="tag">${esc(S.me.nick)}</span><span class="note">${esc(g.title)}</span></div>`;
  let body = "";
  if (g.phase === "lobby") body = `<div class="joincard" style="text-align:center;align-items:center;margin-top:4vh"><span class="livepill">Lobidesin</span><h1>Hazırsın, ${esc(S.me.nick)}</h1><p class="note" style="margin:0">Sunucu başlattığında ilk soru burada açılacak.</p></div>`;
  else if (g.phase === "question") {
    const a = S.me.a && S.me.a[g.qi], rem = pRemaining(), closed = !!a || rem <= 0;
    body = `<div class="stagehead"><span class="tag">Soru ${g.qi + 1} / ${g.total}</span><span class="tnum" id="tnum">${Math.ceil(rem / 1000)}</span></div>
      <div class="timer"><i id="tbar"></i></div><div class="qtext">${esc(g.question.q)}</div>
      ${tilesHTML(g.question, { clickable: true, picked: a ? a.c : null, answered: closed })}
      <p class="note" style="text-align:center;margin:0">${a ? "Cevabın alındı. Diğerleri bekleniyor…" : rem <= 0 ? "Süre doldu." : "Hızlı cevap daha çok puan getirir."}</p>`;
  } else if (g.phase === "reveal") {
    if (!g.reveal) body = `<div class="center" style="min-height:40vh"><div class="spin"></div></div>`;
    else {
      const a = S.me.a && S.me.a[g.qi]; const ok = a && a.c === g.reveal.correct;
      body = `<div class="result ${!a ? "none" : ok ? "ok" : "bad"}"><h2>${!a ? "Cevap vermedin" : ok ? "Doğru!" : "Yanlış"}</h2>
        ${mine ? `<div><b class="tnum" style="font-size:20px">+${mine[1]}</b> puan · toplam ${mine[2]} · ${mine[3]}. sıradasın</div>` : ""}</div>
        <div class="qtext" style="font-size:20px">${esc(g.question.q)}</div>${tilesHTML(g.question, { correct: g.reveal.correct, picked: a ? a.c : null })}
        ${g.reveal.exp ? `<div class="exp"><b>Açıklama.</b> ${esc(g.reveal.exp)}</div>` : ""}`;
    }
  } else if (g.phase === "board" || g.phase === "ended") {
    body = `<div class="stagehead"><h2 style="font-size:26px">${g.phase === "ended" ? "Oyun bitti" : "Sıralama"}</h2>${mine ? `<span class="tag">Sen: ${mine[3]}. · ${mine[2]} puan</span>` : ""}</div>
      ${g.phase === "ended" && !g.cancelled ? podiumHTML(g.board) : ""}${g.cancelled ? '<p class="note">Oyun sunucu tarafından kapatıldı.</p>' : boardHTML(g.board, uid)}
      ${g.phase === "ended" ? '<div class="row"><button class="btn primary" data-act="leave">Yeni oyuna katıl</button></div>' : '<p class="note">Sıradaki soru birazdan…</p>'}`;
  }
  return `<main><div class="pwrap">${top}${body}</div></main>`;
}

/* reports */
function reportsView() {
  const done = S.games.filter(g => g.phase === "ended" && !g.cancelled);
  return `<div class="head"><div><h1>Raporlar</h1><p class="sub">Biten her oyunun sonuçları burada saklanır.</p></div></div>
   ${!S.gamesLoaded ? '<p class="note">Yükleniyor…</p>' : !done.length ? '<div class="empty"><h3>Henüz rapor yok</h3><p class="note">İlk canlı oyunun bittiğinde katılımcı ve soru istatistikleri burada görünür.</p></div>' :
      `<div class="card" style="padding:0"><div class="scroll"><table><thead><tr><th>Test</th><th>Tarih</th><th>Katılımcı</th><th></th></tr></thead><tbody>
      ${done.map(g => `<tr><td><b>${esc(g.title)}</b></td><td class="n">${fmtDate(g.createdAt)}</td><td class="n">${g.playerCount || 0}</td><td style="text-align:right"><button class="btn" data-go="#/report/${g.id}">Aç</button></td></tr>`).join("")}</tbody></table></div></div>`}`;
}
function reportView() {
  const R = S.report;
  const back = `<button class="btn ghost" data-go="#/reports" style="padding-left:0">${I.back} Raporlar</button>`;
  if (!R || R.loading) return `${back}<p class="note">Rapor yükleniyor…</p>`;
  if (R.error) return `${back}<p class="errmsg">${esc(R.error)}</p>`;
  const qs = R.quiz.questions.slice(0, R.played), P = R.rows;
  const qStats = qs.map((q, i) => {
    const counts = q.opts.map(() => 0); let ok = 0, ans = 0, t = 0;
    for (const p of P) { const x = p.res[i]; if (x && x.c != null) { counts[x.c] = (counts[x.c] || 0) + 1; ans++; t += x.ms || 0; if (x.ok) ok++; } }
    return { q, counts, ok, ans, avg: ans ? t / ans / 1000 : 0, pct: P.length ? ok / P.length * 100 : 0 };
  });
  const totOk = qStats.reduce((s, x) => s + x.ok, 0), avgPct = P.length && qs.length ? totOk / (P.length * qs.length) * 100 : 0;
  const avgScore = P.length ? Math.round(P.reduce((s, p) => s + p.score, 0) / P.length) : 0;
  const hardest = qStats.length ? qStats.reduce((a, b) => b.pct < a.pct ? b : a) : null;
  return `${back}<div class="head"><div><h1>${esc(R.game.title)}</h1><p class="sub">${fmtDate(R.game.createdAt)} · ${qs.length} soru oynandı</p></div>
   <div class="row"><button class="btn" data-act="csv">Excel'e aktar (CSV)</button>${S.confirmDel === "r" ? `<span class="note">Rapor silinsin mi?</span><button class="btn danger" data-act="rdel-yes">Sil</button><button class="btn ghost" data-act="del-no">Vazgeç</button>` : `<button class="btn ghost danger" data-act="rdel">Sil</button>`}</div></div>
   <div class="stats"><div class="stat"><span>Katılımcı</span><b>${P.length}</b></div><div class="stat"><span>Ort. başarı</span><b>%${Math.round(avgPct)}</b></div><div class="stat"><span>Ort. puan</span><b>${avgScore}</b></div><div class="stat"><span>En zor soru</span><b>${hardest ? "#" + (qStats.indexOf(hardest) + 1) : "–"}</b></div></div>
   <section class="card"><h3>Sıralama</h3><div class="scroll"><table><thead><tr><th>#</th><th>Ad</th><th>Doğru</th><th>Puan</th></tr></thead><tbody>
   ${P.map((p, i) => `<tr><td class="n">${i + 1}</td><td>${esc(p.nick)}</td><td class="n">${p.correct} / ${qs.length}</td><td class="n">${p.score}</td></tr>`).join("") || '<tr><td colspan="4" class="note">Katılımcı yok</td></tr>'}</tbody></table></div></section>
   <section class="card"><h3>Soru bazlı</h3><div class="scroll"><table><thead><tr><th>#</th><th>Soru</th><th>Doğru oranı</th><th>Dağılım</th><th>Ort. süre</th></tr></thead><tbody>
   ${qStats.map((s, i) => {
    const tot = s.counts.reduce((a, b) => a + b, 0) || 1; const col = s.pct >= 70 ? "var(--ok)" : s.pct >= 40 ? "var(--warn)" : "var(--bad)";
    return `<tr><td class="n">${i + 1}</td><td style="min-width:220px">${esc(s.q.q)}<div class="note">Doğru: ${L[s.q.correct]}) ${esc(s.q.opts[s.q.correct])}</div></td>
     <td><div class="pct"><i><b style="width:${s.pct}%;background:${col}"></b></i><span class="n">%${Math.round(s.pct)}</span></div></td>
     <td><div class="mini">${s.counts.map((c, j) => `<span style="width:${c / tot * 100}%;background:${OC[j]}"></span>`).join("")}</div><div class="note">${s.counts.map((c, j) => L[j] + " " + c).join(" · ")}</div></td>
     <td class="n">${s.ans ? s.avg.toFixed(1) + " sn" : "–"}</td></tr>`;
  }).join("")}</tbody></table></div></section>
   <section class="card"><h3>Katılımcı × soru</h3><div class="scroll"><table><thead><tr><th>Ad</th>${qs.map((s, i) => `<th class="n">${i + 1}</th>`).join("")}</tr></thead><tbody>
   ${P.map(p => `<tr><td>${esc(p.nick)}</td>${qs.map((s, i) => { const x = p.res[i]; return `<td class="n">${!x || x.c == null ? '<span class="z">–</span>' : x.ok ? '<span class="y">✓</span>' : `<span class="x">${L[x.c]}</span>`}</td>` }).join("")}</tr>`).join("")}</tbody></table></div>
   <p class="note" style="margin:0">✓ doğru · harf: verilen yanlış cevap · – cevapsız</p></section>`;
}

/* ================= EVENTS ================= */
document.addEventListener("click", async ev => {
  const nav = ev.target.closest("[data-go]"); if (nav) { ev.preventDefault(); go(nav.dataset.go); return; }
  const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act, id = b.dataset.id, i = +b.dataset.i, E = S.editing;
  switch (a) {
    case "google": googleLogin(); break;
    case "tab": S.authTab = b.dataset.t; S.authErr = ""; render(); break;
    case "reset": resetPass(); break;
    case "logout": await signOut(auth); go("#/"); break;
    case "start": { const q = S.quizzes.find(x => x.id === id); if (q) startGame(q); break; }
    case "del": S.confirmDel = id; render(); break;
    case "del-no": S.confirmDel = null; render(); break;
    case "del-yes": S.confirmDel = null; deleteDoc(doc(db, "quizzes", id)).then(() => toast("Test silindi")).catch(e => toast(errText(e))); break;
    case "q-add": E.questions.push(blankQ()); render(); setTimeout(() => $("#q" + (E.questions.length - 1))?.focus(), 0); break;
    case "q-del": E.questions.splice(i, 1); S.editErr = null; render(); break;
    case "q-dup": E.questions.splice(i + 1, 0, structuredClone(E.questions[i])); S.editErr = null; render(); break;
    case "q-up": [E.questions[i - 1], E.questions[i]] = [E.questions[i], E.questions[i - 1]]; S.editErr = null; render(); break;
    case "q-down": [E.questions[i + 1], E.questions[i]] = [E.questions[i], E.questions[i + 1]]; S.editErr = null; render(); break;
    case "opt-add": E.questions[i].opts.push(""); render(); break;
    case "opt-del": { const q = E.questions[i]; q.opts.pop(); if (q.correct >= q.opts.length) q.correct = -1; render(); break; }
    case "save": saveQuiz(); break;
    case "bulk": openBulk(); break;
    case "bulk-ex": $("#bulkTxt").value = BULK_EX; $("#bulkTxt").dispatchEvent(new Event("input", { bubbles: true })); break;
    case "bulk-add": {
      const qs = parseBulk($("#bulkTxt").value); if (!qs.length) { $("#bulkInfo").textContent = "Soru bulunamadı. Biçimi kontrol et."; return; }
      E.questions = E.questions.filter(q => q.q.trim() || q.opts.some(o => o.trim())).concat(qs); $("#dlg").close(); render();
      const miss = qs.filter(q => q.correct < 0).length; toast(qs.length + " soru eklendi" + (miss ? ` · ${miss} soruda doğru cevabı işaretle` : "")); break;
    }
    case "dlg-close": $("#dlg").close(); break;
    case "h-next": hostNext(); break;
    case "h-reveal": hostReveal(); break;
    case "h-board": hostBoard(); break;
    case "h-end": hostEnd(); break;
    case "h-cancel": hostCancel(); break;
    case "kick": kick(id); break;
    case "copy-link": { const t = joinUrl(S.game.pin); try { await navigator.clipboard.writeText(t); toast("Link kopyalandı"); } catch (e) { toast(t); } break; }
    case "answer": answer(+b.dataset.j); break;
    case "leave": leaveGame(); break;
    case "csv": csvExport(); break;
    case "rdel": S.confirmDel = "r"; render(); break;
    case "rdel-yes": S.confirmDel = null; deleteGame(S.report.id); break;
  }
});
document.addEventListener("input", ev => {
  const t = ev.target, f = t.dataset && t.dataset.f;
  if (t.id === "bulkTxt") { const n = parseBulk(t.value).length; $("#bulkInfo").textContent = n ? n + " soru algılandı" : ""; return; }
  if (t.id === "pinIn") { t.value = t.value.replace(/\D/g, "").slice(0, 6); return; }
  if (!f || !S.editing) return;
  const i = +t.dataset.i, E = S.editing;
  if (f === "title") E.title = t.value;
  else if (f === "q") E.questions[i].q = t.value;
  else if (f === "opt") E.questions[i].opts[+t.dataset.j] = t.value;
  else if (f === "exp") E.questions[i].exp = t.value;
  else if (f === "time") E.questions[i].time = +t.value;
});
document.addEventListener("change", ev => {
  const t = ev.target; if (t.dataset && t.dataset.f === "correct" && S.editing) {
    const i = +t.dataset.i; S.editing.questions[i].correct = +t.dataset.j;
    t.closest(".opts").querySelectorAll(".opt").forEach((o, j) => o.classList.toggle("correct", j === +t.dataset.j));
    if (S.editErr && S.editErr[i] && !qErrors(cleanQ(S.editing.questions[i])).length) { delete S.editErr[i]; render(); }
  }
});
document.addEventListener("submit", ev => {
  const f = ev.target.dataset.form; if (!f) return; ev.preventDefault();
  if (f === "auth") emailAuth(ev.target);
  if (f === "pin") joinByPin($("#pinIn").value);
  if (f === "nick") joinWithNick($("#nickIn").value);
});
document.addEventListener("keydown", ev => {
  if (S.route.name !== "play" || !S.pGame || S.pGame.phase !== "question" || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
  const k = ev.key.toUpperCase(); const j = "1234".includes(k) ? "1234".indexOf(k) : "ABCD".indexOf(k);
  if (j >= 0) document.querySelector(`.tile[data-j="${j}"]`)?.click();
});
// Auto-join when opened from a QR code
onAuthStateChanged(auth, u => { if (S.pendingPin && S.pendingPin.length === 6 && !S.busy && !S.pGameId) joinByPin(S.pendingPin); });

requestAnimationFrame(loop);
