# -*- coding: utf-8 -*-
"""POP一式を作る: pop_v2.html(雛形・ポスター調) → pop_<store>.html → PDF ＋ プレビューPNG
   使い方: python build_pop.py            （長岡本店・仙台連坊店）
   文言の正典は雛形 pop_v2.html。店の運用＝券売機で食券／アプリ交換は食券を買わず引換画面を見せて口頭注文"""
import io, os, subprocess, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
STORES = {"nagaoka": "長岡本店", "sendai": "仙台連坊店"}
TEMPLATE = "pop_v2.html"

tpl = io.open(TEMPLATE, encoding="utf-8").read()

CARD = ('<div class="card paper"><div class="sun"></div><img class="hero" src="../assets/hero.png" alt="">'
        '<div class="tv"><span class="ln">来るたび、</span><span class="ln"><span class="aka">油神</span>に近づく。</span></div>'
        '<div class="lab g">柿川亭アプリ</div>'
        '<div class="qr"><img src="qr_get_400.png" alt=""></div>'
        '<div class="qrc g">無料　iPhone／Android</div>'
        '<div class="st">柿川亭 {store}</div></div>')

for key, name in STORES.items():
    html = tpl.replace("{{STORE}}", name).replace("<!--CARDS-->", "\n".join([CARD.format(store=name)] * 10))
    fn = f"pop_{key}.html"
    io.open(fn, "w", encoding="utf-8").write(html)
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
