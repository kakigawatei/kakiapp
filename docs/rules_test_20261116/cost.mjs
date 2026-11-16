// ルールの式が「1000式の上限」のうち何式ぶん使うかを測る小道具（エミュレータ用）。使い方: node cost.mjs
//   1つの allow に「測りたい式 && むだな比較 N 個」を書き、通る最大の N を二分探索 → 何も足さないときとの差＝その式の重さ（単位＝ 1 == 1 の比較1個ぶん）
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const mk = (expr, n) => { const a = Math.floor(n / 10), b = n % 10; const pads = Array(a).fill("p10()").concat(Array(b).fill("1 == 1")); return `rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
  function p10() { return 1 == 1 && 1 == 1 && 1 == 1 && 1 == 1 && 1 == 1 && 1 == 1 && 1 == 1 && 1 == 1 && 1 == 1 && 1 == 1; }
  function f1(x) { return x; }
  function f3(x, y, z) { return x; }
  function ymd(ts) { return string(ts.year()) + "-" + (ts.month() < 10 ? "0" : "") + string(ts.month()) + "-" + (ts.day() < 10 ? "0" : "") + string(ts.day()); }
  function rankMin(k) { return k == "silver" ? 5 : (k == "gold" ? 15 : (k == "rainbow" ? 40 : (k == "king" ? 100 : (k == "founder" ? 200 : 100000000)))); }
  function wl(n, o) { let c = n.diff(o).affectedKeys(); let t = 1; return ${expr.startsWith("LET:") ? expr.slice(4) : "true"}; }
  match /bench/{id} { allow write: if ${expr.startsWith("LET:") ? "wl(request.resource.data, resource.data)" : expr}${pads.length ? " && " + pads.join(" && ") : ""}; }
} }`; };
let k = 0;
async function passes(expr, n) {
  const env = await initializeTestEnvironment({ projectId: "demo-cost", firestore: { rules: mk(expr, n), host, port: Number(port) } });
  const id = "d" + (++k);
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "bench", id), { a: {}, m: { x: 1, y: 2 }, v: ["2026-01-01", "2026-01-02"], s: "z", big: Object.fromEntries(Array.from({ length: 60 }, (_, i) => ["k" + i, i])) }));
  let ok = true;
  try { await setDoc(doc(env.authenticatedContext("u").firestore(), "bench", id), { a: {}, m: { x: 1, y: 2, k: 3 }, v: ["2026-01-01", "2026-01-02", "2026-01-03"], s: "z", q: 1, big: Object.fromEntries(Array.from({ length: 60 }, (_, i) => ["k" + i, i])) }); } catch (e) { ok = false; }
  await env.cleanup(); return ok;
}
async function maxN(expr) { if (!(await passes(expr, 0))) return -1; let lo = 0, hi = 900; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await passes(expr, mid)) lo = mid; else hi = mid; } return lo; }
const exprs = process.argv.slice(2).length ? process.argv.slice(2) : [
  "true", "1 == 1", "f1(1) == 1", "f3(1, 2, 3) == 1", '"q" in request.resource.data', 'request.resource.data.get("a", {}) == {}', 'request.resource.data.s == "z"',
  'request.resource.data.diff(resource.data).affectedKeys().hasAny(["q"])', 'request.resource.data.diff(resource.data).affectedKeys().hasAny(["q", "b", "c", "d", "e", "f"])',
  'ymd(request.time) != "x"', 'request.resource.data.m.keys().removeAll(resource.data.m.keys())[0] == "k"', 'request.resource.data.big == resource.data.big', 'request.resource.data.m != resource.data.m',
  'rankMin("founder") == 200', 'rankMin("silver") == 5', '(1 == 2 ? 1 : 0) + (1 == 2 ? 1 : 0) == 0', 'request.resource.data.v.size() == resource.data.v.size() + 1',
  'LET:"q" in c', 'LET:"q" in c && "q" in c && "q" in c', 'LET:t == 1 && t == 1 && t == 1', '(request.time + duration.value(9, "h")).hours() >= 0', 'request.resource.data.m.diff(resource.data.m).affectedKeys().size() == 1',
];
const base = await maxN("true");
console.log("何も足さないとき N=" + base);
for (const e of exprs) { const n = await maxN(e); console.log(String(n < 0 ? "×" : base - n).padStart(5) + "  " + e); }
process.exit(0);
