/**
 * factory-ranking-client.js — MCF 用ランキングクライアント (Phase 1D-26)
 *
 * Google Apps Script web app と連携。POST でスコア送信、GET でランキング取得。
 * 設計は mycryptotactics の ranking-client.js を踏襲。
 *
 * 設定:
 *   - localStorage["mcf.rankingApiUrl"] に URL 上書き可
 *   - 未設定時は組み込みデフォルト (base64 難読化) を使用
 *   - 組み込みデフォルトも空ならランキング送信を無効化
 *
 * 送信ペイロード形式:
 *   {
 *     playerName: string,
 *     score: number,
 *     gum: number,
 *     factoryLevel: number,
 *     craftCount: number,
 *     hireCount: number,
 *     saleCount: number,
 *     appraisalBest: number,
 *     yearWeek: string,        // 例 "2028-11-4"
 *     version: string,         // 例 "1D-26"
 *     timestamp: string,
 *   }
 */

const LS_API_URL = "mcf.rankingApiUrl";
const LS_PLAYER_NAME = "mcf.playerName";

/** 組み込みデフォルト (base64)。空文字なら未設定扱い → ローカル送信無効。
 *  Phase β2 hotfix: bearko デプロイの公式 GAS URL を埋め込み (= 起動だけで
 *  ランキング機能が利用可能)。 ユーザーが上級設定で別 URL に上書き可能。
 *
 *  decoded URL:
 *    https://script.google.com/macros/s/AKfycbweVO0bT_gSu-LpRKrKn7nQ04CkROJgBH18fucZ_64ti3OOqq0BzChJDP40rRWOGpGQ6g/exec
 */
const _DEFAULT_API_URL_ENC = "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J3ZVZPMGJUX2dTdS1McFJLcktuN25RMDRDa1JPSmdCSDE4ZnVjWl82NHRpM09PcXEwQnpDaEpEUDQwclJXT0dwR1E2Zy9leGVj";
function _decodeDefault() {
  try {
    if (!_DEFAULT_API_URL_ENC) return null;
    return typeof atob === "function" ? atob(_DEFAULT_API_URL_ENC) : null;
  } catch (e) { return null; }
}

/** GAS web app URL を取得 */
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

/** プレイヤー名を取得 */
export function getPlayerName() {
  try { return localStorage.getItem(LS_PLAYER_NAME) || ""; }
  catch (e) { return ""; }
}

/** プレイヤー名を保存 */
export function setPlayerName(name) {
  try {
    const trimmed = (name || "").trim().slice(0, 30);
    if (!trimmed) localStorage.removeItem(LS_PLAYER_NAME);
    else localStorage.setItem(LS_PLAYER_NAME, trimmed);
  } catch (e) { /* ignore */ }
}

/** スコア送信 */
export async function submitFactoryScore(payload) {
  const url = getRankingApiUrl();
  if (!url) return { ok: false, error: "ランキング API URL が未設定です" };
  try {
    const body = { ...payload, timestamp: new Date().toISOString() };
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

/** ランキング取得 */
export async function fetchFactoryRanking(opts = {}) {
  const url = getRankingApiUrl();
  if (!url) return { ok: false, error: "ランキング API URL が未設定です" };
  try {
    const params = new URLSearchParams();
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

/**
 * Phase 1D-26: スコア計算式
 *
 *   base       = state.gum
 *   craftMult  = 1 + craftCount / 50          (e.g. 25 craft → 1.5x)
 *   hireMult   = 1 + max(0, 20 - hireCount) / 20  (少ない雇用 = 倍率高)
 *   factoryMult= 1 + (factoryLevel - 1) * 0.5     (Lv5 → 3.0x)
 *   appraisalMult = 1 + (best Common 査定 score) / 50  (50点満点 → 2.0x)
 *
 *   score = round(base × craftMult × hireMult × factoryMult × appraisalMult)
 *
 *   返却: { score, breakdown: {...} } で内訳を表示用に提供
 */
export function calcFactoryScore(stats) {
  const gum = Math.max(0, stats.gum || 0);
  const craftCount = Math.max(0, stats.craftCount || 0);
  const hireCount = Math.max(0, stats.hireCount || 0);
  const factoryLevel = Math.max(1, Math.min(5, stats.factoryLevel || 1));
  const bestCommon = Math.max(0, (stats.appraisalBest && stats.appraisalBest.common) || 0);

  const craftMult = 1 + craftCount / 50;
  const hireMult  = 1 + Math.max(0, 20 - hireCount) / 20;
  const factoryMult = 1 + (factoryLevel - 1) * 0.5;
  const appraisalMult = 1 + bestCommon / 50;

  const score = Math.round(gum * craftMult * hireMult * factoryMult * appraisalMult);

  return {
    score,
    breakdown: {
      gum,
      craftCount, craftMult,
      hireCount,  hireMult,
      factoryLevel, factoryMult,
      bestCommon,   appraisalMult,
    },
  };
}
