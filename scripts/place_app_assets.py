# -*- coding: utf-8 -*-
"""GPT Image 2 で作った絵（マゼンタ背景）をクロマキーしてアプリに置く。
   入力: pop/fal/app_assets/*.png（Macから取得）  出力: assets/badge_*.png（816×816 透過）, assets/gacha_machine.png, assets/capsule_*.png"""
import os, sys, glob
from PIL import Image, ImageFilter
import numpy as np
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = "pop/fal/app_assets"

def key_magenta(path):
    im = Image.open(path).convert("RGB"); a = np.asarray(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 150) & (b > 150) & (g < 110) & ((r - g) > 80) & ((b - g) > 80)
    alpha = np.where(mag, 0, 255).astype(np.uint8)
    al = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgb = a.copy(); edge = (np.asarray(al) > 0) & (np.asarray(al) < 255)
    rgb[..., 1] = np.where(edge, np.maximum(rgb[..., 1], (rgb[..., 0] + rgb[..., 2]) // 2), rgb[..., 1])
    out = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA"); out.putalpha(al)
    bbox = al.getbbox()
    return out.crop(bbox) if bbox else out

def square(im, size, pad=0.06):
    w, h = im.size; s = int(max(w, h) * (1 + pad * 2))
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0)); canvas.paste(im, ((s - w) // 2, (s - h) // 2), im)
    return canvas.resize((size, size), Image.LANCZOS)

done = []
for name in ("bronze", "silver", "gold", "rainbow", "king", "founder"):
    p = os.path.join(SRC, "badge_%s.png" % name)
    if not os.path.exists(p): print("missing", p); continue
    im = key_magenta(p); square(im, 816).save("assets/badge_%s.png" % name); done.append("badge_" + name)
p = os.path.join(SRC, "gacha_machine.png")
if os.path.exists(p):
    im = key_magenta(p); im.thumbnail((900, 900)); im.save("assets/gacha_machine.png"); done.append("gacha_machine")
for nm in ("capsule_closed", "capsule_open"):
    p = os.path.join(SRC, nm + ".png")
    if os.path.exists(p):
        im = key_magenta(p); im = square(im, 480, 0.02); im.save("assets/%s.png" % nm); done.append(nm)
# カプセルの上半分・下半分（CSS演出用）
p = "assets/capsule_closed.png"
if os.path.exists(p):
    im = Image.open(p); w, h = im.size
    im.crop((0, 0, w, h // 2)).save("assets/capsule_top.png"); im.crop((0, h // 2, w, h)).save("assets/capsule_bottom.png"); done += ["capsule_top", "capsule_bottom"]
print("placed:", done)
