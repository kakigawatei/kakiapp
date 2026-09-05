# -*- coding: utf-8 -*-
"""masaの参考デザイン（2026-09-06 01:15）にアプリを寄せる。
   生成り地・白カード・赤茶ボタン・紺のポイント丸・金の進捗・見出し明朝・線画アイコン・写真ヒーロー"""
import io, re
P = "index.html"
s = io.open(P, encoding="utf-8").read()

# ---------- パレット・書体 ----------
old = s[s.index("    /* POPと同じ: 白・墨・ロゴの赤（2026-09-06） */"):s.index("--gray: #6b6b6b;") + len("--gray: #6b6b6b;")]
s = s.replace(old, '''    /* masaの参考デザイン（2026-09-06）: 生成り・赤茶・紺・金 */
    --cream: #f4efe6; --navy: #1f2f5a; --red: #a63a2a; --ink: #2b241d;
    --card: #ffffff; --gold: #c4913c; --line: #e6dccb; --gray: #7a6f63; --brown: #3a2a20;
    --mincho: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;''')
s = s.replace('body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif; background: var(--cream); color: var(--ink); padding-bottom: 76px; -webkit-font-smoothing: antialiased; }',
              'body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif; background: var(--cream); color: var(--ink); padding-bottom: 84px; -webkit-font-smoothing: antialiased; }')

# ---------- ヘッダー ----------
old = s[s.index("  header { position: sticky;"):s.index("  .balance small")]
s = s.replace(old, '''  header { position: sticky; top: 0; z-index: 40; padding: calc(10px + env(safe-area-inset-top)) 16px 8px; display: grid; grid-template-columns: 56px 1fr 72px; align-items: center; background: var(--cream); }
  header .bell { width: 48px; height: 48px; border-radius: 50%; background: #fff; border: none; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 2px 6px rgba(58,42,32,.08); }
  header .bell img { width: 24px; height: 24px; }
  header .bell i { position: absolute; top: 9px; right: 10px; width: 9px; height: 9px; border-radius: 50%; background: var(--red); display: none; }
  header .logo { display: block; margin: 0 auto; height: 58px; }
  header .pts { text-align: center; }
  .balance { width: 64px; height: 64px; margin: 0 auto; border-radius: 50%; background: var(--navy); color: #fff; display: flex; align-items: baseline; justify-content: center; font-family: var(--mincho); font-weight: 700; font-size: 22px; line-height: 64px; box-shadow: 0 3px 8px rgba(31,47,90,.25); }
  header .pts .cap { font-size: 10px; color: var(--gray); margin-top: 3px; letter-spacing: .04em; }
''')
s = s.replace('  .balance small { opacity: .7; font-weight: 400; margin-left: 2px; }', '  .balance small { font-size: 12px; margin-left: 2px; }')

# ---------- ヒーロー（写真＋コピー） ----------
old = s[s.index("  .hero { position: relative; margin: 0 0 6px;"):s.index("  main { padding: 0 16px; }")]
s = s.replace(old, '''  .hero { position: relative; margin: 6px 16px 14px; aspect-ratio: 16/10.2; border-radius: 16px; overflow: hidden; background: #3a2a20 url("assets/hero_photo.jpg") center right / cover no-repeat; box-shadow: 0 6px 16px rgba(58,42,32,.18); }
  .hero .fallback { position: absolute; right: -6%; top: 8%; width: 66%; display: none; filter: drop-shadow(0 10px 14px rgba(0,0,0,.4)); }
  .hero.nophoto .fallback { display: block; }
  .hero .copy { position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: #f4efe6; text-shadow: 0 1px 6px rgba(0,0,0,.5); max-width: 58%; }
  .hero .copy .s1 { font-size: 13px; letter-spacing: .08em; line-height: 1.6; }
  .hero .copy .s2 { font-family: var(--mincho); font-size: 30px; font-weight: 700; letter-spacing: .04em; margin: 6px 0 8px; }
  .hero .copy .s3 { font-size: 12px; line-height: 1.8; letter-spacing: .04em; }
''')

# ---------- カード（行型） ----------
s = s.replace('  .card { background: var(--card); border: 2px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }',
              '  .card { background: var(--card); border: none; border-radius: 16px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 10px rgba(58,42,32,.06); }')
s = s.replace('  .card h2 { font-size: 16px; color: var(--ink); margin-bottom: 8px; font-weight: 900; letter-spacing: .02em; }',
              '  .card h2 { font-family: var(--mincho); font-size: 20px; color: var(--ink); margin-bottom: 6px; font-weight: 700; letter-spacing: .04em; }')
s = s.replace('  .muted { color: var(--gray); font-size: 12px; }', '  .muted { color: var(--gray); font-size: 12.5px; line-height: 1.7; }')
old = s[s.index("  .rankline { display: flex;"):s.index("  .bar > div")]
s = s.replace(old, '''  .row { display: flex; align-items: center; gap: 14px; }
  .row .ico { width: 68px; height: 68px; flex: 0 0 68px; border-radius: 50%; background: #f7f2ea; display: flex; align-items: center; justify-content: center; font-size: 30px; position: relative; overflow: hidden; }
  .row .ico img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; padding: 12px; background: #f7f2ea; }
  .row .body { flex: 1; min-width: 0; }
  .row .body h2 { margin-bottom: 4px; }
  .row .side { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
  .row .chev { color: #b8ab9a; font-size: 22px; }
  button.small { padding: 12px 14px; border: none; border-radius: 10px; background: var(--red); color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .04em; white-space: nowrap; box-shadow: 0 3px 8px rgba(166,58,42,.25); }
  .rankline { display: flex; align-items: center; gap: 14px; }
  .rankline .badge { width: 68px; height: 68px; border-radius: 50%; background: #f7f2ea; border: none; display: flex; align-items: center; justify-content: center; font-size: 30px; overflow: hidden; }
  .rankline .badge img { width: 100%; height: 100%; object-fit: contain; padding: 10px; }
  .rankline .info { flex: 1; }
  .rankline .info b { font-family: var(--mincho); font-size: 22px; font-weight: 700; letter-spacing: .04em; }
  .barline { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .bar { flex: 1; height: 8px; background: #ece4d6; border-radius: 4px; overflow: hidden; margin-top: 0; }
  .barnum { font-family: var(--mincho); font-size: 15px; color: var(--ink); }
''')
s = s.replace('  .bar > div { height: 100%; background: var(--gold); }', '  .bar > div { height: 100%; background: linear-gradient(90deg, #d1a55a, #b3822f); }')
s = s.replace('  button.primary { width: 100%; padding: 15px; border: none; border-radius: 12px; background: #111; color: #fff; font-size: 17px; font-weight: 900; letter-spacing: .04em; cursor: pointer; }',
              '  button.primary { width: 100%; padding: 15px; border: none; border-radius: 12px; background: var(--red); color: #fff; font-size: 16px; font-weight: 700; letter-spacing: .06em; cursor: pointer; box-shadow: 0 3px 8px rgba(166,58,42,.25); }')
s = s.replace('  button.primary:disabled { background: #cfcfcf; }', '  button.primary:disabled { background: #d9cfbf; box-shadow: none; }')
s = re.sub(r'  button\.ghost \{ width: 100%; padding: 12px; border: 2px solid #111; border-radius: 12px; background: #fff; color: #111;',
           '  button.ghost { width: 100%; padding: 12px; border: 1.5px solid var(--red); border-radius: 12px; background: #fff; color: var(--red);', s)

# ---------- 称号・ログイン・演出・つかう・ナビ ----------
s = s.replace('#shogo .name { font-size: 54px; font-weight: 900; color: #111; line-height: 1.1;', '#shogo .name { font-family: var(--mincho); font-size: 52px; font-weight: 700; color: var(--ink); line-height: 1.1;')
s = s.replace('border: none; border-radius: 999px; background: #111; color: #fff;\n               font-size: 16px; font-weight: 900; }', 'border: none; border-radius: 999px; background: var(--red); color: #fff;\n               font-size: 16px; font-weight: 700; }')
s = s.replace('#gate input { width: 100%; padding: 13px 14px; border: 1.5px solid #111;', '#gate input { width: 100%; padding: 13px 14px; border: 1px solid var(--line);')
s = s.replace('#gate .sep::before, #gate .sep::after { content: ""; flex: 1; height: 1px; background: #ddd; }', '#gate .sep::before, #gate .sep::after { content: ""; flex: 1; height: 1px; background: var(--line); }')
s = s.replace('.btn-google { width: 100%; padding: 13px; border: 1.5px solid #111;', '.btn-google { width: 100%; padding: 13px; border: 1px solid var(--line);')
s = s.replace('#gate h2 { font-size: 19px; color: var(--navy); text-align: center; margin: 10px 0 4px; }', '#gate h2 { font-family: var(--mincho); font-size: 22px; color: var(--ink); text-align: center; margin: 10px 0 4px; }')
s = s.replace('#overlay { position: fixed; inset: 0; background: rgba(0,0,0,.92);', '#overlay { position: fixed; inset: 0; background: rgba(43,36,29,.9);')
s = s.replace("#overlay .big { font-size: 64px; font-weight: 900; color: #fff; letter-spacing: -.02em; }", "#overlay .big { font-family: var(--mincho); font-size: 64px; font-weight: 700; color: #f4efe6; letter-spacing: -.02em; }")
s = s.replace('#overlay .sub { color: var(--red); font-size: 20px; font-weight: 900; }', '#overlay .sub { color: var(--gold); font-size: 20px; font-weight: 700; letter-spacing: .08em; }')
s = s.replace('#overlay button { padding: 12px 32px; border-radius: 999px; border: none; background: #fff; color: #111; font-size: 15px; font-weight: 900; }', '#overlay button { padding: 12px 32px; border-radius: 999px; border: none; background: #f4efe6; color: var(--ink); font-size: 15px; font-weight: 700; }')
s = s.replace('.payamount { font-size: 44px; font-weight: 900; text-align: center; color: #111; padding: 8px 0; }', '.payamount { font-family: var(--mincho); font-size: 44px; font-weight: 700; text-align: center; color: var(--ink); padding: 8px 0; }')
s = s.replace('.numpad button { padding: 14px 0; font-size: 20px; font-weight: 900; border-radius: 10px; border: 1.5px solid #111; background: #fff; cursor: pointer; }', '.numpad button { padding: 14px 0; font-size: 20px; font-weight: 700; border-radius: 10px; border: 1px solid var(--line); background: #fff; cursor: pointer; }')
s = s.replace('.staff { background: #111; color: #fff; border-radius: 14px; padding: 18px; text-align: center; }', '.staff { background: var(--navy); color: #fff; border-radius: 16px; padding: 18px; text-align: center; }')
s = s.replace('.staff .amt { font-size: 46px; font-weight: 900; color: #fff; }', '.staff .amt { font-family: var(--mincho); font-size: 46px; font-weight: 700; color: #fff; }')
s = s.replace("nav { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 2px solid #111;", "nav { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid var(--line);")
s = s.replace('nav button .ic { display: block; font-size: 20px; margin-bottom: 2px; }', 'nav button .ic { display: block; height: 28px; margin: 0 auto 3px; position: relative; font-size: 20px; }\n  nav button .ic img { position: absolute; left: 50%; top: 0; transform: translateX(-50%); height: 28px; width: 28px; object-fit: contain; background: #fff; }')
s = s.replace('nav button.on { color: #111; font-weight: 900; }', 'nav button.on { color: var(--red); font-weight: 700; }\n  nav button.on::after { content: ""; display: block; width: 28px; height: 2px; background: var(--red); margin: 4px auto 0; }')
s = s.replace('#capOverlay { position: fixed; inset: 0; background: rgba(0,0,0,.92);', '#capOverlay { position: fixed; inset: 0; background: rgba(43,36,29,.9);')
s = s.replace('.capsule .top { top: 0; border-radius: 60px 60px 0 0; background: var(--red) url("assets/capsule_top.png") center/cover no-repeat; border: 3px solid #fff; border-bottom: none; }',
              '.capsule .top { top: 0; border-radius: 60px 60px 0 0; background: var(--red) url("assets/capsule_top.png") center/cover no-repeat; border: 3px solid #f4efe6; border-bottom: none; }')
s = s.replace('.capsule .bottom { bottom: 0; border-radius: 0 0 60px 60px; background: #fff url("assets/capsule_bottom.png") center/cover no-repeat; border: 3px solid #fff; border-top: none; }',
              '.capsule .bottom { bottom: 0; border-radius: 0 0 60px 60px; background: #f4efe6 url("assets/capsule_bottom.png") center/cover no-repeat; border: 3px solid #f4efe6; border-top: none; }')
old = s[s.index("  /* 大当たり: 上＝白い下半分の絵を反転して黒"):s.index("  .capsule.big.open .bottom")]
s = s.replace(old, '  /* 大当たり: 紺×金 */\n  .capsule.big .top { background: var(--navy); }\n  .capsule.big .bottom { background: var(--gold); }\n')
s = s.replace('  .capsule.big.open .bottom { transform: scaleY(-1) translateY(-24px) rotate(-8deg); }\n', '')
s = s.replace('#capHint { color: #fff; font-size: 16px; font-weight: 900; letter-spacing: .1em; }', '#capHint { color: #f4efe6; font-size: 16px; font-weight: 700; letter-spacing: .1em; }')
s = s.replace('#kdlg { position: fixed; inset: 0; background: rgba(0,0,0,.6);', '#kdlg { position: fixed; inset: 0; background: rgba(43,36,29,.55);')
s = s.replace('.pt { font-weight: 900; color: var(--red); }', '.pt { font-weight: 700; color: var(--red); }')
# ルーレット盤: 生成り／赤茶、最高点は金、中心は紺
s = s.replace('const fill = (segs[i] === Math.max(...segs)) ? "#ff1717" : (i % 2 ? "#ffffff" : "#111111");', 'const fill = (segs[i] === Math.max(...segs)) ? "#c4913c" : (i % 2 ? "#f4efe6" : "#a63a2a");')
s = s.replace('const tc = (segs[i] === Math.max(...segs)) ? "#fff" : (i % 2 ? "#111" : "#fff");', 'const tc = (segs[i] === Math.max(...segs)) ? "#fff" : (i % 2 ? "#2b241d" : "#fff");')
s = s.replace('stroke="#111" stroke-width="2', 'stroke="#3a2a20" stroke-width="2')
s = s.replace('d += `<circle cx="${cx}" cy="${cy}" r="16" fill="#fff" stroke="#111" stroke-width="3"/>`;', 'd += `<circle cx="${cx}" cy="${cy}" r="16" fill="#1f2f5a" stroke="#f4efe6" stroke-width="3"/>`;')
s = re.sub(r'(\.pointer \{[^}]*border-top: 18px solid )[^;]+;', r'\1#a63a2a;', s)

# ---------- マークアップ ----------
old = '''<header>
  <h1>柿川亭アプリ</h1>
  <div class="balance"><span id="bal">0</span><small>P</small></div>
</header>'''
assert old in s
s = s.replace(old, '''<header>
  <button class="bell" id="bellBtn" aria-label="お知らせ"><img src="assets/icon_bell.png" alt="" onerror="this.replaceWith(document.createTextNode('🔔'))"><i id="bellDot"></i></button>
  <img class="logo" src="pop/logo.png" alt="新潟油そば 柿川亭">
  <div class="pts"><div class="balance"><span id="bal">0</span><small>P</small></div><div class="cap">保有ポイント</div></div>
</header>''')
old = '  <div class="hero"><img class="logo" src="pop/logo.png" alt="新潟油そば 柿川亭"><img class="bowl" src="assets/bowl_photo.png" alt=""></div>'
assert old in s
s = s.replace(old, '''  <div class="hero" id="hero">
    <img class="fallback" src="assets/bowl_photo.png" alt="">
    <div class="copy"><div class="s1">今日も、<br>最高の一杯を。</div><div class="s2">柿川亭アプリ</div><div class="s3">来るほどに楽しくなる、<br>油そば体験をあなたに。</div></div>
  </div>''')
old = s[s.index('      <div class="rankline">'):s.index('    <div class="card">\n      <h2>🎡 毎日ルーレット</h2>')]
s = s.replace(old, '''      <div class="rankline">
        <div class="badge" id="rankBadge">🍜</div>
        <div class="info">
          <b id="rankName">油そば見習い</b>
          <div class="muted">累計来店 <span id="visitCount">0</span>回 ／ 次のランクまであと<span id="nextLeft">-</span>回</div>
          <div class="barline"><div class="bar"><div id="rankBar" style="width:0%"></div></div><span class="barnum" id="rankNum"></span></div>
        </div>
      </div>
    </div>
''')
old = '''    <div class="card">
      <h2>🎡 毎日ルーレット</h2>
      <p class="muted">1日1回、無料で回せます</p>
      <button class="primary" id="btnGoRoulette">ルーレットを回す</button>
    </div>
    <div class="card">
      <h2>🏮 来店ガチャ</h2>
      <p class="muted">お店に来たら1日1回回せます（10〜100P・ハズレなし）</p>
      <button class="primary" id="btnGeoCheckin" style="margin-top:6px">📍 お店にいるのでチェックイン</button>
      <button class="ghost" id="btnMockQR" style="display:none">（開発用）来店したことにする</button>
    </div>'''
assert old in s
s = s.replace(old, '''    <div class="card">
      <div class="row">
        <div class="ico">🎡<img src="assets/icon_wheel.png" alt="" onerror="this.remove()"></div>
        <div class="body"><h2>毎日ルーレット</h2><p class="muted">1日1回、無料で回せます</p></div>
        <div class="side"><button class="small" id="btnGoRoulette">ルーレットを回す</button><span class="chev">›</span></div>
      </div>
    </div>
    <div class="card">
      <div class="row">
        <div class="ico">🏮<img src="assets/icon_lantern.png" alt="" onerror="this.remove()"></div>
        <div class="body"><h2>来店ガチャ</h2><p class="muted">お店に来たら1日1回回せます<br>（10〜100P・ハズレなし）</p></div>
        <div class="side"><button class="small" id="btnGeoCheckin">お店でチェックイン</button><span class="chev">›</span></div>
      </div>
      <button class="ghost" id="btnMockQR" style="display:none;margin-top:10px">（開発用）来店したことにする</button>
    </div>''')
old = '''<nav>
  <button data-page="home" class="on"><span class="ic">🏠</span>ホーム</button>
  <button data-page="roulette"><span class="ic">🎡</span>ルーレット</button>
  <button data-page="gacha"><span class="ic">🏮</span>ガチャ</button>
  <button data-page="pay"><span class="ic">💴</span>つかう</button>
  <button data-page="mypage"><span class="ic">👤</span>マイページ</button>
</nav>'''
assert old in s
s = s.replace(old, '''<nav>
  <button data-page="home" class="on"><span class="ic">🏠<img src="assets/icon_home.png" alt="" onerror="this.remove()"></span>ホーム</button>
  <button data-page="roulette"><span class="ic">🎡<img src="assets/icon_wheel.png" alt="" onerror="this.remove()"></span>ルーレット</button>
  <button data-page="gacha"><span class="ic">🏮<img src="assets/icon_lantern.png" alt="" onerror="this.remove()"></span>ガチャ</button>
  <button data-page="pay"><span class="ic">💴<img src="assets/icon_ticket.png" alt="" onerror="this.remove()"></span>つかう</button>
  <button data-page="mypage"><span class="ic">👤<img src="assets/icon_person.png" alt="" onerror="this.remove()"></span>マイページ</button>
</nav>''')
# 見出しの絵文字を外す
s = s.replace('<h2>🎡 毎日ルーレット</h2>', '<h2>毎日ルーレット</h2>').replace('<h2>🏮 来店ガチャ</h2>', '<h2>来店ガチャ</h2>').replace('<h2>💴 ポイントをつかう（1P=1円）</h2>', '<h2>ポイントをつかう（1P=1円）</h2>').replace('<h2>📜 ポイント履歴</h2>', '<h2>ポイント履歴</h2>')
s = s.replace('<button class="ghost" id="btnGeoCheckin2">📍 お店にいるのでチェックイン</button>', '<button class="ghost" id="btnGeoCheckin2">お店でチェックイン</button>')
# ヒーロー写真が無ければ丼の切り抜きにフォールバック／ランクの n/m 表示
old = 'function celebrate(points, sub) {'
assert old in s
s = s.replace(old, '''(function(){ var im = new Image(); im.onerror = function(){ document.getElementById("hero").classList.add("nophoto"); }; im.src = "assets/hero_photo.jpg"; })();
function celebrate(points, sub) {''')
s = s.replace("var APP_VER", "var APP_VER")
io.open(P, "w", encoding="utf-8").write(s)

# kintsugi-repair.css の罫色も合わせる
K = "kintsugi-repair.css"
k = io.open(K, encoding="utf-8").read()
k = k.replace("  --line: #111111;   /* 2026-09-06 POPと同じ墨の罫 */", "  --line: #e6dccb;   /* 2026-09-06 参考デザインの薄い罫 */")
k = k.replace("#page-gacha #btnGeoCheckin2 {\n  background: #111;\n  border-color: #111;\n  color: #fff;\n}", "#page-gacha #btnGeoCheckin2 {\n  background: var(--red);\n  border-color: var(--red);\n  color: #fff;\n}")
k = k.replace(".bar { background: #eeeeee; }                          /* 溝は薄いグレー（罫が墨になったため） */", ".bar { background: #ece4d6; }")
io.open(K, "w", encoding="utf-8").write(k)
print("warm theme patched")
