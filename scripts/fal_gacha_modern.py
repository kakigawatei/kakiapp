#!/usr/bin/env python3
import os, json, time, urllib.request
KEY=open(os.path.expanduser("~/.fal_key")).read().strip(); OUT="/tmp/app_warm"; os.makedirs(OUT,exist_ok=True)
def call(ep,payload):
    req=urllib.request.Request("https://queue.fal.run/"+ep,data=json.dumps(payload).encode(),headers={"Authorization":"Key "+KEY,"Content-Type":"application/json"})
    j=json.load(urllib.request.urlopen(req,timeout=60)); st,rs=j["status_url"],j["response_url"]
    for _ in range(120):
        time.sleep(3); s=json.load(urllib.request.urlopen(urllib.request.Request(st,headers={"Authorization":"Key "+KEY}),timeout=60))
        if s.get("status")=="COMPLETED": return json.load(urllib.request.urlopen(urllib.request.Request(rs,headers={"Authorization":"Key "+KEY}),timeout=60))
        if s.get("status") in ("FAILED","ERROR"): raise RuntimeError(json.dumps(s)[:200])
    raise TimeoutError
P=("Flat modern illustration of a simple capsule toy vending machine (gashapon), front view, clean geometric shapes, no Japanese motifs, no lanterns, no patterns, no text. "
   "Colors: white body with soft dark-brown (#3A2A20) outline, a big round clear window full of capsule balls in brown-red (#A63A2A), deep navy (#1F2F5A) and muted gold (#C4913C), a gold turning knob, a dark brown base with a white outlet. "
   "Soft premium look, slight shading allowed, centered, background completely flat solid magenta (#FF00FF) with no shadow, object not touching edges.")
for payload in ({"prompt":P,"quality":"high","image_size":"square"},{"prompt":P,"quality":"high"}):
    try:
        r=call("openai/gpt-image-2",payload); url=(r.get("images") or [r.get("image")])[0]["url"]; urllib.request.urlretrieve(url,OUT+"/gacha_machine.png"); print("gacha_machine modern ok"); break
    except Exception as e: print("retry",str(e)[:120])
