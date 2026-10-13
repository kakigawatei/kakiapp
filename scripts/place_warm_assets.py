# -*- coding: utf-8 -*-
"""温かい配色の絵（pop/fal/app_warm/*.png・マゼンタ背景）をクロマキーして assets/ に置く。
   python scripts/place_warm_assets.py   （存在するものだけ処理）"""
import os, glob
from PIL import Image, ImageFilter
import numpy as np
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = "pop/fal/app_warm"

def key(path):
    im = Image.open(path).convert("RGB"); a = np.asarray(im).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = (r > 150) & (b > 150) & (g < 110) & ((r - g) > 80) & ((b - g) > 80)
    al = Image.fromarray(np.where(mag, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgb = a.copy(); edge = (np.asarray(al) > 0) & (np.asarray(al) < 255)
    rgb[..., 1] = np.where(edge, np.maximum(rgb[..., 1], (rgb[..., 0] + rgb[..., 2]) // 2), rgb[..., 1])
    out = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA"); out.putalpha(al)
    bb = al.getbbox(); return out.crop(bb) if bb else out

def square(im, size, pad=0.06):
    w, h = im.size; s = int(max(w, h) * (1 + pad * 2)); c = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c.paste(im, ((s - w) // 2, (s - h) // 2), im); return c.resize((size, size), Image.LANCZOS)

done = []
for f in glob.glob(os.path.join(SRC, "icon_*.png")):
    square(key(f), 256, 0.05).save("assets/" + os.path.basename(f)); done.append(os.path.basename(f))
for f in glob.glob(os.path.join(SRC, "badge_*.png")):
    square(key(f), 816).save("assets/" + os.path.basename(f)); done.append(os.path.basename(f))
p = os.path.join(SRC, "gacha_machine.png")
if os.path.exists(p):
    im = key(p); im.thumbnail((900, 900)); im.save("assets/gacha_machine.png"); done.append("gacha_machine.png")
p = os.path.join(SRC, "capsule_closed.png")
if os.path.exists(p):
    im = square(key(p), 480, 0.02); im.save("assets/capsule_closed.png"); w, h = im.size
    im.crop((0, 0, w, h // 2)).save("assets/capsule_top.png"); im.crop((0, h // 2, w, h)).save("assets/capsule_bottom.png"); done += ["capsule_top/bottom"]
p = os.path.join(SRC, "hero_photo.png")
if os.path.exists(p):
    im = Image.open(p).convert("RGB"); im.thumbnail((1600, 1600)); im.save("assets/hero_photo.jpg", quality=86); done.append("hero_photo.jpg")
print("placed:", done)
