/* `npx cap sync` は ios/App/Podfile の `def capacitor_pods` を毎回まるごと作り直すので、
   そこに必要な手当てが消える。sync のあとにこれを走らせて必ず戻す。
   （npm run sync がこの順番でやってくれる）

   ① Googleログイン
      CapacitorFirebaseAuthentication は既定で Lite（Googleログイン抜き）で入る。
      Google サブスペックを付けないと GoogleSignIn がプラグイン本体から見えず、
      「unable to resolve module dependency: 'GoogleSignIn'」でビルドが落ちる。
      ※ App ターゲット側に GoogleSignIn を書くだけでは解決しない（プラグイン側の依存にならないため）

   ② FirebaseAuth のバージョン固定
      GoogleSignIn 7.1 は GTMSessionFetcher 3.x を要求するが、最新の FirebaseAuth は 4.x を
      引いてくるため衝突する。両方が満たせる 11.4.0 で止める。 */
const fs = require("fs"), path = require("path");

const PODFILE = path.join(__dirname, "..", "ios", "App", "Podfile");
if (!fs.existsSync(PODFILE)) { console.log("Podfile なし（iOS未追加）。スキップします"); process.exit(0); }

let s = fs.readFileSync(PODFILE, "utf8");
const before = s;

// ① Google サブスペックを付ける
const plain = "pod 'CapacitorFirebaseAuthentication', :path => '../../node_modules/@capacitor-firebase/authentication'";
const withGoogle = plain + ", :subspecs => ['Google']";
if (s.includes(plain) && !s.includes(withGoogle)) s = s.replace(plain, withGoogle);

// ② FirebaseAuth を固定（target ブロック内。ここは cap sync が触らない）
if (!s.includes("pod 'FirebaseAuth'")) {
  s = s.replace(
    /(target 'App' do\n  capacitor_pods\n)/,
    "$1  # GoogleSignIn 7.1 と依存を揃えるためのバージョン固定（詳細は scripts/patch-podfile.js）\n" +
    "  pod 'FirebaseAuth', '11.4.0'\n"
  );
}

if (s === before) { console.log("Podfile は手当て済みでした"); process.exit(0); }
fs.writeFileSync(PODFILE, s);
console.log("Podfile を手当てしました（Googleサブスペック / FirebaseAuth 固定）");
