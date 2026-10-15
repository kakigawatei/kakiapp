// 柿川亭アプリ 保存まわり（auth.js の SYNC-CORE 区間）の手元点検 2026-10-15
// 使い方:
//   node scripts/sync_check.mjs                          … 通信なしの点検（偽の Firestore で 再試行・拒否・重複除去・控え）
//   node scripts/sync_check.mjs --emu <emuDir> <rules>   … 上に加えて Firestore エミュレータ（127.0.0.1:8089）＋本番と同じルールで、保存成功／拒否を通しで試す
//     <emuDir> は @firebase/rules-unit-testing と firebase を入れた node_modules のあるフォルダ。エミュレータは先に起動しておく
//   --old auth_backup_20261015_save.js を付けると、直す前の auth.js でも同じ「再起動の穴」の点検を流して比べる
// 本番の Firestore には一切つながない（demo- の projectId だけ使う）
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const args = process.argv.slice(2);
const emuIdx = args.indexOf("--emu");
const EMU_DIR = emuIdx >= 0 ? args[emuIdx + 1] : null;
const RULES = emuIdx >= 0 ? args[emuIdx + 2] : null;
const oldIdx = args.indexOf("--old");
const OLD_FILE = oldIdx >= 0 ? path.resolve(APP, args[oldIdx + 1]) : null;

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log("  OK   " + name); } else { fail++; console.log("  NG   " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); } };

/* ---- auth.js から同期の区間を切り出す ---- */
function extractCore(file) {
  const t = fs.readFileSync(file, "utf8");
  const k0 = t.indexOf("const KEYS = ["), k1 = t.indexOf("];", k0);
  const keysDecl = t.slice(k0, k1 + 2);
  let a = t.indexOf("/* ---- 同期 ---- */"), b = t.indexOf("/* ==== SYNC-CORE-END ==== */");
  if (b < 0) b = t.indexOf("/* ---- SMS"); else b += "/* ==== SYNC-CORE-END ==== */".length;
  if (a < 0 || b < 0) throw new Error("同期の区間が見つかりません: " + file);
  return { keysDecl, core: t.slice(a, b) };
}

/* 偽のタイマー（待ち時間は記録だけして、すぐ実行する） */
function makeTimers() {
  const waits = []; let active = 0, seq = 0; const live = new Map();
  const st = (fn, ms) => { const id = ++seq; waits.push(ms); active++; live.set(id, true); setTimeout(() => { if (!live.get(id)) return; live.delete(id); active--; fn(); }, 1); return id; };
  const ct = id => { if (live.get(id)) { live.delete(id); active--; } };
  return { st, ct, waits, get active() { return active; } };
}

function makeCore(file, deps) {
  const { keysDecl, core } = extractCore(file);
  const body = `
    const { window, localStorage, db, doc, getDoc, runTransaction, withTimeout, auth } = deps;
    const setTimeout = deps.timers.st, clearTimeout = deps.timers.ct;
    ${keysDecl}
    let uid = null, ready = false, timer = null;
    ${core}
    return {
      pull, write,
      afterReady: typeof afterReady === "function" ? afterReady : () => {},
      normTx: typeof normTx === "function" ? normTx : null,
      setUid: v => { uid = v; }, setReady: v => { ready = v; },
      chain: () => writeChain,
    };`;
  return new Function("deps", body)(deps);
}

/* index.html の store / logTx / ルーレット / ログボ を最小限まねる */
function makeLocalStorage(init) { const m = new Map(Object.entries(init || {})); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; }
function makeApp(ls, T) {
  const notices = [];
  const window = { __errs: [] };
  const app = {
    window, notices,
    get s() { try { return JSON.parse(ls.getItem("kakiapp") || "{}"); } catch { return {}; } },
    set(patch) { ls.setItem("kakiapp", JSON.stringify(Object.assign(app.s, patch))); if (window.cloudPush) window.cloudPush(); },
    logTx(label, points) { const tx = app.s.tx || []; tx.unshift({ d: new Date().toISOString().slice(0, 16).replace("T", " "), label, points }); app.set({ tx: tx.slice(0, 100) }); },
    canSpin() { return app.s.rouletteDate !== T; },
    spin(p) { if (!app.canSpin()) return false; app.set({ points: (app.s.points || 0) + p, rouletteDate: T }); app.logTx("毎日ルーレット", p); return true; },
    checkinGacha(vp, g) { if (app.s.gachaDate === T) return false; const v = (app.s.visits || []).slice(); app.set({ qrDate: T }); if (!v.includes(T)) { v.push(T); app.set({ visits: v, points: (app.s.points || 0) + vp }); app.logTx("来店ポイント", vp); } app.set({ points: (app.s.points || 0) + g, gachaDate: T }); app.logTx("来店ガチャ", g); return true; },
    loginBonus() { if (app.s.loginDate !== T) { app.set({ points: (app.s.points || 0) + 1, loginDate: T }); app.logTx("ログインボーナス", 1); } },
  };
  window.kakiGetState = () => app.s;
  window.kakiSetState = o => ls.setItem("kakiapp", JSON.stringify(o || {}));
  window.kakiToday = () => T;
  window.kakiSyncClock = async () => 0;
  window.kakiNotice = m => notices.push(m);
  return app;
}
const noTimeout = p => p;
async function idle(timers, core) {
  for (let i = 0; i < 400; i++) {
    await new Promise(r => setTimeout(r, 5));
    try { await core.chain(); } catch (_) {}
    if (timers.active === 0) { await new Promise(r => setTimeout(r, 20)); try { await core.chain(); } catch (_) {} if (timers.active === 0) return; }
  }
  throw new Error("idle: 終わらない");
}
/* 起動（index.html の onAuthStateChanged → pull → ready → kakiStart(ログボ) → afterReady の順） */
async function boot(file, ls, T, uidv, fsdeps) {
  const app = makeApp(ls, T), timers = makeTimers();
  const core = makeCore(file, { window: app.window, localStorage: ls, auth: { currentUser: { email: "x@example.com", displayName: "" } }, withTimeout: noTimeout, timers, ...fsdeps });
  core.setUid(uidv);
  await core.pull({ uid: uidv });
  core.setReady(true);
  app.loginBonus();
  core.afterReady();
  await idle(timers, core);
  return { app, core, timers };
}

const jst = off => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const T = jst(0), Y = jst(-1), Y2 = jst(-2);
const NEW = path.join(APP, "auth.js");

/* ================= 1. 通信なしの点検（偽の Firestore） ================= */
function fakeFs(cloud, opts = {}) {
  const st = { calls: 0, failLeft: opts.failTimes || 0, failCode: opts.failCode || "unavailable" };
  const ref = { id: "u1" };
  return {
    st, cloud,
    db: {}, doc: () => ref,
    getDoc: async () => ({ exists: () => !!cloud.data, data: () => JSON.parse(JSON.stringify(cloud.data)) }),
    runTransaction: async (_db, fn) => {
      st.calls++;
      if (st.failLeft !== 0) { st.failLeft--; throw Object.assign(new Error(st.failCode), { code: st.failCode }); }
      let pendingSet = null;
      await fn({ get: async () => ({ exists: () => !!cloud.data, data: () => JSON.parse(JSON.stringify(cloud.data)) }), set: (_r, v) => { pendingSet = v; } });
      if (pendingSet) cloud.data = Object.assign({}, cloud.data || {}, JSON.parse(JSON.stringify(pendingSet)));
    },
  };
}


console.log("■ 1. 偽の Firestore での点検（" + T + "）");
{
  // 1a 通信の失敗（unavailable）は 3回まで再試行し、最後に1回だけ知らせる
  const cloud = { data: { points: 50, rouletteDate: Y, loginDate: Y, tx: [] } };
  const f = fakeFs(cloud, { failTimes: -1, failCode: "unavailable" });
  const ls = makeLocalStorage();
  const { app, core, timers } = await boot(NEW, ls, T, "u1", f);
  app.spin(3); await idle(timers, core);
  ok(f.st.calls === (1 + 3) * 2, "通信の失敗は再試行する（試行回数 " + f.st.calls + "）");
  ok(timers.waits.filter(w => w === 3000).length >= 1 && timers.waits.filter(w => w === 30000).length >= 1 && !timers.waits.some(w => w > 30000), "再試行の待ち時間は 3s/10s/30s で上限あり", timers.waits);
  ok(app.notices.length === 1, "同じ失敗の知らせは1回だけ（" + app.notices.length + "回）", app.notices);
  ok(app.window.__errs.some(e => e.includes("unavailable")), "window.__errs に記録される");
  ok(!!ls.getItem("kakiapp_pending"), "未保存の控えが残る");
}
{
  // 1b 拒否（permission-denied）は再試行しない
  const cloud = { data: { points: 50, rouletteDate: Y, loginDate: Y, tx: [] } };
  const f = fakeFs(cloud, { failTimes: -1, failCode: "permission-denied" });
  const ls = makeLocalStorage();
  const { app, core, timers } = await boot(NEW, ls, T, "u1", f);
  const callsAfterBoot = f.st.calls;
  app.spin(3); await idle(timers, core);
  ok(f.st.calls - callsAfterBoot === 1, "拒否は再試行しない（ルーレット後の試行 " + (f.st.calls - callsAfterBoot) + "回）");
  ok(app.notices.length === 1 && app.window.__errs.some(e => e.includes("permission-denied")), "拒否も記録し、知らせは1回", app.notices);
  // 再起動（ルール直る前）: 今日の印は端末に残る＝もう一度回せない
  const r2 = await boot(NEW, ls, T, "u1", f);
  ok(!r2.app.canSpin(), "保存に失敗したまま開き直しても、同じ日のルーレットは回せない");
  ok(r2.app.s.points === 54, "端末のポイント（50+ログボ1+ルーレット3）は残る", r2.app.s.points);
  // ルールが直った（以後は成功）→ 開き直すと送り直して控えが消える
  f.st.failLeft = 0;
  const r3 = await boot(NEW, ls, T, "u1", f);
  ok(cloud.data.points === 54 && cloud.data.rouletteDate === T && cloud.data.loginDate === T, "ルールが直った後の起動で、クラウドに送り直される", { p: cloud.data.points, r: cloud.data.rouletteDate });
  ok(!ls.getItem("kakiapp_pending"), "送れたら控えは消える");
  ok(r3.app.notices.length === 0, "成功時は何も出さない");
}
{
  // 1c 日付が変わった控え（昨日の未保存）は送れない → クラウドを正にする
  const cloud = { data: { points: 50, rouletteDate: Y2, loginDate: Y2, tx: [] } };
  const f = fakeFs(cloud);
  const ls = makeLocalStorage({ kakiapp: JSON.stringify({ points: 53, rouletteDate: Y, loginDate: Y2, tx: [] }), kakiapp_pending: JSON.stringify({ uid: "u1", day: Y, base: 50, tries: [] }) });
  const { app } = await boot(NEW, ls, T, "u1", f);
  ok(app.s.points === 51 && app.canSpin(), "昨日の未保存はクラウドの状態に戻り、今日は回せる（51=50+今日のログボ）", app.s);
  ok(app.window.__errs.some(e => e.includes("日付が変わった")), "戻したことを __errs に残す");
}
{
  // 1d 履歴の重複: キーの並び順違い・完全重複 → 起動後の保存で整う。ポイントは変えない
  const a = { d: "2026-10-14 03:00", label: "来店ガチャ", points: 10 };
  const a2 = { points: 10, label: "来店ガチャ", d: "2026-10-14 03:00" };
  const b = { d: "2026-10-13 03:00", label: "毎日ルーレット", points: 3 };
  const cloud = { data: { points: 500, rouletteDate: T, loginDate: T, tx: [a, a2, b, a2, b, a, { label: "毎日ルーレット", d: "2026-10-13 03:00", points: 3 }] } };
  const f = fakeFs(cloud);
  const ls = makeLocalStorage();
  const { app, core, timers } = await boot(NEW, ls, T, "u1", f);
  ok(app.s.tx.length === 2, "端末の履歴は重複が除かれる（" + app.s.tx.length + "件）", app.s.tx);
  ok(cloud.data.tx.length === 2, "次の保存でクラウドの履歴も整う（" + cloud.data.tx.length + "件）", cloud.data.tx);
  ok(cloud.data.points === 500 && app.s.points === 500, "ポイント残高は変わらない", cloud.data.points);
  // 和集合が並び順違いで増えない
  cloud.data.tx = [a2, { label: "毎日ルーレット", points: 3, d: "2026-10-13 03:00" }];
  app.set({ mailOptIn: true }); await idle(timers, core);
  ok(cloud.data.tx.length === 2 && app.s.tx.length === 2, "並び順の違う同じ履歴で増えない", cloud.data.tx.length);
  ok(JSON.stringify(core.normTx([b, a])) === JSON.stringify([a, b]), "新しい順に並ぶ");
}
{
  // 1e 時間切れ扱いでも実は届いていた → 二重に足さない
  const cloud = { data: { points: 50, rouletteDate: Y, loginDate: T, tx: [] } };
  const f = fakeFs(cloud);
  const ls = makeLocalStorage();
  const { app, core, timers } = await boot(NEW, ls, T, "u1", f);
  const real = f.runTransaction; let once = true;
  f.runTransaction = async (...x) => { await real(...x); if (once) { once = false; throw Object.assign(new Error("timeout"), { code: "timeout/setDoc" }); } };
  // makeCore はデストラクトで受け取っているので、差し替えは起動し直して反映
  const r = await boot(NEW, ls, T, "u1", Object.assign({}, f, { runTransaction: f.runTransaction }));
  r.app.spin(3); await idle(r.timers, r.core);
  ok(cloud.data.points === 53, "時間切れ→再試行でも 3P は1回だけ足される（クラウド " + cloud.data.points + "P）");
  ok(r.app.s.points === 53, "端末も 53P", r.app.s.points);
}
{
  // 1f 運営が加算していた（admin increment）＋端末に未保存 → 両方残る
  const cloud = { data: { points: 50, rouletteDate: Y, loginDate: T, tx: [] } };
  const f = fakeFs(cloud, { failTimes: -1, failCode: "permission-denied" });
  const ls = makeLocalStorage();
  const r1 = await boot(NEW, ls, T, "u1", f);
  r1.app.spin(3); await idle(r1.timers, r1.core);
  cloud.data.points += 100;   // 運営の加算
  f.st.failLeft = 0;
  const r2 = await boot(NEW, ls, T, "u1", f);
  ok(cloud.data.points === 153 && r2.app.s.points === 153, "運営の +100 と端末の +3 が両方残る（クラウド " + cloud.data.points + " / 端末 " + r2.app.s.points + "）");
}

/* ================= 2. エミュレータ＋本番と同じルール ================= */
if (EMU_DIR) {
  console.log("\n■ 2. エミュレータ（" + RULES + "）");
  const req = createRequire(path.join(path.resolve(EMU_DIR), "package.json"));
  const rut = req("@firebase/rules-unit-testing");
  const fsm = req("firebase/firestore");
  const rulesOk = fs.readFileSync(RULES, "utf8");
  if (!rulesOk.includes("userWriteOk()")) throw new Error("想定したルールではありません");
  /* 来店の保存が全部拒否された 10/15 の状態をまねる: 本人の更新だけ必ず拒否 */
  const rulesDeny = rulesOk.replace("(request.auth.uid == uid && userWriteOk())", "(request.auth.uid == uid && false)");
  const envOk = await rut.initializeTestEnvironment({ projectId: "demo-kaki-sync-ok", firestore: { host: "127.0.0.1", port: 8089, rules: rulesOk } });
  const envNg = await rut.initializeTestEnvironment({ projectId: "demo-kaki-sync-ng", firestore: { host: "127.0.0.1", port: 8089, rules: rulesDeny } });
  await envOk.clearFirestore(); await envNg.clearFirestore();
  const seed = async (env, id, data) => env.withSecurityRulesDisabled(async c => { await fsm.setDoc(fsm.doc(c.firestore(), "kakiapp_users", id), data); });
  const read = async (env, id) => { let d; await env.withSecurityRulesDisabled(async c => { d = (await fsm.getDoc(fsm.doc(c.firestore(), "kakiapp_users", id))).data(); }); return d; };
  const deps = (env, id) => ({ db: env.authenticatedContext(id, { email: "x@example.com" }).firestore(), doc: fsm.doc, getDoc: fsm.getDoc, runTransaction: fsm.runTransaction });
  const base = { points: 50, visits: [Y2], qrDate: Y2, gachaDate: Y2, loginDate: Y, rouletteDate: Y, claimed: {}, rankBonus: {}, refClaimed: {}, tx: [] };

  // 2a 正常: ログボ＋ルーレットが保存される
  await seed(envOk, "e1", base);
  { const ls = makeLocalStorage(); const { app, core, timers } = await boot(NEW, ls, T, "e1", deps(envOk, "e1"));
    app.spin(3); await idle(timers, core); const d = await read(envOk, "e1");
    ok(d.points === 54 && d.rouletteDate === T && d.loginDate === T && !ls.getItem("kakiapp_pending") && app.notices.length === 0, "成功: ログボ＋ルーレットがルールを通って保存（" + d.points + "P）", d); }

  // 2b 拒否 → 開き直し（まだ拒否）→ ルールが直って開き直し
  const runHole = async (file, tag) => {
    await seed(envNg, tag, base); await seed(envOk, tag, base);
    const ls = makeLocalStorage();
    const r1 = await boot(file, ls, T, tag, deps(envNg, tag)); r1.app.spin(3); await idle(r1.timers, r1.core);
    const r2 = await boot(file, ls, T, tag, deps(envNg, tag));
    const spinAgain = r2.app.canSpin();
    const r3 = await boot(file, ls, T, tag, deps(envOk, tag));
    if (r3.app.canSpin()) { r3.app.spin(3); await idle(r3.timers, r3.core); }
    return { r1, r2, r3, spinAgain, cloud: await read(envOk, tag), ls };
  };
  { const x = await runHole(NEW, "e2");
    ok(x.r1.app.window.__errs.some(e => e.includes("permission-denied")) && x.r1.app.notices.length === 1, "拒否が __errs と画面の知らせ（1回）に出る", x.r1.app.notices);
    ok(!x.spinAgain, "拒否されたまま開き直しても、同じ日にもう一度回せない");
    ok(x.cloud.points === 54 && x.cloud.rouletteDate === T, "ルールが直った後の起動で 54P（ログボ1＋ルーレット3）が本番ルールを通って保存", { p: x.cloud.points, r: x.cloud.rouletteDate });
    ok(!x.ls.getItem("kakiapp_pending"), "保存できたら控えは消える"); }
  if (OLD_FILE) {
    const x = await runHole(OLD_FILE, "e3");
    console.log("  参考 直す前の auth.js: 拒否後に開き直して回せる=" + x.spinAgain + " / 知らせ=" + x.r1.app.notices.length + "回 / __errs=" + x.r1.app.window.__errs.length + "件");
  }

  // 2c 重複した履歴（並び順違い）を持つクラウド → 整えて保存（ルールは tx を制限しない）
  { const a = { d: "2026-10-14 03:00", label: "来店ガチャ", points: 10 }, a2 = { points: 10, label: "来店ガチャ", d: "2026-10-14 03:00" };
    const many = []; for (let i = 0; i < 40; i++) many.push(i % 2 ? a : a2);
    await seed(envOk, "e4", Object.assign({}, base, { loginDate: T, tx: many }));
    const ls = makeLocalStorage(); await boot(NEW, ls, T, "e4", deps(envOk, "e4")); const d = await read(envOk, "e4");
    ok(d.tx.length === 1 && d.points === 50, "40件の重複が1件に整い、残高はそのまま（" + d.tx.length + "件・" + d.points + "P）"); }

  // 2d 日付が変わった控え → クラウドを正にし、今日の分は普通に保存できる
  { await seed(envOk, "e5", Object.assign({}, base, { rouletteDate: Y2, loginDate: Y2 }));
    const ls = makeLocalStorage({ kakiapp: JSON.stringify(Object.assign({}, base, { points: 53, rouletteDate: Y, loginDate: Y2 })), kakiapp_pending: JSON.stringify({ uid: "e5", day: Y, base: 50, tries: [] }) });
    const { app, core, timers } = await boot(NEW, ls, T, "e5", deps(envOk, "e5"));
    app.spin(3); await idle(timers, core); const d = await read(envOk, "e5");
    ok(d.points === 54 && d.rouletteDate === T && app.notices.length === 0, "昨日の控えは捨て、今日のログボ＋ルーレットは保存（" + d.points + "P）", d); }

  // 2e 来店＋ガチャが拒否 → 開き直しても今日のガチャは回せない → ルールが直って送り直し（visits/qrDate/gachaDate/points を1回で）
  { await seed(envNg, "e6", Object.assign({}, base, { loginDate: T })); await seed(envOk, "e6", Object.assign({}, base, { loginDate: T }));
    const ls = makeLocalStorage();
    const r1 = await boot(NEW, ls, T, "e6", deps(envNg, "e6")); r1.app.checkinGacha(1, 50); await idle(r1.timers, r1.core);
    const r2 = await boot(NEW, ls, T, "e6", deps(envNg, "e6")); const again = r2.app.checkinGacha(1, 50);
    await boot(NEW, ls, T, "e6", deps(envOk, "e6")); const d = await read(envOk, "e6");
    ok(!again, "来店ガチャが拒否されたまま開き直しても、同じ日にもう一度回せない");
    ok(d.points === 101 && d.gachaDate === T && d.qrDate === T && d.visits.length === 2 && d.visits[1] === T && !ls.getItem("kakiapp_pending"), "直った後、来店1件＋来店1P＋ガチャ50P が本番ルールを通って保存（" + d.points + "P）", d); }

  await envOk.cleanup(); await envNg.cleanup();
}

console.log("\n結果: OK " + pass + " / NG " + fail);
process.exit(fail ? 1 : 0);
