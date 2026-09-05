#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""アプリの絵を GPT Image 2（fal）で白黒赤に描き直す（masa 2026-09-06「image2も使って」）。Macで実行。
   出力: /tmp/app_assets/*.png（マゼンタ背景→Windows側でクロマキー）"""
import os, json, time, urllib.request
KEY = open(os.path.expanduser("~/.fal_key")).read().strip()
OUT = "/tmp/app_assets"; os.makedirs(OUT, exist_ok=True)

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

STYLE = ("Flat, bold, modern Japanese graphic style. Strictly three colors only: pure white (#FFFFFF), ink black (#111111), vermilion red (#FF1717). "
         "Thick black outlines, no gradients, no shading, no text, no letters. Centered single object. "
         "Background must be completely flat solid magenta (#FF00FF) with no shadow; the object must not touch the frame edges. ")
JOBS = {
  "gacha_machine": "A cute capsule toy vending machine (gashapon) seen from the front: white body with thick black outline, a big round window full of red and black capsule balls, a red turning knob, a black base with a white capsule outlet.",
  "capsule_closed": "A single round gashapon capsule ball, top half red and bottom half white, thick black outline, slight white highlight.",
  "capsule_open": "A single round gashapon capsule ball opened into two halves (red top half and white bottom half) lying apart, thick black outline.",
  "badge_bronze": "A round enamel medal badge for a beginner rank: white face with a bowl of noodles icon in black line, a red ribbon at the bottom, thick black outline.",
  "badge_silver": "A round enamel medal badge for a regular rank: white face with a bowl of noodles icon and one red star, black ribbon at the bottom, thick black outline.",
  "badge_gold": "A round enamel medal badge for an expert rank: red face with a bowl of noodles icon in white, three white stars, black laurel around, thick black outline.",
  "badge_king": "A round enamel medal badge for the top rank: black face with a bowl of noodles icon in white, a red crown on top, red and white laurel wreath, thick black outline.",
  "badge_founder": "A round enamel medal badge for a founding member: white face split diagonally with red, a bowl of noodles icon in black, a small black flag, thick black outline.",
}
for name, desc in JOBS.items():
    t = time.time()
    try:
        r = call("openai/gpt-image-2", {"prompt": STYLE + desc, "quality": "high", "image_size": "square"})
        url = (r.get("images") or [r.get("image")])[0]["url"]
        fn = os.path.join(OUT, name + ".png"); urllib.request.urlretrieve(url, fn)
        print(name, "ok", "%.0fs" % (time.time() - t), flush=True)
    except Exception as e:
        # image_size が通らない場合はサイズ指定なしで再試行
        try:
            r = call("openai/gpt-image-2", {"prompt": STYLE + desc, "quality": "high"})
            url = (r.get("images") or [r.get("image")])[0]["url"]
            fn = os.path.join(OUT, name + ".png"); urllib.request.urlretrieve(url, fn)
            print(name, "ok(no-size)", "%.0fs" % (time.time() - t), flush=True)
        except Exception as e2:
            print(name, "ERROR", str(e2)[:160], flush=True)
