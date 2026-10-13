# 柿川亭アプリ Cloud Functions 化 設計（2026-09-21 さくら/ずんだ）

目的: エル監査で残った「本人がポイント・来店数を書き換えられる」を、来店判定・シーズン締め・報酬付与を**サーバー側**に移して塞ぐ。
前提: Firebase プロジェクト kakigawatei-franchise は **Blaze**（2026-09-21 コンソールで確認）。Functions v2（Node 20・asia-northeast1）。費用は無料枠内の見込み（月数万呼び出し以下）。
方針: **10月（第0回・お試し）は現状の客側処理で回し、11月（第1回）から Functions 版に切替**。切替は「ルールで客側の書き込みを閉じる」だけで済むよう、データの形は変えない。

## 1. Functions 一覧（callable・認証必須）
| 名前 | 入力 | 処理 | 返り |
|---|---|---|---|
| `checkin` | `{ lat, lng, storeId? }` | ①uid のユーザ doc を読む ②今日（JST）既に来店済みなら拒否 ③店リスト（config と同じ値を Functions 側にも持つ）と距離判定（半径内） ④トランザクションで: users/{uid}.visits に今日を追加・storeVisits・来店ポイント（称号別）・tx 追記・qrDate=今日／teamId があれば teams/{id}.visits.{月}・visitsByStore・days・visitsTotal を +1／users.teamVisits.{月} +1 | `{ ok, visits, points, vp }` |
| `spinRoulette` | なし | 1日1回の判定と加点をサーバーで（乱数もサーバー） | `{ points }` |
| `visitGacha` | なし | 今日 checkin 済みかつ未実施なら抽選・加点 | `{ points }` |
| `joinTeam` / `leaveTeam` | `{ name, kind }` | 正規化・既存検索（norm/aliases）・members ±1・users.teamId 更新 | `{ team }` |
| `redeem` | `{ points }` | 「つかう」の消費（スタッフ確認は現状どおり画面で） | `{ balance }` |
| `closeSeason`（scheduled: 毎月1日 00:05 JST） | なし | admin.html の締めと同じ集計をサーバーで。結果 doc → 対象者に awards＋points increment＋tx → announcements | ログ |
| `closeSeasonNow`（callable・運営 uid のみ） | `{ month, force? }` | 手動締め（admin のボタンから呼ぶ） | 結果 |

## 2. ルールの変更（Functions 切替時）
- `kakiapp_users/{uid}`: 本人の write を **許可キーのみ**に絞る（nickname, mailOptIn, mailOptInAt, awardsSeen, devMode 系）。points/visits/tx/team*/awards は Functions（Admin SDK＝ルール対象外）だけが書く
- `kakiapp_teams/{id}`: 客側 write を全面禁止（read のみ）。create/update は Functions
- `kakiapp_seasons` / `kakiapp_settings`: 現状どおり（運営 uid と Functions）

## 3. アプリ側の変更
- auth.js: `store.set` → Firestore 直書きの箇所のうち、points/visits/team* は Functions 呼び出しに置換（`httpsCallable`）。オフライン時はエラー表示（来店判定は店内なので電波前提）
- index.html: `checkin()` → `callCheckin(lat,lng)`。ルーレット／ガチャ／つかう も同様。結果はサーバーの返りで state を更新（楽観更新はしない）
- admin.html: 締めボタンは `closeSeasonNow` を呼ぶだけに（集計コードは Functions へ移動・二重実装を避ける）
- 既存ユーザーのデータはそのまま（形を変えない）。切替日に「アプリを最新にしてください」のお知らせ

## 4. 段取り（11/1 の本番締めを Functions で行う場合）
1. 10月上旬: functions/ を作成（TypeScript・v2）・エミュレータで checkin/closeSeason の単体テスト（エル監査の観点＝一度限り・再実行安全・テスト分離）
2. 10月中旬: テスト版（kakiapp-test）を Functions 版に切替、masa がテスト
3. 10月下旬: 本番リリース（Web＋iOS 1.0.10）、ルール切替（客側 write 禁止）
4. 11/1 00:05: scheduled `closeSeason` が第0回を締める → 結果発表（IG 自動投稿は接続後）
- デプロイは `firebase deploy --only functions`（classifier で止まる場合は masa が `!` で実行）。Functions のログは Cloud Logging

## 5. テストの分離（エル指摘③）
- Functions に `env.TEST_ORIGIN`（kakiapp-test からの呼び出しは request の origin/appCheck で判別）→ テスト時は **別コレクション接頭辞 `test_`**（test_kakiapp_teams / test_kakiapp_seasons）に書く。users は共有だが、テストからの points 変更は行わない（返り値だけ）
- これで「テスト版で配った報酬が本番残高に入る」問題を構造的に解消

## 6. やらないこと
- 位置情報の偽装対策（GPS スプーフ）は Functions でも完全には防げない。1日1回・店半径・電話番号1アカウントで十分とする
- App Check の導入は次段階（Functions 化の後）
