#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""柿川亭アプリ POP 第2ラウンド（masa 🇧: お店の実物の色。看板・のれん・丼の写真を土台にする）
   Macで実行: python3 fal_pop_gen2.py <outdir> [D,E,F]   参照画像は /tmp/fal_pop/ref_*.jpg"""
import sys, os, json, time, base64, urllib.request

KEY = open(os.path.expanduser("~/.fal_key")).read().strip()
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/fal_pop"
os.makedirs(OUT, exist_ok=True)

def data_uri(p):
    return "data:image/jpeg;base64," + base64.b64encode(open(p, "rb").read()).decode()

BOWL = data_uri("/tmp/fal_pop/ref_bowl.jpg")
NOREN = data_uri("/tmp/fal_pop/ref_noren.jpg")
LOGO = data_uri("/tmp/fal_pop/ref_logo.jpg")

def call(endpoint, payload):
    req = urllib.request.Request("https://queue.fal.run/" + endpoint, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Key " + KEY, "Content-Type": "application/json"})
    j = json.load(urllib.request.urlopen(req, timeout=120))
    st, rs = j["status_url"], j["response_url"]
    for _ in range(160):
        time.sleep(3)
        s = json.load(urllib.request.urlopen(urllib.request.Request(st, headers={"Authorization": "Key " + KEY}), timeout=60))
        if s.get("status") == "COMPLETED":
            return json.load(urllib.request.urlopen(urllib.request.Request(rs, headers={"Authorization": "Key " + KEY}), timeout=60))
        if s.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(json.dumps(s)[:400])
    raise TimeoutError(endpoint)

REAL = ("Use the real restaurant's look from the reference photos: white noren with the red brush-calligraphy 油 logo and black 柿川亭 lettering, "
        "white bowls, golden oil-coated noodles, green onion, nori. Colors must come from the photos (white, the logo's red, black, golden yellow, green). "
        "Clean, appetizing, modern Japanese ramen-shop feel. No mascots, no cartoon style. ")

JOBS_ALL = {
  # D: 実写の丼を主役にしたポスター丸ごと（GPT Image 2 edit・文字入り）
  "D_gpt_real_poster": ("openai/gpt-image-2/edit", {
      "image_urls": [BOWL, NOREN, LOGO],
      "prompt": REAL + "Create an A4 portrait in-store poster for the restaurant's smartphone loyalty app. Hero: the exact bowl from photo 1 as a clean photographic cutout on a white background with a soft shadow. "
                "Use the exact logo from photo 3 at the top. Big Japanese headline exactly 「来るたび、たまる。」 in bold Gothic, sub line exactly 「柿川亭アプリ」, and 「850Pで油そば一杯」. "
                "Bottom right: an empty white square with a thin black border reserved for a QR code. Keep every Japanese character correct and crisp.",
      "quality": "high"}),
  # E: 実写の丼を白背景に切り抜いただけ（Nano Banana 2 edit・文字なし＝文字とQRはHTMLで載せる）
  "E_nb2_bowl_cutout": ("fal-ai/nano-banana-2/edit", {
      "image_urls": [BOWL],
      "prompt": "Keep this exact bowl of abura soba photo unchanged (same bowl, same toppings, same angle, same colors). Replace the background with pure white, add a soft natural shadow under the bowl, "
                "product-photo quality, sharp, appetizing, slight steam. No text, no extra objects.",
      "aspect_ratio": "1:1"}),
  # F: のれんの世界観でポスター（GPT Image 2 edit・文字入り・写真質感）
  "F_gpt_noren_poster": ("openai/gpt-image-2/edit", {
      "image_urls": [NOREN, BOWL, LOGO],
      "prompt": REAL + "Create an A4 portrait poster that feels like standing in front of this shop: white noren fabric texture as the background, the red 油 calligraphy large, "
                "the real bowl from photo 2 photographed from above in the lower half. Headline exactly 「来店で、ポイント。」 in bold black Gothic, small line exactly 「柿川亭アプリ　無料」. "
                "Bottom right: an empty white square with a thin black border for a QR code. Keep the Japanese text correct.",
      "quality": "high"}),
}

JOBS = {k: v for k, v in JOBS_ALL.items() if k.startswith(tuple(sys.argv[2].split(",")))} if len(sys.argv) > 2 else JOBS_ALL
for name, (ep, payload) in JOBS.items():
    t = time.time()
    try:
        r = call(ep, payload)
        imgs = r.get("images") or [r.get("image")]
        for i, im in enumerate(imgs):
            url = im["url"]
            ext = ".png" if ".png" in url else ".jpg"
            fn = os.path.join(OUT, f"{name}{'' if i == 0 else i}{ext}")
            urllib.request.urlretrieve(url, fn)
            print(name, fn, f"{time.time()-t:.0f}s", flush=True)
    except Exception as e:
        print(name, "ERROR", str(e)[:300], flush=True)
