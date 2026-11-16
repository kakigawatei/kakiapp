// 柿川亭アプリ ポイントの抜け穴ふさぎ（2026-11-16）: ルールの試験
// 使い方（Firestore エミュレータの中で）:
//   firebase emulators:exec --only firestore --project demo-kakiapp "node rules_test.mjs <ルールのファイル> <old|new> [raw]"
//   old＝今の本番ルール（穴の操作が「通ってしまう」ことを記録）／new＝新ルール（正しい操作が通る・穴の操作が弾かれる、を判定）
//   ふつうは「営業時間の中・学校エントリー受付中」に書き換えた写しで流す（試験を流す時刻に依らないように。openAt と teamEntryClosed の2関数だけ差し替え）。
//   raw を付けると書き換えずにそのまま読み込む（時刻に依らない試験だけ流す）
// 本番の Firestore には一切つながない（projectId は demo-kakiapp・エミュレータだけ）
import fs from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, increment, deleteField, serverTimestamp, collection } from "firebase/firestore";

const [RULES_FILE, LABEL, RAW] = process.argv.slice(2);
if (!RULES_FILE || !/^(old|new)$/.test(LABEL || "")) { console.log("使い方: node rules_test.mjs <rules> <old|new> [raw]"); process.exit(2); }
const IS_NEW = LABEL === "new", IS_RAW = RAW === "raw";
let rules = fs.readFileSync(RULES_FILE, "utf8");
if (!IS_RAW) {
  const sub = (re, to) => { if (!re.test(rules)) throw new Error("差し替える関数が見つかりません: " + re); rules = rules.replace(re, to); };
  sub(/function openAt\(st, j\) \{[^\n]*\}/, 'function openAt(st, j) { return st == "nagaoka" || st == "sendai"; }');
  sub(/function teamEntryClosed\(\) \{[^\n]*\}/, "function teamEntryClosed() { return false; }");
}
/* 式の数（1回の判定で 1000 まで）の余裕を測る用: PAD=K を付けると、会員データの判定の先頭にむだな比較を K 個足す */
const PAD = Number(process.env.PAD || 0);
if (PAD > 0) { const key = 'return !c.hasAny(["awards", "qrRequired"])'; if (!rules.includes(key)) throw new Error("userWriteOk が見つかりません"); rules = rules.replace(key, "return " + Array(PAD).fill(process.env.PADEXPR || "t == t").join(" && ") + ' && !c.hasAny(["awards", "qrRequired"])'); }
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const env = await initializeTestEnvironment({ projectId: "demo-kakiapp", firestore: { rules, host, port: Number(port) } });
await env.clearFirestore();
/* 本番と同じく店内QRの設定 doc を置く（抜き打ちなし＝spotMax 00000000）。来店のたびにルールがこの doc を読む */
await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "kakiapp_qr", "config"), { salt: "0123456789abcdef0123", spotMax: "00000000", spot: 0 }));

const ADMIN = "KtFyiOuMs6VcCguSKKFjLP4PUgg2";
const jst = ms => new Date(ms + 9 * 3600e3).toISOString();
const T = jst(Date.now()).slice(0, 10), Y = jst(Date.now() - 86400e3).slice(0, 10), Y2 = jst(Date.now() - 2 * 86400e3).slice(0, 10), TM = T.slice(0, 7);
const TOMORROW = jst(Date.now() + 86400e3).slice(0, 10), LASTWEEK = jst(Date.now() - 7 * 86400e3).slice(0, 10);
const days = n => Array.from({ length: n }, (_, i) => jst(Date.UTC(2026, 0, 1) + i * 86400e3 - 9 * 3600e3).slice(0, 10));   /* 2026-01-01 から n 日（昔の来店日） */
const now = () => new Date().toISOString();
let seq = 0;
const newUid = () => "u" + String(++seq).padStart(3, "0") + "x" + Math.random().toString(36).slice(2, 8);
const dbOf = uid => env.authenticatedContext(uid).firestore();
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const U = (db, uid) => doc(db, "kakiapp_users", uid);
const baseUser = (over) => Object.assign({ email: "a@example.com", name: "", updatedAt: "2026-11-01T00:00:00.000Z", points: 300, visits: days(20), tx: [], createdAt: "2026-01-01", loginDate: Y, rouletteDate: Y, mailOptIn: true }, over || {});
const visitedToday = (over) => baseUser(Object.assign({ visits: days(20).concat([T]), qrDate: T, lastStore: "nagaoka", lastStoreAt: T, storeVisits: { nagaoka: 21 }, visitStore: { [T]: "nagaoka" }, points: 310 }, over || {}));
const checkinPatch = (u, pts, extra) => Object.assign({ qrDate: T, visits: (u.visits || []).concat([T]), points: (u.points || 0) + pts, storeVisits: { nagaoka: ((u.storeVisits || {}).nagaoka || 0) + 1 }, lastStore: "nagaoka", lastStoreAt: T, visitStore: { [T]: "nagaoka" }, lastCheckinMs: Date.now(), updatedAt: now() }, extra || {});
const boardPost = uid => ({ uid, name: "テスト", text: "うまい", shop: "nagaoka", img: "doc", createdAt: now(), day: T, likes: 0, reports: 0, hidden: false, igOk: true });
const teamDoc = (over) => Object.assign({ name: "試験高校", norm: "試験高校", kind: "高校", members: 3, visits: {}, visitsTotal: 0, aliases: [], hidden: false, mergedInto: null, createdAt: now(), createdBy: "x" }, over || {});
const teamInc = () => ({ ["visits." + TM]: increment(1), visitsTotal: increment(1), ["days." + T]: increment(1), ["visitsByStore." + TM + ".nagaoka"]: increment(1) });

/* kind: "ok"＝正しいお客さんの操作（旧・新とも通るはず）／"hole"＝穴の操作（旧は通ってしまう・新は弾くはず）
         "ok-new"＝新ルールで初めて通る正しい操作（旧の結果は記録だけ）／"deny"＝旧・新とも弾くはず（前から守られていたもの）
         "fix"＝旧ルールの不具合で弾かれていた正しい操作（旧は弾く・新は通る）／"limit"＝ルールの式の上限で旧・新とも弾かれる（記録だけ）
   time: true＝営業時間・エントリー受付に依る（raw では流さない） */
const cases = [];
const add = (kind, name, fn, time) => cases.push({ kind, name, fn, time: !!time });

/* ================= 正しい操作 ================= */
add("ok", "L01 新規アカウントの最初の保存（メール・同意だけ）", async () => { const uid = newUid(), db = dbOf(uid);
  await setDoc(U(db, uid), { email: "n@example.com", name: "", updatedAt: now(), mailOptIn: true, mailOptInAt: now() }, { merge: true }); });
add("ok", "L02 新規アカウント: 最初の保存→ログインボーナス+1・使い始めた日", async () => { const uid = newUid(), db = dbOf(uid);
  await setDoc(U(db, uid), { email: "n@example.com", name: "", updatedAt: now(), mailOptIn: true }, { merge: true });
  await setDoc(U(db, uid), { points: 1, loginDate: T, createdAt: T, tx: [{ d: "x", label: "ログインボーナス", points: 1 }], updatedAt: now() }, { merge: true }); });
add("ok", "L03 新規アカウント: 最初の保存にログインボーナス+1 が入っていても通る", async () => { const uid = newUid(), db = dbOf(uid);
  await setDoc(U(db, uid), { email: "n@example.com", name: "", updatedAt: now(), points: 1, loginDate: T, createdAt: T, tx: [] }, { merge: true }); });
add("ok", "L04 ログインボーナス+1（既存会員）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { points: 301, loginDate: T, updatedAt: now() }, { merge: true }); });
add("ok", "L05 毎日ルーレット+10", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { points: 310, rouletteDate: T, updatedAt: now() }, { merge: true }); });
add("ok", "L06 来店チェックイン（来店ポイント+10・来店数+1）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 10), { merge: true }); }, true);
add("ok", "L07 はじめての来店チェックイン（見習い+1・来店数 0→1）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: [], points: 5 }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 1), { merge: true }); }, true);
add("ok", "L08 来店ガチャ+100（来店した日・別の書き込み）", async () => { const uid = newUid(), db = dbOf(uid), u = visitedToday(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), Object.assign({}, u, { points: 410, gachaDate: T, updatedAt: now() }), { merge: true }); });
add("ok", "L09 まとめて1回で保存（来店+10・ガチャ+100・ルーレット+10・ログイン+1）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 121, { gachaDate: T, rouletteDate: T, loginDate: T }), { merge: true }); }, true);
add("ok", "L10 未同期の来店2件（きのう＋今日）+20", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: days(20).concat([Y2]) }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 20, { visits: u.visits.concat([Y, T]) }), { merge: true }); }, true);
add("ok", "L11 ランクアップ 常連 +100（来店5回目のあと）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: days(4).concat([T]), qrDate: T, points: 20 }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), { rankBonus: { silver: T }, points: 120, updatedAt: now() }, { merge: true }); });
add("ok", "L12 ランクアップ 猛者 +150（来店15回）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: days(15), rankBonus: { silver: Y }, points: 200 }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), { rankBonus: { silver: Y, gold: T }, points: 350, updatedAt: now() }, { merge: true }); });
add("ok", "L13 ランクアップ 血液が米油 +500（来店200回）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: days(200), rankBonus: { silver: Y, gold: Y, rainbow: Y, king: Y }, points: 900 }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), { rankBonus: { silver: Y, gold: Y, rainbow: Y, king: Y, founder: T }, points: 1400, updatedAt: now() }, { merge: true }); });
add("ok", "L14 来店と同じ書き込みでランクアップ（来店+5・常連+100）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: days(4), points: 20 }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 105, { rankBonus: { silver: T } }), { merge: true }); }, true);
add("ok", "L15 実在キャンペーンの受取 +350（期間内・来店1回以上）", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_campaigns", "campA"), { title: "創業記念", body: "", points: 350, from: LASTWEEK, until: TOMORROW, target: "before", eligibleBefore: LASTWEEK, minVisits: 1, active: true }); });
  await setDoc(U(db, uid), { claimed: { campA: T }, points: 650, updatedAt: now() }, { merge: true }); });
add("ok", "L16 キャンペーン2件目の受取（前の受取の印を残したまま）+60", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser({ claimed: { oldCamp: "2026-10-07" } })); await setDoc(doc(d, "kakiapp_campaigns", "campB"), { title: "雨の日", points: 60, from: "", until: "", target: "all", minVisits: 0, active: true }); });
  await setDoc(U(db, uid), { claimed: { oldCamp: "2026-10-07", campB: T }, points: 360, updatedAt: now() }, { merge: true }); });
add("ok", "L17 キャンペーン最終日の受取が日付をまたいで届く（終了日＝きのう）", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_campaigns", "campY"), { title: "きのうまで", points: 100, from: LASTWEEK, until: Y, target: "all", minVisits: 0, active: true }); });
  await setDoc(U(db, uid), { claimed: { campY: Y }, points: 400, updatedAt: now() }, { merge: true }); });
add("ok", "L18 紹介した側の受取 2人分 +100（成立済みの紹介の記録あり）", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser());
    for (const r of ["refA", "refB"]) await setDoc(doc(d, "kakiapp_referrals", r + uid), { referrer: uid, referee: r + uid, code: "ABCDEF", createdAt: now(), status: "qualified", qualifiedAt: now() }); });
  await setDoc(U(db, uid), { refClaimed: { ["refA" + uid]: T, ["refB" + uid]: T }, points: 400, updatedAt: now() }, { merge: true }); });
add("ok", "L19 紹介した側の受取 10人分まとめて +500（古い版は溜まった分を1回で送る）", async () => { const uid = newUid(), db = dbOf(uid), rc = {}; await seed(async d => { await setDoc(U(d, uid), baseUser());
    for (let i = 0; i < 10; i++) { rc["r" + i + uid] = T; await setDoc(doc(d, "kakiapp_referrals", "r" + i + uid), { referrer: uid, referee: "r" + i + uid, code: "ABCDEF", createdAt: now(), status: "qualified" }); } });
  await runTransaction(db, async tx => { await tx.get(U(db, uid)); tx.set(U(db, uid), { refClaimed: rc, points: 800, updatedAt: now() }, { merge: true }); }); });
add("ok", "L20 みんなの一杯: 投稿（写真つき）→ 投稿ポイント+20", async () => { const uid = newUid(), db = dbOf(uid), u = visitedToday(); await seed(d => setDoc(U(d, uid), u));
  const b = writeBatch(db); b.set(doc(db, "kakiapp_board", uid + "_" + T), boardPost(uid)); b.set(doc(db, "kakiapp_board_img", uid + "_" + T), { uid, data: "data:image/jpeg;base64,AAAA", createdAt: now() }); await b.commit();
  await setDoc(U(db, uid), Object.assign({}, u, { points: 330, boardDate: T, updatedAt: now() }), { merge: true }); });
add("ok", "L21 みんなの一杯: 自分の投稿を削除 → ポイントを戻す −20（e9b1717）", async () => { const uid = newUid(), db = dbOf(uid), u = visitedToday({ boardDate: T, points: 330 }); await seed(async d => { await setDoc(U(d, uid), u); await setDoc(doc(d, "kakiapp_board", uid + "_" + T), boardPost(uid)); await setDoc(doc(d, "kakiapp_board_img", uid + "_" + T), { uid, data: "data:image/jpeg;base64,AAAA", createdAt: now() }); });
  const b = writeBatch(db); b.delete(doc(db, "kakiapp_board", uid + "_" + T)); b.delete(doc(db, "kakiapp_board_img", uid + "_" + T)); await b.commit();
  await setDoc(U(db, uid), Object.assign({}, u, { points: 310, tx: [{ d: "x", label: "みんなの一杯 投稿の削除（ポイントを戻す）", points: -20 }], updatedAt: now() }), { merge: true }); });
add("ok", "L22 学校対抗: 既存の学校に参加（人数+1 と本人の teamId を同時に）", async () => { const uid = newUid(), db = dbOf(uid), tid = "team" + uid; await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_teams", tid), teamDoc()); });
  await runTransaction(db, async tx => { await tx.get(U(db, uid)); await tx.get(doc(db, "kakiapp_teams", tid)); tx.update(doc(db, "kakiapp_teams", tid), { members: increment(1) }); tx.set(U(db, uid), { teamId: tid, team: "試験高校", teamJoinedAt: now(), teamJoinDay: T, updatedAt: now() }, { merge: true }); }); }, true);
add("ok", "L23 学校対抗: 新しい学校を作って参加", async () => { const uid = newUid(), db = dbOf(uid), tid = "teamN" + uid; await seed(d => setDoc(U(d, uid), baseUser()));
  await runTransaction(db, async tx => { await tx.get(U(db, uid)); tx.set(doc(db, "kakiapp_teams", tid), teamDoc({ members: 1, createdBy: uid })); tx.set(U(db, uid), { teamId: tid, team: "試験高校", teamJoinedAt: now(), teamJoinDay: T, updatedAt: now() }, { merge: true }); }); }, true);
add("ok", "L24 学校対抗: 来店した日の学校+1（本人の teamVisitDay と同じ batch）→ 自分の回数の保存", async () => { const uid = newUid(), db = dbOf(uid), tid = "team" + uid, u = visitedToday({ teamId: tid, team: "試験高校", teamJoinedAt: now() }); await seed(async d => { await setDoc(U(d, uid), u); await setDoc(doc(d, "kakiapp_teams", tid), teamDoc()); });
  const b = writeBatch(db); b.update(U(db, uid), { teamVisitDay: T, updatedAt: now() }); b.update(doc(db, "kakiapp_teams", tid), teamInc()); await b.commit();
  await setDoc(U(db, uid), Object.assign({}, u, { teamVisitDay: T, teamVisits: { [TM]: 1 }, updatedAt: now() }), { merge: true }); });
add("ok", "L25 学校対抗: 学校を抜ける（人数−1 と teamId の削除を同時に）", async () => { const uid = newUid(), db = dbOf(uid), tid = "team" + uid; await seed(async d => { await setDoc(U(d, uid), baseUser({ teamId: tid, team: "試験高校", teamJoinedAt: now(), teamVisitDay: Y })); await setDoc(doc(d, "kakiapp_teams", tid), teamDoc()); });
  await runTransaction(db, async tx => { await tx.get(U(db, uid)); await tx.get(doc(db, "kakiapp_teams", tid)); tx.update(doc(db, "kakiapp_teams", tid), { members: increment(-1) }); tx.set(U(db, uid), { teamId: deleteField(), team: deleteField(), teamJoinedAt: deleteField(), updatedAt: now() }, { merge: true }); }); });
add("ok", "L26 古い版の交換（ポイントを減らすだけ −850・交換の記録なし）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ points: 1200 })));
  await setDoc(U(db, uid), { points: 350, tx: [{ d: "x", label: "お店で交換 油そば 並盛（1234）", points: -850 }], updatedAt: now() }, { merge: true }); });
add("ok-new", "L27 新しい交換: ポイント −850 と交換の記録を同時に書く → 記録を本人が読める", async () => { const uid = newUid(), db = dbOf(uid), rid = uid + "_r1"; await seed(d => setDoc(U(d, uid), baseUser({ points: 1200 })));
  await runTransaction(db, async tx => { const s = await tx.get(U(db, uid)); tx.set(U(db, uid), { points: s.data().points - 850, tx: [{ d: "x", label: "お店で交換 油そば 並盛（4321）", points: -850 }], lastRedeem: rid, updatedAt: now() }, { merge: true }); tx.set(doc(db, "kakiapp_redeems", rid), { uid, pts: 850, name: "油そば 並盛", code: "4321", at: serverTimestamp() }); });
  const g = await getDoc(doc(db, "kakiapp_redeems", rid)); if (!g.exists() || g.data().pts !== 850) throw new Error("記録が読めない"); });
add("ok-new", "L28 新しい交換: まだ無い交換の記録を本人が確かめられる（届いたかの確認用）", async () => { const uid = newUid(), db = dbOf(uid);
  const g = await getDoc(doc(db, "kakiapp_redeems", uid + "_none")); if (g.exists()) throw new Error("あるはずがない"); });
add("ok", "L29 アカウント削除（消せなかったときの上書き: ポイント0・履歴を空に）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ teamId: "t1", team: "x", teamJoinedAt: now(), nickname: "n", claimed: { a: Y }, rankBonus: { silver: Y } })));
  await setDoc(U(db, uid), { deleted: true, points: 0, tx: [], email: "", name: "", nickname: deleteField(), teamId: deleteField(), team: deleteField(), teamJoinedAt: deleteField(), mailOptIn: false, updatedAt: now() }, { merge: true }); });
add("ok", "L30 運営（admin）の加算: 学校対抗の報酬 +200 と awards", async () => { const uid = newUid(), db = dbOf(ADMIN); await seed(d => setDoc(U(d, uid), baseUser()));
  await updateDoc(U(db, uid), { points: increment(200), ["awards." + TM]: { tier: "r1", points: 200 } }); });
add("ok", "L31 ポイントが変わらない保存（お知らせメールの同意・ニックネーム・履歴の整理）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ claimed: { a: Y }, rankBonus: { silver: Y }, refClaimed: { z: Y } }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), Object.assign({}, u, { mailOptIn: false, mailOptInAt: now(), nickname: "あぶら", updatedAt: now() }), { merge: true }); });
add("ok", "L32 来店が拒否されたあとの送り直し（来店分を外してルーレット+10 だけ）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), Object.assign({}, u, { points: 310, rouletteDate: T, updatedAt: now() }), { merge: true }); });
const txRows = n => Array.from({ length: n }, (_, i) => ({ d: "2026-10-" + String(1 + (i % 28)).padStart(2, "0") + " 03:" + String(i % 60).padStart(2, "0"), label: i % 3 ? "毎日ルーレット" : "来店ポイント", points: 1 + (i % 10) }));
/* 重い保存（電波が悪くて溜まった分を1回で送る）: 来店+10・ガチャ+100・ルーレット+10・ログイン+1 に、ランクアップ・キャンペーン・紹介 nRef 人を足す */
const heavy = (nRef, camp, rank) => async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: days(14), rankBonus: { silver: Y2 }, claimed: { old1: Y2, old2: Y2 }, refClaimed: { z1: Y2 }, tx: txRows(100) }), rc = { z1: Y2 };
  await seed(async d => { await setDoc(U(d, uid), u); await setDoc(doc(d, "kakiapp_campaigns", "campW"), { title: "w", points: 350, from: LASTWEEK, until: TOMORROW, target: "all", minVisits: 1, active: true });
    for (let i = 0; i < nRef; i++) { rc["w" + i + uid] = T; await setDoc(doc(d, "kakiapp_referrals", "w" + i + uid), { referrer: uid, referee: "w" + i + uid, code: "ABCDEF", createdAt: now(), status: "qualified" }); } });
  await setDoc(U(db, uid), Object.assign({}, u, checkinPatch(u, 10 + 100 + 10 + 1 + (rank ? 150 : 0) + (camp ? 350 : 0) + 50 * nRef, Object.assign({ gachaDate: T, rouletteDate: T, loginDate: T, mailOptIn: false, nickname: "n" }, rank ? { rankBonus: { silver: Y2, gold: T } } : {}, camp ? { claimed: { old1: Y2, old2: Y2, campW: T } } : {}, nRef ? { refClaimed: rc } : {}))), { merge: true }); };
add("limit", "X01 ありえないほど重い保存: 来店・ガチャ・ルーレット・ログイン・ランクアップ・キャンペーン・紹介3人 を全部1回で（式の上限 1000 を超える＝旧・新とも弾く。ふつうは別々の保存になる）", heavy(3, true, true), true);
add("fix", "L39 重い保存: 来店・ガチャ・ルーレット・ログイン・ランクアップ+150・キャンペーン+350 を1回で（旧ルールは式の上限 1000 を超えて弾く・新は通る）", heavy(0, true, true), true);
add("ok", "L40 重い保存: 来店・ガチャ・ルーレット・ログイン・キャンペーン+350・紹介1人+50 を1回で", heavy(1, true, false), true);
/* 実際の会員に近い大きさ（履歴 tx 100件・来店 150件・店ごとの記録つき）で、履歴も1件ずつ増える保存 */
const bigUser = (over) => baseUser(Object.assign({ visits: days(150), tx: txRows(100), storeVisits: { nagaoka: 140, sendai: 10 }, visitStore: Object.fromEntries(days(150).slice(-30).map(d => [d, "nagaoka"])), lastStore: "nagaoka", lastStoreAt: Y, lastCheckinMs: 1, rankBonus: { silver: Y2, gold: Y2, rainbow: Y2, king: Y2 }, claimed: { c1: Y2 }, refClaimed: { z1: Y2, z2: Y2 }, teamId: "tBig", team: "試験高校", teamJoinedAt: "2026-11-02T00:00:00.000Z", teamVisits: { [TM]: 3 }, teamVisitDay: Y, nickname: "あぶら", gReview: { nagaoka: { n: 1, at: Y } }, qrDate: Y, gachaDate: Y, boardDate: Y2, points: 2345 }, over || {}));
const txAdd = (u, rows) => rows.map(([label, points]) => ({ d: now().slice(0, 16).replace("T", " "), label, points })).concat(u.tx);
add("ok", "L35 大きな会員データ: ログインボーナス+1（履歴も1件増える）", async () => { const uid = newUid(), db = dbOf(uid), u = bigUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), Object.assign({}, u, { points: u.points + 1, loginDate: T, tx: txAdd(u, [["ログインボーナス", 1]]), updatedAt: now() }), { merge: true }); });
add("ok", "L36 大きな会員データ: 来店+10（履歴も1件増える）", async () => { const uid = newUid(), db = dbOf(uid), u = bigUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), Object.assign({}, u, checkinPatch(u, 10, { storeVisits: { nagaoka: 141, sendai: 10 }, visitStore: Object.assign({}, u.visitStore, { [T]: "nagaoka" }), tx: txAdd(u, [["来店ポイント", 10]]) })), { merge: true }); }, true);
add("ok", "L37 大きな会員データ: 来店+10・ガチャ+100・ルーレット+10・ログイン+1 を1回で（履歴4件増える）", async () => { const uid = newUid(), db = dbOf(uid), u = bigUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), Object.assign({}, u, checkinPatch(u, 121, { gachaDate: T, rouletteDate: T, loginDate: T, storeVisits: { nagaoka: 141, sendai: 10 }, visitStore: Object.assign({}, u.visitStore, { [T]: "nagaoka" }), tx: txAdd(u, [["来店ポイント", 10], ["来店ガチャ", 100], ["毎日ルーレット", 10], ["ログインボーナス", 1]]) })), { merge: true }); }, true);
add("ok", "L38 大きな会員データ: 来店200回目＋ランクアップ「血液が米油」+500＋ガチャ+100 を1回で", async () => { const uid = newUid(), db = dbOf(uid), u = bigUser({ visits: days(199) }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), Object.assign({}, u, checkinPatch(u, 610, { gachaDate: T, rankBonus: Object.assign({}, u.rankBonus, { founder: T }), storeVisits: { nagaoka: 141, sendai: 10 }, tx: txAdd(u, [["来店ポイント", 10], ["来店ガチャ", 100], ["ランクアップ「血液が米油」", 500]]) })), { merge: true }); }, true);
add("ok", "L34 運営の印がある人の来店（店内QRを読んだ印 qrTok つき）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ qrRequired: true }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 10, { qrTok: "kakiapp-get:" + T }), { merge: true }); }, true);
add("deny", "K09 運営の印がある人の、店内QRを読んでいない来店", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ qrRequired: true }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 10), { merge: true }); }, true);

/* ================= 穴の操作 ================= */
add("hole", "H01 ❌2 新規アカウント作成でいきなり 1000P", async () => { const uid = newUid(), db = dbOf(uid);
  await setDoc(U(db, uid), { email: "c@example.com", points: 1000, updatedAt: now() }, { merge: true }); });
add("hole", "H02 ❌2 新規アカウント作成で来店200件（営業時間中・lastStore つき）", async () => { const uid = newUid(), db = dbOf(uid);
  await setDoc(U(db, uid), { email: "c@example.com", points: 0, visits: days(199).concat([T]), qrDate: T, lastStore: "nagaoka", updatedAt: now() }, { merge: true }); }, true);
add("hole", "H03 ❌2 新規アカウント作成でランク受取の印＋500P", async () => { const uid = newUid(), db = dbOf(uid);
  await setDoc(U(db, uid), { email: "c@example.com", points: 500, rankBonus: { founder: T }, updatedAt: now() }, { merge: true }); });
add("hole", "H04 ❌2 常連（来店5回）のランクアップで 500P（本来 100）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser({ visits: days(5), points: 20 }); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), { rankBonus: { silver: T }, points: 520, updatedAt: now() }, { merge: true }); });
add("hole", "H05 ❌3 実在しないキャンペーンの受取 +500", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { claimed: { ["fake" + uid]: T }, points: 800, updatedAt: now() }, { merge: true }); });
add("hole", "H06 ❌3 実在キャンペーン（60P）で 500P 受け取る", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_campaigns", "camp60"), { title: "60", points: 60, from: LASTWEEK, until: TOMORROW, target: "all", minVisits: 0, active: true }); });
  await setDoc(U(db, uid), { claimed: { camp60: T }, points: 800, updatedAt: now() }, { merge: true }); });
add("hole", "H07 ❌3 とっくに終わったキャンペーン（10/13 まで）の受取", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_campaigns", "campOld"), { title: "創業6周年ありがとう", points: 350, from: "2026-10-07", until: "2026-10-13", target: "before", eligibleBefore: "2026-10-07", minVisits: 1, active: true }); });
  await setDoc(U(db, uid), { claimed: { campOld: T }, points: 650, updatedAt: now() }, { merge: true }); });
add("hole", "H08 ❌3 停止中のキャンペーンの受取", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_campaigns", "campOff"), { title: "off", points: 100, from: "", until: "", target: "all", minVisits: 0, active: false }); });
  await setDoc(U(db, uid), { claimed: { campOff: T }, points: 400, updatedAt: now() }, { merge: true }); });
add("hole", "H09 ❌3 来店回数の条件（3回以上）を満たさない受取", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser({ visits: [] })); await setDoc(doc(d, "kakiapp_campaigns", "campMin"), { title: "min", points: 100, from: "", until: "", target: "all", minVisits: 3, active: true }); });
  await setDoc(U(db, uid), { claimed: { campMin: T }, points: 400, updatedAt: now() }, { merge: true }); });
add("hole", "H10 ❌4 紹介していないのに紹介の受取 +50（記録なし）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { refClaimed: { ["nobody" + uid]: T }, points: 350, updatedAt: now() }, { merge: true }); });
add("hole", "H11 ❌4 他人が紹介した記録で受取 +50", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_referrals", "other" + uid), { referrer: "someoneElse", referee: "other" + uid, code: "ABCDEF", createdAt: now(), status: "qualified" }); });
  await setDoc(U(db, uid), { refClaimed: { ["other" + uid]: T }, points: 350, updatedAt: now() }, { merge: true }); });
add("hole", "H12 ❌4 まだ成立していない（pending）紹介で受取 +50", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_referrals", "pend" + uid), { referrer: uid, referee: "pend" + uid, code: "ABCDEF", createdAt: now(), status: "pending" }); });
  await setDoc(U(db, uid), { refClaimed: { ["pend" + uid]: T }, points: 350, updatedAt: now() }, { merge: true }); });
add("hole", "H13 ❌4 本物1件に偽物9件をまぜて +500", async () => { const uid = newUid(), db = dbOf(uid), rc = { ["real" + uid]: T }; for (let i = 0; i < 9; i++) rc["fake" + i + uid] = T;
  await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_referrals", "real" + uid), { referrer: uid, referee: "real" + uid, code: "ABCDEF", createdAt: now(), status: "qualified" }); });
  await setDoc(U(db, uid), { refClaimed: rc, points: 800, updatedAt: now() }, { merge: true }); });
add("hole", "H14 ❌5 来店していない日のガチャ +100", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { gachaDate: T, points: 400, updatedAt: now() }, { merge: true }); });
add("hole", "H15 ❌5 投稿していないのに投稿ポイント +20（来店はした日）", async () => { const uid = newUid(), db = dbOf(uid), u = visitedToday(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), { boardDate: T, points: 330, updatedAt: now() }, { merge: true }); });
add("hole", "H16 ❌5 来店も投稿もなしで 1日 131P（ルーレット10・ログイン1・ガチャ100・投稿20）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { rouletteDate: T, loginDate: T, gachaDate: T, boardDate: T, points: 431, updatedAt: now() }, { merge: true }); });
add("hole", "H17 ❌6 来店していない日に学校の来店+1（teamVisitDay と同じ batch）", async () => { const uid = newUid(), db = dbOf(uid), tid = "team" + uid; await seed(async d => { await setDoc(U(d, uid), baseUser({ teamId: tid, team: "試験高校", teamJoinedAt: now() })); await setDoc(doc(d, "kakiapp_teams", tid), teamDoc()); });
  const b = writeBatch(db); b.update(U(db, uid), { teamVisitDay: T, updatedAt: now() }); b.update(doc(db, "kakiapp_teams", tid), teamInc()); await b.commit(); });
add("hole", "H18 ❌6 来店していない日に自分の teamVisitDay・teamVisits だけ書く（賞の対象の自己申告）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ teamId: "t1", team: "x", teamJoinedAt: now() })));
  await setDoc(U(db, uid), { teamVisitDay: T, teamVisits: { [TM]: 9 }, updatedAt: now() }, { merge: true }); });
add("hole", "H20 ❌6 学校を新しく作るときに来店数 9999 を最初から入れておく", async () => { const uid = newUid(), db = dbOf(uid), tid = "teamF" + uid; await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(doc(db, "kakiapp_teams", tid), teamDoc({ members: 1, createdBy: uid, visits: { [TM]: 9999 }, visitsTotal: 9999 })); }, true);
add("hole", "H19 ⚠7 来店1件で来店ポイント +20（本来は最大 10）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), checkinPatch(u, 20), { merge: true }); }, true);
add("fix", "F01 受取の印が10件ある長年の会員の、11件目の正しいキャンペーン受取（旧ルールは10件で頭打ち＝弾く・新は通る）", async () => { const uid = newUid(), db = dbOf(uid), cl = {}; for (let i = 0; i < 10; i++) cl["past" + i] = "2026-10-0" + (i % 9 + 1);
  await seed(async d => { await setDoc(U(d, uid), baseUser({ claimed: cl })); await setDoc(doc(d, "kakiapp_campaigns", "camp11"), { title: "11件目", points: 60, from: "", until: "", target: "all", minVisits: 0, active: true }); });
  await setDoc(U(db, uid), { claimed: Object.assign({}, cl, { camp11: T }), points: 360, updatedAt: now() }, { merge: true }); });

/* ================= 交換の記録の穴（新ルールだけにある置き場。旧は置き場が無い＝全部拒否） ================= */
add("deny", "D01 ❌1 残高を減らさずに交換の記録だけ作る", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ points: 1200, lastRedeem: uid + "_x" })));
  await setDoc(doc(db, "kakiapp_redeems", uid + "_x"), { uid, pts: 850, name: "油そば 並盛", code: "1234", at: serverTimestamp() }); });
add("deny", "D02 ❌1 1回の減算（−850）で交換の記録を2つ作る", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ points: 1200 })));
  const b = writeBatch(db); b.set(U(db, uid), { points: 350, lastRedeem: uid + "_a", updatedAt: now() }, { merge: true });
  b.set(doc(db, "kakiapp_redeems", uid + "_a"), { uid, pts: 850, name: "並", code: "1111", at: serverTimestamp() }); b.set(doc(db, "kakiapp_redeems", uid + "_b"), { uid, pts: 850, name: "並", code: "2222", at: serverTimestamp() }); await b.commit(); });
add("deny", "D03 ❌1 50P しか減らさずに 850P 分の交換の記録を作る", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ points: 1200 })));
  const b = writeBatch(db); b.set(U(db, uid), { points: 1150, lastRedeem: uid + "_a", updatedAt: now() }, { merge: true }); b.set(doc(db, "kakiapp_redeems", uid + "_a"), { uid, pts: 850, name: "並", code: "1111", at: serverTimestamp() }); await b.commit(); });
add("deny", "D04 ❌1 他人の名前で交換の記録を作る／他人の交換の記録を読む", async () => { const uid = newUid(), db = dbOf(uid), other = newUid(); await seed(async d => { await setDoc(U(d, uid), baseUser({ points: 1200 })); await setDoc(doc(d, "kakiapp_redeems", other + "_a"), { uid: other, pts: 850, name: "並", code: "1111", at: new Date() }); });
  let read = false; try { await getDoc(doc(db, "kakiapp_redeems", other + "_a")); read = true; } catch (_) {}
  if (!read) { const b = writeBatch(db); b.set(U(db, uid), { points: 350, lastRedeem: uid + "_a", updatedAt: now() }, { merge: true }); b.set(doc(db, "kakiapp_redeems", uid + "_a"), { uid: other, pts: 850, name: "並", code: "1111", at: serverTimestamp() }); await b.commit(); } });
add("deny", "D05 ❌1 交換の記録を書き換える・消す（本人）", async () => { const uid = newUid(), db = dbOf(uid); await seed(async d => { await setDoc(U(d, uid), baseUser()); await setDoc(doc(d, "kakiapp_redeems", uid + "_a"), { uid, pts: 850, name: "並", code: "1111", at: new Date() }); });
  let ok = false; try { await updateDoc(doc(db, "kakiapp_redeems", uid + "_a"), { pts: 1 }); ok = true; } catch (_) {}
  if (!ok) await deleteDoc(doc(db, "kakiapp_redeems", uid + "_a")); });

/* ================= 前から守られていたもの（旧・新とも弾く） ================= */
add("deny", "K01 同じ日の2回目のルーレット（rouletteDate が今日のまま +10）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ rouletteDate: T })));
  await setDoc(U(db, uid), { points: 310, updatedAt: now() }, { merge: true }); });
add("deny", "K02 理由なしでポイントを増やす +50", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { points: 350, updatedAt: now() }, { merge: true }); });
add("deny", "K03 来店数が足りないランクアップ（来店3回で常連）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ visits: days(3) })));
  await setDoc(U(db, uid), { rankBonus: { silver: T }, points: 400, updatedAt: now() }, { merge: true }); });
add("deny", "K04 他人の会員データを書く", async () => { const uid = newUid(), other = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, other), baseUser()));
  await setDoc(U(db, other), { nickname: "x" }, { merge: true }); });
add("deny", "K05 本人が awards・qrRequired を書く", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ qrRequired: true })));
  await setDoc(U(db, uid), { qrRequired: false }, { merge: true }); });
add("deny", "K06 受け取りの印を消して取り直す（rankBonus を空に）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ rankBonus: { silver: Y } })));
  await updateDoc(U(db, uid), { rankBonus: {} }); });
add("deny", "K07 営業時間外・店の指定なしの来店（lastStore なし）", async () => { const uid = newUid(), db = dbOf(uid), u = baseUser(); await seed(d => setDoc(U(d, uid), u));
  await setDoc(U(db, uid), { qrDate: T, visits: u.visits.concat([T]), points: 310, updatedAt: now() }, { merge: true }); });
add("deny", "K08 来店していない日のみんなの一杯の投稿", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  const b = writeBatch(db); b.set(doc(db, "kakiapp_board", uid + "_" + T), boardPost(uid)); b.set(doc(db, "kakiapp_board_img", uid + "_" + T), { uid, data: "data:image/jpeg;base64,AAAA", createdAt: now() }); await b.commit(); });
add("deny", "K10 1日1回の日付を消して取り直す準備（rouletteDate を消す）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ rouletteDate: T })));
  await updateDoc(U(db, uid), { rouletteDate: deleteField() }); });
add("deny", "K11 日付を「あした」にしてログインボーナス+1", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { points: 301, loginDate: TOMORROW, updatedAt: now() }, { merge: true }); });
add("deny", "K12 日付を「きのう」に書き換える（gachaDate・ポイントは変えない）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ gachaDate: Y2 })));
  await setDoc(U(db, uid), { gachaDate: Y, updatedAt: now() }, { merge: true }); });
add("deny", "K13 日付の項目に文字でない値を入れる（qrDate: 1）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser()));
  await setDoc(U(db, uid), { qrDate: 1, lastStore: "nagaoka", updatedAt: now() }, { merge: true }); });
add("deny", "K14 新規アカウント作成で、きのうの日付つき（loginDate がきのう・+1）", async () => { const uid = newUid(), db = dbOf(uid);
  await setDoc(U(db, uid), { email: "c@example.com", points: 1, loginDate: Y, updatedAt: now() }, { merge: true }); });
add("deny", "K15 知らないランク名で受取の印（rankBonus に legend）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ visits: days(200) })));
  await setDoc(U(db, uid), { rankBonus: { legend: T }, points: 800, updatedAt: now() }, { merge: true }); });
add("deny", "K16 ランクアップを1回で2段（silver と gold を同時に）", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ visits: days(20) })));
  await setDoc(U(db, uid), { rankBonus: { silver: T, gold: T }, points: 550, updatedAt: now() }, { merge: true }); });
add("deny", "K17 受取の印（claimed）の古いキーを消す", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ claimed: { a: Y, b: Y } })));
  await updateDoc(U(db, uid), { claimed: { a: Y } }); });
add("deny", "K18 紹介の受取の印（refClaimed）の古いキーを消す", async () => { const uid = newUid(), db = dbOf(uid); await seed(d => setDoc(U(d, uid), baseUser({ refClaimed: { a: Y, b: Y } })));
  await updateDoc(U(db, uid), { refClaimed: { a: Y } }); });

/* ================= 流す ================= */
const res = { ok: [0, 0], hole: [0, 0], "ok-new": [0, 0], deny: [0, 0], fix: [0, 0], limit: [0, 0] };   /* [通った, 弾かれた] */
let bad = 0, skipped = 0;
for (const c of cases) {
  if (ONLY && !ONLY.test(c.name)) continue;
  if (IS_RAW && c.time) { skipped++; continue; }
  let passed = true, err = "";
  try { await c.fn(); } catch (e) { passed = false; err = String((e && e.code) || (e && e.message) || e).slice(0, 80); }
  res[c.kind][passed ? 0 : 1]++;
  /* 期待: ok＝通る／hole＝旧は通る（穴がある）・新は弾く／ok-new＝新は通る（旧は記録だけ）／deny＝弾く／fix＝旧は弾く・新は通る */
  const want = c.kind === "ok" ? true : c.kind === "deny" ? false : c.kind === "ok-new" ? (IS_NEW ? true : null) : c.kind === "fix" ? IS_NEW : c.kind === "limit" ? null : !IS_NEW;
  const judge = want === null ? "（記録だけ）" : want === passed ? "OK" : "NG";
  if (judge === "NG") bad++;
  console.log((judge + "        ").slice(0, 8) + (passed ? "通った   " : "弾かれた ") + c.name + (passed ? "" : "  [" + err + "]"));
}
console.log("\n==== " + LABEL + (IS_RAW ? "（書き換えなし）" : "（営業時間内・エントリー受付中の写し）") + " " + RULES_FILE + " ====");
console.log("正しい操作: 通った " + res.ok[0] + " ／ 弾かれた " + res.ok[1]);
console.log("新しい交換（新ルールだけで通る）: 通った " + res["ok-new"][0] + " ／ 弾かれた " + res["ok-new"][1]);
console.log("穴の操作: 通った " + res.hole[0] + " ／ 弾かれた " + res.hole[1]);
console.log("前から守るもの・交換の記録の穴: 通った " + res.deny[0] + " ／ 弾かれた " + res.deny[1]);
console.log("旧ルールの不具合で弾かれていた正しい操作: 通った " + res.fix[0] + " ／ 弾かれた " + res.fix[1]);
console.log("式の上限の記録（判定しない）: 通った " + res.limit[0] + " ／ 弾かれた " + res.limit[1]);
console.log("時刻に依るため飛ばした: " + skipped + " ／ 期待と違う: " + bad);
await env.cleanup();
process.exit(bad ? 1 : 0);
