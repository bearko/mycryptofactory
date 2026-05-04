/**
 * factory-market.js — マーケット master データ + ヘルパー (Phase 1D-3)
 *
 * Phase 1D-3 (本 PR) スコープ:
 *  - ヒーロー雇用 5 プラン (ノービス/ドラエグ/ベビドラ/ブルドラ/レッドラ)
 *  - 採用担当者の最低レアリティ + 候補数 + 採用確率重み
 *  - 1 ヶ月待機 → 候補リスト → 1 名雇用 (or 全員見送り)
 *  - ファクトリーレベル → 雇用上限テーブル
 *
 * Out of scope (PR-10 以降):
 *  - エクステンション販売 (マーケット出品 / オークション)
 *  - ファクトリーレベル up フロー (現状 Lv.1 固定)
 */

import { HERO_ROSTER } from "./heroes.js";

/** 雇用プラン定義。
 *
 *  rarityWeights: そのプランで採用候補が出る rarity ごとの確率重み。
 *    weight が 0 のレアリティはそのプランでは絶対に出ない。
 *  recruiterMinRarity: 採用担当者として配属できる最低レアリティ。
 *  candidateCount: そのプランで生成される候補の人数。
 *  cost: プラン利用料 (GUM)。
 */
export const HIRE_PLANS = [
  {
    id: "novice",
    nameJa: "ノービスプラン",
    nameEn: "Novice Plan",
    rarityWeights: { common: 1.0, uncommon: 0, rare: 0, epic: 0, legendary: 0 },
    recruiterMinRarity: "common",
    candidateCount: 3,
    cost: 200,
    descJa: "Common ヒーローのみ採用可能。新人募集の入門プラン。",
    descEn: "Common only. The entry plan for new heroes.",
  },
  {
    id: "draeg",
    nameJa: "ドラエグプラン",
    nameEn: "Dra Egg Plan",
    rarityWeights: { common: 0, uncommon: 0.85, rare: 0.15, epic: 0, legendary: 0 },
    recruiterMinRarity: "uncommon",
    candidateCount: 5,
    cost: 600,
    descJa: "Uncommon 多め。たまに Rare が混じる。",
    descEn: "Mostly Uncommon, with the rare Rare candidate.",
  },
  {
    id: "babydra",
    nameJa: "ベビドラプラン",
    nameEn: "Baby Dragon Plan",
    rarityWeights: { common: 0, uncommon: 0, rare: 0.85, epic: 0.15, legendary: 0 },
    recruiterMinRarity: "rare",
    candidateCount: 7,
    cost: 1500,
    descJa: "Rare 多め。たまに Epic が混じる。",
    descEn: "Mostly Rare, with the rare Epic candidate.",
  },
  {
    id: "buldra",
    nameJa: "ブルドラプラン",
    nameEn: "Blue Dragon Plan",
    rarityWeights: { common: 0, uncommon: 0, rare: 0, epic: 0.85, legendary: 0.15 },
    recruiterMinRarity: "epic",
    candidateCount: 8,
    cost: 4000,
    descJa: "Epic 多め。たまに Legendary が混じる。",
    descEn: "Mostly Epic, with the rare Legendary candidate.",
  },
  {
    id: "reddra",
    nameJa: "レッドラプラン",
    nameEn: "Red Dragon Plan",
    rarityWeights: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 1.0 },
    recruiterMinRarity: "legendary",
    candidateCount: 4,
    cost: 12000,
    descJa: "Legendary のみ。最高峰のヒーロー候補が並ぶ。",
    descEn: "Legendary only — the top-tier candidates.",
  },
];

export const PLAN_BY_ID = {};
for (const p of HIRE_PLANS) PLAN_BY_ID[p.id] = p;

/** rarity の rank 値 (比較用) */
const RARITY_RANK = {
  common:    1,
  uncommon:  2,
  rare:      3,
  epic:      4,
  legendary: 5,
};

/** 該当ヒーローがプランの recruiter 要件 (min rarity) を満たすか */
export function canBeRecruiter(hero, plan) {
  if (!hero || !plan) return false;
  const need = RARITY_RANK[plan.recruiterMinRarity] || 1;
  const got  = RARITY_RANK[hero.rarity] || 0;
  return got >= need;
}

/** ファクトリーレベルごとの所有上限 (ユーザー指定) */
export const HERO_CAP_BY_FACTORY_LEVEL = {
  1: 7,
  2: 9,
  3: 11,
  4: 12,
  5: 15,
};

/** Factory Lv の上限を返す (未定義は 1) */
export function heroCapAtFactoryLevel(level) {
  return HERO_CAP_BY_FACTORY_LEVEL[level] || HERO_CAP_BY_FACTORY_LEVEL[1];
}

/** 待機時間 (週) ─ ユーザー仕様: プラン利用後 1 か月 */
export const HIRE_WAIT_WEEKS = 4;

/**
 * プランの rarityWeights に基づき、HERO_ROSTER の中で「未所有」の
 * ヒーローからランダムに candidateCount 名抽選する。
 *
 * @param {object} plan       HIRE_PLANS の 1 つ
 * @param {Set<number>} ownedIds  既に所有している heroId の集合
 * @param {() => number} [rng]
 * @returns {Array<{ heroId: number, nameJa: string, rarity: string }>}
 */
export function rollHireCandidates(plan, ownedIds, rng = Math.random) {
  // 各 rarity ごとに候補プールを構築
  const poolByRarity = {};
  for (const r of Object.keys(plan.rarityWeights)) poolByRarity[r] = [];
  for (const h of HERO_ROSTER) {
    if (ownedIds.has(h.heroId)) continue;
    if (poolByRarity[h.rarity]) poolByRarity[h.rarity].push(h);
  }
  // weights を normalize
  const rarities = Object.keys(plan.rarityWeights).filter(r => plan.rarityWeights[r] > 0);
  const totalW = rarities.reduce((s, r) => s + plan.rarityWeights[r], 0);
  if (totalW <= 0) return [];

  const out = [];
  const usedIds = new Set();
  let attempts = 0;
  while (out.length < plan.candidateCount && attempts < plan.candidateCount * 8) {
    attempts++;
    // rarity 抽選
    let r = rng() * totalW;
    let pickedR = rarities[0];
    for (const rr of rarities) {
      r -= plan.rarityWeights[rr];
      if (r <= 0) { pickedR = rr; break; }
    }
    const pool = poolByRarity[pickedR];
    if (!pool || pool.length === 0) {
      // 該当 rarity 在庫切れ → 別 rarity に fallback
      // (重み変更せず再ロール)
      continue;
    }
    // pool から 1 名抽選 (重複避け)
    const idx = Math.floor(rng() * pool.length);
    const cand = pool[idx];
    if (usedIds.has(cand.heroId)) continue;
    usedIds.add(cand.heroId);
    out.push({ heroId: cand.heroId, nameJa: cand.nameJa, rarity: cand.rarity });
  }
  return out;
}
