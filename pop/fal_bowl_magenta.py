#!/usr/bin/env python3
import os, json, time, base64, urllib.request
KEY=open(os.path.expanduser("~/.fal_key")).read().strip()
def call(ep, payload):
    req=urllib.request.Request("https://queue.fal.run/"+ep, data=json.dumps(payload).encode(), headers={"Authorization":"Key "+KEY,"Content-Type":"application/json"})
    j=json.load(urllib.request.urlopen(req,timeout=60)); st,rs=j["status_url"],j["response_url"]
    for _ in range(80):
        time.sleep(2); s=json.load(urllib.request.urlopen(urllib.request.Request(st,headers={"Authorization":"Key "+KEY}),timeout=60))
        if s.get("status")=="COMPLETED": return json.load(urllib.request.urlopen(urllib.request.Request(rs,headers={"Authorization":"Key "+KEY}),timeout=60))
        if s.get("status") in ("FAILED","ERROR"): raise RuntimeError(json.dumps(s)[:200])
    raise TimeoutError
b64="data:image/jpeg;base64,"+base64.b64encode(open("/tmp/fal_pop/ref_bowl.jpg","rb").read()).decode()
r=call("fal-ai/nano-banana-2/edit",{"image_urls":[b64],"prompt":"Keep this exact bowl of abura soba photo completely unchanged (same white bowl with its full white rim, same toppings, same angle, same colors). Replace ONLY the background with a completely flat solid magenta (#FF00FF), no shadows, no gradient, no reflections. The bowl must not touch the frame edges. No text.","aspect_ratio":"1:1"})
url=(r.get("images") or [r.get("image")])[0]["url"]; urllib.request.urlretrieve(url,"/tmp/fal_pop/bowl_magenta.png"); print("ok",url[:60])
