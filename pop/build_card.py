# -*- coding: utf-8 -*-
"""名刺サイズカード（91×55）だけを作る反復ツール
   python build_card.py [長岡本店|仙台連坊店]
   pop_v3.html の CSS と build_pop.py の CARD を使い、card_v1.html → Mac Chrome で PDF → card_v1.png(300dpi)"""
import io, os, re, subprocess, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
store = sys.argv[1] if len(sys.argv) > 1 else "長岡本店"

css = io.open("pop_v3.html", encoding="utf-8").read()
css = css[css.index("<style>") + 7:css.index("</style>")]
bp = io.open("build_pop.py", encoding="utf-8").read()
m = re.search(r"CARD = \((.*?)\)\n\n", bp, re.S)
card = eval("(" + m.group(1) + ")").format(store=store)
html = ('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>柿川亭アプリ カード 91×55</title><style>'
        + css.replace("@page{size:A4;margin:0}", "@page{size:91mm 55mm;margin:0}")
        + "\n.card{border:none}\nbody{width:91mm;height:55mm;overflow:hidden}\n</style></head><body>" + card + "</body></html>")
io.open("card_v1.html", "w", encoding="utf-8").write(html)

subprocess.run(["scp", "-q", "card_v1.html", "logo.png", "qr_get_400.png", "mac:/tmp/pop/"], check=True)
subprocess.run(["scp", "-q", "fal/bowl_cutout.png", "mac:/tmp/pop/fal/"], check=True)
subprocess.run(["ssh", "mac", 'cd /tmp/pop && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf=/tmp/pop/card_v1.pdf "file:///tmp/pop/card_v1.html" >/dev/null 2>&1'], check=True)
subprocess.run(["scp", "-q", "mac:/tmp/pop/card_v1.pdf", "."], check=True)
import fitz
d = fitz.open("card_v1.pdf"); d[0].get_pixmap(dpi=300).save("card_v1.png")
print("card_v1.png", d[0].rect)
