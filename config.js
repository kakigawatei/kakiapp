// 柿川亭アプリ 設定（数字は全部ここで変える。アプリ本体のコードは触らない）
// 本番ではこの値をFirestoreの settings ドキュメントに移し、ノーリリースで変更できるようにする
window.KAKI_CONFIG = {
  // 1P = 1円換算
  itemCatalog: [
    { id: "topping50", name: "トッピング（50円のもの）", points: 50 },
    { id: "topping120", name: "トッピング（120円のもの）", points: 120 },
    { id: "namimori", name: "油そば 並盛", points: 850 },
    { id: "oomori", name: "油そば 大盛", points: 900 },
    { id: "tokumori", name: "油そば 特盛", points: 950 },
  ],

  // 来店ガチャ（各席QR・1日1回・ハズレなし）期待値17.5P
  visitGacha: {
    costInfo: "来店で1回無料",
    table: [
      { points: 10, rate: 0.80 },
      { points: 30, rate: 0.10 },
      { points: 50, rate: 0.07 },
      { points: 100, rate: 0.03 },
    ],
  },

  // 毎日ルーレット（来店不要・1日1回・小口P）※マス構成はmasa確認中の仮値
  roulette: {
    segments: [1, 2, 3, 5, 1, 2, 3, 10],
  },

  // ログインボーナス（仮値）
  loginBonus: { points: 1 },

  // 来店判定（GPS）: 店舗リスト。新店はここに1行足す。半径はメートル
  stores: [
    { id: "nagaoka", name: "柿川亭 長岡本店", lat: 37.443615, lng: 138.849167, radius: 150 },  // 南町1-10-16（公式サイト住所・国土地理院ジオコーダ）
    { id: "sendai", name: "柿川亭 仙台連坊店", lat: 38.251450, lng: 140.889099, radius: 80 },  // 仙台市若林区連坊小路81 熊谷ビル103（公式サイト住所・国土地理院ジオコーダ 2026-09-03）
  ],
  // 開発用: trueにするとGPS判定を常に成功させる
  devSkipGeo: false,

  // visitPoints＝来店1回ごとに固定でつくP（ガチャとは別・2026-09-16 masa決定: 見習い1/常連5/猛者10/油神10）
  // ランク（累計来店数）名称はたたき台。bonus＝そのランクに上がった瞬間に1回だけ入るポイント（2026-09-10 masa「ランクアップボーナス」・masa決定 2026-09-10 12:50: 100/150/250/350/500）
  ranks: [
    { id: "bronze", name: "油そば見習い", minVisits: 0, badge: "assets/badge_bronze.png", visitPoints: 1 },
    { id: "silver", name: "常連", minVisits: 5, badge: "assets/badge_silver.png", bonus: 100, visitPoints: 5 },
    { id: "gold", name: "猛者", minVisits: 15, badge: "assets/badge_gold.png", bonus: 150, visitPoints: 10 },
    { id: "rainbow", name: "油神", minVisits: 40, badge: "assets/badge_rainbow.png", bonus: 250, visitPoints: 10 },
    { id: "king", name: "伝説の油神", minVisits: 100, badge: "assets/badge_king.png", bonus: 350 },   // 2026-09-03 masa「伝説の〇〇／至高の〇〇がいい」
    { id: "founder", name: "血液が米油", minVisits: 200, badge: "assets/badge_founder.png", bonus: 500 },  // masa案 2026-09-03
  ],

  // 学校対抗 来店バトル（masa 決定 2026-09-21）: 第0回＝お試し（10/7〜10/31・エントリー10/15まで・報酬少なめ）、第1回＝11月から本番・以後毎月・エントリーは月末まで。
  // 報酬の対象＝そのシーズンに来店1回以上（登録だけでは出ない）。数字は admin の「シーズン設定」（Firestore kakiapp_settings/teamBattle）で月ごとに上書きできる
  teamBattle: {
    seasons: { "2026-10": { round: 0, trial: true, start: "2026-10-07", entryUntil: "2026-10-15", rewards: { r1: 50, r2: 0, r3: 0, mvp: 0 } } },
    firstRealMonth: "2026-11",
    defaultRewards: { r1: 200, r2: 100, r3: 50, mvp: 50 },
    minMembersForRank: 2,
  },
};
