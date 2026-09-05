#!/usr/bin/env python3
import os, json, time, urllib.request
KEY=open(os.path.expanduser("~/.fal_key")).read().strip(); OUT="/tmp/app_assets"; os.makedirs(OUT,exist_ok=True)
def call(ep,payload):
    req=urllib.request.Request("https://queue.fal.run/"+ep,data=json.dumps(payload).encode(),headers={"Authorization":"Key "+KEY,"Content-Type":"application/json"})
    j=json.load(urllib.request.urlopen(req,timeout=60)); st,rs=j["status_url"],j["response_url"]
    for _ in range(120):
        time.sleep(3); s=json.load(urllib.request.urlopen(urllib.request.Request(st,headers={"Authorization":"Key "+KEY}),timeout=60))
        if s.get("status")=="COMPLETED": return json.load(urllib.request.urlopen(urllib.request.Request(rs,headers={"Authorization":"Key "+KEY}),timeout=60))
        if s.get("status") in ("FAILED","ERROR"): raise RuntimeError(json.dumps(s)[:200])
    raise TimeoutError
STYLE=("Flat, bold, modern Japanese graphic style. Strictly three colors only: pure white (#FFFFFF), ink black (#111111), vermilion red (#FF1717). Thick black outlines, no gradients, no shading, no text, no letters. Centered single object. Background must be completely flat solid magenta (#FF00FF) with no shadow; the object must not touch the frame edges. ")
desc="A round enamel medal badge for a master rank: red face with a bowl of noodles icon in white, a white flame halo around the bowl, black laurel wreath, a small black star at the top, thick black outline."
for payload in ({"prompt":STYLE+desc,"quality":"high","image_size":"square"},{"prompt":STYLE+desc,"quality":"high"}):
    try:
        r=call("openai/gpt-image-2",payload); url=(r.get("images") or [r.get("image")])[0]["url"]; urllib.request.urlretrieve(url,OUT+"/badge_rainbow.png"); print("badge_rainbow ok"); break
    except Exception as e: print("retry", str(e)[:120])
