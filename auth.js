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
import { initializeFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
  "teamId", "team", "teamJoinedAt", "teamVisits",   /* 学校対抗 来店バトル（任意参加・自分の学校と月別の自分の来店数）2026-09-21 */
  "nickname", "awards"];   /* ニックネーム（カード・名簿用）／シーズン結果の受け取り（運営が書き込む・本人は claimed を足す）2026-09-21 */


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
  visit: async storeId => { const st = window.kakiGetState(); if (!st.teamId) return; const m = teamMonth(), d = new Date().toISOString().slice(0, 10); const u = {};
    u["visits." + m] = increment(1); u.visitsTotal = increment(1); u["days." + d] = increment(1);
    if (storeId) u["visitsByStore." + m + "." + storeId] = increment(1);
    await updateDoc(doc(db, "kakiapp_teams", st.teamId), u); teamCache = null; },
  /* 起動時: 統合・改名されていたら自分の所属を付け替える */
  sync: async () => { const st = window.kakiGetState(); if (!st.teamId) return null; const arr = await teamList(); const t = teamResolve(arr, st.teamId); if (!t) return null; if (t.id !== st.teamId || t.name !== st.team) { const s2 = window.kakiGetState(); s2.teamId = t.id; s2.team = t.name; window.kakiSetState(s2); window.cloudPush(); } return t; },
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
    $("acctMail").textContent = u.email || u.displayName || (u.phoneNumber ? u.phoneNumber.replace("+81", "0") : "");

  } catch (e) {
    console.error(e);
    $("gLoadMsg").textContent = "サーバーに接続できませんでした。電波の良い場所で「もう一度」を押してください。";
    $("gRetry").style.display = "inline-block";
  } finally { busy(false); }
});
$("gRetry").onclick = () => location.reload();
$("gLoadSignOut").onclick = async () => { try { await withTimeout(signOut(auth), 5000, "signOut"); } catch (e) {} localStorage.removeItem("kakiapp"); location.reload(); };
