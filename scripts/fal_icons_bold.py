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
STYLE=("App icon illustration, medium-weight clean line art in dark brown (#3A2A20) with flat fills in brown-red (#A63A2A), muted gold (#C4913C) and deep navy (#1F2F5A), premium Japanese restaurant app style, "
       "simple and readable at small size, no text, single centered object, background completely flat solid magenta (#FF00FF), object not touching edges. ")
ICONS={"icon_bowl":"a bowl of noodles with chopsticks lifting noodles, steam lines","icon_wheel":"a small ferris wheel with colored gondolas","icon_lantern":"a Japanese paper lantern (chochin), red with gold top and bottom","icon_ticket":"a coupon ticket with a dotted tear line and a small star","icon_person":"a simple person bust avatar","icon_bell":"a notification bell","icon_home":"a simple house"}
for nm,d in ICONS.items():
    for payload in ({"prompt":STYLE+d,"quality":"medium","image_size":"square"},{"prompt":STYLE+d,"quality":"medium"}):
        try:
            r=call("openai/gpt-image-2",payload); url=(r.get("images") or [r.get("image")])[0]["url"]; urllib.request.urlretrieve(url,OUT+"/"+nm+".png"); print(nm,"ok",flush=True); break
        except Exception as e: err=str(e)[:100]
    else: print(nm,"ERROR",err,flush=True)
