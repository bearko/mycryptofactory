/**
 * SPEC-007: ランキングスコア計算
 *
 * クリア時のスコアは以下の要素で構成される。
 * - turnBonus:  ターン数が短いほど高い（max 500 turn まで）
 * - deckBonus:  デッキ枚数が多いほど高い
 * - llBonus:    LL エクステ装備数が多いほど高い
 * - rarityBonus: ヒーローのレアリティが低いほど高い（common=5pt 〜 legendary=1pt）
 *
 * レギュレーション乗数 (regMult) と Absolute スコア倍率 (absMult) を
 * baseScore に乗算して最終スコアとする。
 */

import { getAbsoluteScoreMult } from "./absolute-config.js";

const RARITY_VALUES = {
  legendary: 1,
  epic: 2,
  rare: 3,
  uncommon: 4,
  common: 5,
};

const REGULATION_SCORE_MULTS = {
  common: 1.0,
  egg: 1.2,
  baby: 1.5,
  blue: 2.0,
  red: 3.0,
  absolute: 1.0, // Absolute は別途 absMult を掛けるため 1.0 固定
};

/**
 * ベーススコアを算出。
 * @param {{
 *   turns: number,
 *   deckSize: number,
 *   llExtCount: number,
 *   partyHeroes: Array<{rarity: string}>,
 * }} params
 * @returns {number}
 */
export function computeBaseScore({ turns, deckSize, llExtCount, partyHeroes }) {
  const turnBonus = Math.max(0, 500 - (turns || 0)) * 30;
  // Ver.1.1.0: 1 枚 50 → 200 点。少枚数クリアが最適解にならないように引き上げ。
  const deckBonus = (deckSize || 0) * 200;
  const llBonus = (llExtCount || 0) * 3000;
  const rarityBonus = (partyHeroes || []).reduce((sum, h) => {
    const v = RARITY_VALUES[(h?.rarity || "").toLowerCase()] || 3;
    return sum + v * 500;
  }, 0);
  return turnBonus + deckBonus + llBonus + rarityBonus;
}

/**
 * レギュレーション乗数を取得。
 * @param {string} regulationId
 * @returns {number}
 */
export function getRegulationMult(regulationId) {
  return REGULATION_SCORE_MULTS[regulationId] || 1.0;
}

/**
 * 最終スコアを算出。
 * @param {{
 *   baseScore: number,
 *   regulationId: string,
 *   absoluteConfig: object | null,
 * }} params
 * @returns {number}
 */
export function computeFinalScore({ baseScore, regulationId, absoluteConfig }) {
  const regMult = getRegulationMult(regulationId);
  const absMult = (regulationId === "absolute" && absoluteConfig)
    ? getAbsoluteScoreMult(absoluteConfig)
    : 1.0;
  return Math.round(baseScore * regMult * absMult);
}

/**
 * ヘルパー: スコア内訳を返す（UI 表示用）。
 * @returns {{turnBonus, deckBonus, llBonus, rarityBonus, baseScore, regMult, absMult, finalScore}}
 */
export function computeScoreBreakdown({ turns, deckSize, llExtCount, partyHeroes, regulationId, absoluteConfig }) {
  const turnBonus = Math.max(0, 500 - (turns || 0)) * 30;
  // Ver.1.1.0: 1 枚 50 → 200 点。少枚数クリアが最適解にならないように引き上げ。
  const deckBonus = (deckSize || 0) * 200;
  const llBonus = (llExtCount || 0) * 3000;
  const rarityBonus = (partyHeroes || []).reduce((sum, h) => {
    const v = RARITY_VALUES[(h?.rarity || "").toLowerCase()] || 3;
    return sum + v * 500;
  }, 0);
  const baseScore = turnBonus + deckBonus + llBonus + rarityBonus;
  const regMult = getRegulationMult(regulationId);
  const absMult = (regulationId === "absolute" && absoluteConfig)
    ? getAbsoluteScoreMult(absoluteConfig)
    : 1.0;
  const finalScore = Math.round(baseScore * regMult * absMult);
  return {
    turnBonus, deckBonus, llBonus, rarityBonus,
    baseScore,
    regMult, absMult,
    finalScore,
  };
}
