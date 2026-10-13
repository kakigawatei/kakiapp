# -*- coding: utf-8 -*-
"""優勝カードの絵柄を fal の GPT Image 2.5（edit・参照画像つき）で作る。文字なし・3:4。
   使い方: python fal_card.py <prompt.txt> <out.png> [ref1 ref2 ...]   （キー ~/.fal_key）"""
import sys, os, io, json, base64, time, urllib.request, urllib.error
from PIL import Image
KEY = open(os.path.expanduser("~/.fal_key"), encoding="utf-8").read().strip()
def post(ep, payload):
    req = urllib.request.Request("https://queue.fal.run/" + ep, data=json.dumps(payload).encode(), headers={"Authorization": "Key " + KEY, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Key " + KEY}), timeout=120))
def data_uri(path, maxside=1400):
    im = Image.open(path).convert("RGB"); im.thumbnail((maxside, maxside)); b = io.BytesIO(); im.save(b, "JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
prompt = open(sys.argv[1], encoding="utf-8").read().strip(); out = sys.argv[2]; refs = sys.argv[3:]
payload = {"prompt": prompt, "image_size": "portrait_4_3", "quality": "high"}
ep = "openai/gpt-image-2.5/sunburst/text-to-image"
if refs: payload["image_urls"] = [data_uri(r) for r in refs]; ep = "openai/gpt-image-2.5/sunburst/edit"
try:
    j = post(ep, payload)
except urllib.error.HTTPError as e:
    print("REFUSED", e.code, e.read().decode("utf-8", "replace")[:300]); sys.exit(1)
print("queued", j.get("request_id"), flush=True)
t0 = time.time()
while True:
    time.sleep(8); s = get(j["status_url"]); st = s.get("status")
    if st == "COMPLETED": break
    if st in ("FAILED", "ERROR"): print("FAILED", json.dumps(s)[:400]); sys.exit(2)
    if time.time() - t0 > 600: print("TIMEOUT"); sys.exit(3)
r = get(j["response_url"]); url = (r.get("images") or [r.get("image")])[0]["url"]
urllib.request.urlretrieve(url, out); im = Image.open(out); print("saved", out, im.size, int(time.time() - t0), "s")
