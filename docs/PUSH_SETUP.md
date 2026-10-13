# プッシュ通知 運営の準備チェックリスト（2026-10-09・ブランチ tb-1015）

目的: admin.html で下書き → 運営の手元のスクリプトで「通知ONの全員」に送る（例:「高校対抗が10/15から始まります」「創業6周年 350P は10/13まで」）。

## しくみ（コード側は済み）
- アプリ（iOS/Android）: `@capacitor-firebase/messaging`。許可は起動直後には聞かない → 来店ガチャのお祝いを閉じた後に1回だけ／マイページ「プッシュ通知」で切り替え
- ONにした端末は FCM トピック `all` を購読し、トークンの控えを Firestore `kakiapp_push_tokens/{uid}` に保存
- 下書き: admin.html「📣 プッシュ通知（下書き）」→ `kakiapp_push_requests/{ID}`（status:"draft"）。ブラウザからは送らない（鍵を置かない）
- 送信: `scripts/push_send.mjs`（FCM HTTP v1・サービスアカウント）。`--send` なしは下見（validate_only）
- 通知タップ → `data.link`（home/team/gacha/roulette/board/mypage）の画面へ
- Web 版（ブラウザ・PWA）は対象外（iPhone はホーム画面追加時のみ・VAPID 鍵と Service Worker が別途要るため見送り）

## 運営がやること（順番どおり）
1. [x] **APNs 認証キー（.p8）が Firebase に入っているか確認**（✅ 2026-10-13 21:13 確認済み: 開発用・本番用とも Key ID 8DY7UVKUXY／Team ID JTPQ37786V）: Firebase コンソール → kakigawatei-franchise → プロジェクトの設定 → Cloud Messaging → Apple アプリ構成（com.kakigawatei.app）。電話番号確認（サイレント通知）で既に登録済みの可能性が高い。無ければ Apple Developer → Keys で「Apple Push Notifications service (APNs)」キーを作り、.p8・Key ID・Team ID を登録
2. [ ] **Push Notifications capability の確認**: `App.entitlements` には `aps-environment = production` と `UIBackgroundModes = remote-notification` が既にある。Apple Developer の App ID（com.kakigawatei.app）で Push Notifications が有効か、Xcode の Signing & Capabilities に Push Notifications が出ているかだけ見る
3. [ ] **ネイティブのプラグインを入れる（Mac）**: `npm install` → `npx cap sync ios`。🟥 IOS_RELEASE.md の注意どおり Mac では `cap sync`（pod install）が cocoapods/ruby4 の問題で動かない。直すか、手で Podfile の `capacitor_pods` に次の1行を足して `pod install`:
   `pod 'CapacitorFirebaseMessaging', :path => '../../node_modules/@capacitor-firebase/messaging'`
   （FirebaseMessaging ~> 11.0 が入る。FirebaseAuth/Core と同じ 11 系に揃うこと。Mac の Podfile のローカル変更＝Google サブスペック抜きは保つ。`scripts/patch-podfile.js` は古い手当て（Google サブスペック・FirebaseAuth 11.4.0 固定）を戻すので、`npm run sync` は使わない）
4. [ ] AppDelegate.swift はコミット済み（APNs トークンをプラグインへ渡す2メソッド）。ビルド番号を +1 して TestFlight へ
5. [ ] **Firestore ルール公開**: `docs/firestore_rules_2026-10-09_push.txt`（紹介ルール＋push 2コレクション）。🟥 掲示板ルール（firestore_rules_2026-10-08_board.txt）を先に/一緒に公開するなら、両方の追加分を合わせてから貼る
6. [x] **サービスアカウント鍵**（✅ 2026-10-13 21:19 生成・Mac ~/.kakiapp_push_sa.json に 600 で保存済み・firebase-adminsdk-fbsvc）: Firebase コンソール → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵を生成（JSON）。リポジトリ外に保存（例: Mac `~/.kakiapp_push_sa.json`）。Discord・git に出さない
7. [ ] **試し送り（自分の iPhone 1台）**: TestFlight 版でマイページ「プッシュ通知」ON → Firestore `kakiapp_push_tokens/{自分のuid}.token` をコピー →
   `GOOGLE_APPLICATION_CREDENTIALS=~/.kakiapp_push_sa.json node scripts/push_send.mjs --request <ID> --token <トークン> --send`
   - アプリを閉じた状態・開いた状態の両方で届くか、タップで指定の画面が開くか
   - 電話番号の確認（SMS）が今まで通り通るか（APNs の受け渡しを足したため）
8. [ ] **全員へ送る**（masa の「送って」の後だけ）: `node scripts/push_send.mjs --request <ID>` で下見 → `--send`。送ると下書きが「送信済み」になる（再送は `--force`）

## Android（公開していないなら後回しで可）
- `google-services.json` はあり・`POST_NOTIFICATIONS` 権限は追加済み。`npx cap sync android` でプラグインが入る

## まだ確かめていないこと
- 実機での許可ダイアログ・トークン取得・トピック購読・受信・タップ遷移（ビルドしていない）
- 電話番号確認との両立（理屈上は Firebase の swizzling 経由で両方にトークンが渡る）
- push_send.mjs の実送信（鍵がないので未実行。構文確認のみ）
