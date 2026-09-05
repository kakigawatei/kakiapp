# -*- coding: utf-8 -*-
"""POP一式を作る: pop.html(雛形) → pop_<store>.html → PDF ＋ プレビューPNG
   使い方: python build_pop.py            （長岡本店・仙台連坊店）
   文言の正典は WORDING。店の運用（券売機で食券／アプリ交換は画面を見せて口頭注文）に合わせる"""
import io, os, subprocess, time, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
STORES = {"nagaoka": "長岡本店", "sendai": "仙台連坊店"}

tpl = io.open("pop.html", encoding="utf-8").read()

# ---- 文言（2026-09-05 masa確定: 貯める=開くだけ／使う=食券は買わず画面を見せて口頭注文）----
WORDING = [
    # ① A4 QR横
    ('iPhoneはApp Store、AndroidはWeb版に自動で案内します。<br>お店で開くだけで、今日の分からポイントが付きます。',
     'iPhoneはApp Store、AndroidはWeb版に自動で案内します。<br>お店で開くだけで、今日の分からポイントが付きます。'),
    # ① A4 右下
    ('ポイントは来店時に位置情報で自動付与（お声がけ不要）<br>kakigawatei.github.io/kakiapp/get',
     '貯める＝お店で開くだけ（位置情報で自動）<br>使う＝食券を買わずに、アプリの引換画面を見せて注文<br>kakigawatei.github.io/kakiapp/get'),
    # ② 卓上 中面
    ('<div class="pt"><b>850P</b><span>油そば並盛1杯と交換。トッピングは50P〜</span></div>',
     '<div class="pt"><b>850P</b><span>油そば並盛1杯と交換。トッピングは50P〜</span></div>'),
    ('<div class="sub" style="font-size:11pt;margin-top:4mm">称号が上がると、ランクバッジが変わります。</div>',
     '<div class="sub" style="font-size:11pt;margin-top:4mm">つかい方：食券は買わずに、アプリ「つかう」→メニューをタップ→引換画面をスタッフに見せて「アプリで並盛」と注文。</div>'
     '<div class="sub" style="font-size:11pt;margin-top:2mm">称号が上がると、ランクバッジが変わります。</div>'),
    ('ポイントの交換はアプリの「使う」から。<br>Android版は Web版を「ホーム画面に追加」でアプリとして使えます。',
     '引換画面は10分間有効。ポイントはその場で引かれます。<br>Android版は Web版を「ホーム画面に追加」でアプリとして使えます。'),
]
for old, new in WORDING:
    if old not in tpl:
        print("!! 雛形に見つからない:", old[:40]); sys.exit(1)
    tpl = tpl.replace(old, new)
io.open("pop.html", "w", encoding="utf-8").write(tpl)

CARD = ('<div class="card"><div class="qr"><img src="qr_get_400.png" width="98" height="98" alt=""></div><div>'
        '<div class="kicker" style="font-size:7pt;letter-spacing:.25em">柿川亭アプリ</div>'
        '<div class="h">来るたび、<em>油神</em>に近づく。</div>'
        '<div class="sub">来店でポイント／毎日1回ガチャ／850Pで油そば1杯<br>iPhone＝App Store・Android＝Web版（無料）</div>'
        '<div class="st">柿川亭 {store}</div></div></div>')

for key, name in STORES.items():
    html = tpl.replace("{{STORE}}", name).replace("<!--CARDS-->", "\n".join([CARD.format(store=name)] * 10))
    fn = f"pop_{key}.html"
    io.open(fn, "w", encoding="utf-8").write(html)
    here = os.getcwd()
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={here}\\pop_{key}.pdf", f"file:///{here}/{fn}"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
    print("made", fn, f"pop_{key}.pdf")

# プレビュー（長岡・1/2ページ）
try:
    import fitz
    doc = fitz.open("pop_nagaoka.pdf")
    for i, nm in [(0, "preview_a4_nagaoka.png"), (1, "preview_tent_nagaoka.png")]:
        doc[i].get_pixmap(dpi=70).save(nm)
    print("pages", len(doc))
except Exception as e:
    print("preview skipped:", e)
