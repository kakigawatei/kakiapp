# 配信可能な国（App Availability）の確認・設定
#   python scripts/asc_availability.py status        … 設定の有無と available=true の地域
#   python scripts/asc_availability.py set JPN        … 指定地域だけ配信ON（他はOFF）。複数は JPN,USA のようにカンマ区切り
#   python scripts/asc_availability.py set ALL        … 全地域ON
# 2026-09-05: この設定が無いと、審査に通って READY_FOR_SALE でもストアに出ない（柿川亭アプリで発生）
import sys, json
import asc_api as a


def territories():
    out = []
    s, d = a.call("GET", "/v1/territories?limit=200")
    out += [t["id"] for t in d.get("data", [])]
    nxt = (d.get("links") or {}).get("next")
    while nxt:
        s, d = a.call("GET", nxt.replace(a.BASE, ""))
        out += [t["id"] for t in d.get("data", [])]
        nxt = (d.get("links") or {}).get("next")
    return out


def status():
    s, d = a.call("GET", f"/v1/apps/{a.APP_ID}/appAvailabilityV2?fields[appAvailabilities]=availableInNewTerritories")
    if s != 200:
        print("availability record: NONE (app is not on sale anywhere)", s); return
    print("record:", d.get("data", {}).get("attributes"))
    on = []; url = f"/v2/appAvailabilities/{a.APP_ID}/territoryAvailabilities?limit=50"
    while url:
        s, d = a.call("GET", url)
        if s != 200:
            print("territoryAvailabilities", s, d); break
        on += [x["id"] for x in d.get("data", []) if (x.get("attributes") or {}).get("available")]
        nxt = (d.get("links") or {}).get("next"); url = nxt.replace(a.BASE, "") if nxt else None
    print("available(true):", len(on), on[:10])


def set_avail(arg):
    want = None if arg.upper() == "ALL" else set(x.strip().upper() for x in arg.split(","))
    inc, rel = [], []
    for t in territories():
        tid = "${t_%s}" % t
        rel.append({"type": "territoryAvailabilities", "id": tid})
        inc.append({"type": "territoryAvailabilities", "id": tid, "attributes": {"available": (want is None or t in want)},
                    "relationships": {"territory": {"data": {"type": "territories", "id": t}}}})
    body = {"data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": want is None},
                     "relationships": {"app": {"data": {"type": "apps", "id": a.APP_ID}},
                                       "territoryAvailabilities": {"data": rel}}}, "included": inc}
    s, d = a.call("POST", "/v2/appAvailabilities", body)
    print("POST /v2/appAvailabilities:", s, json.dumps(d, ensure_ascii=False)[:200])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        status()
    elif cmd == "set":
        set_avail(sys.argv[2] if len(sys.argv) > 2 else "JPN")
