# -*- coding: utf-8 -*-
"""新しいバージョンを作って、ビルドと文言を載せる（2026-09-04）

  承認済みのバージョンにはビルドを差し替えられない（409）ので、
  masaの判断で「1.0(7)の承認は保険として残し、新バージョンで出す」形にした。

  使い方:
    python asc_new_version.py create 1.0.1 <buildId>   … 作成＋ビルド紐付け＋文言コピー
    python asc_new_version.py show <versionId>          … 中身を確認
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_api as a

SRC_VID = "a56a1340-2212-446f-8506-82e12cd413de"   # 1.0（コピー元）


def get(path):
    s, d = a.call("GET", path)
    if s >= 300:
        raise SystemExit("GET失敗 %s %s %s" % (path, s, json.dumps(d, ensure_ascii=False)[:400]))
    return d


def post(path, body):
    s, d = a.call("POST", path, body)
    return s, d


def create(vstr, build_id, whats_new):
    src = get("/v1/appStoreVersions/%s" % SRC_VID)["data"]["attributes"]

    # ① バージョンを作る
    s, d = post("/v1/appStoreVersions", {"data": {
        "type": "appStoreVersions",
        "attributes": {
            "platform": src["platform"],
            "versionString": vstr,
            "copyright": src.get("copyright"),
            "releaseType": src.get("releaseType"),
        },
        "relationships": {"app": {"data": {"type": "apps", "id": a.APP_ID}}},
    }})
    if s >= 300:
        print("バージョン作成に失敗:", s, json.dumps(d, ensure_ascii=False)[:600])
        return
    vid = d["data"]["id"]
    print("作成:", vstr, vid)

    # ② ビルドを紐付ける
    s, d = a.call("PATCH", "/v1/appStoreVersions/%s/relationships/build" % vid,
                  {"data": {"type": "builds", "id": build_id}})
    print("ビルド紐付け:", s, "" if s < 300 else json.dumps(d, ensure_ascii=False)[:400])

    # ③ 説明文などをコピー（新バージョンには自動で空の枠ができるので、それを埋める）
    src_locs = get("/v1/appStoreVersions/%s/appStoreVersionLocalizations" % SRC_VID)["data"]
    new_locs = get("/v1/appStoreVersions/%s/appStoreVersionLocalizations" % vid)["data"]
    new_by_locale = {x["attributes"]["locale"]: x["id"] for x in new_locs}
    for x in src_locs:
        at = x["attributes"]
        loc = at["locale"]
        body = {k: at.get(k) for k in
                ("description", "keywords", "marketingUrl", "promotionalText",
                 "supportUrl") if at.get(k)}
        body["whatsNew"] = whats_new
        if loc in new_by_locale:
            s, d = a.call("PATCH", "/v1/appStoreVersionLocalizations/%s" % new_by_locale[loc],
                          {"data": {"type": "appStoreVersionLocalizations",
                                    "id": new_by_locale[loc], "attributes": body}})
            print("文言 %s: PATCH %s" % (loc, s), "" if s < 300 else json.dumps(d, ensure_ascii=False)[:300])
        else:
            body["locale"] = loc
            s, d = post("/v1/appStoreVersionLocalizations", {"data": {
                "type": "appStoreVersionLocalizations", "attributes": body,
                "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
            print("文言 %s: POST %s" % (loc, s), "" if s < 300 else json.dumps(d, ensure_ascii=False)[:300])

    print("NEW_VERSION_ID", vid)


def show(vid):
    d = get("/v1/appStoreVersions/%s" % vid)
    print("version:", json.dumps(d["data"]["attributes"], ensure_ascii=False))
    s, b = a.call("GET", "/v1/appStoreVersions/%s/build?fields[builds]=version" % vid)
    print("build:", b.get("data", {}).get("attributes"))
    l = get("/v1/appStoreVersions/%s/appStoreVersionLocalizations" % vid)["data"]
    for x in l:
        at = x["attributes"]
        print("loc", at.get("locale"), "desc=%d字" % len(at.get("description") or ""),
              "whatsNew=", (at.get("whatsNew") or "")[:60])
    s, rd = a.call("GET", "/v1/appStoreVersions/%s/appStoreReviewDetail" % vid)
    print("reviewDetail:", s, json.dumps((rd.get("data") or {}).get("attributes", {}), ensure_ascii=False)[:300])


if __name__ == "__main__":
    c = sys.argv[1]
    if c == "create":
        create(sys.argv[2], sys.argv[3], open(sys.argv[4], encoding="utf-8").read().strip())
    elif c == "show":
        show(sys.argv[2])
