# -*- coding: utf-8 -*-
"""優勝カード V2（masa 決定 2026-09-21: 黒地・「優勝」を金の特大明朝で主役・写真は右下に小さく暗く）
   元絵 out/card_gen_V_black.png（fal GPT Image 2.5・文字なし）から丼だけ切り出して沈め、文字を重ねる。
   使い方: python make_card_v2.py  → out/card_V2_tier1..4.png と一覧 out/card_V2_tiers.png
   本実装ではこの配置をアプリ側（canvas）で再現し、学校名・月・数字・通し番号を差し替える。"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out")
FB = "C:/Windows/Fonts/YuGothB.ttc"; FM = "C:/Windows/Fonts/YuGothM.ttc"; FMIN = "C:/Windows/Fonts/yumindb.ttf"
def f(p, s): return ImageFont.truetype(p, s)
W, H = 1080, 1440
TIERS = [("CHAMPION", "優勝", (214, 170, 80), "長岡高校", "来店 156回 ｜ 参加 41人", "No. 0041 / 41"),
         ("2ND PLACE", "準優勝", (190, 192, 200), "帝京長岡高校", "来店 141回 ｜ 参加 57人", "No. 0012 / 57"),
         ("3RD PLACE", "3位", (196, 140, 96), "仙台育英高校", "来店 120回 ｜ 参加 33人", "No. 0007 / 33"),
         ("MVP SCHOOL", "MVP校", (170, 130, 220), "東北学院高校", "1人あたり 4.1回 ｜ 参加 22人", "No. 0003 / 22")]

def render(lab, jp, col, school, stat, no, kind="高校", season="2026年10月", round_no=1, out=None):
    src = Image.open(os.path.join(OUT, "card_gen_V_black.png")).convert("RGB").resize((W, H), Image.LANCZOS)
    bowl = src.crop((150, 140, 980, 830))   # 赤い四角を含めない範囲で丼だけ
    im = Image.new("RGB", (W, H), (12, 12, 12))
    b = bowl.resize((620, int(620 * bowl.height / bowl.width)), Image.LANCZOS); b = ImageEnhance.Brightness(b).enhance(0.34); b = b.filter(ImageFilter.GaussianBlur(1.0))
    mask = Image.new("L", b.size, 0); ImageDraw.Draw(mask).ellipse((30, 30, b.width - 30, b.height - 30), fill=255); mask = mask.filter(ImageFilter.GaussianBlur(70))
    im.paste(b, (W - b.width + 90, H - b.height - 130), mask)
    dr = ImageDraw.Draw(im); ink = (255, 255, 255); sub = (190, 180, 165)
    dr.rectangle((60, 60, 124, 124), fill=(200, 30, 30))
    dr.text((60, 160), f"第{round_no}回 学校対抗 来店バトル ｜ {season}", font=f(FM, 28), fill=sub)   # masa 2026-09-21「第何回もつけた方がいい」
    v = f"VOL. {round_no:02d}"; dr.text((W - 60 - dr.textlength(v, font=f(FB, 26)), 258), v, font=f(FB, 26), fill=col)
    x = 60
    for ch in lab: dr.text((x, 250), ch, font=f(FB, 34), fill=col); x += dr.textlength(ch, font=f(FB, 34)) + 12
    dr.text((52, 300), jp, font=f(FMIN, 300 if len(jp) <= 2 else 200), fill=col)
    y = 650 if len(jp) <= 2 else 560
    dr.line((60, y + 20, W - 60, y + 20), fill=col, width=2)
    dr.text((60, y + 60), school, font=f(FMIN, 104 if len(school) <= 5 else 86), fill=ink)
    dr.text((60, y + 200), stat, font=f(FM, 30), fill=sub)
    dr.line((60, 1230, W - 60, 1230), fill=col, width=1)
    dr.text((60, 1262), "油そば 柿川亭", font=f(FMIN, 40), fill=ink)
    x = 60
    for ch in "KAKIGAWATEI": dr.text((x, 1322), ch, font=f(FM, 20), fill=sub); x += dr.textlength(ch, font=f(FM, 20)) + 6
    dr.text((W - 60 - dr.textlength(no, font=f(FM, 22)), 1330), no, font=f(FM, 22), fill=sub)
    dr.rounded_rectangle((W - 60 - 150, 60, W - 60, 104), 999, outline=col, width=2)
    dr.text((W - 60 - 150 + (150 - dr.textlength(kind, font=f(FB, 22))) / 2, 70), kind, font=f(FB, 22), fill=col)
    if out: im.save(out)
    return im

if __name__ == "__main__":
    outs = []
    for i, t in enumerate(TIERS):
        p = os.path.join(OUT, f"card_V2_tier{i + 1}.png"); render(*t, out=p); outs.append(p)
    sheet = Image.new("RGB", (W * 4 + 150, H + 60), (28, 26, 24))
    for i, p in enumerate(outs): sheet.paste(Image.open(p), (30 + i * (W + 30), 30))
    sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS).save(os.path.join(OUT, "card_V2_tiers.png")); print("ok")
