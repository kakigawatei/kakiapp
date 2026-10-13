# -*- coding: utf-8 -*-
"""高校対抗 来店バトル: 参加校が増えたときの表示イメージ（masa 2026-09-21「競争心を煽る表示のイメージを見たい」）
   3画面を PNG で描く（1080×2160・アプリの配色: 白／赤 #a63a2a／紺 #1f2f5a／金 #c4913c）。実装ではなく見せ方の確認用。"""
import os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
W, H = 1080, 2160
WHITE = (255, 255, 255); INK = (43, 36, 29); RED = (166, 58, 42); NAVY = (31, 47, 90); GOLD = (196, 145, 60); GRAY = (122, 111, 99); LINE = (230, 220, 203); PAPER = (250, 246, 240); PALE = (251, 243, 234)
FB = "C:/Windows/Fonts/YuGothB.ttc"; FM = "C:/Windows/Fonts/YuGothM.ttc"
def f(p, s): return ImageFont.truetype(p, s)
def tw(dr, t, fo): return dr.textlength(t, font=fo)
def card(dr, x0, y0, x1, y1, fill=WHITE, r=28, outline=(239, 234, 226)):
    dr.rounded_rectangle((x0, y0, x1, y1), r, fill=fill, outline=outline, width=2)
def pill(dr, x, y, t, fo, bg, fg=WHITE, padx=22, pady=10):
    w = tw(dr, t, fo); dr.rounded_rectangle((x, y, x + w + padx * 2, y + fo.size + pady * 2), 999, fill=bg); dr.text((x + padx, y + pady), t, font=fo, fill=fg); return x + w + padx * 2
def header(dr, title, sub):
    dr.rectangle((0, 0, W, 210), fill=WHITE); dr.text((60, 70), title, font=f(FB, 46), fill=INK); dr.text((60, 135), sub, font=f(FM, 28), fill=GRAY)
    dr.line((0, 210, W, 210), fill=LINE, width=2)
def tabs(dr, y, items, active):
    x = 60
    for i, t in enumerate(items):
        fo = f(FB, 30); w = tw(dr, t, fo) + 56
        if i == active: dr.rounded_rectangle((x, y, x + w, y + 64), 999, fill=NAVY); dr.text((x + 28, y + 14), t, font=fo, fill=WHITE)
        else: dr.rounded_rectangle((x, y, x + w, y + 64), 999, fill=PAPER, outline=LINE, width=2); dr.text((x + 28, y + 14), t, font=fo, fill=GRAY)
        x += w + 14
def nav(dr):
    dr.rectangle((0, H - 130, W, H), fill=WHITE); dr.line((0, H - 130, W, H - 130), fill=LINE, width=2)
    for i, t in enumerate(["ホーム", "ルーレット", "ガチャ", "つかう", "マイページ"]):
        cx = W / 10 + i * W / 5; fo = f(FM, 24); dr.text((cx - tw(dr, t, fo) / 2, H - 60), t, font=fo, fill=GRAY)
        dr.text((cx - 16, H - 112), ["🏠", "🎡", "🏮", "💴", "👤"][i], font=f("C:/Windows/Fonts/seguiemj.ttf", 34), fill=INK)

SCHOOLS = [("長岡高校", 118, 41, "+2"), ("帝京長岡高校", 112, 57, "▲1"), ("仙台育英高校", 97, 33, "▼1"), ("長岡大手高校", 84, 29, "—"), ("東北学院高校", 71, 22, "▲3"),
           ("長岡工業高校", 66, 18, "▼1"), ("仙台三高", 52, 15, "—"), ("長岡商業高校", 47, 14, "▲2"), ("中越高校", 41, 12, "▼2"), ("宮城野高校", 38, 11, "—"), ("長岡向陵高校", 30, 9, "—"), ("新潟高校", 12, 4, "NEW")]

def screen_ranking():
    im = Image.new("RGB", (W, H), PAPER); dr = ImageDraw.Draw(im)
    header(dr, "高校対抗 来店バトル", "10月シーズン ｜ 参加 23校・312人 ｜ 残り 12日")
    tabs(dr, 236, ["全体", "長岡", "仙台", "県外"], 0)
    # 速報バー
    dr.rounded_rectangle((60, 326, W - 60, 392), 16, fill=(255, 240, 232)); dr.text((84, 342), "速報　帝京長岡が 2位に浮上（今日 +14回）", font=f(FB, 28), fill=RED)
    # 表彰台
    y = 420; card(dr, 60, y, W - 60, y + 470)
    pod = [(0, SCHOOLS[0], 380, 175), (1, SCHOOLS[1], 130, 140), (2, SCHOOLS[2], 640, 110)]
    for idx, (pos, s, x, h) in enumerate(pod):
        rank = pos + 1; col = [GOLD, (160, 160, 168), (176, 120, 80)][pos]
        bx0, bx1 = 60 + x, 60 + x + 300; base = y + 440
        dr.rounded_rectangle((bx0, base - h, bx1, base), 14, fill=col)
        dr.text((bx0 + 150 - tw(dr, str(rank), f(FB, 60)) / 2, base - h + 12), str(rank), font=f(FB, 60), fill=WHITE)
        # 校章の代わり: 頭文字の丸
        cx = bx0 + 150; dr.ellipse((cx - 56, base - h - 150, cx + 56, base - h - 38), fill=NAVY if pos else RED); dr.text((cx - tw(dr, s[0][0], f(FB, 52)) / 2, base - h - 128), s[0][0], font=f(FB, 52), fill=WHITE)
        nm = s[0]; fo = f(FB, 30 if len(nm) <= 6 else 26); dr.text((cx - tw(dr, nm, fo) / 2, base - h - 228), nm, font=fo, fill=INK)
        v = f"{s[1]}回"; dr.text((cx - tw(dr, v, f(FB, 40)) / 2, base - h - 300), v, font=f(FB, 40), fill=RED if pos == 0 else INK)
        dr.text((cx - tw(dr, f"{s[2]}人", f(FM, 24)) / 2, base - h - 262), f"{s[2]}人", font=f(FM, 24), fill=GRAY)
    dr.text((84, y + 24), "TOP 3", font=f(FB, 26), fill=GOLD)
    # 自分の学校の追い上げ
    y = 920; card(dr, 60, y, W - 60, y + 150, fill=PALE, outline=(232, 200, 180))
    dr.text((84, y + 22), "あなたの学校　長岡大手高校　4位　84回", font=f(FB, 30), fill=INK)
    dr.text((84, y + 72), "3位 仙台育英まで あと 13回 ｜ 今日 +6回 ｜ 参加 29人", font=f(FM, 27), fill=RED)
    dr.text((W - 84 - tw(dr, "友達を誘う ›", f(FB, 26)), y + 110), "友達を誘う ›", font=f(FB, 26), fill=NAVY)
    # 4位以下
    y = 1100; card(dr, 60, y, W - 60, y + 880); yy = y + 24; mx = SCHOOLS[0][1]
    for i, (nm, v, m, d) in enumerate(SCHOOLS[3:12], start=4):
        me = (nm == "長岡大手高校")
        if me: dr.rounded_rectangle((76, yy - 6, W - 76, yy + 84), 14, fill=PALE)
        dr.text((92, yy + 14), str(i), font=f(FB, 34), fill=RED); dr.text((160, yy + 8), nm, font=f(FB, 30), fill=INK)
        dr.text((160 + tw(dr, nm, f(FB, 30)) + 16, yy + 16), f"{m}人", font=f(FM, 24), fill=GRAY)
        bw = int((W - 420 - 160) * v / mx); dr.rounded_rectangle((160, yy + 54, 160 + max(bw, 8), yy + 66), 6, fill=RED if me else (206, 120, 104))
        dr.text((W - 92 - tw(dr, f"{v}回", f(FB, 30)), yy + 8), f"{v}回", font=f(FB, 30), fill=INK)
        dc = RED if d.startswith("▲") else (NAVY if d.startswith("▼") else GRAY); dr.text((W - 92 - tw(dr, d, f(FB, 22)), yy + 52), d, font=f(FB, 22), fill=dc)
        yy += 96
    dr.text((84, y + 24 + 9 * 96 + 2), "…参加待ち（あと1人で順位がつく）：新潟高校・仙台二華・柏崎高校", font=f(FM, 22), fill=GRAY)
    nav(dr); im.save(os.path.join(OUT, "mock_1_ranking.png"))

def screen_myschool():
    im = Image.new("RGB", (W, H), PAPER); dr = ImageDraw.Draw(im)
    header(dr, "長岡大手高校", "10月シーズン ｜ 4位 ｜ 参加 29人")
    y = 240; card(dr, 60, y, W - 60, y + 330)
    dr.text((84, y + 26), "今シーズンの来店", font=f(FM, 26), fill=GRAY); dr.text((84, y + 60), "84", font=f(FB, 120), fill=RED); dr.text((84 + tw(dr, "84", f(FB, 120)) + 12, y + 132), "回", font=f(FB, 40), fill=INK)
    dr.text((520, y + 70), "今日 +6回", font=f(FB, 30), fill=INK); dr.text((520, y + 120), "3位まで あと 13回", font=f(FB, 30), fill=RED); dr.text((520, y + 170), "1人あたり 2.9回", font=f(FM, 26), fill=GRAY)
    dr.text((84, y + 220), "あなたの来店　今月 5回（学校内で上位20%）", font=f(FM, 26), fill=INK)
    pill(dr, 84, y + 262, "本エントリー済み（報酬対象）", f(FB, 24), (232, 244, 236), (34, 110, 70))
    # 一週間の推移
    y = 610; card(dr, 60, y, W - 60, y + 300); dr.text((84, y + 22), "この1週間", font=f(FB, 26), fill=INK)
    vals = [9, 12, 7, 15, 11, 18, 6]; days = ["月", "火", "水", "木", "金", "土", "日"]
    for i, v in enumerate(vals):
        x = 110 + i * 130; h = v * 9; dr.rounded_rectangle((x, y + 240 - h, x + 70, y + 240), 8, fill=RED if i == 6 else (206, 120, 104))
        dr.text((x + 35 - tw(dr, str(v), f(FB, 24)) / 2, y + 240 - h - 32), str(v), font=f(FB, 24), fill=INK); dr.text((x + 35 - tw(dr, days[i], f(FM, 22)) / 2, y + 252), days[i], font=f(FM, 22), fill=GRAY)
    # 動き（タイムライン）
    y = 950; card(dr, 60, y, W - 60, y + 560); dr.text((84, y + 22), "動き", font=f(FB, 26), fill=INK)
    feed = [("14:02", "帝京長岡 が 仙台育英 を抜いて 2位に"), ("12:40", "長岡大手 に新しい仲間が参加（29人目）"), ("11:15", "仙台三高 が 参加待ち → 7位に登場"), ("昨日", "長岡大手 昨日の来店 15回（シーズン最多）"), ("昨日", "3位争い：仙台育英 97 vs 長岡大手 84")]
    yy = y + 76
    for t, s in feed:
        dr.text((84, yy + 4), t, font=f(FM, 22), fill=GRAY); dr.text((190, yy), s, font=f(FM, 27), fill=INK); dr.line((84, yy + 62, W - 84, yy + 62), fill=LINE, width=1); yy += 92
    # 誘う
    y = 1550; card(dr, 60, y, W - 60, y + 200, fill=(255, 250, 244), outline=(240, 220, 200))
    dr.text((84, y + 24), "あと 3人 参加すると 1人あたりの来店が…", font=f(FM, 26), fill=GRAY); dr.text((84, y + 64), "友達を誘って 3位を取りに行く", font=f(FB, 32), fill=INK)
    dr.rounded_rectangle((84, y + 124, 480, y + 180), 999, fill=RED); dr.text((84 + (396 - tw(dr, "招待リンクを送る", f(FB, 26))) / 2, y + 138), "招待リンクを送る", font=f(FB, 26), fill=WHITE)
    dr.rounded_rectangle((500, y + 124, 900, y + 180), 999, fill=WHITE, outline=NAVY, width=2); dr.text((500 + (400 - tw(dr, "参加をやめる／変える", f(FB, 24))) / 2, y + 140), "参加をやめる／変える", font=f(FB, 24), fill=NAVY)
    nav(dr); im.save(os.path.join(OUT, "mock_2_myschool.png"))

def screen_result():
    im = Image.new("RGB", (W, H), PAPER); dr = ImageDraw.Draw(im)
    header(dr, "10月シーズン 結果", "10/7〜10/31 ｜ 参加 23校・312人 ｜ 来店 合計 812回")
    y = 240; card(dr, 60, y, W - 60, y + 520, fill=(255, 251, 240), outline=(236, 214, 170))
    dr.text((84, y + 26), "優勝", font=f(FB, 30), fill=GOLD)
    cx = W / 2; dr.ellipse((cx - 90, y + 80, cx + 90, y + 260), fill=RED); dr.text((cx - tw(dr, "長", f(FB, 90)) / 2, y + 108), "長", font=f(FB, 90), fill=WHITE)
    dr.text((cx - tw(dr, "長岡高校", f(FB, 56)) / 2, y + 280), "長岡高校", font=f(FB, 56), fill=INK)
    dr.text((cx - tw(dr, "156回 ｜ 41人", f(FM, 30)) / 2, y + 356), "156回 ｜ 41人", font=f(FM, 30), fill=GRAY)
    pill(dr, cx - 250, y + 410, "本エントリーの全員に 200P プレゼント", f(FB, 26), RED)
    dr.text((cx - tw(dr, "＋ 11月は「来店ポイント 2倍」の称号つき", f(FM, 24)) / 2, y + 476), "＋ 11月は「来店ポイント 2倍」の称号つき", font=f(FM, 24), fill=INK)
    y = 800; card(dr, 60, y, W - 60, y + 300)
    rows = [("2位", "帝京長岡高校", "141回", "全員に 100P"), ("3位", "仙台育英高校", "120回", "全員に 50P"), ("MVP校", "東北学院高校", "1人あたり 4.1回", "全員に 50P（少人数でも狙える）")]
    yy = y + 24
    for a, b, c, d in rows:
        dr.text((84, yy), a, font=f(FB, 28), fill=RED); dr.text((190, yy), b, font=f(FB, 28), fill=INK); dr.text((190, yy + 40), c + " ｜ " + d, font=f(FM, 24), fill=GRAY); yy += 92
    y = 1140; card(dr, 60, y, W - 60, y + 380)
    dr.text((84, y + 24), "あなた", font=f(FB, 26), fill=INK); dr.text((84, y + 70), "長岡高校 ｜ 本エントリー ｜ 今月の来店 7回", font=f(FM, 27), fill=GRAY)
    dr.rounded_rectangle((84, y + 130, W - 84, y + 230), 20, fill=PALE); dr.text((110, y + 150), "200P を受け取る", font=f(FB, 34), fill=RED); dr.text((110, y + 196), "受け取りは店頭で。スタッフに学生証（生徒手帳）を見せてタップ", font=f(FM, 22), fill=INK)
    dr.text((84, y + 262), "受け取り期限 11/30 ｜ 1人1回 ｜ 学校名が確認できない場合は無効", font=f(FM, 22), fill=GRAY)
    pill(dr, 84, y + 306, "11月シーズン エントリー受付中（〜11/15）", f(FB, 24), NAVY)
    y = 1560; card(dr, 60, y, W - 60, y + 380); dr.text((84, y + 24), "シーズンの流れ", font=f(FB, 26), fill=INK)
    steps = [("〜15日", "エントリー期間（途中参加OK・来店は参加した日から数える）"), ("16日〜", "本戦（新規参加は「次シーズンから」の予告表示・閲覧はできる）"), ("月末", "締め切り → 結果発表 → 翌月に店頭で受け取り")]
    yy = y + 76
    for a, b in steps:
        dr.text((84, yy), a, font=f(FB, 26), fill=RED); dr.text((230, yy), b, font=f(FM, 24), fill=INK); yy += 70
    nav(dr); im.save(os.path.join(OUT, "mock_3_result.png"))

screen_ranking(); screen_myschool(); screen_result(); print("ok", OUT)
