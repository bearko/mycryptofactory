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
    Promise.resolve(bg.init({ game: "factory", version })).catch((e) => console.warn("[platform] init", e));
  } catch (e) {
    console.warn("[platform] init", e);
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
