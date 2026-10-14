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
  RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber,
  PhoneAuthProvider, linkWithCredential
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, updateDoc, increment, query, where, orderBy, limit, startAfter, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
  "createdAt", "claimed", "rankBonus",   /* 使い始めた日・キャンペーン受取・ランクアップ受取（二重取り防止）2026-09-10 */
  "teamId", "team", "teamJoinedAt", "teamVisits", "teamVisitDay",   /* 学校対抗 来店バトル（任意参加・自分の学校と月別の自分の来店数）2026-09-21 */
  "nickname", "awards", "awardsSeen",
  "referredBy", "refClaimed",   /* 友だち紹介キャンペーン（下の注記） */
  "boardDate"];   /* みんなの一杯: 投稿ポイントを受け取った日（1日1回・二重取り防止）2026-10-08 */   /* 友だち紹介キャンペーン: 自分を紹介した人／紹介した人の成立分の受け取り済み（二重取り防止）2026-10-08 */   /* ニックネーム／シーズン結果（awards＝運営だけが書く・本人は書けない）／受け取り済み（awardsClaimed＝本人が書く）2026-09-21 エル監査対応 */


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
    cloudBase = { points: Number(d.points) || 0, updatedAt: d.updatedAt || "" };   /* 2026-10-14: 差分マージの基準（運営の加算を古い端末が消さない） */
    KEYS.forEach(k => { if (d[k] !== undefined) next[k] = d[k]; });
    if (cur.devMode) next.devMode = cur.devMode;
    if (cur.devSkipGeo) next.devSkipGeo = cur.devSkipGeo;
    window.kakiSetState(next);
  } else {
    /* 初回。ログイン前にこの端末で貯めていた分をそのまま引き継ぐ */
    await write();
  }
}

let cloudBase = null;   /* 最後にクラウドと合わせたときの {points, updatedAt} */
let writeChain = Promise.resolve();
/* 2026-10-14（エル 3回目）: 保存は1本ずつ順番に（直列化）。重なった呼び出しは前の保存が終わってから走る */
function write() { const p = writeChain.then(() => _write()); writeChain = p.catch(() => {}); return p; }
async function _write() {
  if (!uid || !auth.currentUser) return;
  /* 2026-10-14（エル監査）: 運営が加算した直後に、開いたままの端末が古い残高で上書きしないように、
     クラウドの残高が自分の知っている基準と違っていたら「自分の差分」だけを足す（points は差分マージ・visits/tx は和集合） */
  const ref = doc(db, "kakiapp_users", uid);
  let merged = null, mergedVisits = null, mergedTx = null, out = null, s = null;
  await withTimeout(runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    /* 差分は「送る直前の端末の状態」で計算する（通信中の加算・利用を落とさない） */
    s = window.kakiGetState();
    out = { email: auth.currentUser.email || "", name: auth.currentUser.displayName || "", updatedAt: new Date().toISOString() };
    KEYS.forEach(k => { if (s[k] !== undefined && k !== "awards") out[k] = s[k]; });   /* awards は運営専用（ルールで本人の書き込みを拒否）*/
    merged = null; mergedVisits = null; mergedTx = null;
    if (snap.exists() && cloudBase) {
      const d = snap.data();
      /* points: クラウドの実残高が自分の知っている基準と違えば（運営の増減）、自分の差分だけ足す。updatedAt は見ない（admin の increment は更新しないため・エル再監査） */
      if (typeof d.points === "number" && typeof out.points === "number" && d.points !== cloudBase.points) {
        const delta = (Number(s.points) || 0) - cloudBase.points;
        out.points = Math.max(0, d.points + delta);
        merged = out.points;
      }
      /* visits / tx: クラウドにだけある項目（運営が足した来店や履歴）を消さない＝和集合にする（ジェミ再監査） */
      if (Array.isArray(d.visits) && Array.isArray(out.visits)) {
        const u = Array.from(new Set(d.visits.concat(out.visits))).sort();
        if (u.length !== out.visits.length) { out.visits = u; mergedVisits = u; }
      }
      if (Array.isArray(d.tx) && Array.isArray(out.tx)) {
        const key = t => JSON.stringify(t); const have = new Set(out.tx.map(key));
        const extra = d.tx.filter(t => !have.has(key(t)));
        if (extra.length) { out.tx = out.tx.concat(extra); mergedTx = out.tx; }
      }
    }
    tx.set(ref, out, { merge: true });
  }), 20000, "setDoc");
  const sentPoints = Number(out.points) || 0;
  cloudBase = { points: sentPoints, updatedAt: out.updatedAt };
  const cur = window.kakiGetState();
  /* 送信中に端末側でさらに増減していたら、その分を上乗せ（基準は送った値） */
  const drift = (Number(cur.points) || 0) - (Number(s.points) || 0);
  if (merged !== null) cur.points = Math.max(0, merged + drift);
  if (mergedVisits) cur.visits = Array.from(new Set(mergedVisits.concat(cur.visits || []))).sort();
  if (mergedTx) { const key = t => JSON.stringify(t); const have = new Set((cur.tx || []).map(key)); cur.tx = (cur.tx || []).concat(mergedTx.filter(t => !have.has(key(t)))); }
  if (merged !== null || mergedVisits || mergedTx) window.kakiSetState(cur);
  if (drift !== 0 || mergedVisits || mergedTx) window.cloudPush();   /* 送信中の変化は次の保存で追いつく */
}

window.cloudPush = function () {
  if (!ready) return;
  clearTimeout(timer);
  timer = setTimeout(() => { write().catch(() => {}); }, 700);
};

/* ---- SMS（電話番号）認証・試作（?sms=1 のときだけ入口を出す） ---- */
const SMS_ON = true;   /* 2026-09-11 masa「出して」: 全員に展開（メール登録→電話番号を1回確認→紐付け。1番号1アカウント） */
if (SMS_ON) { localStorage.setItem("kakiSms", "1"); }   /* 電話番号ログインの入口は出さない（紐付け専用） */
const toE164 = raw => { let d = (raw || "").replace(/[^0-9+]/g, ""); if (d.startsWith("+")) return d; if (d.startsWith("0")) return "+81" + d.slice(1); return "+81" + d; };
let smsConfirm = null, smsLinkUser = null, recaptcha = null;
const getRecaptcha = () => { if (recaptcha) return recaptcha; recaptcha = new RecaptchaVerifier(auth, "gSendSms", { size: "invisible" }); return recaptcha; };
const smsErr = e => ({ "auth/invalid-phone-number": "電話番号の形が違います（例: 090-1234-5678）", "auth/too-many-requests": "送りすぎです。しばらく待ってからもう一度",
  "auth/invalid-verification-code": "確認コードが違います", "auth/code-expired": "コードの期限が切れました。もう一度送ってください",
  "auth/credential-already-in-use": "この電話番号は別のアカウントに登録済みです", "auth/provider-already-linked": "このアカウントには電話番号が登録済みです",
  "auth/captcha-check-failed": "確認（reCAPTCHA）に失敗しました。ページを開き直してください" }[e && e.code] || jaError(e));
$("gToPhone").onclick = () => { msg(""); smsLinkUser = null; $("gSmsStep2").style.display = "none"; $("gDoSmsWrap").style.display = "none"; $("gSendSms").textContent = "確認コードを送る"; showGate("gPhone"); };
$("gPhoneBack").onclick = async () => { msg(""); try { await withTimeout(signOut(auth), 5000, "signOut"); } catch (e) {} smsLinkUser = null; showGate("gSignin"); };
/* ---- iOS/Android アプリ版（1.0.7〜）: WKWebView では reCAPTCHA が動かないので、SMS の送信だけネイティブ（@capacitor-firebase/authentication・APNs のサイレント通知で端末確認）に頼み、
   届いた verificationId ＋ 入力コードで Web SDK の PhoneAuthProvider.credential を作り、ログイン中のメールユーザーに linkWithCredential する（skipNativeAuth はそのまま） ---- */
const nativePhone = (() => {
  if (!isNativeApp || !window.Capacitor) return null;
  try { const C = window.Capacitor; const P = C.registerPlugin ? C.registerPlugin("FirebaseAuthentication") : (C.Plugins && C.Plugins.FirebaseAuthentication); return P || null; } catch (_) { return null; }
})();
let nativeVerificationId = null, nativeListening = false, nativeSentOnce = false, nativeFail = null;
const nativeErr = e => { const c = (e && (e.code || e.message)) || ""; const m = { "missing-apns-token": "端末の確認ができませんでした（通知の設定を確認して、アプリを開き直してください）", "invalid-phone-number": "電話番号の形が違います（例: 090-1234-5678）",
  "too-many-requests": "送りすぎです。しばらく待ってからもう一度", "quota-exceeded": "本日の送信上限に達しました。時間をおいてもう一度", "network-request-failed": "通信できませんでした。電波の良い所でもう一度" };
  for (const k in m) if (String(c).includes(k)) return m[k]; return "SMS を送れませんでした" + (c ? "（" + String(c).slice(0, 60) + "）" : ""); };
async function nativeSendSms(tel) {
  if (!nativeListening) {
    nativeListening = true;
    await nativePhone.addListener("phoneCodeSent", ev => { nativeVerificationId = ev && ev.verificationId || null; });
    await nativePhone.addListener("phoneVerificationFailed", ev => { console.error("phone failed", ev); nativeFail = ev || { message: "failed" }; });
  }
  nativeVerificationId = null; nativeFail = null;
  const wait = new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { if (nativeVerificationId) return res(nativeVerificationId); if (nativeFail) return rej(nativeFail); if (Date.now() - t0 > 40000) return rej(Object.assign(new Error("timeout"), { code: "timeout/sms" })); setTimeout(tick, 250); }; tick(); });
  await nativePhone.signInWithPhoneNumber({ phoneNumber: tel, skipNativeAuth: true, resendCode: nativeSentOnce });   // 送信だけ。ネイティブ側ではログインしない
  nativeSentOnce = true;
  return wait;
}
$("gSendSms").onclick = async () => {
  msg(""); const tel = toE164($("gTel").value);
  if (!/^\+81[0-9]{9,10}$/.test(tel)) { msg("携帯電話番号を入れてください（例: 090-1234-5678）"); return; }
  busy(true);
  try {
    if (nativePhone) {
      if (!smsLinkUser) throw Object.assign(new Error("link only"), { code: "auth/operation-not-allowed" });   // アプリ版は紐付け専用
      const vid = await nativeSendSms(tel);
      smsConfirm = { confirm: async code => linkWithCredential(smsLinkUser, PhoneAuthProvider.credential(vid, code)) };
    } else {
      const v = getRecaptcha();
      smsConfirm = smsLinkUser ? await linkWithPhoneNumber(smsLinkUser, tel, v) : await signInWithPhoneNumber(auth, tel, v);
    }
    $("gSmsStep2").style.display = "block"; $("gDoSmsWrap").style.display = "block"; $("gSendSms").textContent = "もう一度送る";
    $("gDoSms").textContent = smsLinkUser ? "登録する" : "ログイン"; msg("SMS を送りました。届いた6桁を入れてください"); setTimeout(() => $("gSmsCode").focus(), 100);
  } catch (e) { console.error("sms send", e && e.code, e && e.message, e); msg((nativePhone ? nativeErr(e) : smsErr(e)) + (e && e.code && !nativePhone ? "（" + e.code + "）" : "")); try { recaptcha && recaptcha.clear(); } catch (_) {} recaptcha = null; }
  finally { busy(false); }
};
$("gDoSms").onclick = async () => {
  msg(""); const code = ($("gSmsCode").value || "").replace(/[^0-9]/g, "");
  if (code.length !== 6 || !smsConfirm) { msg("6桁の確認コードを入れてください"); return; }
  busy(true);
  try {
    await smsConfirm.confirm(code);
    if (smsLinkUser) {   // 紐付け完了 → 再読込して通常フロー（onAuthStateChanged が phone provider を見て本体へ）
      try { const st = window.kakiGetState ? window.kakiGetState() : {}; st.phoneLinkedAt = new Date().toISOString(); if (window.kakiSetState) window.kakiSetState(st); } catch (_) {}
      smsLinkUser = null; msg("電話番号を確認しました。"); setTimeout(() => location.reload(), 600); return;
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
    refSavePending($("gRef") && $("gRef").value);   /* 紹介コード（任意）。確認メール→電話番号のあと、初回ログインで記録する */
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
      /* プッシュ通知: 購読をやめてトークンの控えも消す（失敗しても削除は続ける） */
      try { if (pushPlugin) await pushDisable(); await withTimeout(deleteDoc(doc(db, PUSH_COL, u.uid)), 6000, "pushDel"); } catch (e) { console.warn("push delete", e && e.code); }
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

/* ---- 高校対抗 来店バトル（2026-09-21 masa🇦）----
   チーム＝ kakiapp_teams/{id} {name, norm, kind:"school", members, visits:{"YYYY-MM":n}, visitsTotal, aliases:[norm...], hidden, mergedInto, createdAt, createdBy}
   学校名は本人が自由入力（遠くの学校も自分で作れる）。表記ゆれは norm（正規化）で寄せ、残った重複は admin.html の「統合」で masa がひとつにする
   （統合された側は mergedInto に統合先が入り、norm は統合先の aliases に記憶＝次から同じ名前は自動で同じチーム。所属していた人は起動時 sync で付け替わる） */
const teamNorm = raw => {
  let s = String(raw || "").normalize("NFKC").replace(/[\s\u3000]+/g, "").toLowerCase();
  s = s.replace(/^(新潟県立|新潟県|県立|私立|市立|国立|学校法人)/, "");
  s = s.replace(/高等学校$/, "高校").replace(/高等専門学校$/, "高専");
  return s;
};
const teamMonth = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
let teamCache = null, teamCacheAt = 0;
async function teamList(force) {
  if (!force && teamCache && Date.now() - teamCacheAt < 60000) return teamCache;
  const snap = await withTimeout(getDocs(collection(db, "kakiapp_teams")), 12000, "teams");
  const arr = []; snap.forEach(d => arr.push(Object.assign({ id: d.id }, d.data())));
  teamCache = arr; teamCacheAt = Date.now(); return arr;
}
const teamResolve = (arr, id) => { let t = arr.find(x => x.id === id), n = 0; while (t && t.mergedInto && n++ < 5) { const nx = arr.find(x => x.id === t.mergedInto); if (!nx) break; t = nx; } return t || null; };
const teamFind = (arr, norm) => { const t = arr.find(x => !x.mergedInto && (x.norm === norm || (x.aliases || []).includes(norm))) || arr.find(x => x.norm === norm || (x.aliases || []).includes(norm)); return t ? teamResolve(arr, t.id) : null; };
/* シーズン情報: config.js の既定 ＋ Firestore kakiapp_settings/teamBattle の上書き（admin で編集）。round は firstRealMonth を第1回として自動計算 */
let settingsCache = null, settingsAt = 0;
async function teamSeason(force) {
  const m = teamMonth(); const cfg = (window.KAKI_CONFIG && window.KAKI_CONFIG.teamBattle) || {};
  let over = settingsCache || {};
  try {
    if (force || !settingsCache || Date.now() - settingsAt > 300000) { const snap = await withTimeout(getDoc(doc(db, "kakiapp_settings", "teamBattle")), 8000, "settings"); settingsCache = snap.exists() ? snap.data() : {}; settingsAt = Date.now(); }
    over = settingsCache || {};
  } catch (e) { console.warn("settings", e && e.code); }
  const base = (cfg.seasons && cfg.seasons[m]) || null, ovr = (over.seasons && over.seasons[m]) || null;
  const s = Object.assign({}, base || {}, ovr || {});
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); const lastDay = new Date(y, mo, 0).getDate();
  if (s.round === undefined) { const fm = String(cfg.firstRealMonth || "2026-11"); const fy = Number(fm.slice(0, 4)), fmo = Number(fm.slice(5, 7)); s.round = Math.max(0, (y - fy) * 12 + (mo - fmo) + 1); }
  s.month = m; s.trial = !!s.trial; s.start = s.start || m + "-01"; s.end = m + "-" + String(lastDay).padStart(2, "0"); s.entryUntil = s.entryUntil || s.end;
  s.rewards = Object.assign({}, cfg.defaultRewards || {}, s.rewards || {});
  return s;
}
/* 締めた結果（admin が kakiapp_seasons/{月} に書く）: 表彰台・名簿に使う */
const seasonResultCache = {};
async function teamSeasonResult(month) {
  if (seasonResultCache[month] !== undefined) return seasonResultCache[month];
  try { const snap = await withTimeout(getDoc(doc(db, "kakiapp_seasons", month)), 8000, "season"); seasonResultCache[month] = snap.exists() ? snap.data() : null; }
  catch (e) { console.warn("season result", e && e.code); return null; }
  return seasonResultCache[month];
}
window.kakiTeams = {
  season: teamSeason, result: teamSeasonResult,
  month: teamMonth, norm: teamNorm, list: teamList,
  /* 入力中の候補（正規化して部分一致・統合済み/非表示は除く） */
  suggest: async q => { const n = teamNorm(q); if (!n) return []; const arr = await teamList(); return arr.filter(t => !t.mergedInto && !t.hidden && (String(t.norm || "").includes(n) || String(t.name || "").includes(q))).slice(0, 8); },
  /* 今月のランキング材料（表示側で「参加2人以上だけ順位つき」にする） */
  /* storeId を渡すとその店での来店だけで並べる（タブ 長岡／仙台）。today＝今日の来店数、createdAt＝NEW 判定用 */
  ranking: async (force, storeId) => { const m = teamMonth(), d = new Date().toISOString().slice(0, 10); const arr = await teamList(force);
    return arr.filter(t => !t.mergedInto && !t.hidden).map(t => ({ id: t.id, name: t.name, kind: t.kind || "高校", members: t.members || 0, createdAt: t.createdAt || "",
      visits: storeId ? ((t.visitsByStore && t.visitsByStore[m] && t.visitsByStore[m][storeId]) || 0) : ((t.visits && t.visits[m]) || 0),
      today: (t.days && t.days[d]) || 0 })).sort((a, b) => b.visits - a.visits || b.members - a.members || String(a.name).localeCompare(String(b.name), "ja")); },
  join: async (name, kind) => {
    if (!uid || !auth.currentUser) throw Object.assign(new Error("not signed in"), { code: "team/auth" });
    name = String(name || "").normalize("NFKC").replace(/\s+/g, " ").trim(); const norm = teamNorm(name);
    if (norm.length < 2 || name.length > 30) throw Object.assign(new Error("bad name"), { code: "team/name" });
    const st = window.kakiGetState();
    const arr = await teamList(true);
    let t = teamFind(arr, norm);
    if (t && t.id === st.teamId) return t;
    if (st.teamId) { try { await updateDoc(doc(db, "kakiapp_teams", st.teamId), { members: increment(-1) }); } catch (e) { console.error(e); } }
    if (t) { await withTimeout(updateDoc(doc(db, "kakiapp_teams", t.id), { members: increment(1) }), 12000, "teamJoin"); }
    else {
      const ref = await withTimeout(addDoc(collection(db, "kakiapp_teams"), { name, norm, kind: kind || "高校", members: 1, visits: {}, visitsTotal: 0, aliases: [], hidden: false, mergedInto: null, createdAt: new Date().toISOString(), createdBy: uid }), 12000, "teamCreate");
      t = { id: ref.id, name, norm, kind: kind || "高校", members: 1, visits: {} };
    }
    teamCache = null;
    const s2 = window.kakiGetState(); s2.teamId = t.id; s2.team = t.name; s2.teamJoinedAt = new Date().toISOString(); window.kakiSetState(s2); window.cloudPush();
    return t;
  },
  leave: async () => {
    const st = window.kakiGetState(); if (!st.teamId) return;
    try { await updateDoc(doc(db, "kakiapp_teams", st.teamId), { members: increment(-1) }); } catch (e) { console.error(e); }
    teamCache = null; delete st.teamId; delete st.team; delete st.teamJoinedAt; window.kakiSetState(st); window.cloudPush();
  },
  /* 来店1回＝自分の学校の今月に+1（index.html の checkin から。失敗しても本人の来店は成立） */
  visit: async (storeId, day) => { const st = window.kakiGetState(); if (!st.teamId || !uid) return; const m = teamMonth(), d = day || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); const u = {};
    u["visits." + m] = increment(1); u.visitsTotal = increment(1); u["days." + d] = increment(1);
    if (storeId) u["visitsByStore." + m + "." + storeId] = increment(1);
    /* 2026-10-14（エル監査）: 学校の+1 は、本人の会員データの teamVisitDay を「今日」にする同じ batch でだけ通る（ルール teamVisitOk）＝1日1回 */
    clearTimeout(timer); await write();   /* 先に本人データを最新にしてから */
    const b = writeBatch(db);
    b.update(doc(db, "kakiapp_users", uid), { teamVisitDay: d, updatedAt: new Date().toISOString() });
    b.update(doc(db, "kakiapp_teams", st.teamId), u);
    await withTimeout(b.commit(), 15000, "teamVisit");
    const cur = window.kakiGetState(); cur.teamVisitDay = d; window.kakiSetState(cur);
    teamCache = null; },
  /* 起動時: 統合・改名されていたら自分の所属を付け替える */
  sync: async () => { const st = window.kakiGetState(); if (!st.teamId) return null; const arr = await teamList(); const t = teamResolve(arr, st.teamId); if (!t) return null; if (t.id !== st.teamId || t.name !== st.team) { const s2 = window.kakiGetState(); s2.teamId = t.id; s2.team = t.name; window.kakiSetState(s2); window.cloudPush(); } return t; },
};

/* ---- 友だち紹介キャンペーン（masa 決定 2026-10-08）----
   コード＝uid から決まる6文字（紛らわしい 0/O/1/I は使わない32文字）。kakiapp_refcodes/{コード} = {uid, createdAt}（本人が作るだけ・書き換え不可）
   紹介の記録＝ kakiapp_referrals/{紹介された人のuid} = {referrer, referee, code, createdAt, status:"pending"}（doc id が本人＝1人1回）
   成立＝紹介された人が status を "qualified" にする（index.html の refQualify）。紹介した人は自分宛ての qualified を数えて受け取る（applyReferrals） */
const REF_ABC = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REF_RE = /^[2-9A-HJ-NP-Z]{6}$/;
function refCodeOf(id) {
  /* cyrb53（53bit の速いハッシュ）→ 下位30bit を5bitずつ6文字に */
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) { const c = id.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  let n = (h1 >>> 0) ^ ((h2 & 0x1fffff) << 9), out = "";
  for (let i = 0; i < 6; i++) { out += REF_ABC[n & 31]; n >>>= 5; }
  return out;
}
const refNorm = v => String(v || "").normalize("NFKC").replace(/[\s\-]/g, "").toUpperCase();
function refSavePending(v) {
  const c = refNorm(v); if (!REF_RE.test(c)) return;
  try { sessionStorage.setItem("kakiRef", c); localStorage.setItem("kakiRef", c); } catch (_) {}   /* 確認メールで別タブになっても残るよう localStorage にも */
}
function refPending() { try { return sessionStorage.getItem("kakiRef") || localStorage.getItem("kakiRef") || ""; } catch (_) { return ""; } }
function refClearPending() { try { sessionStorage.removeItem("kakiRef"); localStorage.removeItem("kakiRef"); } catch (_) {} }
/* 紹介リンク（?ref=コード）で開いたら覚えておき、登録画面の欄にも入れておく */
(() => { const r = new URLSearchParams(location.search).get("ref"); if (r) refSavePending(r); const p = refPending(); if (p && $("gRef")) $("gRef").value = p; })();
const jstDay = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
async function refAfterLogin(u) {
  const R = window.KAKI_CONFIG && window.KAKI_CONFIG.referral; if (!R) return;
  const myCode = refCodeOf(u.uid);
  /* ① 自分のコードを公開の引き当て表に置く（1回だけ。置けたら端末に印） */
  if (localStorage.getItem("kakiRefCode") !== u.uid + ":" + myCode) {
    try {
      const ref = doc(db, "kakiapp_refcodes", myCode), snap = await withTimeout(getDoc(ref), 8000, "refcode");
      if (!snap.exists()) await withTimeout(setDoc(ref, { uid: u.uid, createdAt: new Date().toISOString() }), 8000, "refcodeSet");
      else if (snap.data().uid !== u.uid) { console.warn("refcode collision", myCode); localStorage.setItem("kakiRefCodeNG", u.uid); }   /* 別の人と同じコード（ごくまれ）＝紹介カードを出さない */
      localStorage.setItem("kakiRefCode", u.uid + ":" + myCode);
    } catch (e) { console.warn("refcode", e && e.code); }
  }
  /* ② 紹介された人の記録（新しく作ったアカウント・来店前・期間中だけ） */
  const code = refPending(); if (!code) return;
  const st = window.kakiGetState();
  if (st.referredBy || (st.visits || []).length) { refClearPending(); return; }
  if (window.kakiSyncClock && (await window.kakiSyncClock()) === null) return;   /* 時計が取れない＝次回 */
  const t = window.kakiToday(), created = jstDay(Date.parse(u.metadata && u.metadata.creationTime) || 0);
  if (t > R.until || created < R.from || created > R.until) { refClearPending(); return; }
  if (code === myCode) { refClearPending(); return; }   /* 自分のコード */
  try {
    const cs = await withTimeout(getDoc(doc(db, "kakiapp_refcodes", code)), 8000, "refLookup");
    if (!cs.exists() || cs.data().uid === u.uid) { refClearPending(); return; }
    const referrer = cs.data().uid, rref = doc(db, "kakiapp_referrals", u.uid);
    const ex = await withTimeout(getDoc(rref), 8000, "refGet");
    if (!ex.exists()) await withTimeout(setDoc(rref, { referrer, referee: u.uid, code, createdAt: new Date().toISOString(), status: "pending" }), 8000, "refSet");
    const d = ex.exists() ? ex.data() : { referrer, code, status: "pending" };
    const s2 = window.kakiGetState(); s2.referredBy = { uid: d.referrer, code: d.code, at: t, status: d.status }; window.kakiSetState(s2); window.cloudPush();
    refClearPending();
  } catch (e) { console.warn("referral", e && e.code); }   /* 通信失敗は次回の起動でやり直す（コードは残す） */
}
window.kakiRef = {
  code: () => (uid && localStorage.getItem("kakiRefCodeNG") !== uid ? refCodeOf(uid) : ""),
  /* 紹介された人: pending → qualified（ルールで「本人・pending からだけ・この2項目だけ」） */
  qualify: async () => { if (!uid) throw Object.assign(new Error("not signed in"), { code: "ref/auth" });
    await withTimeout(updateDoc(doc(db, "kakiapp_referrals", uid), { status: "qualified", qualifiedAt: new Date().toISOString() }), 10000, "refQualify"); },
  /* 紹介した人: 自分宛ての成立分 */
  qualified: async () => { if (!uid) return [];
    const snap = await withTimeout(getDocs(query(collection(db, "kakiapp_referrals"), where("referrer", "==", uid), where("status", "==", "qualified"))), 12000, "refList");
    const arr = []; snap.forEach(d => arr.push(Object.assign({ id: d.id }, d.data()))); arr.sort((a, b) => String(a.qualifiedAt || "").localeCompare(String(b.qualifiedAt || ""))); return arr; },
};

/* ---- みんなの一杯（写真の掲示板・masa 決定 2026-09-21／2026-10-08 確認）----
   投稿＝ kakiapp_board/{uid}_{日付} = {uid, name, text, shop, img:"doc", createdAt, day, likes:0, reports:0, hidden:false, igOk}
   （doc id に日付を入れる＝1人1日1件をルールで保証。投稿できるのは kakiapp_users の qrDate が今日＝来店チェックインした日だけ）
   写真＝ kakiapp_board_img/{同じid} = {uid, data:"data:image/jpeg;base64,…", createdAt}。Firebase Storage はこのプロジェクトで未設定なので
   端末で 720px・JPEG に縮めて別 doc に置く（投稿 doc を軽く保ち、一覧は文字だけ先に読める）
   ♥＝ kakiapp_board/{id}/likes/{uid}、通報＝ …/reports/{uid}。数（likes/reports）は doc の作成・削除と同じ batch で ±1（ルールで突き合わせ） */
const BOARD = "kakiapp_board", BOARD_IMG = "kakiapp_board_img", BOARD_PAGE = 20;
const boardImgCache = new Map();
window.kakiBoard = {
  uid: () => uid,
  /* 新しい順に20件。after＝前のページの最後（続きを読む） */
  page: async after => {
    const base = collection(db, BOARD);
    const q = after ? query(base, orderBy("createdAt", "desc"), startAfter(after), limit(BOARD_PAGE)) : query(base, orderBy("createdAt", "desc"), limit(BOARD_PAGE));
    const snap = await withTimeout(getDocs(q), 12000, "board");
    const items = []; snap.forEach(d => items.push(Object.assign({ id: d.id }, d.data())));
    return { items, last: snap.docs.length ? snap.docs[snap.docs.length - 1] : null, done: snap.docs.length < BOARD_PAGE };
  },
  /* 写真（data URL）。一度読んだものは覚えておく */
  img: async id => {
    if (boardImgCache.has(id)) return boardImgCache.get(id);
    const snap = await withTimeout(getDoc(doc(db, BOARD_IMG, id)), 12000, "boardImg");
    const v = snap.exists() ? String(snap.data().data || "") : "";
    if (v) boardImgCache.set(id, v);
    return v;
  },
  liked: async id => { if (!uid) return false; const s = await withTimeout(getDoc(doc(db, BOARD, id, "likes", uid)), 8000, "boardLiked"); return s.exists(); },
  reported: async id => { if (!uid) return false; const s = await withTimeout(getDoc(doc(db, BOARD, id, "reports", uid)), 8000, "boardReported"); return s.exists(); },
  /* 投稿。先に会員データ（qrDate）をクラウドへ書き切る＝ルールの「今日来店した人だけ」に間に合わせる */
  post: async ({ name, text, shop, igOk, dataUrl, day, createdAt }) => {
    if (!uid || !auth.currentUser) throw Object.assign(new Error("not signed in"), { code: "board/auth" });
    clearTimeout(timer); await write();
    const id = uid + "_" + day, b = writeBatch(db);
    b.set(doc(db, BOARD, id), { uid, name, text, shop, img: "doc", createdAt, day, likes: 0, reports: 0, hidden: false, igOk: !!igOk });
    b.set(doc(db, BOARD_IMG, id), { uid, data: dataUrl, createdAt });
    await withTimeout(b.commit(), 25000, "boardPost");
    boardImgCache.set(id, dataUrl);
    return id;
  },
  exists: async id => { const s = await withTimeout(getDoc(doc(db, BOARD, id)), 8000, "boardGet"); return s.exists(); },
  /* ♥ をつける／はずす（1人1回・数は ±1） */
  like: async (id, on) => {
    if (!uid) throw Object.assign(new Error("not signed in"), { code: "board/auth" });
    const b = writeBatch(db), lr = doc(db, BOARD, id, "likes", uid);
    if (on) { b.set(lr, { uid, at: new Date().toISOString() }); b.update(doc(db, BOARD, id), { likes: increment(1) }); }
    else { b.delete(lr); b.update(doc(db, BOARD, id), { likes: increment(-1) }); }
    await withTimeout(b.commit(), 12000, "boardLike");
  },
  /* 通報（1人1回・数は +1） */
  report: async id => {
    if (!uid) throw Object.assign(new Error("not signed in"), { code: "board/auth" });
    const b = writeBatch(db);
    b.set(doc(db, BOARD, id, "reports", uid), { uid, at: new Date().toISOString() });
    b.update(doc(db, BOARD, id), { reports: increment(1) });
    await withTimeout(b.commit(), 12000, "boardReport");
  },
  /* ブロック（2026-10-13 masa 🇧・App Store 1.2 の「相手をブロックする機能」）: ブロックした人の投稿を自分の画面に出さない。
     kakiapp_board_blocks/{自分のuid} = {list:[uid…], updatedAt}。自分だけが読み書き・相手には知らされない。端末にも控える（電波が無い時用） */
  blocks: async () => {
    let ls = []; try { ls = JSON.parse(localStorage.getItem("kaki_bd_blocks") || "[]"); } catch (e) {}
    if (!uid) return ls;
    try { const s = await withTimeout(getDoc(doc(db, "kakiapp_board_blocks", uid)), 8000, "boardBlocks");
      const cl = s.exists() && Array.isArray(s.data().list) ? s.data().list : [];
      return Array.from(new Set(cl.concat(ls))); } catch (e) { return ls; }
  },
  setBlocks: async list => {
    list = Array.from(new Set(list)).slice(-500);
    try { localStorage.setItem("kaki_bd_blocks", JSON.stringify(list)); } catch (e) {}
    if (!uid) return;
    await withTimeout(setDoc(doc(db, "kakiapp_board_blocks", uid), { list, updatedAt: new Date().toISOString() }), 12000, "boardBlocksSet");
  },
  /* 自分の投稿を消す（写真の doc も一緒に） */
  remove: async id => {
    const b = writeBatch(db); b.delete(doc(db, BOARD, id)); b.delete(doc(db, BOARD_IMG, id));
    await withTimeout(b.commit(), 12000, "boardDelete"); boardImgCache.delete(id);
  },
};

/* ---- プッシュ通知（2026-10-09 masa「店からアプリの全員に通知を送りたい」）----
   アプリ版（iOS/Android）だけ。@capacitor-firebase/messaging で許可→FCM トークン→トピック "all" を購読。
   送るのは運営の手元のスクリプト（scripts/push_send.mjs・サービスアカウント）で、トピック "all" に1回送れば全員に届く。
   トークンは kakiapp_push_tokens/{uid} = {token, platform, enabled, topics, updatedAt} に控える（店別・個別に送るとき用・人数の確認用）。
   Web 版（ブラウザ）は対象外（iPhone はホーム画面に追加した PWA だけ・別の鍵と Service Worker が要るため今回は見送り）。
   許可のお願いは起動直後には出さない（index.html: 来店ガチャのお祝いを閉じた後に1回だけ／マイページの切り替え） */
const PUSH_TOPIC = "all";
const PUSH_COL = "kakiapp_push_tokens";
const pushPlugin = (() => {
  const C = window.Capacitor;
  if (!C || !(C.isNativePlatform && C.isNativePlatform())) return null;
  try {
    if (C.isPluginAvailable && !C.isPluginAvailable("FirebaseMessaging")) return null;   /* 古いアプリ本体（プラグイン未同梱）では出さない */
    return C.registerPlugin ? C.registerPlugin("FirebaseMessaging") : (C.Plugins && C.Plugins.FirebaseMessaging) || null;
  } catch (_) { return null; }
})();
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
async function pushSave(token, enabled) {
  if (!uid || !auth.currentUser) return;
  const platform = (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || "unknown";
  await withTimeout(setDoc(doc(db, PUSH_COL, uid), { token: String(token || ""), platform, enabled: !!enabled, topics: enabled ? [PUSH_TOPIC] : [], updatedAt: new Date().toISOString() }), 10000, "pushSave");
}
/* iOS は APNs のトークンが届く前だと getToken が失敗するので、少し待って1回だけやり直す */
async function pushToken() {
  try { return (await withTimeout(pushPlugin.getToken(), 15000, "pushToken")).token; }
  catch (e) { await new Promise(r => setTimeout(r, 2500)); return (await withTimeout(pushPlugin.getToken(), 15000, "pushToken")).token; }
}
async function pushPerm(ask) {
  let st = (await withTimeout(pushPlugin.checkPermissions(), 8000, "pushPerm")).receive;
  if (st !== "granted" && ask && st !== "denied") st = (await pushPlugin.requestPermissions()).receive;   /* OS の確認ダイアログ（ユーザーが押すまで待つので制限時間なし） */
  return st;
}
/* 戻り値: "on"（受け取る）/"denied"（端末の設定で止まっている）/"prompt"（まだ聞いていない・断られた）/"unavailable"/"error" */
async function pushEnable(ask) {
  if (!pushPlugin) return "unavailable";
  try {
    const st = await pushPerm(ask);
    if (st !== "granted") return st === "denied" ? "denied" : "prompt";
    const token = await pushToken();
    await withTimeout(pushPlugin.subscribeToTopic({ topic: PUSH_TOPIC }), 15000, "pushTopic");
    lsSet("kakiPush", "on"); lsSet("kakiPushSyncedAt", String(Date.now()));
    try { await pushSave(token, true); } catch (e) { console.warn("pushSave", e && e.code); }   /* 全員向けはトピックで届くので、控えの保存失敗は次の起動でやり直す */
    return "on";
  } catch (e) { console.error("push enable", e && (e.code || e.message)); return "error"; }
}
async function pushDisable() {
  lsSet("kakiPush", "off");
  if (!pushPlugin) return "off";
  try { await withTimeout(pushPlugin.unsubscribeFromTopic({ topic: PUSH_TOPIC }), 15000, "pushUntopic"); } catch (e) { console.warn("push untopic", e && (e.code || e.message)); }
  try { await withTimeout(pushPlugin.deleteToken(), 10000, "pushDelToken"); } catch (_) {}   /* 個別送信も届かないようにトークンも捨てる */
  try { await pushSave("", false); } catch (e) { console.warn("pushSave", e && e.code); }
  return "off";
}
/* 起動時: 「受け取る」の人はトークンの入れ替わりに備えて1日1回控えを更新。端末の設定で通知を切られていたら控えも OFF に */
async function pushRefresh() {
  if (!pushPlugin || lsGet("kakiPush") !== "on") return;
  if (Date.now() - Number(lsGet("kakiPushSyncedAt") || 0) < 86400000) return;
  try {
    const st = await pushPerm(false);
    if (st !== "granted") { await pushSave("", false); lsSet("kakiPushSyncedAt", String(Date.now())); return; }
    await pushEnable(false);
  } catch (e) { console.warn("push refresh", e && (e.code || e.message)); }
}
if (pushPlugin) {
  try {
    pushPlugin.addListener("tokenReceived", ev => { if (lsGet("kakiPush") === "on" && ev && ev.token) pushSave(ev.token, true).catch(() => {}); });
    /* 通知をタップして開いたとき: data.link（"gacha" などのタブ名か https のURL）へ */
    pushPlugin.addListener("notificationActionPerformed", ev => {
      const link = ev && ev.notification && ev.notification.data && ev.notification.data.link;
      if (link && window.kakiOpenLink) setTimeout(() => window.kakiOpenLink(String(link)), 600);
    });
  } catch (e) { console.warn("push listen", e && e.message); }
}
window.kakiPush = {
  available: () => !!pushPlugin,
  pref: () => lsGet("kakiPush"),   /* "on" / "off" / ""（まだ） */
  enable: () => pushEnable(true),
  disable: pushDisable,
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

  if (SMS_ON && byPassword && !u.providerData.some(p => p.providerId === "phone")) { uid = u.uid; window.kakiLinkPhone(); return; }   /* 電話番号の確認が済むまで本体に入れない */
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
    setTimeout(() => { pushRefresh(); }, 3000);   /* プッシュ通知の控えの更新（裏で・失敗しても本体は動く） */
    refAfterLogin(u).then(() => window.kakiSetState(window.kakiGetState())).catch(e => console.warn("ref", e));   /* 紹介コードの登録・紹介の記録（裏で） */
    $("acctMail").textContent = u.email || u.displayName || (u.phoneNumber ? u.phoneNumber.replace("+81", "0") : "");

  } catch (e) {
    console.error(e);
    $("gLoadMsg").textContent = "サーバーに接続できませんでした。電波の良い場所で「もう一度」を押してください。";
    $("gRetry").style.display = "inline-block";
  } finally { busy(false); }
});
$("gRetry").onclick = () => location.reload();
$("gLoadSignOut").onclick = async () => { try { await withTimeout(signOut(auth), 5000, "signOut"); } catch (e) {} localStorage.removeItem("kakiapp"); location.reload(); };
