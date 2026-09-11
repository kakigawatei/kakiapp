/* 柿川亭アプリ 会員機能（Firebase Auth + Firestore）
   ・ログインしないとポイントが貯まらない＝端末を変えても残高が引き継がれる
   ・メール登録は本人確認メールを踏むまでポイント付与なし＝複数アカウント対策
   本体(index.html)とは window.kakiGetState / kakiSetState / kakiStart / cloudPush で繋ぐ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, initializeAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut,
  EmailAuthProvider, reauthenticateWithCredential, deleteUser,
  setPersistence, browserLocalPersistence, indexedDBLocalPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDtDZIEQtBzjujnpTDcXt1QeEU2r-wbg74",
  authDomain: "kakigawatei-franchise.firebaseapp.com",
  projectId: "kakigawatei-franchise",
});
/* 🟥 iOS/Androidアプリ(Capacitor)では getAuth() が使えない（ポップアップ用の初期化がWKWebViewで止まり、
   onAuthStateChanged が一度も呼ばれない＝ログイン画面が出ずメール欄が「—」のまま。1.0(4)〜(6)で実際に起きた）
   → アプリ版は initializeAuth＋indexedDB保存で初期化する（@capacitor-firebase の推奨）。Web版は従来どおり getAuth */
const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
  || location.search.includes("nativeauth=1");   // ← Chromeでアプリ版の経路を試すためのフラグ
const auth = isNativeApp ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
/* iOSアプリ(WKWebView)ではFirestoreの通常接続(WebChannel)が張れず「offline」のまま固まることがある
   → 接続方式を自動判定させる。Web版には影響なし */
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
auth.languageCode = "ja";

/* ネットワーク待ちで画面が固まらないように、全部に制限時間を付ける */
const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout: " + label), { code: "timeout/" + label })), ms))
]);
if (!isNativeApp) setPersistence(auth, browserLocalPersistence).catch(() => {});

/* クラウドに保存する項目。devMode などの端末設定は同期しない */
const KEYS = ["points", "visits", "tx", "rouletteDate", "gachaDate", "qrDate", "loginDate",
  "mailOptIn", "mailOptInAt",   /* 宣伝メールの同意（特定電子メール法）2026-09-03 */
  "storeVisits", "lastStore", "lastStoreAt",   /* どの店に来たか。送り分けに使う 2026-09-03 */
  "createdAt", "claimed", "rankBonus"];   /* 使い始めた日・キャンペーン受取・ランクアップ受取（二重取り防止）2026-09-10 */


let uid = null, ready = false, timer = null;

const $ = id => document.getElementById(id);
const gate = () => $("gate");

function showGate(view) {
  gate().style.display = "flex";
  document.body.style.overflow = "hidden";
  ["gSignin", "gSignup", "gVerify", "gLoading", "gPhone"].forEach(v => { const el = $(v); if (el) el.style.display = v === view ? "block" : "none"; });
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

/* ---- SMS（電話番号）認証・試作（?sms=1 のときだけ入口を出す） ---- */
const SMS_ON = location.search.includes("sms=1") || localStorage.getItem("kakiSms") === "1";
if (SMS_ON) { localStorage.setItem("kakiSms", "1"); $("gToPhone").style.display = "inline-block"; }
const toE164 = raw => { let d = (raw || "").replace(/[^0-9+]/g, ""); if (d.startsWith("+")) return d; if (d.startsWith("0")) return "+81" + d.slice(1); return "+81" + d; };
let smsConfirm = null, smsLinkUser = null, recaptcha = null;
const getRecaptcha = () => { if (recaptcha) return recaptcha; recaptcha = new RecaptchaVerifier(auth, "gSendSms", { size: "invisible" }); return recaptcha; };
const smsErr = e => ({ "auth/invalid-phone-number": "電話番号の形が違います（例: 090-1234-5678）", "auth/too-many-requests": "送りすぎです。しばらく待ってからもう一度",
  "auth/invalid-verification-code": "確認コードが違います", "auth/code-expired": "コードの期限が切れました。もう一度送ってください",
  "auth/credential-already-in-use": "この電話番号は別のアカウントに登録済みです", "auth/provider-already-linked": "このアカウントには電話番号が登録済みです",
  "auth/captcha-check-failed": "確認（reCAPTCHA）に失敗しました。ページを開き直してください" }[e && e.code] || jaError(e));
$("gToPhone").onclick = () => { msg(""); smsLinkUser = null; $("gSmsStep2").style.display = "none"; $("gDoSmsWrap").style.display = "none"; $("gSendSms").textContent = "確認コードを送る"; showGate("gPhone"); };
$("gPhoneBack").onclick = () => { msg(""); showGate("gSignin"); };
$("gSendSms").onclick = async () => {
  msg(""); const tel = toE164($("gTel").value);
  if (!/^\+81[0-9]{9,10}$/.test(tel)) { msg("携帯電話番号を入れてください（例: 090-1234-5678）"); return; }
  busy(true);
  try {
    const v = getRecaptcha();
    smsConfirm = smsLinkUser ? await linkWithPhoneNumber(smsLinkUser, tel, v) : await signInWithPhoneNumber(auth, tel, v);
    $("gSmsStep2").style.display = "block"; $("gDoSmsWrap").style.display = "block"; $("gSendSms").textContent = "もう一度送る";
    $("gDoSms").textContent = smsLinkUser ? "登録する" : "ログイン"; msg("SMS を送りました。届いた6桁を入れてください"); setTimeout(() => $("gSmsCode").focus(), 100);
  } catch (e) { msg(smsErr(e)); try { recaptcha && recaptcha.clear(); } catch (_) {} recaptcha = null; }
  finally { busy(false); }
};
$("gDoSms").onclick = async () => {
  msg(""); const code = ($("gSmsCode").value || "").replace(/[^0-9]/g, "");
  if (code.length !== 6 || !smsConfirm) { msg("6桁の確認コードを入れてください"); return; }
  busy(true);
  try {
    await smsConfirm.confirm(code);
    if (smsLinkUser) {   // 既存アカウントへの紐付け完了 → 本体へ戻る
      const st = window.kakiGetState ? window.kakiGetState() : {}; st.phoneLinkedAt = new Date().toISOString(); if (window.kakiSetState) window.kakiSetState(st);
      smsLinkUser = null; hideGate(); msg(""); if (window.kakiToast) window.kakiToast("電話番号を登録しました");
    }
    /* 新規は onAuthStateChanged が拾って本体へ */
  } catch (e) { msg(smsErr(e)); }
  finally { busy(false); }
};
/* 既存（メール）ユーザーに1回だけ電話番号の登録を勧める入口。本体から window.kakiLinkPhone() で開ける */
window.kakiLinkPhone = () => { const u = auth.currentUser; if (!u || !SMS_ON) return false; if (u.providerData.some(p => p.providerId === "phone")) return false;
  smsLinkUser = u; $("gSmsStep2").style.display = "none"; $("gDoSmsWrap").style.display = "none"; $("gSendSms").textContent = "確認コードを送る"; $("gTel").value = ""; showGate("gPhone"); msg("1人1アカウントのため、携帯電話番号を登録してください"); return true; };
window.kakiPhoneLinked = () => { const u = auth.currentUser; return !!(u && u.providerData.some(p => p.providerId === "phone")); };

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
    /* 宣伝メールの同意を、押した瞬間の状態で記録する（同意日時も残す） */
    const ok = !!($("gOptIn") && $("gOptIn").checked);
    const st = window.kakiGetState ? window.kakiGetState() : {};
    st.mailOptIn = ok;
    st.mailOptInAt = new Date().toISOString();
    if (window.kakiSetState) window.kakiSetState(st);
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

/* 見張り: 認証の初期化が黙って止まったら、裏の画面を触らせずに知らせる（原因調査用） */
let authFired = false;
setTimeout(() => {
  if (authFired) return;
  console.error("auth init timeout (onAuthStateChanged not fired in 10s) native=" + isNativeApp);
  showGate("gLoading");
  $("gLoadMsg").textContent = "ログイン機能の起動に時間がかかっています。電波の良い場所で「もう一度」を押してください。";
  $("gRetry").style.display = "inline-block";
}, 10000);

onAuthStateChanged(auth, async (u) => {
  authFired = true;
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
    $("acctMail").textContent = u.email || u.displayName || (u.phoneNumber ? u.phoneNumber.replace("+81", "0") : "");
    if (SMS_ON && byPassword && !u.providerData.some(p => p.providerId === "phone") && !sessionStorage.getItem("kakiLinkAsked")) { sessionStorage.setItem("kakiLinkAsked", "1"); setTimeout(() => window.kakiLinkPhone(), 1200); }
  } catch (e) {
    console.error(e);
    $("gLoadMsg").textContent = "サーバーに接続できませんでした。電波の良い場所で「もう一度」を押してください。";
    $("gRetry").style.display = "inline-block";
  } finally { busy(false); }
});
$("gRetry").onclick = () => location.reload();
$("gLoadSignOut").onclick = async () => { try { await withTimeout(signOut(auth), 5000, "signOut"); } catch (e) {} localStorage.removeItem("kakiapp"); location.reload(); };
