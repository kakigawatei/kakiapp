# -*- coding: utf-8 -*-
"""学校対抗 来店バトルの「ルールブック」1枚（Instagram フィード 1080×1350・VIE トーン）。masa 2026-09-21「フィード投稿するための告知文をペラ一で」
   使い方: PYTHONUTF8=1 python make_rulebook.py → out/rulebook_feed.png（＋ ストーリーズ用 out/rulebook_story.png）"""
import os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
FB = "C:/Windows/Fonts/YuGothB.ttc"; FM = "C:/Windows/Fonts/YuGothM.ttc"; FMIN = "C:/Windows/Fonts/yumindb.ttf"
def f(p, s): return ImageFont.truetype(p, s)
GOLD = (214, 170, 80); INK = (255, 255, 255); SUB = (190, 180, 165); BG = (12, 12, 12); RED = (200, 30, 30); LINE = (60, 56, 50)
RULES = [
    ("01", "参加する", "アプリの「ランキング」から、自分の学校を入れて参加。中学・高校・高専・専門学校・大学、どこでもOK。途中参加もOK。"),
    ("02", "来店で学校に +1", "お店で来店チェックインするたび、あなたの学校の来店数が1増える。個人の名前や来店は出ません（ニックネームは任意）。"),
    ("03", "月ごとに勝負", "1か月がひとつのシーズン。毎日ランキングが動く。順位がつくのは参加2人以上の学校から。"),
    ("04", "優勝校には", "その月に来店した参加者全員にポイントと「優勝カード」。準優勝・3位・MVP校（1人あたりの来店が最多）にも。カードはアプリのコレクションに残り、画像で保存できる。"),
    ("05", "受け取り", "ポイントは店頭でスタッフが学生証（生徒手帳）を確認してから。受け取りは翌月中に。"),
]
def draw(W, H, top_safe=0, bottom_safe=0):
    im = Image.new("RGB", (W, H), BG); dr = ImageDraw.Draw(im)
    y = top_safe + 56
    dr.rectangle((60, y, 124, y + 64), fill=RED)
    dr.text((60, y + 90), "柿川亭アプリ ｜ 10月7日スタート", font=f(FM, 26), fill=SUB)
    x = 60
    for ch in "SCHOOL BATTLE": dr.text((x, y + 134), ch, font=f(FB, 28), fill=GOLD); x += dr.textlength(ch, font=f(FB, 28)) + 10
    dr.text((52, y + 168), "学校対抗", font=f(FMIN, 104), fill=GOLD)
    dr.text((52, y + 282), "来店バトル", font=f(FMIN, 104), fill=INK)
    dr.text((60, y + 412), "どこの学校が、いちばん柿川亭に来てるか。", font=f(FM, 28), fill=SUB)
    yy = y + 468; dr.line((60, yy, W - 60, yy), fill=GOLD, width=2); yy += 26
    for no, t, body in RULES:
        dr.text((60, yy), no, font=f(FB, 24), fill=GOLD); dr.text((120, yy - 4), t, font=f(FB, 30), fill=INK)
        # 本文を折り返し
        fo = f(FM, 22); line = ""; ly = yy + 40; maxw = W - 120 - 60
        for ch in body:
            if dr.textlength(line + ch, font=fo) > maxw: dr.text((120, ly), line, font=fo, fill=SUB); ly += 31; line = ch
            else: line += ch
        if line: dr.text((120, ly), line, font=fo, fill=SUB); ly += 31
        yy = ly + 14; dr.line((120, yy - 8, W - 60, yy - 8), fill=LINE, width=1)
    by = H - bottom_safe - 128
    dr.text((60, by), "第0回（お試し）10/7〜10/31 ・ エントリーは 10/15 まで ・ 11月から本番、以後毎月", font=f(FB, 21), fill=GOLD)
    dr.line((60, by + 40, W - 60, by + 40), fill=GOLD, width=1)
    dr.text((60, by + 56), "油そば 柿川亭", font=f(FMIN, 34), fill=INK)
    x = 60
    for ch in "KAKIGAWATEI": dr.text((x, by + 102), ch, font=f(FM, 17), fill=SUB); x += dr.textlength(ch, font=f(FM, 17)) + 6
    t = "アプリはプロフィールのリンクから"; dr.text((W - 60 - dr.textlength(t, font=f(FM, 22)), by + 66), t, font=f(FM, 22), fill=SUB)
    return im
if __name__ == "__main__":
    draw(1080, 1350).save(os.path.join(OUT, "rulebook_feed.png")); draw(1080, 1920, 200, 250).save(os.path.join(OUT, "rulebook_story.png")); print("ok")
