# -*- coding: utf-8 -*-
"""かきあつめアプリ 日報の画像（Instagram ストーリーズ 1080×1920）と A4 1枚 PDF。VIE トーン（黒地・金・赤1点・極細罫線）。
   入力＝scripts/kakiapp_daily.mjs が書く JSON（docs/daily/YYYY-MM-DD.json）。
   使い方: PYTHONUTF8=1 python make_daily.py docs/daily/2026-09-21.json [out_dir]
   出力: daily_YYYY-MM-DD_story.png（公開用・登録者/来店/推移）, daily_YYYY-MM-DD.pdf（内部用・全部入り）"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
FB = "C:/Windows/Fonts/YuGothB.ttc"; FM = "C:/Windows/Fonts/YuGothM.ttc"; FMIN = "C:/Windows/Fonts/yumindb.ttf"
def f(p, s): return ImageFont.truetype(p, s)
GOLD = (214, 170, 80); INK = (255, 255, 255); SUB = (190, 180, 165); DIM = (110, 104, 96); BG = (12, 12, 12); RED = (200, 30, 30); LINE = (70, 64, 56)
STORE = {"nagaoka": "長岡本店", "sendai": "仙台", "kakigawatei": "長岡本店", "kakigawatei_sendai": "仙台"}
def sn(k): return STORE.get(k, k)
def spaced(dr, xy, s, font, fill, gap):
    x, y = xy
    for ch in s: dr.text((x, y), ch, font=font, fill=fill); x += dr.textlength(ch, font=font) + gap
def jp_date(d): return f"{d[:4]}.{d[5:7]}.{d[8:10]}"
def wd(d):
    import datetime; return "月火水木金土日"[datetime.date(int(d[:4]), int(d[5:7]), int(d[8:10])).weekday()]

def kpi(dr, x, y, label, en, value, unit, sub, big=150, col=GOLD):
    spaced(dr, (x, y), en, f(FB, 22), col, 6)
    dr.text((x, y + 30), label, font=f(FM, 26), fill=SUB)
    fo = f(FMIN, big); dr.text((x - 6, y + 60), str(value), font=fo, fill=INK)
    dr.text((x + dr.textlength(str(value), font=fo) + 8, y + 60 + big - 44), unit, font=f(FM, 30), fill=SUB)
    if sub: dr.text((x, y + 60 + big + 16), sub, font=f(FM, 24), fill=SUB)
    return y + 60 + big + 60

def bars(dr, x, y, w, h, series, days, col=GOLD, label=""):
    """14日の縦棒。最後の日（対象日）だけ明るく"""
    n = len(series); mx = max(series) if series and max(series) > 0 else 1
    bw = (w - (n - 1) * 8) / n
    for i, v in enumerate(series):
        bh = int(h * v / mx); x0 = x + i * (bw + 8); c = col if i == n - 1 else (120, 100, 60)
        dr.rectangle((x0, y + h - bh, x0 + bw, y + h), fill=c if v > 0 else (40, 38, 34))
        if v > 0 and (i == n - 1 or v == mx): dr.text((x0 + bw / 2 - dr.textlength(str(v), font=f(FB, 20)) / 2, y + h - bh - 28), str(v), font=f(FB, 20), fill=INK if i == n - 1 else SUB)
        if i in (0, n // 2, n - 1): d = days[i]; dr.text((x0 + bw / 2 - dr.textlength(d[5:].replace("-", "/"), font=f(FM, 18)) / 2, y + h + 8), d[5:].replace("-", "/"), font=f(FM, 18), fill=DIM)
    dr.line((x, y + h, x + w, y + h), fill=LINE, width=1)
    if label: dr.text((x, y - 34), label, font=f(FM, 22), fill=SUB)
    return y + h + 40

def hbars(dr, x, y, w, items, col=GOLD, unit=""):
    mx = max([v for _, v in items] or [1]) or 1
    for k, v in items:
        dr.text((x, y), k, font=f(FM, 24), fill=INK); tv = f"{v:,}{unit}"; dr.text((x + w - dr.textlength(tv, font=f(FB, 24)), y), tv, font=f(FB, 24), fill=GOLD)
        dr.rectangle((x, y + 36, x + int(w * v / mx), y + 42), fill=col); dr.line((x, y + 42, x + w, y + 42), fill=LINE, width=1)
        y += 66
    return y

def footer(dr, W, H, bottom_safe, right):
    by = H - bottom_safe - 130
    dr.line((60, by, W - 60, by), fill=GOLD, width=1)
    dr.text((60, by + 24), "油そば 柿川亭", font=f(FMIN, 40), fill=INK); spaced(dr, (60, by + 84), "KAKIGAWATEI", f(FM, 20), SUB, 6)
    dr.text((W - 60 - dr.textlength(right, font=f(FM, 22)), by + 40), right, font=f(FM, 22), fill=SUB)

def head(dr, y, small, en, title, sub=None):
    dr.rectangle((60, y, 124, y + 64), fill=RED)
    dr.text((60, y + 100), small, font=f(FM, 28), fill=SUB)
    spaced(dr, (60, y + 150), en, f(FB, 34), GOLD, 12)
    dr.text((52, y + 190), title, font=f(FMIN, 120), fill=INK)
    if sub: dr.text((60, y + 340), sub, font=f(FM, 28), fill=SUB)
    return y + 400

def story(r):
    W, H = 1080, 1920; im = Image.new("RGB", (W, H), BG); dr = ImageDraw.Draw(im); d = r["day"]
    s_ = r.get("series") or {}; vs = s_.get("visits") or []
    if r["newUsers"] >= 10: tag = f"きのうも {r['newUsers']}人が仲間入り。ありがとうございます。"
    elif vs and r["visitsDay"] >= max(vs): tag = "きのうは、この2週間でいちばん来てもらえた日。"
    elif r["visitsDay"] == 0: tag = "きょうは、あなたの一杯から。"
    else: tag = ["みんなの来店が、毎日つみ上がっています。", "一杯ごとに、ポイントとガチャ。", "今日も、いつもの一杯を。"][int(d[8:10]) % 3]
    y = head(dr, 240 + 20, f"柿川亭アプリ ｜ {jp_date(d)}（{wd(d)}）", "DAILY REPORT", "アプリ日報", tag)
    dr.line((60, y, W - 60, y), fill=GOLD, width=2); y += 40
    y2 = kpi(dr, 60, y, "登録者（累計）", "MEMBERS", f"{r['users']:,}", "人", f"きのう +{r['newUsers']} ／ 今月 +{r['newUsersMonth']}", big=170)
    kpi(dr, 600, y, "きのうの来店", "VISITS", r["visitsDay"], "回", f"今月 {r['visitsMonth']}回 ／ 累計 {r['visitsTotal']}回", big=170)
    y = y2 + 10
    s = r.get("series") or {}
    if s.get("days"):
        y = bars(dr, 60, y + 40, W - 120, 220, s["visits"], s["days"], label="来店回数の推移（14日）")
    y += 10
    items = sorted(r.get("storeTotal", {}).items(), key=lambda kv: -kv[1])
    if items:
        dr.text((60, y), "店舗別の来店（累計）", font=f(FM, 22), fill=SUB); y = hbars(dr, 60, y + 40, W - 120, [(sn(k), v) for k, v in items], unit="回")
    footer(dr, W, H, 270, "柿川亭アプリ ｜ 来店でポイント・ガチャ")
    return im

def pdf_page(r):
    W, H = 1240, 1754; im = Image.new("RGB", (W, H), BG); dr = ImageDraw.Draw(im); d = r["day"]
    y = head(dr, 70, f"かきあつめアプリ 運営日報 ｜ 対象日 {jp_date(d)}（{wd(d)}） ｜ 本番 Firestore 集計", "DAILY REPORT  /  INTERNAL", "アプリ日報")
    dr.line((60, y - 30, W - 60, y - 30), fill=GOLD, width=2)
    y2 = kpi(dr, 60, y, "登録者（累計）", "MEMBERS", f"{r['users']:,}", "人", f"当日 +{r['newUsers']} ／ 今月 +{r['newUsersMonth']}", big=120)
    kpi(dr, 460, y, "当日の来店", "VISITS", r["visitsDay"], "回", f"{r['visitorsDay']}人 ／ 今月 {r['visitsMonth']}回 ／ 累計 {r['visitsTotal']}回", big=120)
    kpi(dr, 860, y, "当日の付与", "POINTS", f"{r['pointsDayTotal']:,}", "P", f"使用 {r['spentDay']}P ／ 今月付与 {r['pointsMonthTotal']:,}P", big=120)
    y = y2
    s = r.get("series") or {}
    if s.get("days"):
        y = bars(dr, 60, y + 40, 560, 180, s["visits"], s["days"], label="来店回数（14日）")
        bars(dr, 660, y - 220, 520, 180, s["newUsers"], s["days"], col=RED, label="新規登録（14日）")
    colw = 520
    yl = y + 10; dr.text((60, yl), "店舗別", font=f(FB, 24), fill=GOLD); yl += 40
    st = sorted(r.get("storeTotal", {}).items(), key=lambda kv: -kv[1]); sd = r.get("storeDay", {})
    yl = hbars(dr, 60, yl, colw, [(f"{sn(k)}（当日 {sd.get(k, 0)}）", v) for k, v in st] or [("記録なし", 0)], unit="回")
    dr.text((60, yl + 6), f"今月に来店ありの人: {r['activeMonth']}人（登録者の {round(100 * r['activeMonth'] / max(1, r['users']))}%）", font=f(FM, 22), fill=SUB); yl += 50
    yr = y + 10; dr.text((660, yr), "ポイント内訳（当日付与）", font=f(FB, 24), fill=GOLD); yr += 40
    pd = sorted(r.get("pointsDay", {}).items(), key=lambda kv: -kv[1])
    yr = hbars(dr, 660, yr, colw, pd or [("付与なし", 0)], unit="P")
    dr.text((660, yr + 6), f"残高合計 {r['balanceTotal']:,}P（全員のいま使えるポイント）", font=f(FM, 22), fill=SUB); yr += 50
    y = max(yl, yr) + 30
    dr.text((60, y), "学校対抗 来店バトル", font=f(FB, 24), fill=GOLD); y += 40
    tt = r.get("teamTop") or []
    dr.text((60, y), f"エントリー {r['teams']}校 ・ 参加 {r['teamMembers']}人" + ("　今月トップ: " + "／".join(f"{t['name']}（{t['kind']}）{t['v']}回" for t in tt) if tt else ""), font=f(FM, 24), fill=INK); y += 44
    dr.text((60, y), "※ ダウンロード数（iOS）は App Store Connect の売上レポート接続後に追加。Android は審査通過後。", font=f(FM, 20), fill=DIM)
    footer(dr, W, H, 40, "自動生成 ｜ scripts/kakiapp_daily.mjs → pop/ig_story/make_daily.py")
    return im

if __name__ == "__main__":
    r = json.load(open(sys.argv[1], encoding="utf-8")); out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    os.makedirs(out, exist_ok=True); d = r["day"]
    p1 = os.path.join(out, f"daily_{d}_story.png"); story(r).save(p1)
    p2 = os.path.join(out, f"daily_{d}.pdf"); pg = pdf_page(r); pg.save(p2, "PDF", resolution=150); pg.save(os.path.join(out, f"daily_{d}_pdf.png"))
    print(p1); print(p2)
