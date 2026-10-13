# -*- coding: utf-8 -*-
"""学校対抗 来店バトル 結果発表の Instagram 用画像（フィード 1080×1350 とストーリーズ 1080×1920）。
   入力＝season_close.mjs が書く JSON（/tmp/season_YYYY-MM.json を scp したもの）。VIE トーン（黒地・金・赤1点）。
   使い方: PYTHONUTF8=1 python make_result.py <season.json> [out_dir]"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
FB = "C:/Windows/Fonts/YuGothB.ttc"; FM = "C:/Windows/Fonts/YuGothM.ttc"; FMIN = "C:/Windows/Fonts/yumindb.ttf"
def f(p, s): return ImageFont.truetype(p, s)
GOLD = (214, 170, 80); SILVER = (190, 192, 200); BRONZE = (196, 140, 96); PURPLE = (170, 130, 220); INK = (255, 255, 255); SUB = (190, 180, 165); BG = (12, 12, 12); RED = (200, 30, 30)
def draw(data, W, H, top_safe=0, bottom_safe=0):
    im = Image.new("RGB", (W, H), BG); dr = ImageDraw.Draw(im)
    rl = "第0回（お試し）" if (data.get("round") == 0 or data.get("trial")) else f"第{data.get('round')}回"
    m = data.get("month", ""); mo = f"{m[:4]}年{int(m[5:7])}月" if len(m) >= 7 else ""
    y = top_safe + 60
    dr.rectangle((60, y, 124, y + 64), fill=RED)
    dr.text((60, y + 100), f"{rl} 学校対抗 来店バトル ｜ {mo} ｜ 参加 {data.get('schools', 0)}校・{data.get('participants', 0)}人", font=f(FM, 28), fill=SUB)
    x = 60
    for ch in "RESULT": dr.text((x, y + 160), ch, font=f(FB, 34), fill=GOLD); x += dr.textlength(ch, font=f(FB, 34)) + 12
    dr.text((52, y + 200), "結果発表", font=f(FMIN, 150), fill=GOLD)
    yy = y + 400; dr.line((60, yy, W - 60, yy), fill=GOLD, width=2); yy += 30
    ranked = data.get("ranked") or []
    for r in ranked[:3]:
        col = [GOLD, SILVER, BRONZE][r["rank"] - 1]; lab = ["優勝", "準優勝", "3位"][r["rank"] - 1]
        dr.text((60, yy), lab, font=f(FB, 30), fill=col)
        nm = r["name"]; fo = f(FMIN, 84 if len(nm) <= 6 else 66); dr.text((60, yy + 40), nm, font=fo, fill=INK)
        dr.text((60, yy + 140), f"来店 {r['visits']}回 ｜ 参加 {r['members']}人", font=f(FM, 28), fill=SUB)
        yy += 200
    if not ranked: dr.text((60, yy), "順位のつく学校（参加2人以上）はありませんでした", font=f(FM, 30), fill=SUB); yy += 60
    mvp = data.get("mvp")
    if mvp:
        dr.text((60, yy), "MVP校（1人あたり最多）", font=f(FB, 26), fill=PURPLE); dr.text((60, yy + 36), f"{mvp['name']}  {mvp['per']}回／人", font=f(FMIN, 50), fill=INK); yy += 120
    by = H - bottom_safe - 130
    dr.line((60, by, W - 60, by), fill=GOLD, width=1)
    dr.text((60, by + 24), "油そば 柿川亭", font=f(FMIN, 40), fill=INK)
    x = 60
    for ch in "KAKIGAWATEI": dr.text((x, by + 84), ch, font=f(FM, 20), fill=SUB); x += dr.textlength(ch, font=f(FM, 20)) + 6
    t = "柿川亭アプリ ｜ 学校対抗 来店バトル"; dr.text((W - 60 - dr.textlength(t, font=f(FM, 22)), by + 40), t, font=f(FM, 22), fill=SUB)
    return im
if __name__ == "__main__":
    data = json.load(open(sys.argv[1], encoding="utf-8")); out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    os.makedirs(out, exist_ok=True); m = data.get("month", "season")
    draw(data, 1080, 1350).save(os.path.join(out, f"result_{m}_feed.png")); draw(data, 1080, 1920, 240, 270).save(os.path.join(out, f"result_{m}_story.png"))
    print(os.path.join(out, f"result_{m}_feed.png")); print(os.path.join(out, f"result_{m}_story.png"))
