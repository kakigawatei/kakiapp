/* 柿川亭アプリ 会員機能（Firebase Auth + Firestore）
   ・ログインしないとポイントが貯まらない＝端末を変えても残高が引き継がれる
   ・メール登録は本人確認メールを踏むまでポイント付与なし＝複数アカウント対策
   本体(index.html)とは window.kakiGetState / kakiSetState / kakiStart / cloudPush で繋ぐ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut,
  EmailAuthProvider, reauthenticateWithCredential, deleteUser,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDtDZIEQtBzjujnpTDcXt1QeEU2r-wbg74",
  authDomain: "kakigawatei-franchise.firebaseapp.com",
  projectId: "kakigawatei-franchise",
});
const auth = getAuth(app);
/* iOSアプリ(WKWebView)ではFirestoreの通常接続(WebChannel)が張れず「offline」のまま固まることがある
   → 接続方式を自動判定させる。Web版には影響なし */
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
auth.languageCode = "ja";

/* ネットワーク待ちで画面が固まらないように、全部に制限時間を付ける */
const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout: " + label), { code: "timeout/" + label })), ms))
]);
setPersistence(auth, browserLocalPersistence).catch(() => {});

/* クラウドに保存する項目。devMode などの端末設定は同期しない */
const KEYS = ["points", "visits", "tx", "rouletteDate", "gachaDate", "qrDate", "loginDate"];


let uid = null, ready = false, timer = null;

const $ = id => document.getElementById(id);
const gate = () => $("gate");

function showGate(view) {
  gate().style.display = "flex";
  document.body.style.overflow = "hidden";
  ["gSignin", "gSignup", "gVerify", "gLoading"].forEach(v => $(v).style.display = v === view ? "block" : "none");
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
  if (c.includes("network") || c.includes("timeout") || c.includes("unavailable")) return "サーバーに接続できませんでした。電波の良い場所でもう一度お試しください。";
  if (c.includes("popup-blocked") || c.includes("popup-closed")) return "ログイン画面が開けませんでした。もう一度お試しください。";
  if (c.includes("unauthorized-domain")) return "このドメインが未許可です（設定を確認してください）。";
  return "うまくいきませんでした。もう一度お試しください。";
}

/* ---- 同期 ---- */
async function pull(u) {
  const snap = await withTimeout(getDoc(doc(db, "kakiapp_users", u.uid)), 12000, "getDoc");
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
  await withTimeout(setDoc(doc(db, "kakiapp_users", uid), out, { merge: true }), 15000, "setDoc");
}

window.cloudPush = function () {
  if (!ready) return;
  clearTimeout(timer);
  timer = setTimeout(() => { write().catch(() => {}); }, 700);
};

/* ---- 画面の配線 ---- */
$("gToSignup").onclick = () => { msg(""); showGate("gSignup"); };
$("gToSignin").onclick = () => { msg(""); showGate("gSignin"); };


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

/* ログアウト／アカウント削除。
   🟥 ネイティブの confirm/alert/prompt は iOSアプリ(WKWebView)で固まって画面ごと操作不能になるため使わない。
   index.html の画面内ダイアログ(kakiConfirm / kakiPrompt / kakiAlert) を使う。二重押しは acting で止める */
let acting = false;

window.kakiSignOut = async function () {
  if (acting) return;
  acting = true;
  try {
    const ok = await window.kakiConfirm("ログアウトします。\nポイントはサーバーに保存されているので、ログインし直せば戻ります。", { okText: "ログアウト" });
    if (!ok) return;
    ready = false;
    try { await withTimeout(signOut(auth), 5000, "signOut"); } catch (e) { console.error(e); }
    localStorage.removeItem("kakiapp");
    location.reload();
  } finally { acting = false; }
};

/* アカウント削除（App Store ガイドライン 5.1.1(v) 対応）。
   確認2回→（必要ならパスワード再認証）→Firestoreのデータ削除→Authの本体削除。 */
window.kakiDeleteAccount = async function () {
  if (acting) return;
  acting = true;
  try {
    const u = auth.currentUser;
    if (!u) return;
    const ok1 = await window.kakiConfirm("アカウントを削除します。\n\n貯めたポイント・来店記録・履歴はすべて消え、元に戻せません。\nよろしいですか？", { okText: "削除する", danger: true });
    if (!ok1) return;
    const ok2 = await window.kakiConfirm("最終確認です。本当に削除しますか？", { okText: "本当に削除する", danger: true });
    if (!ok2) return;
    try {
      /* データ削除。Firestoreに繋がらなくても本体(Auth)の削除には進む（残った空docは無害） */
      ready = false;
      try { await withTimeout(deleteDoc(doc(db, "kakiapp_users", u.uid)), 8000, "deleteDoc"); }
      catch (e) {
        console.error(e);
        try { await withTimeout(setDoc(doc(db, "kakiapp_users", u.uid), { deleted: true, points: 0, tx: [], updatedAt: new Date().toISOString() }), 4000, "setDoc"); } catch (e2) { console.error(e2); }
      }
      try {
        await withTimeout(deleteUser(u), 15000, "deleteUser");
      } catch (e) {
        if (String(e && e.code).includes("requires-recent-login")) {
          const pw = await window.kakiPrompt("安全のため、パスワードをもう一度入力してください。", { password: true, okText: "確認" });
          if (!pw) { ready = true; return; }
          await withTimeout(reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw)), 15000, "reauth");
          await withTimeout(deleteUser(auth.currentUser), 15000, "deleteUser");
        } else { throw e; }
      }
      ready = false;
      localStorage.removeItem("kakiapp");
      await window.kakiAlert("アカウントを削除しました。ご利用ありがとうございました。");
      location.reload();
    } catch (e) {
      console.error(e);
      ready = true;
      await window.kakiAlert("削除できませんでした。" + jaError(e));
    }
  } finally { acting = false; }
};

/* ---- 入口 ---- */

onAuthStateChanged(auth, async (u) => {
  if (!u) { ready = false; uid = null; showGate("gSignin"); return; }

  const byPassword = u.providerData.some(p => p.providerId === "password");
  if (byPassword && !u.emailVerified) {
    $("gVerifyMail").textContent = u.email || "";
    showGate("gVerify");
    return;
  }

  uid = u.uid;
  /* 読み込み中は本体を触らせない（裏で見えていると「0P」の古い画面を操作できてしまう） */
  showGate("gLoading");
  $("gLoadMsg").textContent = "ポイントを読み込んでいます…";
  $("gRetry").style.display = "none";
  busy(true);
  try {
    await pull(u);
    ready = true;
    hideGate();
    window.kakiStart();
    $("acctMail").textContent = u.email || u.displayName || "";
  } catch (e) {
    console.error(e);
    $("gLoadMsg").textContent = "サーバーに接続できませんでした。電波の良い場所で「もう一度」を押してください。";
    $("gRetry").style.display = "inline-block";
  } finally { busy(false); }
});
$("gRetry").onclick = () => location.reload();
$("gLoadSignOut").onclick = async () => { try { await withTimeout(signOut(auth), 5000, "signOut"); } catch (e) {} localStorage.removeItem("kakiapp"); location.reload(); };
