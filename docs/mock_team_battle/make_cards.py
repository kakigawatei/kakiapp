# -*- coding: utf-8 -*-
"""優勝カードの絵柄案（masa 2026-09-21「称号みたいに優勝校にカードを配って閲覧できるように」）
   3案 × 金（優勝）を描く＋案Aの銀/銅/MVP色違い。カード比率 3:4（1080×1440）。学校名・月・数字は差し替え前提のテンプレ。"""
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1440
FB = "C:/Windows/Fonts/YuGothB.ttc"; FM = "C:/Windows/Fonts/YuGothM.ttc"; FMIN = "C:/Windows/Fonts/yumindb.ttf"
def f(p, s): return ImageFont.truetype(p, s)
def ctext(dr, y, t, fo, fill): dr.text(((W - dr.textlength(t, font=fo)) / 2, y), t, font=fo, fill=fill)
RED = (166, 58, 42); NAVY = (31, 47, 90); INK = (43, 36, 29); GOLD = (196, 145, 60); GOLD_L = (243, 210, 122); PAPER = (250, 246, 240)
TIERS = {"gold": ("優勝", (196, 145, 60), (243, 210, 122), (168, 121, 44)), "silver": ("準優勝", (160, 162, 172), (220, 221, 227), (120, 122, 132)), "bronze": ("3位", (176, 120, 80), (217, 163, 122), (143, 94, 60)), "mvp": ("MVP校", (110, 80, 160), (200, 180, 230), (80, 55, 120))}
def laurel(dr, cx, cy, r, col, n=9):
    for side in (-1, 1):
        for i in range(n):
            a = math.radians(200 + i * 14) if side < 0 else math.radians(-20 - i * 14)
            x = cx + side * r * math.cos(math.radians(20 + i * 14)) * -1 * side * side + 0
            ang = math.radians(90 + side * (20 + i * 14))
            px, py = cx + r * math.cos(ang) * -1 * side if False else cx - side * r * math.sin(math.radians(20 + i * 14)) * -1, cy + r * math.cos(math.radians(20 + i * 14)) * -1 + r
            # 葉: 中心から外へ向く楕円
            lx, ly = cx - side * (r * 0.95) * math.sin(math.radians(10 + i * 15)), cy + r - r * math.cos(math.radians(10 + i * 15)) * 1.0
            leaf = Image.new("RGBA", (70, 30), (0, 0, 0, 0)); ImageDraw.Draw(leaf).ellipse((0, 0, 69, 29), fill=col + (255,))
            leaf = leaf.rotate(side * (60 - i * 15), expand=True)
            dr._image.paste(leaf, (int(lx - leaf.width / 2), int(ly - leaf.height / 2)), leaf)
def crown(dr, cx, cy, s, col, dark):
    dr.polygon([(cx - s, cy + s * 0.55), (cx - s * 0.62, cy - s * 0.35), (cx - s * 0.2, cy + s * 0.05), (cx, cy - s * 0.7), (cx + s * 0.2, cy + s * 0.05), (cx + s * 0.62, cy - s * 0.35), (cx + s, cy + s * 0.55)], fill=col)
    dr.rounded_rectangle((cx - s * 0.98, cy + s * 0.55, cx + s * 0.98, cy + s * 0.85), 6, fill=dark)

def card_a(tier="gold", school="長岡高校", month="2026年10月", visits=156, members=41, fname=None):
    """案A: クラシック金枠＋月桂樹（参考UIの延長・王道）"""
    name, col, light, dark = TIERS[tier]
    im = Image.new("RGB", (W, H), PAPER); dr = ImageDraw.Draw(im)
    for i, wdt in ((0, 26), (34, 4)):
        dr.rounded_rectangle((40 + i, 40 + i, W - 40 - i, H - 40 - i), 36, outline=col if i == 0 else dark, width=wdt)
    # 角飾り
    for (x, y) in ((70, 70), (W - 70, 70), (70, H - 70), (W - 70, H - 70)): dr.ellipse((x - 14, y - 14, x + 14, y + 14), fill=light, outline=dark, width=3)
    ctext(dr, 120, "柿川亭アプリ ｜ 学校対抗 来店バトル", f(FM, 28), INK)
    ctext(dr, 170, month + " " + name, f(FB, 40), dark)
    crown(dr, W / 2, 330, 70, col, dark)
    laurel(dr, W / 2, 380, 250, col)
    dr.ellipse((W / 2 - 150, 400, W / 2 + 150, 700), fill=RED if tier == "gold" else NAVY)
    ctext(dr, 470, school[0], f(FB, 150), (255, 255, 255))
    fo = f(FB, 72 if len(school) <= 6 else 58); ctext(dr, 760, school, fo, INK)
    ctext(dr, 870, f"来店 {visits}回 ｜ 参加 {members}人", f(FM, 34), (90, 80, 70))
    dr.line((160, 950, W - 160, 950), fill=col, width=3)
    ctext(dr, 990, "このカードは、シーズン中に来店を重ねた", f(FM, 28), INK)
    ctext(dr, 1034, f"{school}のみんなに贈られました。", f(FM, 28), INK)
    ctext(dr, 1160, "油そば 柿川亭", f(FMIN, 44), INK); ctext(dr, 1220, "KAKIGAWATEI ｜ NAGAOKA・SENDAI", f(FM, 22), (120, 110, 100))
    ctext(dr, 1300, "No. 0041 / 41", f(FM, 24), (150, 140, 130))
    im.save(os.path.join(OUT, fname or f"card_A_{tier}.png"))

def card_b(school="長岡高校", month="2026年10月", visits=156, members=41):
    """案B: 黒地ミニマル（VIE風・打ち文字大きく・金1色）"""
    im = Image.new("RGB", (W, H), (20, 18, 16)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((40, 40, W - 40, H - 40), 24, outline=GOLD, width=3)
    dr.text((90, 100), "CHAMPION", font=f(FB, 30), fill=GOLD)
    dr.text((90, 140), month + " 優勝", font=f(FM, 30), fill=(200, 190, 170))
    fo = f(FB, 118 if len(school) <= 5 else 92); dr.text((90, 380), school, font=fo, fill=(255, 255, 255))
    dr.line((90, 560, W - 90, 560), fill=GOLD, width=2)
    dr.text((90, 600), f"{visits}", font=f(FB, 160), fill=GOLD); dr.text((90 + dr.textlength(f"{visits}", font=f(FB, 160)) + 14, 700), "回 来店", font=f(FB, 40), fill=(255, 255, 255))
    dr.text((90, 800), f"参加 {members}人 ｜ 学校対抗 来店バトル", font=f(FM, 30), fill=(200, 190, 170))
    crown(dr, W - 170, 1220, 60, GOLD, (140, 100, 40))
    dr.text((90, 1200), "油そば 柿川亭", font=f(FMIN, 46), fill=(255, 255, 255)); dr.text((90, 1262), "KAKIGAWATEI", font=f(FM, 22), fill=(170, 160, 150))
    im.save(os.path.join(OUT, "card_B_gold.png"))

def card_c(school="長岡高校", month="2026年10月", visits=156, members=41):
    """案C: 和モダン（赤×紺・丼と学校の頭文字の印・柿川亭らしさ）"""
    im = Image.new("RGB", (W, H), (245, 238, 226)); dr = ImageDraw.Draw(im)
    dr.rectangle((0, 0, W, 300), fill=RED); dr.rectangle((0, 300, W, 318), fill=NAVY)
    dr.text((80, 90), "学校対抗 来店バトル", font=f(FMIN, 40), fill=(255, 245, 235)); dr.text((80, 160), month + "　優　勝", font=f(FMIN, 60), fill=(255, 255, 255))
    # 印（はんこ風）
    dr.rounded_rectangle((W / 2 - 170, 420, W / 2 + 170, 760), 20, fill=RED); dr.rounded_rectangle((W / 2 - 150, 440, W / 2 + 150, 740), 14, outline=(255, 235, 225), width=4)
    ctext(dr, 470, school[0], f(FMIN, 200), (255, 245, 235))
    fo = f(FMIN, 78 if len(school) <= 6 else 62); ctext(dr, 820, school, fo, INK)
    ctext(dr, 930, f"来店 {visits} 回 ・ 参加 {members} 人", f(FMIN, 34), NAVY)
    for i in range(7): dr.line((120 + i * 130, 1030, 180 + i * 130, 1030), fill=GOLD, width=3)
    ctext(dr, 1080, "食べるほど、たまる。", f(FMIN, 40), INK)
    ctext(dr, 1200, "油そば 柿川亭", f(FMIN, 44), RED); ctext(dr, 1260, "KAKIGAWATEI", f(FM, 22), NAVY)
    im.save(os.path.join(OUT, "card_C_gold.png"))

card_a("gold"); card_a("silver", school="帝京長岡高校", visits=141, members=57); card_a("bronze", school="仙台育英高校", visits=120, members=33); card_a("mvp", school="東北学院高校", visits=90, members=22)
card_b(); card_c()
# 一覧（A金・B・C）を1枚に
sheet = Image.new("RGB", (W * 3 + 120, H + 80), (235, 230, 222))
for i, n in enumerate(["card_A_gold.png", "card_B_gold.png", "card_C_gold.png"]): sheet.paste(Image.open(os.path.join(OUT, n)), (30 + i * (W + 30), 40))
sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS); sheet.save(os.path.join(OUT, "cards_ABC.png"))
tiers = Image.new("RGB", (W * 2 + 90, H * 2 + 90), (235, 230, 222))
for i, n in enumerate(["card_A_gold.png", "card_A_silver.png", "card_A_bronze.png", "card_A_mvp.png"]): tiers.paste(Image.open(os.path.join(OUT, n)), (30 + (i % 2) * (W + 30), 30 + (i // 2) * (H + 30)))
tiers = tiers.resize((tiers.width // 2, tiers.height // 2), Image.LANCZOS); tiers.save(os.path.join(OUT, "cards_A_tiers.png"))
print("ok")
