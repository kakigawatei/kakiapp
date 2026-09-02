// ネイティブアプリ（iOS/Android）に載せる www/ を作る。
// Capacitorはwebディレクトリを丸ごと端末に同梱するので、配布物だけを集める。
const fs = require("fs"), path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "www");
const FILES = ["index.html", "auth.js", "config.js", "kintsugi-repair.css"];
const DIRS = ["assets"];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
for (const d of DIRS) fs.cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true });

const n = FILES.length + DIRS.reduce((a, d) => a + fs.readdirSync(path.join(OUT, d)).length, 0);
console.log("www/ を作りました（" + n + " 件）");
