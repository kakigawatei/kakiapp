#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""masaの参考デザイン（生成り・赤茶・紺・金・線画アイコン）に合わせた絵を GPT Image 2（fal）で作る。Macで実行。
   出力 /tmp/app_warm/*.png（アイコン・機械・バッジはマゼンタ背景→クロマキー、ヒーローは写真そのまま）"""
import os, json, time, base64, urllib.request
KEY = open(os.path.expanduser("~/.fal_key")).read().strip()
OUT = "/tmp/app_warm"; os.makedirs(OUT, exist_ok=True)

def call(ep, payload):
    req = urllib.request.Request("https://queue.fal.run/" + ep, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Key " + KEY, "Content-Type": "application/json"})
    j = json.load(urllib.request.urlopen(req, timeout=60)); st, rs = j["status_url"], j["response_url"]
    for _ in range(120):
        time.sleep(3)
        s = json.load(urllib.request.urlopen(urllib.request.Request(st, headers={"Authorization": "Key " + KEY}), timeout=60))
        if s.get("status") == "COMPLETED":
            return json.load(urllib.request.urlopen(urllib.request.Request(rs, headers={"Authorization": "Key " + KEY}), timeout=60))
        if s.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(json.dumps(s)[:200])
    raise TimeoutError(ep)

def gen(name, payload, ep="openai/gpt-image-2"):
    t = time.time()
    for p in (payload, {k: v for k, v in payload.items() if k != "image_size"}):
        try:
            r = call(ep, p); url = (r.get("images") or [r.get("image")])[0]["url"]
            urllib.request.urlretrieve(url, os.path.join(OUT, name + ".png")); print(name, "ok", "%.0fs" % (time.time() - t), flush=True); return
        except Exception as e:
            err = str(e)[:140]
    print(name, "ERROR", err, flush=True)

# 1) ヒーロー: 実物の丼写真を、暗い木のテーブルの上に（写真のまま・文字なし）
bowl = "data:image/jpeg;base64," + base64.b64encode(open("/tmp/fal_pop/ref_bowl.jpg", "rb").read()).decode()
gen("hero_photo", {"image_urls": [bowl], "prompt": "Keep this exact bowl of abura soba unchanged (same bowl, toppings, angle). Place it on a dark brown wooden table with warm soft lighting, slightly moody restaurant atmosphere, shallow depth of field, the bowl on the right half of a wide 16:9 frame with empty dark wood on the left for text. Photorealistic. No text.", "quality": "high", "image_size": "landscape"}, ep="openai/gpt-image-2/edit")

LINE = ("Single-line icon illustration, thin elegant brown-red (#8a3a2a) line art, Japanese restaurant app style, minimal, no fill except tiny accents, no text, centered, "
        "background completely flat solid magenta (#FF00FF), object not touching edges. ")
for nm, d in {
  "icon_bowl": "a bowl of noodles with chopsticks lifting noodles",
  "icon_wheel": "a small ferris wheel with gondolas",
  "icon_lantern": "a Japanese paper lantern (chochin)",
  "icon_ticket": "a coupon ticket with a dotted tear line",
  "icon_person": "a simple person bust (profile avatar)",
  "icon_bell": "a notification bell",
  "icon_home": "a simple house outline",
}.items():
    gen(nm, {"prompt": LINE + d, "quality": "medium", "image_size": "square"})

WARM = ("Flat illustration in a warm Japanese restaurant palette: cream (#F4EFE6), brown-red (#A63A2A), deep navy (#1F2F5A), muted gold (#C4913C), dark brown outline (#3A2A20). "
        "Soft, premium, slightly hand-drawn, no text, centered single object, background completely flat solid magenta (#FF00FF) with no shadow, object not touching edges. ")
gen("gacha_machine", {"prompt": WARM + "A capsule toy vending machine (gashapon) front view: cream body with dark brown outline, a big round window full of brown-red and navy and gold capsule balls, a gold turning knob, a dark brown base with a cream outlet, a small paper lantern decoration on top.", "quality": "high", "image_size": "square"})
gen("capsule_closed", {"prompt": WARM + "A single round gashapon capsule ball, top half brown-red and bottom half cream, dark brown outline, small highlight.", "quality": "medium", "image_size": "square"})
for nm, d in {
  "badge_bronze": "A round medal badge for a beginner rank: cream face with a noodle bowl icon in dark brown line, a brown-red ribbon at the bottom.",
  "badge_silver": "A round medal badge for a regular rank: cream face with a noodle bowl icon and one gold star, navy ribbon.",
  "badge_gold": "A round medal badge for an expert rank: gold face with a noodle bowl icon in dark brown, three stars, brown-red laurel.",
  "badge_rainbow": "A round medal badge for a master rank: brown-red face with a noodle bowl icon in cream, cream flame halo, gold laurel wreath, a gold star on top.",
  "badge_king": "A round medal badge for a legendary rank: navy face with a noodle bowl icon in gold, a gold crown on top, gold and cream laurel wreath.",
  "badge_founder": "A round medal badge for a founding member: cream face split diagonally with brown-red, a noodle bowl icon in dark brown, a small navy flag.",
}.items():
    gen(nm, {"prompt": WARM + d, "quality": "medium", "image_size": "square"})
