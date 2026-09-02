# iOS リリース手順（リモート完結版・2026-09-02 確立）

Xcode の GUI を開かずに、Windows から SSH だけで App Store Connect にビルドを上げる。

## 1. Windows で直す
- コードを直す → `ios/App/App.xcodeproj/project.pbxproj` の `CURRENT_PROJECT_VERSION` を **2か所とも +1**（同じ番号は再利用できない）
- `git commit` → `git push origin main`

## 2. Mac で アーカイブ → アップロード（1コマンド・約5分）
```
ssh mac 'cd ~/kakiapp && git pull -q origin main && export PATH=/opt/homebrew/bin:$PATH && node build-www.js && npx cap copy ios && bash scripts/ios-upload.sh'
```
- `UPLOAD_OK` が出れば完了。ログ＝Mac `/tmp/kakiapp_archive.log` / `/tmp/kakiapp_export.log`
- `npx cap sync`（pod install）は cocoapods/ruby4 の問題で動かない。ネイティブ側に変更が無い限り `cap copy` で足りる
- Mac の Podfile はローカル変更（Google サブスペック抜き）のまま。触らない

## 3. 処理完了の確認と TestFlight（Windows・API）
```
python scripts/asc_api.py builds        # processingState が VALID になれば OK（5〜15分）
python scripts/asc_api.py encrypt <ver> # 輸出コンプライアンス「対象外」を申告（Info.plist に ITSAppUsesNonExemptEncryption=false を入れたので次からは不要のはず）
```
- 内部テストグループ「岡雅俊」は **全ビルド自動配信**（hasAccessToAllBuilds）。追加操作は不要で、VALID になった時点で iPhone の TestFlight に出る
- 審査の再提出は App Store Connect のウェブ（Neo のブラウザで可）

## 4. 審査への提出・再提出（API・2026-09-02 実証）
```
python scripts/asc_submit.py status                 # version / build / submission / 添付 の状態
python scripts/asc_attach.py <動画やスクショ>        # App Review 添付（予約→分割PUT→MD5でcommit）
python scripts/asc_submit.py notes <メモ.txt>        # 審査メモ差し替え（雛形: appstore/審査メモ_再提出_2026-09-02.txt）
python scripts/asc_submit.py create                 # 新しい reviewSubmission を作って version 1.0 を追加
python scripts/asc_submit.py submit <submissionId>  # 提出（masaのOK後にだけ）
```
- ビルドの差し替えは `PATCH /v1/appStoreVersions/{VID}/relationships/build`（asc_submit.py の VID＝a56a1340-…）
- 🟥 **却下された submission は再提出できない**（UIの「App Reviewに再提出」が灰色・APIは「Version is not ready」）。正解＝旧 submission を `canceled:true` → CANCELING→COMPLETE（数十秒）→ 新 submission に version を item 追加 → `submitted:true`
- 承認後のリリースは release type MANUAL＝ masa が ASC で「リリース」を押す

## 認証まわり（秘密はリポジトリに入れない）
- App Store Connect API キー: **Admin ロール必須**（App Manager だと `Cloud signing permission error`）。
  - Key ID `5HAPG3KN7F` / Issuer ID `b7b0b3ae-1c10-42d1-bc0c-685adaf9c799`
  - .p8 の置き場: Mac `~/.appstoreconnect/private_keys/` と Windows `%USERPROFILE%\.appstoreconnect\private_keys\`
  - 旧キー `98XN8BVW76`（App Manager）は使わない。App Store Connect 側で失効させてよい
- 署名: Apple Development 証明書はキーチェーンに有り。配布用はクラウド管理（API キーで自動）
- アーカイブが `errSecInternalComponent` で落ちたら＝ログインキーチェーンがロック。masa に Mac のログインパスワードをもらい、Mac の `/tmp/.kc_pw` に置いてから再実行（スクリプトが読んで解除し、ファイルを消す）。**パスワードをコマンド行に直書きしない**（auto mode の分類器に止められる）

## ハマりどころ
- iOS アプリ（WKWebView）で `window.alert / confirm / prompt` は使わない → 画面ごと固まる。`kakiAlert / kakiConfirm / kakiPrompt` を使う（1.0(5) で全置換）
- 審査用アカウント `kakigawatei+appreview@gmail.com` で「アカウント削除」を実演しない（消すと審査担当がログインできず落ちる）
