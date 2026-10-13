// Mac の Chrome(9224) で、アプリ版と同じ認証経路（?nativeauth=1 = initializeAuth+indexedDB）を実ブラウザで再現し、
// デモアカウントでログイン→ポイント読み込みまでの経過とコンソールエラーを出す。Node 24 の組み込み WebSocket を使う。
// 使い方: node cdp_nativeauth_test.mjs <email> <password>
const [email, pass] = process.argv.slice(2);
const URL_ = "https://kakigawatei.github.io/kakiapp/?nativeauth=1&t=" + Date.now();
const t = await (await fetch("http://127.0.0.1:9224/json/new?" + encodeURIComponent(URL_), { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning"))
    logs.push("[console." + m.params.type + "] " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  if (m.method === "Runtime.exceptionThrown") logs.push("[exception] " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") logs.push("[log] " + m.params.entry.text.slice(0, 300));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await new Promise(r => ws.onopen = r);
await send("Runtime.enable"); await send("Log.enable");
await sleep(6000);
const gate = () => evalJs(`(() => { const q = id => document.getElementById(id); const vis = id => q(id) && getComputedStyle(q(id)).display !== "none";
  return JSON.stringify({ signin: vis("gSignin"), loading: vis("gLoading"), msg: q("gLoadMsg") && q("gLoadMsg").textContent, retry: vis("gRetry"), bal: q("bal") && q("bal").textContent, gateVisible: q("gate") ? getComputedStyle(q("gate")).display : "n/a" }); })()`);
console.log("after load:", await gate());
if (email) {
  await evalJs(`document.getElementById("gEmail").value = ${JSON.stringify(email)}; document.getElementById("gPass").value = ${JSON.stringify(pass)}; document.getElementById("btnSignin") ? document.getElementById("btnSignin").click() : (document.querySelector("#gSignin button.primary") || document.querySelector("#gSignin button")).click(); "clicked"`);
  for (const s of [3, 6, 10, 15, 20]) { await sleep(s === 3 ? 3000 : 4000); console.log("t+" + s + "s:", await gate()); }
}
console.log("console/exceptions:", logs.length ? "\n" + logs.join("\n") : "(none)");
await send("Runtime.evaluate", { expression: "window.close()" }).catch(() => {});
try { await fetch("http://127.0.0.1:9224/json/close/" + t.id); } catch {}
ws.close();
