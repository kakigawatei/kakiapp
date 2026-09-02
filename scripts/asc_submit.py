"""再提出まわり
  python asc_submit.py notes <notes.txt>   … 審査メモを差し替え
  python asc_submit.py status               … バージョン／ビルド／提出の状態
  python asc_submit.py create               … 新しい reviewSubmission を作って 1.0 を項目に追加（提出はしない）
  python asc_submit.py submit <submissionId> … 提出（masaのOK後にだけ実行）
"""
import sys, json
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_api as a

VID = "a56a1340-2212-446f-8506-82e12cd413de"        # App Store version 1.0
RD = "8a4ff024-92ec-4a3e-9ced-804c4aa95ca8"         # appStoreReviewDetail

def notes(path):
    txt = open(path, encoding="utf-8").read()
    s, d = a.call("PATCH", f"/v1/appStoreReviewDetails/{RD}", {"data": {"type": "appStoreReviewDetails", "id": RD, "attributes": {"notes": txt}}})
    print("notes:", s, "" if s < 300 else d)

def status():
    s, d = a.call("GET", f"/v1/appStoreVersions/{VID}?fields[appStoreVersions]=versionString,appStoreState,appVersionState")
    print("version:", d["data"]["attributes"])
    s, b = a.call("GET", f"/v1/appStoreVersions/{VID}/build?fields[builds]=version")
    print("build:", b.get("data", {}).get("attributes"))
    s, rs = a.call("GET", f"/v1/reviewSubmissions?filter[app]={a.APP_ID}&filter[platform]=IOS&limit=5&fields[reviewSubmissions]=state,submittedDate")
    for x in rs.get("data", []): print("submission:", x["id"], x["attributes"])
    s, at = a.call("GET", f"/v1/appStoreReviewDetails/{RD}/appStoreReviewAttachments?fields[appStoreReviewAttachments]=fileName,assetDeliveryState")
    for x in at.get("data", []): print("attachment:", x["attributes"])

def create():
    s, d = a.call("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": a.APP_ID}}}}})
    if s >= 300: print("create failed", s, json.dumps(d, ensure_ascii=False)[:600]); return
    sid = d["data"]["id"]; print("submission created:", sid, d["data"]["attributes"])
    s, d = a.call("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
        "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sid}},
                          "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VID}}}}})
    print("item:", s, "" if s < 300 else json.dumps(d, ensure_ascii=False)[:600])

def submit(sid):
    s, d = a.call("PATCH", f"/v1/reviewSubmissions/{sid}", {"data": {"type": "reviewSubmissions", "id": sid, "attributes": {"submitted": True}}})
    print("submit:", s, json.dumps(d.get("data", d), ensure_ascii=False)[:400])

if __name__ == "__main__":
    c = sys.argv[1]
    if c == "notes": notes(sys.argv[2])
    elif c == "status": status()
    elif c == "create": create()
    elif c == "submit": submit(sys.argv[2])
