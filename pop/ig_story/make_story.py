# -*- coding: utf-8 -*-
"""柿川亭 Instagram ストーリーズ「毎日ミッション」画像（1080×1920）を作る（2026-09-17 masa🇦 半自動）
使い方: python make_story.py [YYYY-MM-DD] [--style A|B] [--out path]
  素材＝../ig_story_src/pop_1..4.png（縦）・card_1..9.png（横）を日替わり／文言は COPIES を日替わり。"""
import os, sys, datetime
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, "..", "ig_story_src")
W, H = 1080, 1920
TOP_SAFE, BOTTOM_SAFE = 240, 270   # Instagram のヘッダー／返信バーに隠れる領域（masa 2026-09-19「下が切れる」）
DEADLINE = datetime.date(2026, 10, 7); UNTIL = datetime.date(2026, 10, 13)
RED = (215, 48, 31); INK = (17, 17, 17); PAPER = (255, 255, 255)
FONT_B = "C:/Windows/Fonts/YuGothB.ttc"; FONT_M = "C:/Windows/Fonts/YuGothM.ttc"
def font(path, size): return ImageFont.truetype(path, size)

# 日替わり文言（登録＋来店ガチャ1回のミッション・🟥 350P など「ポイントを渡す」は書かない＝masa 2026-09-19）。10/7〜10/13 は受け取り期間の文言に切替
COPIES = [
    ("ミッション！", "10月7日までにアプリを登録して\nお店で来店ガチャを1回引いておくこと。"),
    ("10月7日、柿川亭は創業6年。", "その日までに、アプリを登録して\n来店ガチャを一度回しておいてください。"),
    ("ミッション、まだの人へ。", "アプリを入れて、お店で来店ガチャを1回。\n10月7日までに、一度だけでOK。"),
    ("登録は1分。来店ガチャは10秒。", "10月7日まで、あと少し。"),
    ("10月7日に、アプリを開いてみて。", "登録して、来店ガチャを一度回した人には\nちょっとしたお知らせがあります。"),
    ("来るたび称号が上がる。", "見習い→常連→猛者→油神。\nあなたは今どこ？"),
    ("ミッション！", "アプリを登録して、\n来店ガチャを1回引いておくこと。\n10月7日まで。"),
]
COPIES_AFTER = [("アプリ、開いてみた？", "10月13日まで。\n開くだけで分かります。"),
                ("創業6年、ありがとう。", "10月13日までにアプリを開いてみてください。")]
IMAGES = ["pop_1", "card_1", "pop_2", "card_2", "card_3", "pop_3", "card_4", "card_5", "pop_4", "card_6", "card_7", "card_8", "card_9"]

def pick(d):
    n = (d - datetime.date(2026, 9, 18)).days
    img = IMAGES[n % len(IMAGES)]
    if d >= DEADLINE: title, body = COPIES_AFTER[n % len(COPIES_AFTER)]
    else: title, body = COPIES[n % len(COPIES)]
    return img, title, body

def load_art(name):
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGB")
    return im                                           # 切り出し済み（グリッドの白帯を検出して余白ごと正確に切ってある・2026-09-19）

def draw_text_block(dr, x, y, lines, f, fill, spacing=1.25, align="left", maxw=None):
    for ln in lines:
        bw = dr.textlength(ln, font=f)
        xx = x if align == "left" else (x - bw / 2 if align == "center" else x - bw)
        dr.text((xx, y), ln, font=f, fill=fill); y += int(f.size * spacing)
    return y

def make(d, style="A", out=None):
    img_name, title, body = pick(d)
    art = load_art(img_name)
    days_left = (DEADLINE - d).days
    landscape = art.width > art.height
    if landscape:
        # 横カードは、同じ絵を拡大ぼかしして背景に敷く（余白を空けない）。文字は白＋影
        bg = art.copy(); bs = max(W / bg.width, H / bg.height); bg = bg.resize((int(bg.width * bs) + 2, int(bg.height * bs) + 2), Image.LANCZOS)
        bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H)).filter(ImageFilter.GaussianBlur(45))
        canvas = Image.eval(bg, lambda v: int(v * 0.42)) if style == "B" else Image.blend(bg, Image.new("RGB", (W, H), PAPER), 0.55)
        art = art.resize((1000, int(art.height * 1000 / art.width)), Image.LANCZOS)
    else:
        canvas = Image.new("RGB", (W, H), PAPER if style == "A" else INK)
    dr = ImageDraw.Draw(canvas)
    # 中央の絵: 幅 1000 に収める（縦POPは高さ制限も）
    art_top = TOP_SAFE + 330; art_bottom = H - BOTTOM_SAFE - 250   # 6周年の1行の分だけ絵を上で止める（2026-09-21）
    avail_h = art_bottom - art_top
    aw, ah = art.size; sc = min(1000 / aw, avail_h / ah); art = art.resize((int(aw * sc), int(ah * sc)), Image.LANCZOS)
    ax = (W - art.width) // 2; ay = art_top + (avail_h - art.height) // 2
    # 影
    sh = Image.new("RGBA", (art.width + 60, art.height + 60), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((30, 30, art.width + 30, art.height + 30), 24, fill=(0, 0, 0, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(18)); canvas.paste(sh, (ax - 30, ay - 22), sh)
    mask = Image.new("L", art.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, art.width, art.height), 24, fill=255)
    canvas.paste(art, (ax, ay), mask)
    ink = INK if style == "A" else PAPER
    # 上の帯: MISSION タグ＋見出し＋本文
    ty = TOP_SAFE + 10
    tag_f = font(FONT_B, 40); dr.rounded_rectangle((60, ty, 60 + 250, ty + 64), 8, fill=RED)
    dr.text((60 + 125 - dr.textlength("MISSION", font=tag_f) / 2, ty + 8), "MISSION", font=tag_f, fill=PAPER)
    y = draw_text_block(dr, 60, ty + 80, [title], font(FONT_B, 60 if len(title) <= 12 else 50), ink, 1.2)
    draw_text_block(dr, 60, y + 4, body.split("\n"), font(FONT_M, 38), ink, 1.35)
    # 下の帯: カウントダウン＋アプリ名＋リンク誘導
    by = H - BOTTOM_SAFE - 175
    # 6周年の1行（masa 2026-09-21「柿川亭は10月7日で創業6周年 ってワード入れて」）
    fa = font(FONT_B, 36); ta = "柿川亭は10月7日で創業6周年"
    dr.text(((W - dr.textlength(ta, font=fa)) / 2, by - 58), ta, font=fa, fill=RED if style == "A" else PAPER)
    if d < DEADLINE:
        big = font(FONT_B, 150); small = font(FONT_B, 44)
        s1 = "10月7日まで あと"; s2 = str(days_left); s3 = "日"
        w1 = dr.textlength(s1, font=small); w2 = dr.textlength(s2, font=big); w3 = dr.textlength(s3, font=small)
        x = (W - (w1 + w2 + w3 + 30)) / 2
        dr.text((x, by + 90), s1, font=small, fill=ink); dr.text((x + w1 + 15, by - 10), s2, font=big, fill=RED); dr.text((x + w1 + w2 + 30, by + 90), s3, font=small, fill=ink)
    else:
        big = font(FONT_B, 96); dr.text(((W - dr.textlength("10月13日まで", font=big)) / 2, by + 10), "10月13日まで", font=big, fill=RED)
    f2 = font(FONT_B, 34); t2 = "柿川亭アプリ ｜ リンクをタップして登録"
    dr.text(((W - dr.textlength(t2, font=f2)) / 2, H - BOTTOM_SAFE - 20), t2, font=f2, fill=ink)
    out = out or os.path.join(HERE, "out", f"story_{d.strftime('%Y%m%d')}.png")
    os.makedirs(os.path.dirname(out), exist_ok=True); canvas.save(out, "PNG", optimize=True)
    return out, img_name, title, body

if __name__ == "__main__":
    a = sys.argv[1:]; style = None; out = None
    if "--style" in a: style = a[a.index("--style") + 1]; del a[a.index("--style"):a.index("--style") + 2]
    if "--out" in a: out = a[a.index("--out") + 1]; del a[a.index("--out"):a.index("--out") + 2]
    d = datetime.date.fromisoformat(a[0]) if a else datetime.date.today()
    if style is None: style = "AB"[(d - datetime.date(2026, 9, 18)).days % 2]   # masa 2026-09-17「日替わりで交互」（9/18=A 白, 9/19=B 黒…）
    p, img, t, b = make(d, style, out); print(p); print(img); print(t); print(b.replace("\n", " / "))
    # 動画版（Remotion KakiStory）用の props も書く（2026-09-19）
    import json
    props = {"title": t, "body": b, "art": f"kakistory/{img}.png", "landscape": img.startswith("card_"), "style": style, "days": (DEADLINE - d).days, "after": d >= DEADLINE}
    pp = os.path.join("C:/Users/masat/Desktop/nagaoka-video/out/kakistory", f"props_{d.strftime('%Y%m%d')}.json")
    os.makedirs(os.path.dirname(pp), exist_ok=True); json.dump(props, open(pp, "w", encoding="utf-8"), ensure_ascii=False); print(pp)
