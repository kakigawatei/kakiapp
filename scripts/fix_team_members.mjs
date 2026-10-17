// 学校対抗: 学校（kakiapp_teams）の参加人数 members を、実際の人数（kakiapp_users の teamId がその学校の人の数）に合わせる 2026-10-17
// 使い方（Windows から。Mac の Chrome（127.0.0.1:9224・admin.html に運営でログイン済み）の中で動かす。Mac にファイルは作らない）:
//   node scripts/fix_team_members.mjs                      … 全部の学校の「members／実際の人数」を表示するだけ（id 確認用・書かない）
//   node scripts/fix_team_members.mjs <チームid> [<id>...]   … 指定の学校を読むだけ（--dry と同じ・既定）
//   node scripts/fix_team_members.mjs <チームid> ... --write … 指定の学校の members を実際の人数に書き換える（運営アカウントの updateDoc・1つの batch）
// どの実行でも、前の値・書いた値・別に読み直した値を表示し、docs/team_members_fix_log.md に1回分を追記する
// チーム id は完全な id（20文字）で渡す。統合済み（mergedInto あり）・見つからない学校は書かない
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG = path.join(APP, "docs", "team_members_fix_log.md");
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const IDS = args.filter(a => !a.startsWith("--"));
const bad = IDS.filter(x => !/^[A-Za-z0-9]{20}$/.test(x));
if (bad.length) { console.log("チーム id は20文字の英数字で: " + bad.join(", ")); process.exit(2); }
if (WRITE && !IDS.length) { console.log("--write はチーム id を指定したときだけ"); process.exit(2); }

const base = "http://127.0.0.1:9224"; const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = "https://kakigawatei.github.io/kakiapp/admin.html";
let open;
try { open = await (await fetch(base + "/json/new?" + URL + "?v=" + Date.now(), { method: "PUT" })).json(); }
catch (e) { console.log("Mac の Chrome（127.0.0.1:9224）につながりません: " + (e.message || e)); process.exit(2); }
const ws = new WebSocket(open.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? "EXC:" + (r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails)) : r.result?.result?.value; };
const close = async () => { try { await fetch(base + "/json/close/" + open.id); } catch (_) {} try { ws.close(); } catch (_) {} };
await new Promise(r => ws.onopen = r); await send("Page.enable"); await send("Runtime.enable");
await sleep(6000);
let ok = false; for (let i = 0; i < 10; i++) { ok = (await ev(`!document.getElementById("app").classList.contains("hidden")`)) === true; if (ok) break; await sleep(1500); }
if (!ok) { console.log("LOGIN_REQUIRED（Mac の Chrome で admin.html に運営アカウントでログインしてから、もう一度）"); await close(); process.exit(2); }

const raw = await ev(`(async () => {
  const WRITE = ${JSON.stringify(WRITE)}, IDS = ${JSON.stringify(IDS)};
  const m = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const am = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  const db = m.getFirestore(), me = am.getAuth().currentUser;
  const countOf = async tid => (await m.getDocsFromServer(m.query(m.collection(db, "kakiapp_users"), m.where("teamId", "==", tid)))).size;
  const readOne = async tid => {
    const s = await m.getDocFromServer(m.doc(db, "kakiapp_teams", tid));
    if (!s.exists()) return { id: tid, missing: true };
    const d = s.data();
    return { id: tid, name: d.name, members: d.members === undefined ? null : d.members, actual: await countOf(tid), mergedInto: d.mergedInto || null, hidden: !!d.hidden };
  };
  if (!IDS.length) {
    const ts = (await m.getDocsFromServer(m.collection(db, "kakiapp_teams"))).docs;
    const us = (await m.getDocsFromServer(m.query(m.collection(db, "kakiapp_users"), m.where("teamId", ">", "")))).docs.map(d => d.data().teamId);
    const cnt = {}; us.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
    return JSON.stringify({ me: me && me.uid.slice(-4), list: ts.map(d => ({ id: d.id, name: d.data().name, members: d.data().members || 0, actual: cnt[d.id] || 0, mergedInto: d.data().mergedInto || null, hidden: !!d.data().hidden })) });
  }
  const before = []; for (const t of IDS) before.push(await readOne(t));
  let done = null;
  if (WRITE) {
    const b = m.writeBatch(db), wrote = [];
    for (const r of before) { if (r.missing || r.mergedInto) continue; if (r.members === r.actual) continue; b.update(m.doc(db, "kakiapp_teams", r.id), { members: r.actual }); wrote.push({ id: r.id, members: r.actual }); }
    try { if (wrote.length) await b.commit(); done = { wrote, at: new Date().toISOString() }; } catch (e) { done = { error: String(e.code || e.message), at: new Date().toISOString() }; }
  }
  const after = []; for (const t of IDS) after.push(await readOne(t));   /* 別の読み直し（サーバーから・数え直しも） */
  return JSON.stringify({ me: me && me.uid.slice(-4), before, done, after });
})()`);
await close();
if (typeof raw !== "string" || raw.startsWith("EXC:")) { console.log("失敗: " + raw); process.exit(1); }
const r = JSON.parse(raw);
const now = new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19) + " JST";
let lines;
if (r.list) {
  console.log("運営ログイン …" + r.me + "（読むだけ・全部の学校）");
  r.list.sort((a, b) => (b.actual - b.members !== 0) - (a.actual - a.members !== 0) || String(a.name).localeCompare(String(b.name), "ja"));
  for (const t of r.list) console.log((t.members !== t.actual ? "≠ " : "  ") + t.id + "  " + t.name + "  members=" + t.members + "  実際=" + t.actual + (t.mergedInto ? "  （統合済み→" + t.mergedInto + "）" : "") + (t.hidden ? "  非表示" : ""));
  const diff = r.list.filter(t => t.members !== t.actual);
  lines = ["", "## " + now + " 一覧（読むだけ）", "- 運営ログイン …" + r.me + "・学校 " + r.list.length + " 件・members と実際の人数が違う " + diff.length + " 件"].concat(diff.map(t => "  - " + t.id + " " + t.name + ": members " + t.members + " / 実際 " + t.actual + (t.mergedInto ? "（統合済み）" : "")));
} else {
  console.log("運営ログイン …" + r.me + "（" + (WRITE ? "書き込み" : "読むだけ --dry") + "）");
  const row = (b, a) => b.missing ? b.id + "  見つからない" : b.id + "  " + b.name + "  前 members=" + b.members + "（実際 " + b.actual + "）" + (b.mergedInto ? "  統合済み→" + b.mergedInto + "（書かない）" : "") + "  →  読み直し members=" + (a && a.members) + "（実際 " + (a && a.actual) + "）" + (a && !a.missing && a.members === a.actual ? "  一致" : "  不一致");
  r.before.forEach((b, i) => console.log(row(b, r.after[i])));
  if (WRITE) console.log(r.done && r.done.error ? "書き込み失敗: " + r.done.error : "書いた: " + JSON.stringify(r.done && r.done.wrote));
  else console.log("（--dry: 書いていない。--write を付けると「前 members」を「実際」に書き換える）");
  lines = ["", "## " + now + " " + (WRITE ? "書き込み（--write）" : "読むだけ（--dry）"), "- 運営ログイン …" + r.me]
    .concat(r.before.map((b, i) => "- " + row(b, r.after[i])))
    .concat(WRITE ? ["- " + (r.done && r.done.error ? "書き込み失敗: " + r.done.error : "書いた: " + JSON.stringify(r.done && r.done.wrote) + "（" + (r.done && r.done.at) + "）")] : []);
}
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, "# 学校の参加人数（members）の直し 記録\n\n`scripts/fix_team_members.mjs` を動かすたびに1回分を追記する（前の値・書いた値・別の読み直し）。\n");
fs.appendFileSync(LOG, lines.join("\n") + "\n");
console.log("記録: " + LOG);
