# -*- coding: utf-8 -*-
"""POP一式を作る: pop_v2.html(雛形・ポスター調) → pop_<store>.html → PDF ＋ プレビューPNG
   使い方: python build_pop.py            （長岡本店・仙台連坊店）
   文言の正典は雛形 pop_v2.html。店の運用＝券売機で食券／アプリ交換は食券を買わず引換画面を見せて口頭注文"""
import io, os, subprocess, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
STORES = {"nagaoka": "長岡本店", "sendai": "仙台連坊店"}
TEMPLATE = "pop_v3.html"

tpl = io.open(TEMPLATE, encoding="utf-8").read()

CARD = ('<div class="card"><div class="bh">ポイ活</div><img class="logo" src="logo.png" alt=""><img class="bowl" src="fal/bowl_cutout.png" alt="">'
        '<div class="h">ポイ活、始めました。</div>'
        '<div class="sub">柿川亭</div>'
        '<div class="qrc">QRでアプリを入れる　無料</div>'
        '<div class="haji">アプリ始めました。</div>'
        '<div class="qr"><img src="qr_get_400.png" alt=""></div>'
        '<div class="st">柿川亭 {store}</div></div>')

for key, name in STORES.items():
    html = tpl.replace("{{STORE}}", name).replace("<!--CARDS-->", "\n".join([CARD.format(store=name)] * 10))
    fn = f"pop_{key}.html"
    io.open(fn, "w", encoding="utf-8").write(html)
    if os.environ.get("MAC_RENDER"): continue
    here = os.getcwd()
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={here}\\pop_{key}.pdf", f"file:///{here}/{fn}"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
    print("made", fn, f"pop_{key}.pdf")

# プレビュー（長岡・3ページ）
try:
    import fitz
    doc = fitz.open("pop_nagaoka.pdf")
    for i, nm in [(0, "preview_a4_nagaoka.png"), (1, "preview_tent_nagaoka.png"), (2, "preview_cards_nagaoka.png")]:
        doc[i].get_pixmap(dpi=80).save(nm)
    print("pages", len(doc))
except Exception as e:
    print("preview skipped:", e)
