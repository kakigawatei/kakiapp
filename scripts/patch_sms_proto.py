# -*- coding: utf-8 -*-
"""SMS（電話番号）認証の Web 試作（2026-09-11・masa 🇦 SMS 選択・1.0.7 の前に Web で試す）
  ・URL に ?sms=1 が付いたときだけ入口を出す（本番ユーザーには見せない）
  ・新規: 電話番号 → SMS 6桁 → ログイン（メール確認は不要）
  ・既存（メールの人）: ログイン後に「電話番号を登録」で1回だけ紐付け（1人1アカウント）
  ・reCAPTCHA は invisible（ボタン押下で自動）。日本の 0X0… は +81 に正規化
"""
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rep(path, old, new):
    p = os.path.join(ROOT, path); s = io.open(p, encoding="utf-8").read()
    assert s.count(old) == 1, (path, old[:60])
    io.open(p, "w", encoding="utf-8").write(s.replace(old, new))

# ---- index.html: 電話パネル ----
rep("index.html", '''        <button class="link" id="gToSignup">新規登録はこちら</button>''',
'''        <button class="link" id="gToSignup">新規登録はこちら</button>
        <button class="link" id="gToPhone" style="display:none">電話番号でログイン（試作）</button>''')
rep("index.html", '''    <div id="gVerify" style="display:none">''',
'''    <div id="gPhone" style="display:none">
      <h2>電話番号でログイン</h2>
      <p class="lead">SMS で届く6桁の番号を入れるだけ。メールもパスワードも要りません。</p>
      <label>携帯電話番号</label>
      <input id="gTel" type="tel" autocomplete="tel" inputmode="tel" placeholder="090-1234-5678">
      <div id="gSmsStep2" style="display:none">
        <label style="margin-top:12px">SMS の確認コード（6桁）</label>
        <input id="gSmsCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="6">
      </div>
      <div style="margin-top:16px"><button class="primary" id="gSendSms">確認コードを送る</button></div>
      <div style="margin-top:10px;display:none" id="gDoSmsWrap"><button class="primary" id="gDoSms">ログイン</button></div>
      <div class="links"><button class="link" id="gPhoneBack">メールでログインに戻る</button></div>
      <div id="recaptcha-container"></div>
    </div>
    <div id="gVerify" style="display:none">''')

# ---- auth.js: import・正規化・送信・確認・紐付け ----
rep("auth.js", '''  setPersistence, browserLocalPersistence, indexedDBLocalPersistence
} from''', '''  setPersistence, browserLocalPersistence, indexedDBLocalPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber
} from''')
rep("auth.js", '''/* ---- 画面の配線 ---- */''', '''/* ---- SMS（電話番号）認証・試作（?sms=1 のときだけ入口を出す） ---- */
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
  if (!/^\\+81[0-9]{9,10}$/.test(tel)) { msg("携帯電話番号を入れてください（例: 090-1234-5678）"); return; }
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

/* ---- 画面の配線 ---- */''')
# ログイン後: メールの人で未紐付けなら、試作フラグ時だけ1回勧める（毎回は出さない）
rep("auth.js", '''    $("acctMail").textContent = u.email || u.displayName || "";''',
'''    $("acctMail").textContent = u.email || u.displayName || (u.phoneNumber ? u.phoneNumber.replace("+81", "0") : "");
    if (SMS_ON && byPassword && !u.providerData.some(p => p.providerId === "phone") && !sessionStorage.getItem("kakiLinkAsked")) { sessionStorage.setItem("kakiLinkAsked", "1"); setTimeout(() => window.kakiLinkPhone(), 1200); }''')
print("sms proto patched")
