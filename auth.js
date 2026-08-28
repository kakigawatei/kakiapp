/* 柿川亭アプリ 会員機能（Firebase Auth + Firestore）
   ・ログインしないとポイントが貯まらない＝端末を変えても残高が引き継がれる
   ・メール登録は本人確認メールを踏むまでポイント付与なし＝複数アカウント対策
   本体(index.html)とは window.kakiGetState / kakiSetState / kakiStart / cloudPush で繋ぐ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, GoogleAuthProvider, OAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDtDZIEQtBzjujnpTDcXt1QeEU2r-wbg74",
  authDomain: "kakigawatei-franchise.firebaseapp.com",
  projectId: "kakigawatei-franchise",
});
const auth = getAuth(app);
const db = getFirestore(app);
auth.languageCode = "ja";
setPersistence(auth, browserLocalPersistence).catch(() => {});

/* クラウドに保存する項目。devMode などの端末設定は同期しない */
const KEYS = ["points", "visits", "tx", "rouletteDate", "gachaDate", "qrDate", "loginDate"];

/* iOS/Androidのアプリ版か（＝Capacitorで包まれて動いているか）。
   アプリ版のWebViewではポップアップが開けないので、ログインは
   ネイティブのGoogle/Appleの画面を呼び出して資格情報だけ受け取る方式に切り替える。 */
const nativeAuth = () => {
  const c = window.Capacitor;
  return (c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.FirebaseAuthentication) || null;
};
const isIOSApp = () => {
  const c = window.Capacitor;
  return !!(c && c.getPlatform && c.getPlatform() === "ios");
};

let uid = null, ready = false, timer = null;

const $ = id => document.getElementById(id);
const gate = () => $("gate");

function showGate(view) {
  gate().style.display = "flex";
  document.body.style.overflow = "hidden";
  ["gSignin", "gSignup", "gVerify"].forEach(v => $(v).style.display = v === view ? "block" : "none");
}
function hideGate() {
  gate().style.display = "none";
  document.body.style.overflow = "";
}
function msg(t) { $("gMsg").textContent = t || ""; }
function busy(on) {
  gate().querySelectorAll("button").forEach(b => b.disabled = on);
  $("gBusy").style.display = on ? "block" : "none";
}

/* Firebaseのエラーを日本語にする（そのまま出すと英語で読めない） */
function jaError(e) {
  const c = (e && e.code) || "";
  if (c.includes("email-already-in-use")) return "このメールアドレスは登録済みです。ログインしてください。";
  if (c.includes("invalid-email")) return "メールアドレスの形式が正しくありません。";
  if (c.includes("weak-password")) return "パスワードは6文字以上にしてください。";
  if (c.includes("wrong-password") || c.includes("invalid-credential")) return "メールアドレスかパスワードが違います。";
  if (c.includes("user-not-found")) return "登録が見つかりません。新規登録してください。";
  if (c.includes("too-many-requests")) return "試行が多すぎます。しばらく待ってからお試しください。";
  if (c.includes("network")) return "通信できませんでした。電波の良い場所でお試しください。";
  if (c.includes("popup-blocked") || c.includes("popup-closed")) return "ログイン画面が開けませんでした。もう一度お試しください。";
  if (c.includes("unauthorized-domain")) return "このドメインが未許可です（設定を確認してください）。";
  return "うまくいきませんでした。もう一度お試しください。";
}

/* ---- 同期 ---- */
async function pull(u) {
  const snap = await getDoc(doc(db, "kakiapp_users", u.uid));
  const cur = window.kakiGetState();
  if (snap.exists()) {
    /* クラウドが正。端末に何が入っていても上書きする＝機種変更してもポイントが戻る */
    const d = snap.data(), next = {};
    KEYS.forEach(k => { if (d[k] !== undefined) next[k] = d[k]; });
    if (cur.devMode) next.devMode = cur.devMode;
    if (cur.devSkipGeo) next.devSkipGeo = cur.devSkipGeo;
    window.kakiSetState(next);
  } else {
    /* 初回。ログイン前にこの端末で貯めていた分をそのまま引き継ぐ */
    await write();
  }
}

async function write() {
  if (!uid || !auth.currentUser) return;
  const s = window.kakiGetState();
  const out = {
    email: auth.currentUser.email || "",
    name: auth.currentUser.displayName || "",
    updatedAt: new Date().toISOString(),
  };
  KEYS.forEach(k => { if (s[k] !== undefined) out[k] = s[k]; });
  await setDoc(doc(db, "kakiapp_users", uid), out, { merge: true });
}

window.cloudPush = function () {
  if (!ready) return;
  clearTimeout(timer);
  timer = setTimeout(() => { write().catch(() => {}); }, 700);
};

/* ---- 画面の配線 ---- */
$("gToSignup").onclick = () => { msg(""); showGate("gSignup"); };
$("gToSignin").onclick = () => { msg(""); showGate("gSignin"); };

async function googleLogin() {
  msg(""); busy(true);
  try {
    const native = nativeAuth();
    if (native) {
      const r = await native.signInWithGoogle({ skipNativeAuth: true });
      const idToken = r.credential && r.credential.idToken;
      if (!idToken) throw new Error("no-credential");
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
  } catch (e) {
    if (!nativeAuth() && String(e.code).includes("popup")) {
      try { await signInWithRedirect(auth, new GoogleAuthProvider()); return; } catch (e2) { msg(jaError(e2)); }
    } else msg(jaError(e));
  } finally { busy(false); }
}
$("gGoogle").onclick = googleLogin;
$("gGoogle2").onclick = googleLogin;

/* Appleでログイン。iOSアプリ版では必須（Googleログインを載せたアプリに
   Appleログインが無いと、App Storeの審査でリジェクトされるため）。 */
async function appleLogin() {
  msg(""); busy(true);
  try {
    const native = nativeAuth();
    if (native) {
      const r = await native.signInWithApple({ skipNativeAuth: true });
      const c = r.credential || {};
      if (!c.idToken) throw new Error("no-credential");
      await signInWithCredential(auth,
        new OAuthProvider("apple.com").credential({ idToken: c.idToken, rawNonce: c.nonce }));
    } else {
      await signInWithPopup(auth, new OAuthProvider("apple.com"));
    }
  } catch (e) { msg(jaError(e)); } finally { busy(false); }
}
$("gApple").onclick = appleLogin;
$("gApple2").onclick = appleLogin;

/* Appleボタンは iOSアプリ版だけに出す（Web版は規約の対象外で、
   Firebase側のApple設定も要らないため、出すと押せないボタンになる） */
if (isIOSApp()) {
  $("gApple").style.display = "flex";
  $("gApple2").style.display = "flex";
}

$("gDoSignin").onclick = async () => {
  msg(""); busy(true);
  try {
    await signInWithEmailAndPassword(auth, $("gEmail").value.trim(), $("gPass").value);
  } catch (e) { msg(jaError(e)); } finally { busy(false); }
};

$("gDoSignup").onclick = async () => {
  msg(""); busy(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, $("gEmail2").value.trim(), $("gPass2").value);
    await sendEmailVerification(cred.user);
  } catch (e) { msg(jaError(e)); } finally { busy(false); }
};

$("gReset").onclick = async () => {
  const em = $("gEmail").value.trim();
  if (!em) { msg("メールアドレスを入れてから押してください。"); return; }
  busy(true);
  try { await sendPasswordResetEmail(auth, em); msg("パスワード再設定のメールを送りました。"); }
  catch (e) { msg(jaError(e)); } finally { busy(false); }
};

$("gResend").onclick = async () => {
  busy(true);
  try { await sendEmailVerification(auth.currentUser); msg("確認メールを送り直しました。"); }
  catch (e) { msg(jaError(e)); } finally { busy(false); }
};

$("gVerified").onclick = async () => {
  busy(true);
  try {
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) location.reload();
    else msg("まだ確認できていません。メールのリンクを開いてから、もう一度押してください。");
  } catch (e) { msg(jaError(e)); } finally { busy(false); }
};

$("gCancel").onclick = () => signOut(auth);

window.kakiSignOut = function () {
  if (!confirm("ログアウトします。ポイントはサーバーに保存されているので、ログインし直せば戻ります。")) return;
  ready = false;
  signOut(auth).then(() => { localStorage.removeItem("kakiapp"); location.reload(); });
};

/* ---- 入口 ---- */
getRedirectResult(auth).catch(() => {});

onAuthStateChanged(auth, async (u) => {
  if (!u) { ready = false; uid = null; showGate("gSignin"); return; }

  const byPassword = u.providerData.some(p => p.providerId === "password");
  if (byPassword && !u.emailVerified) {
    $("gVerifyMail").textContent = u.email || "";
    showGate("gVerify");
    return;
  }

  uid = u.uid;
  busy(true);
  try {
    await pull(u);
    ready = true;
    hideGate();
    window.kakiStart();
    $("acctMail").textContent = u.email || u.displayName || "";
  } catch (e) {
    msg("データの読み込みに失敗しました。電波の良い場所で開き直してください。");
    console.error(e);
  } finally { busy(false); }
});
