# 審査に通った版（PENDING_DEVELOPER_RELEASE）を App Store に公開する
#   python scripts/asc_release.py status          … iOS の各バージョンの状態を表示
#   python scripts/asc_release.py release 1.0.1   … そのバージョンの公開をリクエスト（release type MANUAL の「リリース」ボタン相当）
import sys
import asc_api as a


def versions():
    s, d = a.call("GET", f"/v1/apps/{a.APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10&fields[appStoreVersions]=versionString,appStoreState,appVersionState,releaseType,createdDate")
    out = []
    for v in (d.get("data") or []):
        at = v.get("attributes") or {}
        out.append((v["id"], at.get("versionString"), at.get("appVersionState") or at.get("appStoreState"), at.get("releaseType"), at.get("createdDate")))
    return out


def status():
    for vid, vs, st, rt, cd in versions():
        print(vs, st, rt, cd, vid)


def release(vs):
    cand = [v for v in versions() if v[1] == vs]
    if not cand:
        print("version not found:", vs); return 2
    vid, _, st, rt, _ = cand[0]
    print("target", vs, st, rt, vid)
    if st not in ("PENDING_DEVELOPER_RELEASE", "READY_FOR_DISTRIBUTION"):
        print("not releasable state:", st); return 3
    s, d = a.call("POST", "/v1/appStoreVersionReleaseRequests",
                  {"data": {"type": "appStoreVersionReleaseRequests",
                            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
    print("release request:", s, (d or {}).get("data", {}).get("id") or d)
    return 0 if s in (200, 201) else 4


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        status()
    elif cmd == "release":
        sys.exit(release(sys.argv[2] if len(sys.argv) > 2 else "1.0.1"))
