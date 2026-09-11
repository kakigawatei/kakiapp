# -*- coding: utf-8 -*-
"""SMS 認証を「メール登録 → 電話番号を1回だけ認証して紐付け＝承認」の形に（masa 2026-09-11 13:30）
  ・「電話番号でログイン」の入口は出さない（コードは残すが非表示）
  ・メール確認済みのアカウントで電話番号が未紐付けなら、本体に入る前に紐付け画面（スキップ不可・別アカウントでログインは可）
  ・紐付け成功 → 再読込 → 通常フロー。同じ番号は1アカウントのみ（Firebase が auth/credential-already-in-use で拒否）
  ・?sms=1 の合図があるときだけ（本番展開は masa の OK 後にフラグを外す）
"""
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rep(path, old, new):
    p = os.path.join(ROOT, path); s = io.open(p, encoding="utf-8").read()
    assert s.count(old) == 1, (path, old[:60])
    io.open(p, "w", encoding="utf-8").write(s.replace(old, new))
# 入口は出さない
rep("auth.js", '''if (SMS_ON) { localStorage.setItem("kakiSms", "1"); $("gToPhone").style.display = "inline-block"; }''',
    '''if (SMS_ON) { localStorage.setItem("kakiSms", "1"); }   /* 電話番号ログインの入口は出さない（紐付け専用） */''')
# パネルの文言を紐付け用に
rep("index.html", '''      <h2>電話番号でログイン</h2>
      <p class="lead">SMS で届く6桁の番号を入れるだけ。メールもパスワードも要りません。</p>''',
    '''      <h2>電話番号の確認</h2>
      <p class="lead">1人1アカウントのため、携帯電話番号を1回だけ確認します。SMS で届く6桁を入れてください。</p>''')
rep("index.html", '''      <div class="links"><button class="link" id="gPhoneBack">メールでログインに戻る</button></div>''',
    '''      <div class="links"><button class="link" id="gPhoneBack">別のアカウントでログインする</button></div>''')
# 戻るはログアウト
rep("auth.js", '''$("gPhoneBack").onclick = () => { msg(""); showGate("gSignin"); };''',
    '''$("gPhoneBack").onclick = async () => { msg(""); try { await withTimeout(signOut(auth), 5000, "signOut"); } catch (e) {} smsLinkUser = null; showGate("gSignin"); };''')
# 紐付け成功 → 再読込で通常フローへ
rep("auth.js", '''    if (smsLinkUser) {   // 既存アカウントへの紐付け完了 → 本体へ戻る
      const st = window.kakiGetState ? window.kakiGetState() : {}; st.phoneLinkedAt = new Date().toISOString(); if (window.kakiSetState) window.kakiSetState(st);
      smsLinkUser = null; hideGate(); msg(""); if (window.kakiToast) window.kakiToast("電話番号を登録しました");
    }''',
    '''    if (smsLinkUser) {   // 紐付け完了 → 再読込して通常フロー（onAuthStateChanged が phone provider を見て本体へ）
      try { const st = window.kakiGetState ? window.kakiGetState() : {}; st.phoneLinkedAt = new Date().toISOString(); if (window.kakiSetState) window.kakiSetState(st); } catch (_) {}
      smsLinkUser = null; msg("電話番号を確認しました。"); setTimeout(() => location.reload(), 600); return;
    }''')
# ログイン後: メール確認済み・未紐付け → 本体に入る前に紐付け（スキップ不可）
rep("auth.js", '''  uid = u.uid;
  /* 読み込み中は本体を触らせない''',
    '''  if (SMS_ON && byPassword && !u.providerData.some(p => p.providerId === "phone")) { uid = u.uid; window.kakiLinkPhone(); return; }   /* 電話番号の確認が済むまで本体に入れない */
  uid = u.uid;
  /* 読み込み中は本体を触らせない''')
# 旧: ログイン後に1回だけ勧める（sessionStorage）は不要になった
rep("auth.js", '''    if (SMS_ON && byPassword && !u.providerData.some(p => p.providerId === "phone") && !sessionStorage.getItem("kakiLinkAsked")) { sessionStorage.setItem("kakiLinkAsked", "1"); setTimeout(() => window.kakiLinkPhone(), 1200); }''',
    '''''')
print("link-only patched")
