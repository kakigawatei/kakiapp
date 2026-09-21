// 学校対抗 来店バトル: 月初の自動締め。Mac Chrome（9224・kakigawatei@gmail.com でログイン済み）で admin.html を開き、
// 「シーズン設定と締め」の対象月を前月にして「この月を締める」を押す（確認ダイアログは自動で OK）。
//   node season_close.mjs [YYYY-MM] [base-url] --yes   既定: 前月・本番 admin。--yes が無いと確認だけで締めない
//   テスト版: node season_close.mjs 2026-10 https://kakigawatei.github.io/kakiapp-test/admin.html
// 動かす場所: Windows の cron（毎月1日 0:05）→ ssh mac 'node /tmp/season_close.mjs'。admin の Google ログインが切れていたら LOGIN_REQUIRED を出して止まる（masa がその画面でログインすれば次回から通る）
import fs from "node:fs";
const base = "http://127.0.0.1:9224"; const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = new Date(); const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const MONTH = process.argv[2] || (pm.getFullYear() + "-" + String(pm.getMonth() + 1).padStart(2, "0"));
const URL = process.argv[3] || "https://kakigawatei.github.io/kakiapp/admin.html";
const open = await (await fetch(base + "/json/new?" + URL + "?v=" + Date.now(), { method: "PUT" })).json();
const ws = new WebSocket(open.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? "EXC:" + (r.result.exceptionDetails.exception?.description || "").slice(0, 400) : r.result?.result?.value; };
const shot = async f => { const s = await send("Page.captureScreenshot", { format: "jpeg", quality: 60 }); fs.writeFileSync(f, Buffer.from(s.result.data, "base64")); };
await new Promise(r => ws.onopen = r); await send("Page.enable"); await send("Runtime.enable");
/* confirm/alert は自動で OK（締めの確認と、締め直しの確認） */
await send("Page.setBypassCSP", { enabled: true });
await sleep(6000);
await ev(`window.confirm = () => true; window.alert = m => console.log("alert:", m);`);
let loggedIn = false;
for (let i = 0; i < 10; i++) { loggedIn = (await ev(`!document.getElementById("app").classList.contains("hidden")`)) === true; if (loggedIn) break; await sleep(1500); }
if (!loggedIn) { await shot("/tmp/season_close_login.jpg"); console.log("LOGIN_REQUIRED", URL); await fetch(base + "/json/close/" + open.id); ws.close(); process.exit(2); }
console.log("month:", MONTH);
await ev(`(() => { const el = document.getElementById("s-month"); el.value = ${JSON.stringify(MONTH)}; el.dispatchEvent(new Event("change")); })()`);
await sleep(2500);
const smsg = await ev(`document.getElementById("s-msg").textContent`); console.log("season:", smsg);
/* 締め済みの月は自動では締め直さない（受け取り済みの保護・エル監査） */
if (/締め済み/.test(smsg) && !process.argv.includes("--force")) { console.log("ALREADY_CLOSED (use --force to redo)"); await fetch(base + "/json/close/" + open.id); ws.close(); process.exit(3); }
/* 🟥 --yes が無ければ確認だけ（誤って締めない・2026-09-21 の教訓） */
if (!process.argv.includes("--yes")) { console.log("DRY_RUN (add --yes to close)"); await fetch(base + "/json/close/" + open.id); ws.close(); process.exit(0); }
await ev(`document.getElementById("s-close").click()`);
let res = "";
for (let i = 0; i < 60; i++) { await sleep(2000); res = await ev(`document.getElementById("s-close-msg").textContent + " || " + document.getElementById("s-result").innerText`); if (/完了|失敗/.test(res)) break; }
console.log("result:", res);
const js = await ev(`document.getElementById("s-result").dataset.json || ""`); if (js) { fs.writeFileSync("/tmp/season_" + MONTH + ".json", js); console.log("json:", "/tmp/season_" + MONTH + ".json"); }
await shot("/tmp/season_close_done.jpg");
await fetch(base + "/json/close/" + open.id); ws.close();
process.exit(/完了/.test(res) ? 0 : 1);
