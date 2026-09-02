#!/bin/bash
# 柿川亭アプリ iOS: Mac上で SSHだけで アーカイブ → App Store Connect へアップロード（Xcode GUI不要）
#
# 前提（Mac Pro に設定済み・2026-09-02）
#   ・~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8  … App Store Connect APIキー（Adminロール必須＝クラウド署名の権限）
#   ・ログインキーチェーンの署名鍵に partition list 設定済み（security set-key-partition-list）
#   ・ビルド番号は ios/App/App.xcodeproj の CURRENT_PROJECT_VERSION を上げてからコミットしておく
#
# 使い方（Windowsから）:
#   ssh mac 'cd ~/kakiapp && git pull -q origin main && export PATH=/opt/homebrew/bin:$PATH && node build-www.js && npx cap copy ios && bash scripts/ios-upload.sh'
#
# アーカイブが errSecInternalComponent で落ちたら＝キーチェーンがロック。masaにMacのログインパスワードをもらい
#   /tmp/.kc_pw に置いてから再実行（このスクリプトが読んで解除→ファイル削除）。
set -u
export PATH=/opt/homebrew/bin:$PATH
KEYID="${ASC_KEY_ID:-5HAPG3KN7F}"
ISSUER="${ASC_ISSUER_ID:-b7b0b3ae-1c10-42d1-bc0c-685adaf9c799}"
KEY=~/.appstoreconnect/private_keys/AuthKey_$KEYID.p8
KC=~/Library/Keychains/login.keychain-db
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE=/tmp/kakiapp.xcarchive
EXPORT_DIR=/tmp/kakiapp_export_out
PLIST=/tmp/kakiapp_export.plist

[ -f "$KEY" ] || { echo "NO_KEY $KEY"; exit 1; }

if [ -f /tmp/.kc_pw ]; then
  PW="$(cat /tmp/.kc_pw)"; rm -f /tmp/.kc_pw
  security unlock-keychain -p "$PW" "$KC" || { echo "UNLOCK_FAILED"; exit 2; }
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PW" "$KC" >/dev/null 2>&1 || true
  unset PW
fi

cat > "$PLIST" <<'PL'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>JTPQ37786V</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PL

cd "$ROOT/ios/App" || exit 1
echo "== archive ($(grep -m1 CURRENT_PROJECT_VERSION App.xcodeproj/project.pbxproj | tr -d ' \t;'))"
rm -rf "$ARCHIVE"
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -destination "generic/platform=iOS" -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates archive > /tmp/kakiapp_archive.log 2>&1
if ! grep -q "ARCHIVE SUCCEEDED" /tmp/kakiapp_archive.log; then
  echo "ARCHIVE_FAILED"; grep -n "error:\|errSec" /tmp/kakiapp_archive.log | head -8; exit 3
fi
echo "ARCHIVE_OK"

echo "== export + upload"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$PLIST" -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY" -authenticationKeyID "$KEYID" -authenticationKeyIssuerID "$ISSUER" \
  > /tmp/kakiapp_export.log 2>&1
if grep -q "EXPORT SUCCEEDED" /tmp/kakiapp_export.log; then
  echo "UPLOAD_OK"; grep -i "upload succeeded" /tmp/kakiapp_export.log | head -2
else
  echo "EXPORT_FAILED"; grep -n "error" /tmp/kakiapp_export.log | head -12; exit 4
fi
