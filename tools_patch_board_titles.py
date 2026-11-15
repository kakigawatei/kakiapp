# みんなの一杯の投稿回数で取れる称号（masa 2026-11-15 18:22「そっちにして」）
# 投稿回数＝Firestore の kakiapp_board の本人の doc 数（id＝uid_日付・ルールで当日1件しか作れない）をサーバーで数える。端末の値は使わない
import io, sys
sys.stdout.reconfigure(encoding="utf-8")

def rep(path, old, new, count=1):
    s = io.open(path, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    o, n = (old.replace("\n", "\r\n"), new.replace("\n", "\r\n")) if crlf else (old, new)
    c = s.count(o)
    assert c == count, (path, c, old[:60])
    s = s.replace(o, n)
    io.open(path, "w", encoding="utf-8", newline="").write(s)

# ---- auth.js: 自分の投稿数（サーバーで数える）
rep("auth.js", "orderBy, limit, startAfter, writeBatch, runTransaction } from", "orderBy, limit, startAfter, writeBatch, runTransaction, getCountFromServer } from")
rep("auth.js", "window.kakiBoard = {\n  uid: () => uid,\n",
    "window.kakiBoard = {\n  uid: () => uid,\n"
    "  /* 自分の投稿の数（2026-11-15 称号用）。サーバーで数える＝端末で増やせない。投稿はルールで1日1件（id＝uid_日付）。消した投稿は数えない */\n"
    "  myCount: async () => { if (!uid) return null; const r = await withTimeout(getCountFromServer(query(collection(db, BOARD), where(\"uid\", \"==\", uid))), 8000, \"boardCount\"); return r.data().count; },\n")

# ---- config.js: 段階
rep("config.js", "    points: 15, igBonus: 5, maxChars: 30, hideAfterReports: 2,   // 2026-11-14 masa 🇦: 投稿 15P＋インスタ紹介OK で +5P（計 20P）\n",
    "    points: 15, igBonus: 5, maxChars: 30, hideAfterReports: 2,   // 2026-11-14 masa 🇦: 投稿 15P＋インスタ紹介OK で +5P（計 20P）\n"
    "    // 投稿回数の称号（masa 2026-11-15）。n＝その回数の投稿で取れる。ポイントは付けない。口コミとは無関係\n"
    "    titles: [{ n: 1, name: \"はじめの一杯\" }, { n: 5, name: \"一杯の常連\" }, { n: 10, name: \"一杯の語り部\" }, { n: 30, name: \"一杯の伝道師\" }],\n")

# ---- index.html
H = "index.html"
rep(H, "  #overlay .big { font-family: var(--mincho); font-size: 64px;",
    "  #overlay .big.word { font-size: 34px; line-height: 1.4; text-align: center; padding: 0 20px; }\n"
    "  .bt-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); }\n"
    "  .bt-row:first-child { border-top: none; }\n"
    "  .bt-row .bt-mark { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; background: #f6f3ee; color: #b9ad9c; flex: none; }\n"
    "  .bt-row.got .bt-mark { background: var(--red); color: #fff; }\n"
    "  .bt-row .bt-name { font-family: var(--mincho); font-weight: 700; font-size: 15.5px; }\n"
    "  .bt-row:not(.got) .bt-name { color: #b9ad9c; }\n"
    "  .bt-row .bt-need { margin-left: auto; font-size: 12px; color: var(--muted, #9c9384); }\n"
    "  #overlay .big { font-family: var(--mincho); font-size: 64px;")
rep(H, """    <div class="card" id="refBox" style="display:none">""",
    """    <div class="card" id="bdTitleBox" style="display:none">
      <h2>みんなの一杯の称号</h2>
      <p class="muted" id="bdTitleNow"></p>
      <div id="bdTitleList" style="margin-top:6px"></div>
    </div>
    <div class="card" id="refBox" style="display:none">""")
rep(H, """function celebrate(points, sub) {
  document.getElementById("ovBig").textContent = "+" + points + "P";""",
    """function celebrate(points, sub) {
  /* points が文字なら（称号など）そのまま大きく出す */
  const big = document.getElementById("ovBig"), word = typeof points === "string";
  big.textContent = word ? points : "+" + points + "P"; big.classList.toggle("word", word);""")
rep(H, """  document.getElementById("myBadge").src = r.badge;
""", """  document.getElementById("myBadge").src = r.badge;
  try { btRender(); } catch (e) {}
""")
rep(H, """    if (store.s.boardDate !== t) {
      /* 2026-11-14 masa 🇦: 投稿 15P＋インスタ紹介OK で +5P（チェックは最初は外したまま・自分で入れる） */""",
    """    const cntP = btLoad();   /* 投稿回数の称号: 今の投稿を含めてサーバーで数え直す */
    if (store.s.boardDate !== t) {
      /* 2026-11-14 masa 🇦: 投稿 15P＋インスタ紹介OK で +5P（チェックは最初は外したまま・自分で入れる） */""")
rep(H, """    grBoardShow(postedShop);
    grAfterPost(postedShop);""",
    """    grBoardShow(postedShop);
    const cnt = await cntP, tt = cnt == null ? null : BT.find(x => x.n === cnt);
    if (tt) celebrateNext("称号「" + tt.name + "」", "みんなの一杯 " + cnt + "回目の投稿！");   /* 15P のお祝いを閉じたら出る */
    grAfterPost(postedShop);""")
rep(H, """
/* ---------- Googleマップ口コミ案内（2026-11-15 masa 🇦""",
    """
/* ---------- みんなの一杯の称号（2026-11-15 masa「そっちにして」）----------
 * 投稿回数＝サーバーで数えた本人の投稿の数（kakiBoard.myCount）。端末に回数は持たない（改ざんで増やせない）。
 * 取れた瞬間＝投稿の直後に、数がちょうど段階の回数になったとき celebrateNext で出す。ポイントは付けない */
const BT = (Array.isArray(BC.titles) && BC.titles.length ? BC.titles : [{ n: 1, name: "はじめの一杯" }, { n: 5, name: "一杯の常連" }, { n: 10, name: "一杯の語り部" }, { n: 30, name: "一杯の伝道師" }]).slice().sort((a, b) => a.n - b.n);
let BT_COUNT = null;
async function btLoad() {
  try { const B = window.kakiBoard; if (!B || !B.myCount) return null; const n = await B.myCount(); if (typeof n === "number") { BT_COUNT = n; btRender(); } return n; }
  catch (e) { console.warn("boardCount", e && e.code); return null; }
}
function btRender() {
  const box = document.getElementById("bdTitleBox"); if (!box) return;
  if (BT_COUNT == null) { box.style.display = "none"; return; }
  box.style.display = "";
  const n = BT_COUNT, got = BT.filter(x => n >= x.n), next = BT.find(x => n < x.n);
  document.getElementById("bdTitleNow").textContent = "投稿 " + n + "回" + (got.length ? "・いまの称号「" + got[got.length - 1].name + "」" : "") + (next ? "・次まで あと" + (next.n - n) + "回" : "・すべて取りました！");
  const list = document.getElementById("bdTitleList"); list.textContent = "";
  BT.forEach(x => {
    const row = document.createElement("div"), ok = n >= x.n; row.className = "bt-row" + (ok ? " got" : "");
    const m = document.createElement("div"); m.className = "bt-mark"; m.textContent = ok ? "✓" : "";
    const nm = document.createElement("div"); nm.className = "bt-name"; nm.textContent = x.name;
    const nd = document.createElement("div"); nd.className = "bt-need"; nd.textContent = x.n + "回";
    row.append(m, nm, nd); list.appendChild(row);
  });
}

/* ---------- Googleマップ口コミ案内（2026-11-15 masa 🇦""")
rep(H, """window.kakiStart = function () {
""", """window.kakiStart = function () {
  setTimeout(btLoad, 2500);   /* みんなの一杯の称号（投稿回数をサーバーで数える・裏で） */
""")
print("patched")
