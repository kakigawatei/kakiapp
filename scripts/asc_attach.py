"""App Review 添付ファイル（動画など）を App Store Connect にアップロードする
使い方: python asc_attach.py <ローカルファイル> [reviewDetailId]
流れ: appStoreReviewAttachments を予約 → uploadOperations に従ってPUT → uploaded=true + MD5 で確定
"""
import sys, os, hashlib, json, urllib.request
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_api as a

REVIEW_DETAIL = "8a4ff024-92ec-4a3e-9ced-804c4aa95ca8"

def main(path, rd=REVIEW_DETAIL):
    size = os.path.getsize(path)
    name = os.path.basename(path)
    s, d = a.call("POST", "/v1/appStoreReviewAttachments", {"data": {"type": "appStoreReviewAttachments",
        "attributes": {"fileName": name, "fileSize": size},
        "relationships": {"appStoreReviewDetail": {"data": {"type": "appStoreReviewDetails", "id": rd}}}}})
    if s >= 300: print("reserve failed", s, d); return 1
    att = d["data"]; aid = att["id"]; ops = att["attributes"]["uploadOperations"]
    print("reserved", aid, "ops", len(ops))
    md5 = hashlib.md5()
    with open(path, "rb") as f:
        data = f.read()
    md5.update(data)
    for op in ops:
        chunk = data[op["offset"]:op["offset"] + op["length"]]
        req = urllib.request.Request(op["url"], data=chunk, method=op["method"])
        for h in op["requestHeaders"]: req.add_header(h["name"], h["value"])
        with urllib.request.urlopen(req) as r: print("chunk", op["offset"], r.status)
    s, d = a.call("PATCH", f"/v1/appStoreReviewAttachments/{aid}", {"data": {"type": "appStoreReviewAttachments", "id": aid,
        "attributes": {"uploaded": True, "sourceFileChecksum": md5.hexdigest()}}})
    print("commit", s, "" if s < 300 else d)
    s, d = a.call("GET", f"/v1/appStoreReviewAttachments/{aid}?fields[appStoreReviewAttachments]=fileName,fileSize,assetDeliveryState")
    print("state:", d.get("data", {}).get("attributes"))
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], *(sys.argv[2:3])))
