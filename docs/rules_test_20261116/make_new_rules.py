# 本番ルール（firestore_old_live_20261116.rules＝Mac ~/kakiapp_rules/firestore.rules と同じ）から、
# ポイントの抜け穴をふさいだ新ルール docs/firestore_rules_fix_20261116.rules を作る。
# 置き換えるのは「会員データの検査の関数（4〜51行目）」「teamVisitOk」「kakiapp_redeems の追加」だけ。ほかの行は1文字も変えない。
import io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
src = io.open(os.path.join(HERE, "firestore_old_live_20261116.rules"), encoding="utf-8").read()
lines = src.split("\n")
a = next(i for i, l in enumerate(lines) if l.strip().startswith("// 2026-10-14 監査対応: ポイント増は"))
b = next(i for i, l in enumerate(lines) if l.strip().startswith("function userDoc(u)"))
assert a == 8 and b == 51, (a, b)
new_block = io.open(os.path.join(HERE, "new_user_block.rules.txt"), encoding="utf-8").read().rstrip("\n").split("\n")
lines[a:b] = new_block
out = "\n".join(lines)

old_tv = 'getAfter(userDoc(request.auth.uid)).data.get("teamId", "") == teamId && (monthKey() != "2026-10" || jstDate() >= "2026-10-15"); }'
assert out.count(old_tv) == 1
out = out.replace(old_tv, 'getAfter(userDoc(request.auth.uid)).data.get("teamId", "") == teamId && getAfter(userDoc(request.auth.uid)).data.get("qrDate", "") == jstDate() && (monthKey() != "2026-10" || jstDate() >= "2026-10-15"); }')
old_tvc = "    // 学校の来店+1: 本人の会員データの teamVisitDay が「今日」に変わる同じ batch の中だけ（＝1日1回）。2026-10 は 10/15 開始"
assert out.count(old_tvc) == 1
out = out.replace(old_tvc, old_tvc + "\n    // 2026-11-16 抜け穴⑤: さらに、本人の qrDate が今日（＝今日の来店チェックインがサーバーに保存済み）のときだけ。家から毎日 +1 を止める")

# 学校を新しく作るとき、来店数を最初から入れておけないようにする（作成時は visits 空・visitsTotal 0・days／visitsByStore なし。アプリが作る形と同じ）
old_tc = 'request.resource.data.norm is string && request.resource.data.members == 1; allow update:'
assert out.count(old_tc) == 1
out = out.replace(old_tc, 'request.resource.data.norm is string && request.resource.data.members == 1 && request.resource.data.get("visits", {}) == {} && request.resource.data.get("visitsTotal", 0) == 0 && !request.resource.data.keys().hasAny(["days", "visitsByStore"]); allow update:')

anchor = "match /kakiapp_campaigns/{doc} {"
assert out.count(anchor) == 1
redeems = io.open(os.path.join(HERE, "new_redeems_block.rules.txt"), encoding="utf-8").read().rstrip("\n") + "\n"
out = out.replace(anchor, redeems + anchor)
dst = os.path.join(HERE, "..", "firestore_rules_fix_20261116.rules")
io.open(dst, "w", encoding="utf-8", newline="\n").write(out)
print("written", os.path.normpath(dst), len(out))

# 戻し用: 旧ルール＋交換の記録の置き場（kakiapp_redeems）だけ。新しいアプリを出したあとで会員データの検査だけ元に戻したいとき用
# （旧ルールそのままに戻すと、新しいアプリの交換が全部「交換できませんでした」になる）
assert src.count(anchor) == 1
rb = src.replace(anchor, redeems + anchor)
dst2 = os.path.join(HERE, "firestore_rollback_keep_redeems_20261116.rules")
io.open(dst2, "w", encoding="utf-8", newline=chr(10)).write(rb)
print("written", os.path.normpath(dst2), len(rb))

