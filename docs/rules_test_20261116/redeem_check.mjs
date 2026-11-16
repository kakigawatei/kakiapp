// 柿川亭アプリ 交換（引換券）をサーバーで確定する直しの点検 2026-11-16
// 使い方: node redeem_check.mjs <auth.js> <新ルール> <旧ルール>   （Firestore エミュレータ 127.0.0.1:8089 を先に起動。@firebase/rules-unit-testing と firebase はこのフォルダの node_modules）
// auth.js の「同期の区間（SYNC-CORE）」と「交換の区間（kakiRedeem）」をそのまま切り出して、エミュレータ＋ルールで動かす。本番の Firestore には一切つながない
import fs from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as fsm from "firebase/firestore";

const [AUTH, RULES_NEW, RULES_OLD] = process.argv.slice(2);
if (!AUTH || !RULES_NEW || !RULES_OLD) { console.log("使い方: node redeem_check.mjs <auth.js> <新ルール> <旧ルール>"); process.exit(2); }
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log("  OK   " + name); } else { fail++; console.log("  NG   " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); } };

const SRC = fs.readFileSync(AUTH, "utf8");
function cut(t, from, to, incl) { const a = t.indexOf(from), b = t.indexOf(to, a); if (a < 0 || b < 0) throw new Error("区間が見つかりません: " + from); return t.slice(a, b + (incl ? to.length : 0)); }
const keysDecl = cut(SRC, "const KEYS = [", "];", true);
const core = cut(SRC, "/* ---- 同期 ---- */", "/* ==== SYNC-CORE-END ==== */", true);
const HAS_REDEEM = SRC.includes("window.kakiRedeem = {");
const chained = cut(SRC, "function chained(fn)", "\n", false);
const redeem = HAS_REDEEM ? cut(SRC, "const REDEEM_TRY_KEY", "  recover: redeemRecover,\r\n};".replace("\r\n", SRC.includes("\r\n") ? "\r\n" : "\n"), true) : "";

function makeTimers() {
  let active = 0, seq = 0; const live = new Map();
  const st = (fn, ms) => { const id = ++seq; active++; live.set(id, true); setTimeout(() => { if (!live.get(id)) return; live.delete(id); active--; fn(); }, 1); return id; };
  const ct = id => { if (live.get(id)) { live.delete(id); active--; } };
  return { st, ct, get active() { return active; } };
}
function makeCore(deps) {
  const body = `
    const { window, localStorage, db, doc, getDoc, getDocFromServer, runTransaction, serverTimestamp, withTimeout, auth } = deps;
    const setTimeout = deps.timers.st, clearTimeout = deps.timers.ct;
    ${keysDecl}
    let uid = null, ready = false, timer = null;
    ${core}
    ${chained}
    ${redeem}
    return { pull, write, afterReady, setUid: v => { uid = v; }, setReady: v => { ready = v; }, chain: () => writeChain };`;
  return new Function("deps", body)(deps);
}
function makeLocalStorage(init) { const m = new Map(Object.entries(init || {})); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; }
const jst = off => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const T = jst(0), Y = jst(-1), Y2 = jst(-2);
function makeApp(ls) {
  const notices = [], window = { __errs: [] };
  const app = { window, notices,
    get s() { try { return JSON.parse(ls.getItem("kakiapp") || "{}"); } catch { return {}; } },
    set(patch) { ls.setItem("kakiapp", JSON.stringify(Object.assign(app.s, patch))); if (window.cloudPush) window.cloudPush(); },
    logTx(label, points) { const tx = app.s.tx || []; tx.unshift({ d: new Date().toISOString().slice(0, 16).replace("T", " "), label, points }); app.set({ tx: tx.slice(0, 100) }); },
    spin(p) { app.set({ points: (app.s.points || 0) + p, rouletteDate: T }); app.logTx("毎日ルーレット", p); },
    loginBonus() { if (app.s.loginDate !== T) { app.set({ points: (app.s.points || 0) + 1, loginDate: T }); app.logTx("ログインボーナス", 1); } } };
  window.kakiGetState = () => app.s; window.kakiSetState = o => ls.setItem("kakiapp", JSON.stringify(o || {})); window.kakiToday = () => T; window.kakiSyncClock = async () => 0; window.kakiNotice = m => notices.push(m);
  return app;
}
async function idle(timers, c) { for (let i = 0; i < 400; i++) { await new Promise(r => setTimeout(r, 5)); try { await c.chain(); } catch (_) {} if (timers.active === 0) { await new Promise(r => setTimeout(r, 20)); try { await c.chain(); } catch (_) {} if (timers.active === 0) return; } } throw new Error("idle: 終わらない"); }
/* 起動（onAuthStateChanged → pull → ready → ログボ → afterReady）。net＝通信のまね: { tx: fn, get: fn } を差し替えられる */
async function boot(env, ls, uidv, net, noLogin) {
  const app = makeApp(ls), timers = makeTimers(), db = env.authenticatedContext(uidv, { email: "x@example.com" }).firestore();
  const n = Object.assign({ runTransaction: fsm.runTransaction, getDocFromServer: fsm.getDocFromServer }, net || {});
  const c = makeCore({ window: app.window, localStorage: ls, auth: { currentUser: { email: "x@example.com", displayName: "" } }, withTimeout: p => p, timers, db, doc: fsm.doc, getDoc: fsm.getDoc,
    getDocFromServer: (...a) => n.getDocFromServer(...a), runTransaction: (...a) => n.runTransaction(...a), serverTimestamp: fsm.serverTimestamp });
  c.setUid(uidv); await c.pull({ uid: uidv }); c.setReady(true); if (!noLogin) app.loginBonus(); c.afterReady(); await idle(timers, c);
  return { app, core: c, timers, net: n };
}
const mkEnv = async (pid, file) => { const e = await initializeTestEnvironment({ projectId: pid, firestore: { host: "127.0.0.1", port: 8089, rules: fs.readFileSync(file, "utf8") } }); await e.clearFirestore(); return e; };
const envNew = await mkEnv("demo-kaki-redeem-new", RULES_NEW), envOld = await mkEnv("demo-kaki-redeem-old", RULES_OLD);
const seed = (env, id, data) => env.withSecurityRulesDisabled(c => fsm.setDoc(fsm.doc(c.firestore(), "kakiapp_users", id), data));
const read = async (env, id) => { let d; await env.withSecurityRulesDisabled(async c => { d = (await fsm.getDoc(fsm.doc(c.firestore(), "kakiapp_users", id))).data(); }); return d; };
const redeemsOf = async (env, id) => { const out = []; await env.withSecurityRulesDisabled(async c => { const q = await fsm.getDocs(fsm.query(fsm.collection(c.firestore(), "kakiapp_redeems"), fsm.where("uid", "==", id))); q.forEach(x => out.push(x.data())); }); return out; };
const base = { points: 1200, visits: [Y2], qrDate: Y2, gachaDate: Y2, loginDate: T, rouletteDate: Y, tx: [{ d: "2026-11-01 00:00", label: "毎日ルーレット", points: 3 }] };
const offline = () => Promise.reject(Object.assign(new Error("offline"), { code: "unavailable" }));
const codeOf = async p => { try { await p; return "ok"; } catch (e) { return String((e && e.code) || e); } };

console.log("■ 交換をサーバーで確定（" + AUTH + "）");
if (!HAS_REDEEM) { console.log("  この auth.js には kakiRedeem がありません（直す前の版）"); }
else {
  // R1 ふつうの交換
  { await seed(envNew, "r1", base); const ls = makeLocalStorage(); const { app, core: c, timers } = await boot(envNew, ls, "r1");
    const r = await app.window.kakiRedeem.commit({ pts: 850, name: "油そば 並盛", code: "4321" }); await idle(timers, c);
    const d = await read(envNew, "r1"), recs = await redeemsOf(envNew, "r1");
    ok(d.points === 350 && recs.length === 1 && recs[0].pts === 850 && recs[0].code === "4321" && d.lastRedeem && recs[0].at, "R1 交換: サーバーの残高 1200→350・交換の記録が1件（850P・コード 4321・サーバー時刻つき）", { p: d.points, recs });
    ok(app.s.points === 350 && app.s.redeem && app.s.redeem.code === "4321" && r.code === "4321" && !ls.getItem("kakiapp_pending") && !ls.getItem("kakiapp_redeem_try"), "R1 端末: 残高 350・引換券の中身あり・未保存の控えなし", { p: app.s.points, rd: app.s.redeem });
    ok((d.tx || []).some(t => /お店で交換 油そば 並盛（4321）/.test(t.label) && t.points === -850) && (app.s.tx || []).some(t => /お店で交換/.test(t.label)), "R1 履歴に「お店で交換 …（4321）−850」が端末とサーバーの両方にある");
    app.spin(3); await idle(timers, c); const d2 = await read(envNew, "r1");
    ok(d2.points === 353 && app.s.points === 353, "R1 交換のあと、ふだんの保存（ルーレット+3）で 353P（基準がずれない）", { cloud: d2.points, local: app.s.points });
    // R7 ログアウトの手口: 端末の状態を消して入り直しても戻らない
    const ls2 = makeLocalStorage(); const b2 = await boot(envNew, ls2, "r1");
    ok(b2.app.s.points === 353, "R7 交換→ログアウト→ログインし直しても残高は戻らない（353P のまま）", b2.app.s.points); }
  // R2 電波なし
  { await seed(envNew, "r2", base); const ls = makeLocalStorage(); const { app, core: c, timers, net } = await boot(envNew, ls, "r2");
    net.runTransaction = offline; net.getDocFromServer = offline;
    const code = await codeOf(app.window.kakiRedeem.commit({ pts: 850, name: "油そば 並盛", code: "1111" })); await idle(timers, c);
    const d = await read(envNew, "r2"), recs = await redeemsOf(envNew, "r2");
    ok(code === "redeem/net" && !app.s.redeem && app.s.points === 1200 && d.points === 1200 && recs.length === 0 && !ls.getItem("kakiapp_redeem_try"), "R2 電波なし: 交換しない（redeem/net）・引換券なし・端末もサーバーも 1200P のまま", { code, p: app.s.points, cloud: d.points }); }
  // R3 未送信の加点があるままの交換
  { await seed(envNew, "r3", base); const ls = makeLocalStorage(); const { app, core: c, timers } = await boot(envNew, ls, "r3");
    app.spin(3);   /* まだ送っていない（700ms 待ちの間） */
    await app.window.kakiRedeem.commit({ pts: 850, name: "油そば 並盛", code: "2222" }); await idle(timers, c);
    const d = await read(envNew, "r3");
    ok(d.points === 353 && app.s.points === 353 && d.rouletteDate === T, "R3 未送信のルーレット+3 を先に送ってから交換: 1200+3−850＝353P（端末・サーバー）", { cloud: d.points, local: app.s.points }); }
  // R4 端末の残高だけ多い（書き換え）→ サーバーの残高で断る
  { await seed(envNew, "r4", Object.assign({}, base, { points: 300 })); const ls = makeLocalStorage(); const { app, core: c, timers } = await boot(envNew, ls, "r4");
    const s = app.s; s.points = 5000; app.window.kakiSetState(s);
    const p = app.window.kakiRedeem.commit({ pts: 850, name: "油そば 並盛", code: "3333" }); let have = null; const code = await p.then(() => "ok", e => { have = e.have; return e.code; }); await idle(timers, c);
    const d = await read(envNew, "r4"), recs = await redeemsOf(envNew, "r4");
    ok(code === "redeem/short" && have === 300 && d.points === 300 && recs.length === 0 && !app.s.redeem, "R4 端末の残高を 5000 に書き換えても、サーバーの残高（300P）で断る・引換券なし", { code, have, cloud: d.points }); }
  // R5 届いたのに端末には失敗に見えた（時間切れ）→ その場で確かめて引換券を出す
  { await seed(envNew, "r5", base); const ls = makeLocalStorage(); const { app, core: c, timers, net } = await boot(envNew, ls, "r5");
    let n = 0; net.runTransaction = async (...a) => { if (++n === 2) {   /* 1回目＝未送信分の保存・2回目＝交換 */ await fsm.runTransaction(...a); throw Object.assign(new Error("deadline"), { code: "deadline-exceeded" }); } return fsm.runTransaction(...a); };
    const code = await codeOf(app.window.kakiRedeem.commit({ pts: 850, name: "油そば 並盛", code: "5555" })); await idle(timers, c);
    const d = await read(envNew, "r5"), recs = await redeemsOf(envNew, "r5");
    ok(code === "ok" && d.points === 350 && recs.length === 1 && app.s.points === 350 && app.s.redeem && app.s.redeem.code === "5555" && !ls.getItem("kakiapp_redeem_try"), "R5 届いていたのに時間切れに見えた: 記録を確かめて引換券を出す・減算は1回だけ（350P）", { code, cloud: d.points, local: app.s.points, recs: recs.length }); }
  // R6 届いたか確かめられなかった → 引換券は出さない → 次に開いたとき確かめて出す
  { await seed(envNew, "r6", base); const ls = makeLocalStorage(); const { app, core: c, timers, net } = await boot(envNew, ls, "r6");
    let n = 0; net.runTransaction = async (...a) => { if (++n === 2) {   /* 1回目＝未送信分の保存・2回目＝交換 */ await fsm.runTransaction(...a); throw Object.assign(new Error("deadline"), { code: "deadline-exceeded" }); } return fsm.runTransaction(...a); };
    net.getDocFromServer = offline;
    const code = await codeOf(app.window.kakiRedeem.commit({ pts: 850, name: "油そば 並盛", code: "6666" })); await idle(timers, c);
    ok(code === "redeem/unknown" && !app.s.redeem && !!ls.getItem("kakiapp_redeem_try"), "R6 届いたか確かめられない: 引換券は出さない（redeem/unknown）・控えを残す", { code });
    net.getDocFromServer = fsm.getDocFromServer;
    const r = await app.window.kakiRedeem.recover(); await idle(timers, c);
    const d = await read(envNew, "r6"), recs = await redeemsOf(envNew, "r6");
    ok(r && r.code === "6666" && app.s.redeem && app.s.redeem.code === "6666" && app.s.points === 350 && d.points === 350 && recs.length === 1 && !ls.getItem("kakiapp_redeem_try"), "R6 電波が戻って「つかう」を開く: 記録が見つかり引換券が出る・残高は端末もサーバーも 350P（二重に引かない）", { local: app.s.points, cloud: d.points, recs: recs.length });
    const r2 = await app.window.kakiRedeem.recover(); ok(r2 === null, "R6 もう一度確かめても二重には出ない"); }
  // R8 届かなかった交換（電波なし）の控えは、10分たったら捨てる・すぐ次の交換はできる
  { await seed(envNew, "r8", base); const ls = makeLocalStorage(); const { app, core: c, timers, net } = await boot(envNew, ls, "r8");
    ls.setItem("kakiapp_redeem_try", JSON.stringify({ uid: "r8", id: "r8_never", pts: 850, name: "x", code: "0000", at: Date.now() - 11 * 60000 }));
    const r = await app.window.kakiRedeem.recover();
    ok(r === null && !ls.getItem("kakiapp_redeem_try"), "R8 届いていない古い控え（11分前）は捨てる");
    await app.window.kakiRedeem.commit({ pts: 50, name: "トッピング（50円のもの）", code: "7777" }); await idle(timers, c);
    const d = await read(envNew, "r8"); ok(d.points === 1150 && app.s.redeem.pts === 50, "R8 そのあとの交換（50P）は通る: 1150P", d.points); }
  // R9 新アプリ＋旧ルール（ルールを先に出さなかった／ルールだけ戻した場合）: 交換の記録の置き場が無い → 交換しない（引換券は出ない・残高そのまま）
  { await seed(envOld, "r9", base); const ls = makeLocalStorage(); const { app, core: c, timers } = await boot(envOld, ls, "r9");
    const code = await codeOf(app.window.kakiRedeem.commit({ pts: 850, name: "油そば 並盛", code: "9999" })); await idle(timers, c);
    const d = await read(envOld, "r9");
    ok(code === "redeem/net" && !app.s.redeem && d.points === 1200 && app.s.points === 1200, "R9 新アプリ×旧ルール: 交換できない（引換券は出ない・残高は減らない）＝ルールを先に出す必要がある", { code, cloud: d.points }); }
}

console.log("■ 新規アカウントの最初の保存（新ルール＝作成時も検査）");
// N1 ふつうの新規登録
{ const ls = makeLocalStorage({ kakiapp: JSON.stringify({ mailOptIn: true, mailOptInAt: new Date().toISOString() }) }); const { app, core: c, timers } = await boot(envNew, ls, "n1");
  const d = await read(envNew, "n1");
  ok(d && d.points === 1 && d.loginDate === T && d.mailOptIn === true, "N1 新規登録: 最初の保存→ログインボーナス+1 まで通る", d && { p: d.points, l: d.loginDate }); }
// N2 端末に前のアカウントの状態が残っている（会員データは消されている）
{ const stale = { points: 800, visits: ["2026-10-01", "2026-10-02"], tx: [], loginDate: Y, rouletteDate: Y, mailOptIn: true };
  const ls = makeLocalStorage({ kakiapp: JSON.stringify(stale) }); let err = null, b = null;
  try { b = await boot(envNew, ls, "n2"); } catch (e) { err = String((e && e.code) || e); }
  const d = await read(envNew, "n2");
  if (HAS_REDEEM) ok(!err && d && (d.points || 0) <= 1 && !(d.visits || []).length && b.app.s.mailOptIn === true, "N2 端末に古い状態（800P・来店2件）が残っていても、空から作り直して先へ進む（800P は戻らない）", { err, d });
  else ok(err && /permission-denied/.test(err) && !d, "N2（直す前のアプリ）端末に古い状態が残っていると最初の保存が拒否され、読み込み画面で止まる（読み込み画面の「ログアウト」で抜けられる）", { err, d }); }

console.log("\n結果: OK " + pass + " ／ NG " + fail);
await envNew.cleanup(); await envOld.cleanup();
process.exit(fail ? 1 : 0);
