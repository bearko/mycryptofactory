/**
 * SPEC-007: ランキング送信 / 取得クライアント
 *
 * Google Apps Script web app と連携。POST でスコア送信、GET でランキング取得。
 *
 * web app URL は localStorage (mct.rankingApiUrl) に保存。
 * 設定が無い場合はランキング送信を無効化（クリア時の送信モーダルもスキップ）。
 *
 * 送信ペイロード形式:
 * {
 *   playerName: string,
 *   score: number,
 *   regulation: string,
 *   turns: number,
 *   deckSize: number,
 *   llExt: number,
 *   heroIds: number[],
 *   absoluteConfig: { enemyHpMult, enemyDmgMult, playerHpMult, playerDmgMult } | null,
 *   version: string,
 *   timestamp: string,
 * }
 *
 * 取得レスポンス形式 (GET):
 * { ok: true, ranking: Array<entry>, error?: string }
 */

const LS_API_URL = "mct.rankingApiUrl";
const LS_PLAYER_NAME = "mct.playerName";

/**
 * デフォルトの GAS web app URL（プレーンテキスト直書き回避のため base64）。
 * クライアント側に存在する以上、Network タブやソース閲覧で完全な秘匿は不可能だが、
 * ソースを casually 眺めただけでは URL が直接見えないようにする目的の難読化。
 *
 * 上書きする場合は localStorage.setItem("mct.rankingApiUrl", "<your URL>") で可能。
 */
const _DEFAULT_API_URL_ENC = "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4MVJScnhMMzFPSHFXY1lkWk90QW5OWUtVX1VGUWtxblBVeURRYkRESThiVGgxVWFUSHhPYWxFQ2tuTkhXVHIzeHFsQS9leGVj";
function _decodeDefault() {
  try {
    return typeof atob === "function" ? atob(_DEFAULT_API_URL_ENC) : null;
  } catch (e) { return null; }
}

/**
 * GAS web app URL を取得。
 * 1. localStorage の上書き値があればそれを返す
 * 2. 無ければ組み込みデフォルト URL を返す
 * 3. 組み込みデフォルトも無効ならば null
 */
export function getRankingApiUrl() {
  try {
    const v = localStorage.getItem(LS_API_URL);
    if (v && v.trim()) return v.trim();
  } catch (e) { /* fallthrough */ }
  const def = _decodeDefault();
  return (def && def.trim()) ? def.trim() : null;
}

/** GAS web app URL を保存 */
export function setRankingApiUrl(url) {
  try {
    if (!url || !url.trim()) localStorage.removeItem(LS_API_URL);
    else localStorage.setItem(LS_API_URL, url.trim());
  } catch (e) { /* ignore */ }
}

/** プレイヤー名を取得（無設定なら空文字） */
export function getPlayerName() {
  try { return localStorage.getItem(LS_PLAYER_NAME) || ""; }
  catch (e) { return ""; }
}

/** プレイヤー名を保存（空文字なら削除）*/
export function setPlayerName(name) {
  try {
    const trimmed = (name || "").trim().slice(0, 30);
    if (!trimmed) localStorage.removeItem(LS_PLAYER_NAME);
    else localStorage.setItem(LS_PLAYER_NAME, trimmed);
  } catch (e) { /* ignore */ }
}

/**
 * スコア送信。GAS web app に POST。
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function submitScore(payload) {
  const url = getRankingApiUrl();
  if (!url) return { ok: false, error: "ランキング API URL が未設定です（設定画面から登録してください）" };
  try {
    const body = {
      ...payload,
      timestamp: new Date().toISOString(),
    };
    // GAS web app は CORS 対応のため text/plain で送る (preflight 回避)
    const res = await fetch(url, {
      method: "POST",
      mode: "cors",
      cache: "no-cache",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: !!data.ok, error: data.error };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/**
 * ランキング取得。GAS web app に GET（オプションで regulation フィルタ）。
 * @param {{regulation?: string, limit?: number}} opts
 * @returns {Promise<{ok: boolean, ranking?: Array, error?: string}>}
 */
export async function fetchRanking(opts = {}) {
  const url = getRankingApiUrl();
  if (!url) return { ok: false, error: "ランキング API URL が未設定です" };
  try {
    const params = new URLSearchParams();
    if (opts.regulation) params.set("regulation", opts.regulation);
    if (opts.limit) params.set("limit", String(opts.limit));
    const fullUrl = params.toString() ? `${url}?${params}` : url;
    const res = await fetch(fullUrl, { method: "GET", mode: "cors", cache: "no-cache" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: !!data.ok, ranking: data.ranking || [], error: data.error };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
