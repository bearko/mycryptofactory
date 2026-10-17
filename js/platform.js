// bearko.games 共通基盤への窓口（総合スコア。bearko/mycryptoportfolio の SPEC-002 3.9）
// SDK（https://bearko.games/sdk/v1.js）が読めない・通信に失敗しても何もしない。ゲームの進行・pauseTime には触らない。
// 点の計算は共通基盤：工房 Lv（設備は Lv と一緒に増える）の節目 ＋ Lv 5 までの速さ ＋ クエスト攻略数 ＋ クラフトの数（レアリティの重み）

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
      .then(() => wireChat(bg))
      .catch((e) => console.warn("[platform] init", e));
  } catch (e) {
    console.warn("[platform] init", e);
  }
}

// ---------------------------------------------------------------- SPEC-012: 全体チャット（共通基盤 SPEC-004。SDK 1.6.1 から）
// 窓は SDK が描く（右下の 💬。どの画面でも出す）。このゲームの作法で、窓を開いているあいだは時間を止める。
// 止める・戻すは main.js が onChatToggle で登録する（platform.js は pauseTime に触らない）
let chatOpen = false;
const chatToggleFns = [];

/** 窓が開いているか（main.js の pause の見張りが、止まっているのは正しいと判断するため） */
export function isChatOpen() { return chatOpen; }

/** 窓を開いた（true）・閉じた（false）ときに呼ばれる関数を登録する */
export function onChatToggle(fn) {
  if (typeof fn === "function") chatToggleFns.push(fn);
}

function wireChat(bg) {
  if (!bg || !bg.chat || typeof bg.chat.onToggle !== "function") return;   // SDK が古い（1.6.0 まで）なら何もしない
  try {
    bg.chat.onToggle((open) => {
      const next = !!open;
      if (next === chatOpen) return;
      chatOpen = next;
      for (const fn of chatToggleFns) {
        try { fn(chatOpen); } catch (e) { console.warn("[platform] chat", e); }
      }
    });
  } catch (e) {
    console.warn("[platform] chat", e);
  }
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

/* ─── トロフィー（SPEC-009。定義は共通基盤の platform/trophies.js） ─────── */

export const CLEAR_3Y_WEEKS = 144; // 3 年 (= 1 年 48 週)

/** 満たしているトロフィーの ID。純関数 */
export function trophiesFor(state) {
  const out = [];
  if ((state.factoryLevel || 1) >= 2) out.push("factory.lv2");
  if ((state.craftedByRarity?.legendary || 0) > 0) out.push("factory.legendary");
  if (state.clearedWeeks != null) {
    out.push("factory.clear");
    if (state.clearedWeeks <= CLEAR_3Y_WEEKS) out.push("factory.clear3y");
  }
  return out;
}

const trophiesSent = new Set(); // このページを開いてから送ったもの (state には入れない)
// 1 つずつ順に送る。未ログインで同時に送ると、仮アカウントが送った数だけできてしまう (Cookie がまだないため)
let trophyChain = Promise.resolve();

/** まだ送っていないトロフィーを送る、ただ 1 か所。通知は SDK が出す */
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
