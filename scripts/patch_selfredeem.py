# -*- coding: utf-8 -*-
"""つかう画面をセルフ引換（券売機の前で完結・スタッフ操作なし）に置き換える"""
import io, re
P = "index.html"
s = io.open(P, encoding="utf-8").read()

# ---- HTML: スタッフ確認カード → 引換券カード ----
old_html = s[s.index('    <div class="card staff" id="payConfirm"'):s.index('  </main>\n</section>\n\n<!-- 演出 -->')]
new_html = '''    <div class="card staff" id="payConfirm" style="display:none">
      <p style="font-size:12px;letter-spacing:.2em;color:#ffe9a8">引換券（券売機の前で）</p>
      <div id="rdName" style="font-size:22px;font-weight:800;margin:6px 0 2px">油そば 並盛</div>
      <div class="amt"><span id="payAmt2">0</span>P</div>
      <div style="background:#fff;color:var(--navy);border-radius:12px;padding:10px 12px;margin:10px 0">
        <div style="font-size:11px;letter-spacing:.2em">引換番号</div>
        <div id="rdCode" style="font-size:40px;font-weight:900;letter-spacing:.12em;line-height:1.1">0000</div>
        <div style="font-size:12px;margin-top:4px"><span id="rdAt">--:--</span> 発行　のこり <b id="rdLeft">10:00</b></div>
      </div>
      <ol style="text-align:left;font-size:13px;line-height:1.6;margin:0 0 10px;padding-left:20px">
        <li>券売機の <b>「アプリ引換」</b> ボタンを押して食券を出す</li>
        <li>いつも通り食券を渡す（この画面は見せるだけでOK）</li>
      </ol>
      <p class="muted" style="font-size:11px;color:#cfd6e6;margin:0 0 12px">ポイントはもう引かれています。同じ番号は1回だけ使えます。</p>
      <button class="ghost" id="btnPayCancel" style="border-color:#fff;color:#fff">閉じる</button>
    </div>
'''
s = s.replace(old_html, new_html)

# 目安 → タップで選べる
s = s.replace('<h2>交換の目安</h2>', '<h2>タップで選ぶ</h2>')

# ---- JS ----
old_js = s[s.index('document.getElementById("catalog").innerHTML = C.itemCatalog'):s.index('/* 開発モード: タイトルを7回タップで出現 */')]
new_js = '''document.getElementById("catalog").innerHTML = C.itemCatalog
  .map(x => `<div class="itemrow" data-pts="${x.points}" data-name="${x.name}" style="cursor:pointer"><span>${x.name}</span><span class="pt">${x.points}P</span></div>`).join("");
let payName = "";
document.querySelectorAll("#catalog .itemrow").forEach(el => {
  el.onclick = () => { pay = +el.dataset.pts; payName = el.dataset.name; document.getElementById("payAmt").textContent = pay; };
});
/* 引換券（セルフ引換・スタッフ操作なし）: 発行から10分だけ表示。閉じても10分以内なら「つかう」で再表示 */
let rdTimer = null;
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function showRedeem(r) {
  document.getElementById("rdName").textContent = r.name || (r.pts + "P分");
  document.getElementById("payAmt2").textContent = r.pts;
  document.getElementById("rdCode").textContent = r.code;
  const at = new Date(r.at);
  document.getElementById("rdAt").textContent = pad2(at.getHours()) + ":" + pad2(at.getMinutes());
  document.getElementById("payInput").style.display = "none";
  document.getElementById("payConfirm").style.display = "block";
  clearInterval(rdTimer);
  const tick = () => {
    const left = Math.max(0, 600 - Math.floor((Date.now() - r.at) / 1000));
    document.getElementById("rdLeft").textContent = Math.floor(left / 60) + ":" + pad2(left % 60);
    if (left <= 0) { clearInterval(rdTimer); store.set({ redeem: null }); hideRedeem(); }
  };
  tick(); rdTimer = setInterval(tick, 1000);
}
function hideRedeem() {
  clearInterval(rdTimer);
  document.getElementById("payInput").style.display = "block";
  document.getElementById("payConfirm").style.display = "none";
}
document.getElementById("btnPayShow").onclick = async () => {
  if (!pay) { alert("使うポイント数を入力するか、メニューをタップしてください"); return; }
  if (pay > (store.s.points || 0)) { alert("ポイントが足りません（残高 " + (store.s.points || 0) + "P）"); return; }
  const nm = payName && C.itemCatalog.some(x => x.points === pay && x.name === payName) ? payName : (pay + "P分");
  const ok = await kakiConfirm("券売機の前で押してください。\\n" + pay + "P を使って「" + nm + "」と交換します。取り消せません。", { okText: "交換する" });
  if (!ok) return;
  const at = Date.now();
  const code = String(1000 + (at % 9000));
  store.set({ points: (store.s.points || 0) - pay, redeem: { code, name: nm, pts: pay, at } });
  logTx("券売機で交換 " + nm + "（" + code + "）", -pay);
  pay = 0; payName = ""; document.getElementById("payAmt").textContent = 0;
  showRedeem(store.s.redeem);
};
document.getElementById("btnPayCancel").onclick = () => { hideRedeem(); show("home"); };
const _showOrig = show;
show = function (page) {
  _showOrig(page);
  if (page === "pay") {
    const r = store.s.redeem;
    if (r && Date.now() - r.at < 600000) showRedeem(r); else hideRedeem();
  }
};

'''
s = s.replace(old_js, new_js)
assert 'btnStaffOk' not in s and 'スタッフ' not in s[s.index('id="page-pay"'):s.index('<!-- 演出 -->')]
io.open(P, "w", encoding="utf-8").write(s)
print("patched")
