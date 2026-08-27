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
    { id: "nagaoka", name: "柿川亭 長岡本店", lat: 37.439442, lng: 138.816467, radius: 150 },  // 北山3-19（国土地理院ジオコーダ・番地レベル）
  ],
  // 開発用: trueにするとGPS判定を常に成功させる
  devSkipGeo: false,

  // ランク（累計来店数）名称はたたき台
  ranks: [
    { id: "bronze", name: "油そば見習い", minVisits: 0, badge: "assets/badge_bronze.png" },
    { id: "silver", name: "常連", minVisits: 5, badge: "assets/badge_silver.png" },
    { id: "gold", name: "猛者", minVisits: 15, badge: "assets/badge_gold.png" },
    { id: "rainbow", name: "油神", minVisits: 40, badge: "assets/badge_rainbow.png" },
  ],
};
