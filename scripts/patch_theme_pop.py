# -*- coding: utf-8 -*-
"""アプリの見た目をPOP（白地・墨の太ゴシック・ロゴ赤・実物の丼写真）に寄せる（masa 2026-09-06 00:02）
   ①テーマ（色・文字・ヒーロー） ②ルーレットとガチャを白黒赤の描画演出に（動画は使わない）"""
import io, re
P = "index.html"
s = io.open(P, encoding="utf-8").read()

# ---------- ① テーマ ----------
old = '''    --cream: #faf3e0; --navy: #172a58; --red: #d43f2f; --ink: #2b2b2b;
    --card: #ffffff; --gold: #c9a227;'''
assert old in s
s = s.replace(old, '''    /* POPと同じ: 白・墨・ロゴの赤（2026-09-06） */
    --cream: #ffffff; --navy: #111111; --red: #ff1717; --ink: #111111;
    --card: #ffffff; --gold: #ff1717; --line: #111111; --gray: #6b6b6b;''')
s = s.replace('body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; background: var(--cream); color: var(--ink); padding-bottom: 76px; }',
              'body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif; background: var(--cream); color: var(--ink); padding-bottom: 76px; -webkit-font-smoothing: antialiased; }')
s = s.replace('header h1 { font-size: 18px; color: var(--navy); letter-spacing: .04em; }',
              'header h1 { font-size: 22px; color: var(--ink); letter-spacing: .06em; font-weight: 900; }')
s = s.replace('.balance { background: var(--navy); color: #fff; border-radius: 999px; padding: 6px 14px; font-weight: 700; }',
              '.balance { background: #111; color: #fff; border-radius: 999px; padding: 6px 14px; font-weight: 900; }')
# ヒーロー＝カードと同じ絵（白地・巨大ポイ活・実物の丼）
old = '''  .hero { margin: 4px 16px 12px; border-radius: 16px; overflow: hidden; background: #f6ecd2; }
  .hero img { width: 100%; display: block; }'''
assert old in s
s = s.replace(old, '''  .hero { position: relative; margin: 0 0 8px; aspect-ratio: 91/48; overflow: hidden; background: #fff; }
  .hero .bh { position: absolute; left: 50%; top: 4%; transform: translateX(-50%); font-size: 36vw; font-weight: 900; letter-spacing: -.04em; line-height: 1; white-space: nowrap; color: #111; }
  .hero .bowl { position: absolute; left: 16%; top: 30%; width: 38%; filter: drop-shadow(0 6px 10px rgba(0,0,0,.16)); }
  .hero .haji { position: absolute; right: 5%; bottom: 4%; font-size: 4.8vw; font-weight: 900; letter-spacing: .06em; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 5px #fff; }
  @media (min-width: 520px) { .hero .bh { font-size: 187px } .hero .haji { font-size: 25px } }''')
s = s.replace('  .card { background: var(--card); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }',
              '  .card { background: var(--card); border: 2px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }')
s = s.replace('  .card h2 { font-size: 15px; color: var(--navy); margin-bottom: 8px; }',
              '  .card h2 { font-size: 16px; color: var(--ink); margin-bottom: 8px; font-weight: 900; letter-spacing: .02em; }')
s = s.replace('  .muted { color: #888; font-size: 12px; }', '  .muted { color: var(--gray); font-size: 12px; }')
s = s.replace('  .rankline .badge { width: 44px; height: 44px; border-radius: 50%; background: var(--cream); display: flex; align-items: center; justify-content: center; font-size: 22px; }',
              '  .rankline .badge { width: 44px; height: 44px; border-radius: 50%; background: #fff; border: 2px solid #111; display: flex; align-items: center; justify-content: center; font-size: 22px; }')
s = s.replace('  .bar { height: 8px; background: #eee4c8; border-radius: 4px; overflow: hidden; margin-top: 4px; }',
              '  .bar { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-top: 4px; }')
s = s.replace('  button.primary { width: 100%; padding: 14px; border: none; border-radius: 12px; background: var(--red); color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }',
              '  button.primary { width: 100%; padding: 15px; border: none; border-radius: 12px; background: #111; color: #fff; font-size: 17px; font-weight: 900; letter-spacing: .04em; cursor: pointer; }')
s = s.replace('  button.primary:disabled { background: #ccc; }', '  button.primary:disabled { background: #cfcfcf; }')
s = re.sub(r'  button\.ghost \{ width: 100%; padding: 12px; border: 2px solid var\(--navy\); border-radius: 12px; background: transparent; color: var\(--navy\);',
           '  button.ghost { width: 100%; padding: 12px; border: 2px solid #111; border-radius: 12px; background: #fff; color: #111;', s)
# 称号画面・ログイン・オーバーレイ・ナビ・つかう
s = s.replace('#shogo .cap { font-size: 13px; letter-spacing: .22em; color: #9c9384; margin-bottom: 14px; }', '#shogo .cap { font-size: 13px; letter-spacing: .22em; color: var(--gray); margin-bottom: 14px; }')
s = s.replace('#shogo .name { font-size: 54px; font-weight: 900; color: var(--navy); line-height: 1.1;', '#shogo .name { font-size: 54px; font-weight: 900; color: #111; line-height: 1.1;')
s = s.replace('#shogo .sub { margin-top: 16px; font-size: 13px; color: #7a7266; line-height: 1.9; }', '#shogo .sub { margin-top: 16px; font-size: 13px; color: var(--gray); line-height: 1.9; }')
s = s.replace('border: none; border-radius: 999px; background: var(--navy); color: #fff;\n               font-size: 16px; font-weight: 700; }', 'border: none; border-radius: 999px; background: #111; color: #fff;\n               font-size: 16px; font-weight: 900; }')
s = s.replace('#shogo .up-cap { display: none; font-size: 20px; font-weight: 900; color: #d43f8f;', '#shogo .up-cap { display: none; font-size: 20px; font-weight: 900; color: var(--red);')
s = s.replace('#gate .lead { font-size: 12px; color: #7a7266;', '#gate .lead { font-size: 12px; color: var(--gray);')
s = s.replace('#gate input { width: 100%; padding: 13px 14px; border: 1px solid #ded4b8;', '#gate input { width: 100%; padding: 13px 14px; border: 1.5px solid #111;')
s = s.replace('#gate .sep { display: flex; align-items: center; gap: 10px; color: #b3a892;', '#gate .sep { display: flex; align-items: center; gap: 10px; color: #999;')
s = s.replace('#gate .sep::before, #gate .sep::after { content: ""; flex: 1; height: 1px; background: #e2d8bd; }', '#gate .sep::before, #gate .sep::after { content: ""; flex: 1; height: 1px; background: #ddd; }')
s = s.replace('.btn-google { width: 100%; padding: 13px; border: 1px solid #ded4b8;', '.btn-google { width: 100%; padding: 13px; border: 1.5px solid #111;')
s = s.replace('#gBusy { display: none; text-align: center; color: #7a7266;', '#gBusy { display: none; text-align: center; color: var(--gray);')
s = s.replace('#gate .note { font-size: 10.5px; color: #9c9384;', '#gate .note { font-size: 10.5px; color: var(--gray);')
s = s.replace('#overlay { position: fixed; inset: 0; background: rgba(23,42,88,.86);', '#overlay { position: fixed; inset: 0; background: rgba(0,0,0,.92);')
s = s.replace("#overlay .big { font-size: 52px; font-weight: 800; color: #fff; }", "#overlay .big { font-size: 64px; font-weight: 900; color: #fff; letter-spacing: -.02em; }")
s = s.replace('#overlay .sub { color: #ffe9a8; font-size: 18px; }', '#overlay .sub { color: var(--red); font-size: 20px; font-weight: 900; }')
s = s.replace('#overlay button { padding: 10px 28px; border-radius: 999px; border: none; font-size: 15px; font-weight: 700; }', '#overlay button { padding: 12px 32px; border-radius: 999px; border: none; background: #fff; color: #111; font-size: 15px; font-weight: 900; }')
s = s.replace('.payamount { font-size: 40px; font-weight: 800; text-align: center; color: var(--navy); padding: 8px 0; }', '.payamount { font-size: 44px; font-weight: 900; text-align: center; color: #111; padding: 8px 0; }')
s = s.replace('.numpad button { padding: 14px 0; font-size: 20px; border-radius: 10px; border: 1px solid #ddd; background: #fff; cursor: pointer; }', '.numpad button { padding: 14px 0; font-size: 20px; font-weight: 900; border-radius: 10px; border: 1.5px solid #111; background: #fff; cursor: pointer; }')
s = s.replace('.staff { background: var(--navy); color: #fff; border-radius: 14px; padding: 18px; text-align: center; }', '.staff { background: #111; color: #fff; border-radius: 14px; padding: 18px; text-align: center; }')
s = s.replace('.staff .amt { font-size: 46px; font-weight: 800; color: #ffe9a8; }', '.staff .amt { font-size: 46px; font-weight: 900; color: #fff; }')
s = s.replace("nav { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e8dfc6;", "nav { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 2px solid #111;")
s = s.replace('nav button.on { color: var(--navy); font-weight: 700; }', 'nav button.on { color: #111; font-weight: 900; }')
s = s.replace('#capOverlay { position: fixed; inset: 0; background: rgba(23,42,88,.88);', '#capOverlay { position: fixed; inset: 0; background: rgba(0,0,0,.92);')
s = s.replace('.capsule .top { top: 0; border-radius: 60px 60px 0 0; background: linear-gradient(#e85a4a, #c93b2c); }', '.capsule .top { top: 0; border-radius: 60px 60px 0 0; background: var(--red); border: 3px solid #fff; border-bottom: none; }')
s = s.replace('.capsule .bottom { bottom: 0; border-radius: 0 0 60px 60px; background: linear-gradient(#fdf6e0, #ecdfb8); }', '.capsule .bottom { bottom: 0; border-radius: 0 0 60px 60px; background: #fff; border: 3px solid #fff; border-top: none; }\n  .capsule.big .top { background: #111; }\n  .capsule.big .bottom { background: var(--red); }')
s = s.replace('#capHint { color: #ffe9a8; font-size: 15px; font-weight: 700; }', '#capHint { color: #fff; font-size: 16px; font-weight: 900; letter-spacing: .1em; }')
s = s.replace('#kdlg { position: fixed; inset: 0; background: rgba(23,42,88,.55);', '#kdlg { position: fixed; inset: 0; background: rgba(0,0,0,.6);')
s = s.replace('.pt { font-weight: 700; color: var(--red); }', '.pt { font-weight: 900; color: var(--red); }')
# ルーレット盤の色（白・黒・赤）
s = s.replace('const fill = i % 2 ? "#faf3e0" : "#d43f2f";', 'const fill = (segs[i] === Math.max(...segs)) ? "#ff1717" : (i % 2 ? "#ffffff" : "#111111");')
s = s.replace('const tc = i % 2 ? "#172a58" : "#fff";', 'const tc = (segs[i] === Math.max(...segs)) ? "#fff" : (i % 2 ? "#111" : "#fff");')
s = s.replace('stroke="#172a58" stroke-width="1.5', 'stroke="#111" stroke-width="2')
s = s.replace('d += `<circle cx="${cx}" cy="${cy}" r="14" fill="#172a58"/>`;', 'd += `<circle cx="${cx}" cy="${cy}" r="16" fill="#fff" stroke="#111" stroke-width="3"/>`;')
s = s.replace('border-top: 18px sol', 'border-top: 18px sol')  # no-op guard
s = re.sub(r'(\.pointer \{[^}]*border-top: 18px solid )[^;]+;', r'\1#ff1717;', s)
s = s.replace('svg.wheel { width: 240px; height: 240px; transition: transform 4s cubic-bezier(.15,.75,.25,1); }', 'svg.wheel { width: 260px; height: 260px; transition: transform 4s cubic-bezier(.15,.75,.25,1); }')
s = s.replace('.wheelwrap { position: relative; width: 240px; margin: 8px auto; }', '.wheelwrap { position: relative; width: 260px; margin: 8px auto; }')

# ---------- ① ヒーローのマークアップ ----------
old = '  <div class="hero"><img src="assets/hero.png" alt=""></div>'
assert old in s
s = s.replace(old, '  <div class="hero"><div class="bh">ポイ活</div><img class="bowl" src="assets/bowl_photo.png" alt=""><div class="haji">アプリ始めました。</div></div>')
# ガチャ機の絵 → 白黒赤のSVG（カプセルが並ぶ箱）
old = '      <img src="assets/gacha.png" id="gachaImg" style="width:60%;max-width:220px;border-radius:12px" onerror="this.style.display=\'none\'">'
assert old in s
s = s.replace(old, '''      <svg id="gachaImg" viewBox="0 0 200 240" style="width:58%;max-width:210px;display:block;margin:4px auto 6px">
        <rect x="20" y="10" width="160" height="150" rx="14" fill="#fff" stroke="#111" stroke-width="6"/>
        <circle cx="62" cy="52" r="18" fill="#ff1717"/><circle cx="106" cy="46" r="18" fill="#111"/><circle cx="148" cy="58" r="18" fill="#ff1717"/>
        <circle cx="52" cy="96" r="18" fill="#111"/><circle cx="96" cy="92" r="18" fill="#ff1717"/><circle cx="140" cy="100" r="18" fill="#111"/>
        <circle cx="76" cy="134" r="18" fill="#ff1717"/><circle cx="120" cy="136" r="18" fill="#fff" stroke="#111" stroke-width="6"/>
        <rect x="20" y="160" width="160" height="66" rx="10" fill="#111"/>
        <circle cx="100" cy="193" r="22" fill="#fff" stroke="#ff1717" stroke-width="6"/>
        <rect x="96" y="176" width="8" height="34" rx="3" fill="#111"/>
        <rect x="132" y="184" width="34" height="22" rx="5" fill="#fff"/>
      </svg>''')

# ---------- ② 演出: 動画をやめて描画に ----------
old = '''  playFx("assets/roulette.mp4", () => {
    const p = segs[i];'''
assert old in s
s = s.replace(old, '''  setTimeout(() => {                       /* 盤が止まる（4秒）まで待って結果 */
    const p = segs[i];''')
old = '''    logTx("毎日ルーレット", p);
    celebrate(p, "毎日ルーレット");
  });'''
assert old in s
s = s.replace(old, '''    logTx("毎日ルーレット", p);
    celebrate(p, "毎日ルーレット");
  }, 4300);''')
old = '''    if (hit.points >= 50) {
      // ② 大当たり: 金のカプセルから光があふれる（H3で生成）
      playFx("assets/gacha_gold.mp4", () => celebrate(hit.points, "🎉 大当たり！！"));
    } else {
      // ② 通常: ガチャ機が揺れてカプセルが落ちる（H3で生成）
      playFx("assets/gacha_normal.mp4", () => celebrate(hit.points, "来店ガチャ"));
    }'''
assert old in s
s = s.replace(old, '''    /* ② カプセルが落ちてくる（白黒赤の描画演出・2026-09-06 動画をやめた） */
    showCapsule(hit.points >= 50, () => celebrate(hit.points, hit.points >= 50 ? "大当たり！" : "来店ガチャ"));''')
# showCapsule を playFx の前に置く
old = 'function playFx(src, done) {'
assert old in s
s = s.replace(old, '''function showCapsule(big, done) {
  const ov = document.getElementById("capOverlay"), cap = document.getElementById("capsuleEl"), hint = document.getElementById("capHint");
  let fired = false;
  const finish = () => { if (fired) return; fired = true; ov.classList.remove("show"); cap.classList.remove("open", "big"); done(); };
  cap.className = "capsule" + (big ? " big" : "");
  hint.textContent = big ? "…！　タップしてあける" : "タップしてあける！";
  ov.classList.add("show");
  ov.onclick = () => { if (cap.classList.contains("open")) return; cap.classList.add("open"); setTimeout(finish, 520); };
  setTimeout(() => { if (!cap.classList.contains("open")) { cap.classList.add("open"); setTimeout(finish, 520); } }, 6000);
}
function playFx(src, done) {''')

s = s.replace('font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif', 'font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif')
io.open(P, "w", encoding="utf-8").write(s)
print("theme patched")
