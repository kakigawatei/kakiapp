"""App Store Connect API ヘルパー（柿川亭アプリ・App ID 6806443112）
鍵は ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8（リポジトリには入れない）。pip: pyjwt, cryptography

  python scripts/asc_api.py builds          … 直近ビルドと処理状態（VALIDになれば内部TestFlightに自動配信）
  python scripts/asc_api.py groups          … ベータグループ
  python scripts/asc_api.py encrypt <ver>   … 指定ビルドの輸出コンプライアンス申告を「対象外(false)」にする
"""
import os, sys, time, json, urllib.request, urllib.error
import jwt

KEY_ID = os.environ.get("ASC_KEY_ID", "5HAPG3KN7F")
ISSUER = os.environ.get("ASC_ISSUER_ID", "b7b0b3ae-1c10-42d1-bc0c-685adaf9c799")
P8 = os.path.expanduser(f"~/.appstoreconnect/private_keys/AuthKey_{KEY_ID}.p8")
APP_ID = "6806443112"
BASE = "https://api.appstoreconnect.apple.com"

def token():
    now = int(time.time())
    return jwt.encode({"iss": ISSUER, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
                      open(P8).read(), algorithm="ES256", headers={"kid": KEY_ID})

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def builds():
    s, d = call("GET", f"/v1/builds?filter[app]={APP_ID}&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,uploadedDate,usesNonExemptEncryption")
    if s != 200: print(s, d); return []
    out = []
    for b in d["data"]:
        a = b["attributes"]
        out.append((b["id"], a["version"], a["processingState"], a.get("usesNonExemptEncryption")))
        print(b["id"], "ver", a["version"], a["processingState"], "encExempt=", a.get("usesNonExemptEncryption"), a["uploadedDate"])
    return out

def groups():
    s, d = call("GET", f"/v1/betaGroups?filter[app]={APP_ID}&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds")
    if s != 200: print(s, d); return []
    for g in d["data"]:
        print(g["id"], g["attributes"]["name"], "internal=", g["attributes"]["isInternalGroup"], "allBuilds=", g["attributes"]["hasAccessToAllBuilds"])
    return d["data"]

def encrypt(ver):
    bs = [b for b in builds() if b[1] == ver]
    if not bs: print("build not found"); return 1
    bid = bs[0][0]
    s, d = call("PATCH", f"/v1/builds/{bid}", {"data": {"type": "builds", "id": bid, "attributes": {"usesNonExemptEncryption": False}}})
    print("encryption set:", s, "" if s < 300 else d)
    return 0 if s < 300 else 2

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "builds"
    if cmd == "builds": builds()
    elif cmd == "groups": groups()
    elif cmd == "encrypt": sys.exit(encrypt(sys.argv[2]))
