// bearko.games 共通基盤への窓口（総合スコア。bearko/mycryptoportfolio の SPEC-002 3.9）
// SDK（https://bearko.games/sdk/v1.js）が読めない・通信に失敗しても何もしない。ゲームの進行・pauseTime には触らない。
// 点の計算は共通基盤：工房 Lv（設備は Lv と一緒に増える）の節目 ＋ Lv 5 までの速さ ＋ クエスト攻略数 ＋ クラフトの数（レアリティの重み）

import { LAND_NODES } from "./factory-quest.js";

const SEND_EVERY = 60 * 1000; // こまめな送信は 1 分に 1 回まで
let lastSentAt = 0;
let timer = null;

const sdk = () => (typeof window !== "undefined" ? window.BearkoGames : undefined);

/** ゲーム開始（startYear 年 12 月 1 週）からの週数。純関数 (= tests/platform.test.mjs) */
export function weeksSinceStart({ year, month, week, startYear }) {
  return ((year - startYear) * 12 + (month - 12)) * 4 + (week - 1);
}

/** 共通基盤に送る成績。純関数 */
export function scoreMetrics(state) {
  const crafted = {};
  for (const [r, n] of Object.entries(state.craftedByRarity || {})) if (n > 0) crafted[r] = n;
  return {
    factoryLevel: state.factoryLevel || 1,
    weeksToLv5: (state.factoryLevel || 1) >= 5 && state.lv5Weeks ? state.lv5Weeks : null,
    questsCleared: state.questClearCount || 0,
    crafted,
  };
}

export function initPlatform(version) {
  const bg = sdk();
  if (!bg) return;
  try {
    Promise.resolve(bg.init({ game: "factory", version }))
      .then(() => { wireChat(bg); for (const fn of chatReadyFns) { try { fn(); } catch (e) { console.warn("[platform] chat", e); } } })
      .catch((e) => console.warn("[platform] init", e));
  } catch (e) {
    console.warn("[platform] init", e);
  }
}

// ---------------------------------------------------------------- SPEC-012: 全体チャット（共通基盤 SPEC-004・SPEC-005。SDK 1.6.1 / 1.7.0）
// 窓は SDK が描く（PC は右側のドック、スマホは 💬 → シート。どの画面でも出す）。このゲームの作法で、
// 「チャットに向かっているあいだ」は時間を止める：窓・シートなら開いているあいだ、ドック（常に見えている）なら書いているあいだ。
// 止める・戻すは main.js が onChatToggle で登録する（platform.js は pauseTime に触らない）
let chatOpen = false;        // 窓・シートが開いている（onToggle）
let chatComposing = false;   // 入力欄に入っている（onCompose。SDK 1.7.0）
let chatBusy = false;        // main.js に伝えている状態（上の 2 つから決める）
const chatToggleFns = [];

/** チャットに向かっているか（main.js の pause の見張りが、止まっているのは正しいと判断するため） */
export function isChatOpen() { return chatBusy; }

/** ドックなら書いているあいだ、窓・シートなら開いているあいだ。純関数（tests/platform.test.mjs） */
export function chatBusyFor(layout, open, composing) {
  return layout === "dock" ? composing : (open || composing);
}

/** 窓を開いた（true）・閉じた（false）ときに呼ばれる関数を登録する */
export function onChatToggle(fn) {
  if (typeof fn === "function") chatToggleFns.push(fn);
}

function chatRecompute(bg) {
  const layout = bg.chat && typeof bg.chat.layout === "function" ? bg.chat.layout() : "float";
  const next = chatBusyFor(layout, chatOpen, chatComposing);
  if (next === chatBusy) return;
  chatBusy = next;
  for (const fn of chatToggleFns) {
    try { fn(chatBusy); } catch (e) { console.warn("[platform] chat", e); }
  }
}

function wireChat(bg) {
  if (!bg || !bg.chat || typeof bg.chat.onToggle !== "function") return;   // SDK が古い（1.6.0 まで）なら何もしない
  try {
    bg.chat.onToggle((open) => { chatOpen = !!open; chatRecompute(bg); });
    // SDK 1.7.0：ドックは常に見えているので、書いているあいだだけ止める
    if (typeof bg.chat.onCompose === "function") bg.chat.onCompose((on) => { chatComposing = !!on; chatRecompute(bg); });
  } catch (e) {
    console.warn("[platform] chat", e);
  }
}

// ---------------------------------------------------------------- SPEC-016: 💬 の置き場所（MENU ボタンのすぐ上）
// 既定の右下だと、マイのセリフの「次へ／閉じる」ボタンに重なっていた。置き場所は SDK の chat.setPosition（1.7.0）
export const CHAT_DEFAULT_OFFSET = { x: 16, y: 16 };
const CHAT_BTN = 48;   // SDK の 💬 の大きさ
const chatReadyFns = [];
let chatOffset = null;

/** SDK の init が済んだら呼ぶ（💬 は init のあとに出るため） */
export function onChatReady(fn) {
  if (typeof fn === "function") chatReadyFns.push(fn);
}

/**
 * 💬 を目印（MENU ボタン）の右端にそろえ、そのすぐ上に置くときの offset（右下から）。純関数
 * 目印が画面に見えていないときは null（既定の右下に戻す）
 */
export function chatOffsetAbove(rect, vw, vh, gap = 8) {
  if (!rect || !(rect.width > 0) || rect.bottom <= 0 || rect.top >= vh) return null;
  const x = Math.max(0, Math.round(vw - rect.right));
  const y = Math.round(Math.min(vh - rect.top + gap, vh - CHAT_BTN - CHAT_DEFAULT_OFFSET.y));
  return { x, y: Math.max(CHAT_DEFAULT_OFFSET.y, y) };
}

/** 💬 を動かす（同じ場所なら何もしない）。SDK がない・古いときは何もしない */
export function placeChat(offset) {
  const bg = sdk();
  if (!bg || !bg.chat || typeof bg.chat.setPosition !== "function") return;
  const o = offset || CHAT_DEFAULT_OFFSET;
  if (chatOffset && chatOffset.x === o.x && chatOffset.y === o.y) return;
  try {
    bg.chat.setPosition({ position: "bottom-right", offset: { x: o.x, y: o.y } });
    chatOffset = { x: o.x, y: o.y };
  } catch (e) {
    console.warn("[platform] chat", e);
  }
}

// ---------------------------------------------------------------- SPEC-012: bearko.games 共通のアイコン（SPEC-005 5.3。選ぶ窓は SDK 1.7.0）
export function canPickAvatar() {
  const bg = sdk();
  return !!(bg && typeof bg.openAvatarPicker === "function");
}
export function openAvatarPicker() {
  const bg = sdk();
  if (!bg || typeof bg.openAvatarPicker !== "function") return false;
  try { bg.openAvatarPicker(); } catch (e) { console.warn("[platform] avatar", e); }
  return true;
}

function send(state, quiet) {
  const bg = sdk();
  if (!bg || typeof bg.submitScore !== "function") return;
  lastSentAt = Date.now();
  try {
    Promise.resolve(bg.submitScore(scoreMetrics(state), { quiet }))
      .then((r) => { if (!r || !r.ok) console.warn("[platform] score", r && r.error); })
      .catch((e) => console.warn("[platform] score", e));
  } catch (e) {
    console.warn("[platform] score", e);
  }
}

/**
 * 成績が増えたとき。工房 Lv が上がったとき (= 節目) は { milestone: true } ですぐ送って通知を出す。
 * クラフト・クエストは通知なしで、1 分に 1 回までにまとめる
 */
export function reportProgress(state, { milestone = false } = {}) {
  if (state.scoreFrozen || !sdk()) return;
  if (timer) { clearTimeout(timer); timer = null; }
  if (milestone || Date.now() - lastSentAt >= SEND_EVERY) { send(state, !milestone); return; }
  timer = setTimeout(() => { timer = null; send(state, true); }, SEND_EVERY - (Date.now() - lastSentAt));
}

/**
 * 期限（8 年。SPEC-001 3.4）で総合スコアを止める。待っている分を通知なしで 1 回送り、以降は送らない
 */
export function finalizeScore(state) {
  if (state.scoreFrozen) return;
  if (timer) { clearTimeout(timer); timer = null; }
  send(state, true);
  state.scoreFrozen = true;
}

/* ─── RTA（SPEC-003。レギュレーション factory-lv5） ─────────────────── */

export const RTA_REGULATION = "factory-lv5";
const RTA_CHECKPOINTS = ["lv2", "lv3", "lv4", "clear"];
let rtaRunning = false;

/** 節目 (SPEC-001 の reachMilestone の id) → RTA の区切り。年の終わりは送らない。純関数 */
export function rtaCheckpointFor(milestoneId) {
  return RTA_CHECKPOINTS.includes(milestoneId) ? milestoneId : null;
}

/** 「RTA で始める」を出してよいか (SDK に rta があるとき) */
export function isRtaAvailable() {
  const bg = sdk();
  return !!(bg && bg.rta && typeof bg.rta.start === "function");
}

export function isRtaRunning() { return rtaRunning; }

function rtaCall(name, fn) {
  try {
    Promise.resolve(fn()).then((r) => { if (r && r.ok === false) console.warn(`[platform] rta.${name}`, r.error); })
      .catch((e) => console.warn(`[platform] rta.${name}`, e));
  } catch (e) {
    console.warn(`[platform] rta.${name}`, e);
  }
}

/** 計測を始める (はじめからのときだけ)。timerOffset はヘッダーの高さ (px) */
export function rtaStart(timerOffset = 0) {
  if (!isRtaAvailable()) return;
  rtaRunning = true;
  rtaCall("start", () => sdk().rta.start({ regulation: RTA_REGULATION, timerOffset }));
}

/** 節目に達した。計測中で RTA の区切りなら送る。clear で計測は終わる */
export function rtaMilestone(milestoneId, igtMs) {
  const cp = rtaCheckpointFor(milestoneId);
  if (!rtaRunning || !cp) return;
  if (cp === "clear") rtaRunning = false;
  const bg = sdk();
  if (!bg || !bg.rta) return;
  rtaCall("checkpoint", () => bg.rta.checkpoint(cp, { igtMs }));
}

/** 計測をやめる (期限・ゲームオーバー) */
export function rtaAbort() {
  if (!rtaRunning) return;
  rtaRunning = false;
  const bg = sdk();
  if (!bg || !bg.rta) return;
  rtaCall("abort", () => bg.rta.abort());
}

/* ─── アチーブメント（SPEC-021。送り方は SPEC-009。定義は共通基盤の platform/trophies.js） ─────── */
// 共通基盤の画面では「アチーブメント」と呼ぶ。API と ID は今までどおり unlockTrophy / factory.*

export const CLEAR_3Y_WEEKS = 144; // 3 年 (= 1 年 48 週)
export const MASTERPIECE_SCORE = 45; // 品評会の「傑作」(js/factory-appraisal.js の tier)
export const CRAFTS_MANY = 50;

/** 雇っているヒーローのランクの最大。純関数 */
export function maxHeroRank(state) {
  return (state.ownedHeroes || []).reduce((m, h) => Math.max(m, Number(h?.rank) || 0), 0);
}

/** そろえたランド通行証の数 (LAND_NODES にあるものだけ。Set でも配列でも)。純関数 */
export function landPassCount(state) {
  const passes = state.landPasses instanceof Set ? state.landPasses : new Set(state.landPasses || []);
  return LAND_NODES.filter((n) => passes.has(n.id)).length;
}

/** 満たしているアチーブメントの ID (factory.visit は SDK が送るので入れない)。純関数 */
export function trophiesFor(state) {
  const out = [];
  const lv = state.factoryLevel || 1;
  const rank = maxHeroRank(state);
  const crafts = state.craftCompletedCount || 0;
  // ヒーロー名鑑
  if (lv >= 2) out.push("factory.lv2");
  if (lv >= 3) out.push("factory.lv3");
  if (rank >= 3) out.push("factory.rank3");
  if (landPassCount(state) >= LAND_NODES.length) out.push("factory.passes");
  if (lv >= 4) out.push("factory.lv4");
  if (rank >= 5) out.push("factory.rank5");
  if (Object.values(state.appraisalBest || {}).some((v) => (Number(v) || 0) >= MASTERPIECE_SCORE)) out.push("factory.masterpiece");
  if (state.clearedWeeks != null) out.push("factory.clear");
  if ((state.craftedByRarity?.legendary || 0) > 0) out.push("factory.legendary");
  if (state.clearedWeeks != null && state.clearedWeeks <= CLEAR_3Y_WEEKS) out.push("factory.clear3y");
  if (state.endgameTriggered50y) out.push("factory.y50");
  // エクステンション
  if (crafts >= 1) out.push("factory.firstcraft");
  if ((state.questClearCount || 0) >= 1) out.push("factory.firstquest");
  if (crafts >= CRAFTS_MANY) out.push("factory.crafts50");
  return out;
}

const trophiesSent = new Set(); // このページを開いてから送ったもの (state には入れない)
// 1 つずつ順に送る。未ログインで同時に送ると、仮アカウントが送った数だけできてしまう (Cookie がまだないため)
let trophyChain = Promise.resolve();

/** まだ送っていないアチーブメントを送る、ただ 1 か所。通知は SDK が出す */
export function syncTrophies(state) {
  const bg = sdk();
  if (!bg || typeof bg.unlockTrophy !== "function") return trophyChain;
  for (const id of trophiesFor(state)) {
    if (trophiesSent.has(id)) continue;
    trophiesSent.add(id);
    trophyChain = trophyChain
      .then(() => bg.unlockTrophy(id))
      .then((r) => { if (r && r.ok === false) console.warn("[platform] trophy", id, r.error); })
      .catch((e) => console.warn("[platform] trophy", id, e));
  }
  return trophyChain;
}
