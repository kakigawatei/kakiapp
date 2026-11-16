// 式の数（1回の判定で 1000 まで）の余裕を測る。使い方: node margin.mjs <rules> <old|new> [試験名の正規表現 …]
//   会員データの判定の先頭にむだな比較（t == t）を K 個足した写しで同じ試験を流し、通る最大の K を二分探索で出す。K が大きいほど余裕がある（K=0 でも通らない＝ -1）
//   Firestore エミュレータが要る（FIRESTORE_EMULATOR_HOST）
import { spawnSync } from "node:child_process";
const [RULES, LABEL, ...names] = process.argv.slice(2);
const list = names.length ? names : ["^L04", "^L05", "^L06", "^L08", "^L09", "^L14", "^L15", "^L18", "^L19", "^L20", "^L24", "^L26", "^L27", "^L34", "^L37", "^L38", "^L39", "^L40", "^X01"];
const run = (only, pad) => { const r = spawnSync(process.execPath, ["rules_test.mjs", RULES, LABEL], { env: Object.assign({}, process.env, { ONLY: only, PAD: String(pad), PADEXPR: process.env.PADEXPR || "1 == 1" }), encoding: "utf8" }); return /^OK +通った/m.test(r.stdout); };
for (const only of list) {
  let lo = -1, hi = 200;
  if (run(only, 0)) { lo = 0; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (run(only, mid)) lo = mid; else hi = mid; } }
  console.log(LABEL + " " + only.replace("^", "") + " 余裕 K=" + lo);
}
