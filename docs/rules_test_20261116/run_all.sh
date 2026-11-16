#!/bin/bash
# Mac で: cd ~/kakiapp_rules_test_20261116 && bash run_all.sh
#   Firestore エミュレータ（127.0.0.1:8089・firebase.json）を立てて、旧ルール・新ルール・戻し用ルールの試験を全部流す。結果は results/ に出る。
#   先に npm install（@firebase/rules-unit-testing と firebase）。Java は Homebrew の openjdk。本番の Firestore には一切つながない（demo- の projectId だけ）
#   app_old/auth.js＝直す前のアプリ（git の HEAD・ストア版 1.0.17/1.0.18 と同じ）、app_new/auth.js＝直したアプリ。どちらも scripts/sync_check.mjs・team_check.mjs を一緒に置く
export PATH=/opt/homebrew/opt/openjdk/bin:/opt/homebrew/bin:$PATH LC_ALL=ja_JP.UTF-8
cd "$(dirname "$0")"; mkdir -p results
OLD=firestore_old_live_20261116.rules; NEW=firestore_rules_fix_20261116.rules; RB=firestore_rollback_keep_redeems_20261116.rules
cat > inner.sh <<'EOS'
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8089
OLD=firestore_old_live_20261116.rules; NEW=firestore_rules_fix_20261116.rules; RB=firestore_rollback_keep_redeems_20261116.rules
node rules_test.mjs $OLD old > results/rules_old.txt 2>&1
node rules_test.mjs $NEW new > results/rules_new.txt 2>&1
node rules_test.mjs $OLD old raw > results/rules_old_raw.txt 2>&1
node rules_test.mjs $NEW new raw > results/rules_new_raw.txt 2>&1
node rules_test.mjs $RB old > results/rules_rollback.txt 2>&1
export PADEXPR="(1 == 1 && 2 == 2 && 3 == 3 && 4 == 4)"
node margin.mjs $OLD old > results/margin_old.txt 2>&1
node margin.mjs $NEW new > results/margin_new.txt 2>&1
unset PADEXPR
node redeem_check.mjs app_new/auth.js $NEW $OLD > results/redeem_app_new.txt 2>&1
node redeem_check.mjs app_old/auth.js $NEW $OLD > results/redeem_app_old.txt 2>&1
for r in $OLD $NEW $RB; do sed "s/function teamEntryClosed() { return jst().day() >= 16; }/function teamEntryClosed() { return false; }/" $r > tmp_entryopen_$r; done
for app in app_old app_new; do for r in $OLD $NEW $RB; do
  (cd $app && node scripts/sync_check.mjs --emu .. ../$r > ../results/sync_${app}_${r%%.rules}.txt 2>&1)
  (cd $app && node scripts/team_check.mjs .. ../tmp_entryopen_$r > ../results/team_${app}_${r%%.rules}.txt 2>&1)
done; done
rm -f tmp_entryopen_*
EOS
firebase emulators:exec --only firestore --project demo-kakiapp "bash inner.sh" 2>&1 | tail -2
rm -f inner.sh
for f in results/rules_*.txt; do echo "## $f"; grep -E "^NG" $f; tail -9 $f | grep -v "^$"; done
echo "## 式の余裕（旧 | 新）"; paste results/margin_old.txt results/margin_new.txt
for f in results/redeem_*.txt results/sync_*.txt results/team_*.txt; do echo "## $f: $(grep -E "^ *NG " $f | head -3) $(grep -E "結果" $f | tail -1)"; done
