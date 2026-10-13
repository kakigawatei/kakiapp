#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""柿川亭アプリ POP のキービジュアルを fal で作る（Macで実行: ~/.fal_key を使う）
   usage: python3 fal_pop_gen.py <outdir>
   候補: A/B = GPT Image 2（文字が得意・ポスター丸ごと）, C = Nano Banana 2（イラストのみ・文字なし＝あとでHTMLで文字を載せる）"""
import sys, os, json, time, urllib.request

KEY = open(os.path.expanduser("~/.fal_key")).read().strip()
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/fal_pop"
os.makedirs(OUT, exist_ok=True)

def call(endpoint, payload):
    req = urllib.request.Request("https://queue.fal.run/" + endpoint, data=json.dumps(payload).encode(),
                                 headers={"Authorization": "Key " + KEY, "Content-Type": "application/json"})
    j = json.load(urllib.request.urlopen(req, timeout=60))
    st, rs = j["status_url"], j["response_url"]
    for _ in range(120):
        time.sleep(3)
        s = json.load(urllib.request.urlopen(urllib.request.Request(st, headers={"Authorization": "Key " + KEY}), timeout=60))
        if s.get("status") == "COMPLETED":
            r = json.load(urllib.request.urlopen(urllib.request.Request(rs, headers={"Authorization": "Key " + KEY}), timeout=60))
            return r
        if s.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(json.dumps(s)[:400])
    raise TimeoutError(endpoint)

COMMON = ("Design language: Japanese noodle shop poster, printed on cream paper (#f2ecdd), only three inks: sumi black, vermilion red (#d7301f), cream. "
          "Bold Japanese Mincho typography as the main graphic element, generous negative space, subtle paper grain, hand-cut collage feel. "
          "No cute mascots, no gradients, no western template look, no stock-photo feel. ")

JOBS = {}
JOBS_ALL = {
  "A_gpt_poster": ("openai/gpt-image-2", {
      "prompt": COMMON + "A4 portrait in-store poster for a smartphone loyalty app of the abura-soba (oil noodle) restaurant 柿川亭. "
                "Center: one beautiful bowl of abura soba (thick noodles, chashu pork, menma, seaweed, green onion) painted in flat ink illustration with vermilion accents. "
                "Large vertical Japanese headline text exactly: 「来るたび、たまる。」 Sub text exactly: 「柿川亭アプリ」 and 「850Pで油そば一杯」. "
                "Leave an empty white square area at the bottom right for a QR code (draw only an empty white square with a thin black border). "
                "Keep all Japanese text crisp, correct and legible.",
      "quality": "high"}),
  "B_gpt_poster2": ("openai/gpt-image-2", {
      "prompt": COMMON + "A4 portrait in-store poster for a smartphone loyalty app of the abura-soba restaurant 柿川亭. "
                "Composition: a huge vermilion circle like a rising sun fills the upper half; inside it a top-down bowl of abura soba as a bold ink illustration. "
                "Below, horizontal Japanese headline exactly 「来店で、ポイント。」 in heavy Mincho, and a smaller line exactly 「柿川亭アプリ　無料」. "
                "Bottom right: an empty white square with thin black border reserved for a QR code. Keep Japanese text crisp and correct.",
      "quality": "high"}),
  "C_nb2_illust": ("fal-ai/nano-banana-2", {
      "prompt": COMMON + "Key visual only, NO TEXT anywhere: a top-down bowl of abura soba (thick wavy noodles glossy with oil, sliced chashu pork, menma, nori, chopped green onion, a raw egg yolk) "
                "drawn as a bold flat ink illustration with vermilion and sumi black on cream paper, a vermilion circle behind the bowl, rising steam as thin ink lines, paper texture. Portrait 3:4.",
      "aspect_ratio": "3:4"}),
}

JOBS = {k: v for k, v in JOBS_ALL.items() if k.startswith(tuple(sys.argv[2].split(","))) } if len(sys.argv) > 2 else JOBS_ALL
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
            print(name, fn, f"{time.time()-t:.0f}s", im.get("width"), im.get("height"), flush=True)
    except Exception as e:
        print(name, "ERROR", str(e)[:300], flush=True)
