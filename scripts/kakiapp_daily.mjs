// かきあつめアプリ 日次レポート（2026-09-22 masa「ダウンロード状況・来店状況・ポイント付与状況のレポートを毎日」）
// Mac Chrome（9224・kakigawatei@gmail.com＝運営でログイン済み）で admin.html を開き、そのページの Firebase 経由で
// kakiapp_users / kakiapp_teams を読んで集計する（ルール上 users は運営しか読めない）。
//   node kakiapp_daily.mjs [YYYY-MM-DD(対象日・既定=昨日 JST)] [base-url]   → 標準出力に本文、/tmp/kakiapp_daily.json に数字
// 動かす場所: Windows の cron（毎朝 9:00）→ scp して ssh mac 'node /tmp/kakiapp_daily.mjs' → ずんだ部屋へ貼る
import fs from "node:fs";
const base = "http://127.0.0.1:9224"; const sleep = ms => new Promise(r => setTimeout(r, ms));
const JST = d => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const now = new Date(); const yday = JST(new Date(now.getTime() - 86400 * 1000));
const ARGS = process.argv.slice(2).filter(x => !x.startsWith("--"));
const DAY = ARGS[0] || yday; const URL = ARGS[1] || "https://kakigawatei.github.io/kakiapp/admin.html";
const open = await (await fetch(base + "/json/new?" + URL + "?v=" + Date.now(), { method: "PUT" })).json();
const ws = new WebSocket(open.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? "EXC:" + (r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails)) : r.result?.result?.value; };
const bye = async (code) => { try { await fetch(base + "/json/close/" + open.id); } catch {} ws.close(); process.exit(code); };
await new Promise(r => ws.onopen = r); await send("Page.enable"); await send("Runtime.enable");
await sleep(6000);
let loggedIn = false;
for (let i = 0; i < 10; i++) { loggedIn = (await ev(`!document.getElementById("app").classList.contains("hidden")`)) === true; if (loggedIn) break; await sleep(1500); }
if (!loggedIn) { console.log("LOGIN_REQUIRED", URL); await bye(2); }
/* ページ内で集計（データは外に出さず数字だけ返す） */
const raw = await ev(`(async () => {
  const m = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const db = m.getFirestore();
  const DAY = ${JSON.stringify(DAY)}; const MON = DAY.slice(0, 7);
  const toJstDay = s => { if (!s) return ""; const d = new Date(s.length <= 16 ? s.replace(" ", "T") + ":00Z" : s); return isNaN(d) ? String(s).slice(0, 10) : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10); };
  const us = (await m.getDocs(m.collection(db, "kakiapp_users"))).docs.map(d => ({ id: d.id, ...d.data() })).filter(u => !u.deleted);
  const ts = (await m.getDocs(m.collection(db, "kakiapp_teams"))).docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.hidden && !t.mergedInto);
  const r = { day: DAY, users: us.length, newUsers: 0, newUsersMonth: 0, visitsDay: 0, visitsMonth: 0, visitsTotal: 0, visitorsDay: 0,
              storeDay: {}, storeTotal: {}, pointsDay: {}, pointsDayTotal: 0, spentDay: 0, pointsMonthTotal: 0, balanceTotal: 0, activeMonth: 0,
              teams: ts.length, teamMembers: 0, teamTop: [] };
  const cat = l => /ガチャ/.test(l) ? "ガチャ" : /ルーレット/.test(l) ? "ルーレット" : /ログイン/.test(l) ? "ログイン" : /来店/.test(l) ? "来店" : /キャンペーン|プレゼント/.test(l) ? "キャンペーン" : /ランク/.test(l) ? "ランク" : /学校|シーズン|対抗/.test(l) ? "学校対抗" : /つか|使|交換|引換/.test(l) ? "つかう" : "その他";
  for (const u of us) {
    const c = toJstDay(u.createdAt); if (c === DAY) r.newUsers++; if (c.startsWith(MON)) r.newUsersMonth++;
    const vs = Array.isArray(u.visits) ? u.visits : []; r.visitsTotal += vs.length;
    const vd = vs.filter(v => v === DAY).length; r.visitsDay += vd; if (vd) r.visitorsDay++;
    r.visitsMonth += vs.filter(v => String(v).startsWith(MON)).length;
    if (vs.some(v => String(v).startsWith(MON))) r.activeMonth++;
    if (u.lastStoreAt === DAY && u.lastStore) r.storeDay[u.lastStore] = (r.storeDay[u.lastStore] || 0) + 1;
    for (const [k, n] of Object.entries(u.storeVisits || {})) r.storeTotal[k] = (r.storeTotal[k] || 0) + (Number(n) || 0);
    r.balanceTotal += Number(u.points) || 0;
    for (const t of (u.tx || [])) { const d = toJstDay(t.d); const p = Number(t.points) || 0; if (d.startsWith(MON) && p > 0) r.pointsMonthTotal += p;
      if (d !== DAY) continue; if (p < 0) { r.spentDay += -p; continue; } const k = cat(String(t.label || "")); r.pointsDay[k] = (r.pointsDay[k] || 0) + p; r.pointsDayTotal += p; }
  }
  for (const t of ts) r.teamMembers += Number(t.members) || 0;
  r.teamTop = ts.map(t => ({ name: t.name, kind: t.kind, members: t.members || 0, v: (t.visits || {})[MON] || 0 })).sort((a, b) => b.v - a.v).slice(0, 3);
  return JSON.stringify(r);
})()`);
if (typeof raw !== "string" || raw.startsWith("EXC:")) { console.log("ERROR", raw); await bye(1); }
const r = JSON.parse(raw); fs.writeFileSync("/tmp/kakiapp_daily.json", JSON.stringify(r, null, 1));
const STORE = { nagaoka: "長岡本店", sendai: "仙台", kakigawatei: "長岡本店", kakigawatei_sendai: "仙台" };
const sn = k => STORE[k] || k; const fmt = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => sn(k) + " " + v).join("・") || "なし";
const lines = [
  `📊 かきあつめアプリ 日報（${r.day} 分）`,
  `登録者：累計 ${r.users} 人（${r.day} の新規 ${r.newUsers} 人／今月 ${r.newUsersMonth} 人）`,
  `来店：${r.day} ${r.visitsDay} 回（${r.visitorsDay} 人）／今月 ${r.visitsMonth} 回／累計 ${r.visitsTotal} 回　店舗別（当日）: ${fmt(r.storeDay)}`,
  `　店舗別 累計: ${fmt(r.storeTotal)}　今月来店ありの人: ${r.activeMonth} 人`,
  `ポイント：${r.day} 付与 ${r.pointsDayTotal} P（${fmt(r.pointsDay)}）／使用 ${r.spentDay} P／今月付与 ${r.pointsMonthTotal} P／残高合計 ${r.balanceTotal} P`,
  `学校対抗：${r.teams} 校・${r.teamMembers} 人` + (r.teamTop.length ? `　今月トップ: ` + r.teamTop.map(t => `${t.name}(${t.kind}) ${t.v}回`).join("／") : ""),
];
console.log(lines.join("\n"));
await bye(0);
