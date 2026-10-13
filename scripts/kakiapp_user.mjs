// admin.html（Mac Chrome 9224・admin でログイン済み）の中で Firestore を直接読む／書く
//   node kakiapp_user.mjs get <email>
//   node kakiapp_user.mjs apply <email> <jsonPatchFile>   ← {set:{...}} を merge で書く（配列は置き換え）
import fs from "node:fs";
const base = "http://127.0.0.1:9224"; const sleep = ms => new Promise(r => setTimeout(r, ms));
const [mode, email, patchFile] = process.argv.slice(2);
const URL = "https://kakigawatei.github.io/kakiapp/admin.html";
const open = await (await fetch(base + "/json/new?" + URL + "?v=" + Date.now(), { method: "PUT" })).json();
const ws = new WebSocket(open.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? "EXC:" + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result?.result?.value; };
await new Promise(r => ws.onopen = r); await send("Page.enable"); await send("Runtime.enable");
await send("Page.setBypassCSP", { enabled: true });
await sleep(6000);
let loggedIn = false;
for (let i = 0; i < 10; i++) { loggedIn = (await ev(`!document.getElementById("app").classList.contains("hidden")`)) === true; if (loggedIn) break; await sleep(1500); }
if (!loggedIn) { console.log("LOGIN_REQUIRED"); await fetch(base + "/json/close/" + open.id); ws.close(); process.exit(2); }
const lib = `const A = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"); const F = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"); const db = F.getFirestore(A.getApp());`;
const find = `${lib} const q = F.query(F.collection(db, "kakiapp_users"), F.where("email", "==", ${JSON.stringify(email)})); const s = await F.getDocs(q); const out = []; s.forEach(d => out.push({ id: d.id, data: d.data() }));`;
if (mode === "get") {
  const r = await ev(`(async () => { ${find} return JSON.stringify(out); })()`);
  console.log(r);
} else if (mode === "apply") {
  const patch = JSON.parse(fs.readFileSync(patchFile, "utf8"));
  const r = await ev(`(async () => { ${find} if (out.length !== 1) return "NOT_ONE:" + out.length; const ref = F.doc(db, "kakiapp_users", out[0].id); await F.setDoc(ref, ${JSON.stringify(patch.set)}, { merge: true }); const after = await F.getDoc(ref); return JSON.stringify({ id: out[0].id, after: after.data() }); })()`);
  console.log(r);
}
await fetch(base + "/json/close/" + open.id); ws.close();
