// 柿川亭アプリ プッシュ通知の送信（2026-10-09 masa「店からアプリの全員に通知を送りたい」）
// admin.html の「📣 プッシュ通知（下書き）」で作った下書き（Firestore kakiapp_push_requests/{ID}）を、FCM HTTP v1 で送る。
// 宛先は既定でトピック "all"（アプリで「通知を受け取る」にした全端末が購読している）。--token で1台だけに試し送りもできる。
//
// 使い方（Node 18 以上・追加のパッケージ不要）:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/push_send.mjs --request <ID>            ← 下見（FCM の validate_only・届かない）
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/push_send.mjs --request <ID> --send     ← 本当に送る（全員に届く）
//   … --title "タイトル" --body "本文" [--link gacha]                         ← 下書きなしで直接
//   … --request <ID> --token <FCMトークン> --send                              ← 自分の端末1台だけに試し送り（トークンは kakiapp_push_tokens/{自分のuid}）
// Windows PowerShell なら:  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\sa.json"; node scripts/push_send.mjs --request <ID>
//
// 🟥 鍵（サービスアカウントの JSON）はリポジトリに置かない・Discord に貼らない。このスクリプトは中身を表示しない。
// 🟥 --send を付けたときだけ実際に届く。トピック送信は取り消せない。下書きが送信済みなら止まる（--force で再送）。
import fs from "node:fs";
import crypto from "node:crypto";

const PROJECT = "kakigawatei-franchise";
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--") ? args[i + 1] : ""; };
const flag = (k) => args.includes("--" + k);
const die = (m) => { console.error("NG: " + m); process.exit(1); };

const SEND = flag("send"), FORCE = flag("force");
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
if (!credPath) die("環境変数 GOOGLE_APPLICATION_CREDENTIALS にサービスアカウント JSON のパスを入れてください（docs/PUSH_SETUP.md）");
if (!fs.existsSync(credPath)) die("サービスアカウント JSON が見つかりません: " + credPath);
let sa;
try { sa = JSON.parse(fs.readFileSync(credPath, "utf8")); } catch (e) { die("サービスアカウント JSON を読めません（形式を確認）"); }
if (!sa.client_email || !sa.private_key) die("サービスアカウント JSON ではないようです（client_email / private_key がない）");
if (sa.project_id && sa.project_id !== PROJECT) die("別のプロジェクトの鍵です: " + sa.project_id + "（" + PROJECT + " のものを使う）");

/* サービスアカウント → アクセストークン（JWT bearer・RS256） */
async function accessToken() {
  const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore", aud, iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(head + "." + claim).sign(sa.private_key).toString("base64url");
  const r = await fetch(aud, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + sig }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) die("アクセストークンを取れませんでした: " + r.status + " " + (j.error_description || j.error || ""));
  return j.access_token;
}

const FS = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/kakiapp_push_requests/";
const sv = (f, k) => (f && f[k] && (f[k].stringValue ?? f[k].timestampValue)) || "";

const token = await accessToken();
const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

let title = opt("title"), body = opt("body"), link = opt("link");
const reqId = opt("request");
if (reqId) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(reqId)) die("--request の ID の形が違います");
  const r = await fetch(FS + reqId, { headers: H });
  if (r.status === 404) die("下書きが見つかりません: " + reqId);
  if (!r.ok) die("下書きを読めませんでした: " + r.status + " " + (await r.text()).slice(0, 200));
  const f = (await r.json()).fields || {};
  if (sv(f, "status") === "sent" && SEND && !FORCE && !opt("token")) die("この下書きは送信済みです（" + sv(f, "sentAt") + "）。もう一度全員に送るなら --force");
  title = title || sv(f, "title"); body = body || sv(f, "body"); link = link || sv(f, "link");
}
if (!title || !body) die("タイトルと本文が要ります（--request <ID> か --title/--body）");
if (title.length > 60 || body.length > 300) die("長すぎます（タイトル60字・本文300字まで）");
link = link || "home";

const devToken = opt("token");
const target = devToken ? { token: devToken } : { topic: opt("topic") || "all" };
const message = Object.assign({}, target, {
  notification: { title, body },
  data: { link },
  android: { priority: "HIGH", notification: { sound: "default" } },
  apns: { payload: { aps: { sound: "default" } } },
});

console.log("宛先　: " + (devToken ? "端末1台（--token）" : "トピック " + target.topic + "（通知ONの全員）"));
console.log("タイトル: " + title);
console.log("本文　: " + body);
console.log("開く画面: " + link);
console.log(SEND ? "→ 送信します" : "→ 下見（validate_only・届きません）。本当に送るときは --send");

const r = await fetch("https://fcm.googleapis.com/v1/projects/" + PROJECT + "/messages:send", {
  method: "POST", headers: H, body: JSON.stringify({ validate_only: !SEND, message }),
});
const j = await r.json().catch(() => ({}));
if (!r.ok) die("FCM がエラーを返しました: " + r.status + " " + JSON.stringify(j.error || j).slice(0, 400));
console.log((SEND ? "OK 送信しました: " : "OK 下見は通りました: ") + (j.name || ""));

/* 下書きに「送信済み」を記録（全員送信のときだけ。試し送りは記録しない） */
if (SEND && reqId && !devToken) {
  const at = new Date().toISOString();
  const mask = ["status", "sentAt", "messageId", "target"].map(k => "updateMask.fieldPaths=" + k).join("&");
  const u = await fetch(FS + reqId + "?" + mask, { method: "PATCH", headers: H, body: JSON.stringify({ fields: {
    status: { stringValue: "sent" }, sentAt: { stringValue: at }, messageId: { stringValue: String(j.name || "") }, target: { stringValue: "topic:" + target.topic } } }) });
  console.log(u.ok ? "下書きを「送信済み」にしました（" + at + "）" : "注意: 送信はできたが、下書きの記録に失敗: " + u.status);
}
