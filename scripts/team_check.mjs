// 柿川亭アプリ 学校対抗の「参加・抜ける・アカウント削除」の手元点検 2026-10-17
// 使い方: node scripts/team_check.mjs <emuDir> <rules>
//   <emuDir> は @firebase/rules-unit-testing と firebase を入れた node_modules のあるフォルダ。Firestore エミュレータ（127.0.0.1:8089）を先に起動しておく
//   <rules> は本番と同じルール（例 docs/firestore_rules_2026-10-15_fix.txt）
// auth.js の学校の区間（const teamNorm 〜 window.kakiTeams の終わり）をそのまま切り出して、エミュレータ＋本番ルールで動かす。本番の Firestore には一切つながない
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const [EMU_DIR, RULES] = process.argv.slice(2);
if (!EMU_DIR || !RULES) { console.log("使い方: node scripts/team_check.mjs <emuDir> <rules>"); process.exit(2); }
const req = createRequire(path.join(path.resolve(EMU_DIR), "package.json"));
const rut = req("@firebase/rules-unit-testing");
const fsm = req("firebase/firestore");

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log("  OK   " + name); } else { fail++; console.log("  NG   " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); } };

const SRC = fs.readFileSync(path.join(APP, "auth.js"), "utf8");
function extractTeams(t) {
  const a = t.indexOf("const teamNorm = raw =>"), k = t.indexOf("window.kakiTeams = {", a), b = t.indexOf("\n};", k);
  if (a < 0 || k < 0 || b < 0) throw new Error("学校の区間が見つかりません");
  return t.slice(a, b + 3);
}
/* アカウント削除の「消せなかったときの上書き」の中身（setDoc の第2引数）をそのまま取り出す */
function extractScrub(t) {
  const a = t.indexOf("{ deleted: true"), b = t.indexOf("}, { merge: true }", a);
  if (a < 0 || b < 0) throw new Error("削除の上書きが見つかりません");
  return t.slice(a, b + 1);
}
const TEAMS = extractTeams(SRC), SCRUB = extractScrub(SRC);

function boot(db, uid, state) {
  const window = { KAKI_CONFIG: {}, _s: JSON.parse(JSON.stringify(state || {})), pushes: 0 };
  window.kakiGetState = () => JSON.parse(JSON.stringify(window._s));
  window.kakiSetState = s => { window._s = JSON.parse(JSON.stringify(s)); };
  window.cloudPush = () => { window.pushes++; };
  const body = `
    const { window, db, uid, auth, doc, getDoc, setDoc, getDocs, collection, addDoc, updateDoc, increment, deleteField, writeBatch, runTransaction } = deps;
    const withTimeout = p => p;
    let writeChain = Promise.resolve(), timer = null;
    const write = async () => {};
    ${TEAMS}
    return window.kakiTeams;`;
  const teams = new Function("deps", body)({ window, db, uid, auth: { currentUser: { uid } }, ...fsm });
  return { teams, window };
}

const rules = fs.readFileSync(RULES, "utf8");
const env = await rut.initializeTestEnvironment({ projectId: "demo-kaki-team", firestore: { host: "127.0.0.1", port: 8089, rules } });
await env.clearFirestore();
const put = (col, id, data) => env.withSecurityRulesDisabled(async c => { await fsm.setDoc(fsm.doc(c.firestore(), col, id), data); });
const get = async (col, id) => { let d; await env.withSecurityRulesDisabled(async c => { const s = await fsm.getDoc(fsm.doc(c.firestore(), col, id)); d = s.exists() ? s.data() : null; }); return d; };
const dbOf = uid => env.authenticatedContext(uid, { email: uid + "@example.com" }).firestore();
const team = (name, members, extra) => Object.assign({ name, norm: name.normalize("NFKC").toLowerCase(), kind: "高校", members, visits: {}, visitsTotal: 0, aliases: [], hidden: false, mergedInto: null, createdAt: "2026-10-01T00:00:00.000Z", createdBy: "x" }, extra || {});
const OLD = "2026-10-01";
const user = extra => Object.assign({ points: 30, visits: [OLD], qrDate: OLD, loginDate: OLD, rouletteDate: OLD, claimed: {}, rankBonus: {}, refClaimed: {}, tx: [], email: "u@example.com", name: "" }, extra || {});
const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

console.log("■ 学校の参加・抜ける・削除（" + RULES + "）");

// 1 抜ける: 人数-1 と teamId/team/teamJoinedAt の削除が同時に通る（日付の項目は残る）
await put("kakiapp_teams", "A", team("A高校", 3));
await put("kakiapp_users", "u1", user({ teamId: "A", team: "A高校", teamJoinedAt: "2026-10-02T00:00:00.000Z", teamVisitDay: OLD }));
{ const { teams, window } = boot(dbOf("u1"), "u1", { teamId: "A", team: "A高校" });
  await teams.leave(); const t = await get("kakiapp_teams", "A"), u = await get("kakiapp_users", "u1");
  ok(t.members === 2, "抜ける: 学校の人数 3→2（" + t.members + "）");
  ok(!("teamId" in u) && !("team" in u) && !("teamJoinedAt" in u), "抜ける: クラウドの teamId／team／teamJoinedAt が消える（次の起動で参加中に戻らない）", u);
  ok(u.loginDate === OLD && u.teamVisitDay === OLD && u.points === 30, "抜ける: ほかの項目（日付・teamVisitDay・ポイント）はそのまま");
  ok(!window._s.teamId && !window._s.team, "抜ける: 端末の teamId も消える");
  await teams.leave(true); const t2 = await get("kakiapp_teams", "A");
  ok(t2.members === 2, "もう一度抜けても（クラウドに teamId が無いので）人数は減らない（" + t2.members + "）"); }

// 2 別の学校へ: 前-1・新+1・teamId を1回で
await put("kakiapp_teams", "B", team("B高校", 5));
await put("kakiapp_users", "u2", user({ teamId: "A", team: "A高校" }));
{ const { teams, window } = boot(dbOf("u2"), "u2", { teamId: "A", team: "A高校" });
  const r = await teams.join("B高校", "高校"); const a = await get("kakiapp_teams", "A"), b = await get("kakiapp_teams", "B"), u = await get("kakiapp_users", "u2");
  ok(r.id === "B" && b.members === 6 && a.members === 1 && u.teamId === "B" && u.team === "B高校" && typeof u.teamJoinedAt === "string", "乗り換え: A 2→1・B 5→6・本人 teamId=B（同時）", { r, a: a.members, b: b.members, u });
  ok(window._s.teamId === "B" && window._s.team === "B高校", "乗り換え: 端末も B");
  const again = await teams.join("B高校", "高校"); const b2 = await get("kakiapp_teams", "B");
  ok(again.id === "B" && b2.members === 6, "同じ学校にもう一度参加しても人数は増えない（" + b2.members + "）"); }

// 3 新しい学校を作って参加（作成と teamId を1回で・ルールの create は members==1）
await put("kakiapp_users", "u3", user());
{ const { teams, window } = boot(dbOf("u3"), "u3", {});
  const r = await teams.join("C工業高校", "高校"); const c = await get("kakiapp_teams", r.id), u = await get("kakiapp_users", "u3");
  ok(c && c.members === 1 && c.name === "C工業高校" && u.teamId === r.id && window._s.teamId === r.id, "新しい学校: 作成（1人）と本人の teamId が同時に入る", { c, u }); }

// 4 統合済みの学校に入っていた人が抜ける → 統合先を-1（統合元は 0 のまま）
await put("kakiapp_teams", "M", team("M高校", 0, { mergedInto: "B", hidden: true }));
await put("kakiapp_users", "u4", user({ teamId: "M", team: "M高校" }));
{ const { teams } = boot(dbOf("u4"), "u4", { teamId: "M", team: "M高校" });
  const b0 = (await get("kakiapp_teams", "B")).members; await teams.leave(); const m = await get("kakiapp_teams", "M"), b = await get("kakiapp_teams", "B"), u = await get("kakiapp_users", "u4");
  ok(b.members === b0 - 1 && m.members === 0 && !("teamId" in u), "統合元に残っていた人が抜ける: 統合先 " + b0 + "→" + b.members + "・統合元 0 のまま"); }

// 5 人数 0 の学校から抜けてもマイナスにしない
await put("kakiapp_teams", "Z", team("Z高校", 0));
await put("kakiapp_users", "u5", user({ teamId: "Z", team: "Z高校" }));
{ const { teams } = boot(dbOf("u5"), "u5", { teamId: "Z" }); await teams.leave(); const z = await get("kakiapp_teams", "Z"), u = await get("kakiapp_users", "u5");
  ok(z.members === 0 && !("teamId" in u), "人数 0 の学校: 0 のまま・teamId は消える"); }

// 6 アカウント削除の流れ: 端末に teamId が無くても leave(true) でクラウドを見て抜ける → 本人の delete はルールで拒否 → merge の上書きは通る
await put("kakiapp_teams", "D", team("D高校", 4));
await put("kakiapp_users", "u6", user({ teamId: "D", team: "D高校", nickname: "ニック", mailOptIn: true, points: 120, tx: [{ d: "x", label: "y", points: 1 }] }));
{ const db = dbOf("u6"); const { teams } = boot(db, "u6", {});
  await teams.leave(true); const d = await get("kakiapp_teams", "D");
  ok(d.members === 3, "削除: 端末に teamId が無くてもクラウドの D を 4→3（" + d.members + "）");
  let delOk = true; try { await fsm.deleteDoc(fsm.doc(db, "kakiapp_users", "u6")); } catch (e) { delOk = false; }
  ok(!delOk, "削除: 本人による会員データの delete は今のルールでは拒否（isAdmin のみ）");
  let oldOk = true; try { await fsm.setDoc(fsm.doc(db, "kakiapp_users", "u6"), { deleted: true, points: 0, tx: [], updatedAt: new Date().toISOString() }); } catch (e) { oldOk = false; }
  ok(!oldOk, "削除: 直す前の置き換え set（日付の項目を消す）はルールに拒否される");
  const scrub = new Function("deleteField", "return (" + SCRUB + ");")(fsm.deleteField);
  let newOk = true; try { await fsm.setDoc(fsm.doc(db, "kakiapp_users", "u6"), scrub, { merge: true }); } catch (e) { newOk = false; console.log("    " + (e.code || e.message)); }
  const u = await get("kakiapp_users", "u6");
  ok(newOk && u.deleted === true && u.points === 0 && u.tx.length === 0 && u.email === "" && !("nickname" in u) && !("teamId" in u) && u.mailOptIn === false, "削除: 直した merge の上書きは通る（ポイント0・履歴・メール・ニックネーム・学校を消す）", u); }

// 7 参加の直後に今日の分を学校へ+1（teamVisitOk はクラウドの teamId を見る）＝参加と teamId が同時に入っていれば通る
await put("kakiapp_teams", "E", team("E高校", 1));
await put("kakiapp_users", "u7", user({ visits: [OLD, jstToday()], qrDate: jstToday() }));
{ const { teams } = boot(dbOf("u7"), "u7", { visits: [OLD, jstToday()] });
  await teams.join("E高校", "高校"); let vOk = true; try { await teams.visit("nagaoka", jstToday()); } catch (e) { vOk = false; console.log("    " + (e.code || e.message)); }
  const e = await get("kakiapp_teams", "E");
  ok(vOk && e.members === 2 && e.visitsTotal === 1, "参加直後の今日の+1 がルールを通る（members " + e.members + "・visitsTotal " + e.visitsTotal + "）"); }

await env.cleanup();
console.log("\n結果: OK " + pass + " / NG " + fail);
process.exit(fail ? 1 : 0);
