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

/** ─── 出品 (Phase 1D-4) ─────────────────────────────────────────── */

/** マーケット出品の 3 速度オプション */
export const SALE_SPEED_OPTIONS = [
  {
    id: "fast",
    nameJa: "速度重視",
    nameEn: "Quick sell",
    weeks: 1,
    priceMultiplier: 0.85,   // 相場の 85% で売れる
    descJa: "多少安くても早く売りたい (約 1 週)",
    descEn: "Sell fast, even at a discount (~1 wk)",
  },
  {
    id: "standard",
    nameJa: "相場に合わせる",
    nameEn: "Standard",
    weeks: 4,
    priceMultiplier: 1.0,
    descJa: "標準的なペース (約 1 ヶ月)",
    descEn: "Standard pace (~1 month)",
  },
  {
    id: "premium",
    nameJa: "価格重視",
    nameEn: "Hold for price",
    weeks: 8,
    priceMultiplier: 1.20,
    descJa: "じっくり見定めて高めで売る (約 2 ヶ月)",
    descEn: "Hold out for a higher price (~2 months)",
  },
];
export const SALE_SPEED_BY_ID = {};
for (const s of SALE_SPEED_OPTIONS) SALE_SPEED_BY_ID[s.id] = s;

/** マーケット手数料 (成約時に GUM から控除する割合) */
export const MARKET_FEE_RATE = 0.10;

/** rarity ごとの基準売却価格 (GUM)。査定 tier で更にスケールする。
 *  Phase 1D-36: GUM 投資 (= 工房レベルアップ / ヒーローランクアップ) のリターンを
 *  確保するため、 Uncommon 以上の売却額を大きく引き上げ。 1 週あたりの収益:
 *    Common 22.5 / Uncommon 50.6 / Rare 112.5 / Epic 225 / Legendary 562.5 (= fine 査定基準)
 *  これにより工房 Lv up のコストを 1〜2 個の高 rarity 売却で回収できるようになる。 */
const BASE_PRICE_BY_RARITY = {
  common:      300,   // 22.5 GUM/wk @ fine
  uncommon:    900,   // 50.6 GUM/wk (旧 600 → 900、 +50%)
  rare:       3000,   // 112.5 GUM/wk (旧 1,200 → 3,000、 +150%)
  epic:       9000,   // 225 GUM/wk (旧 3,000 → 9,000、 +200%)
  legendary: 30000,   // 562.5 GUM/wk (旧 8,000 → 30,000、 +275%)
};

/** 査定 tier ごとの価格倍率
 *  Phase 1D-36: great / masterpiece の伸びを大きくし、 ヒーローランクアップの
 *  リターン (= 高 tier ヒット率向上) が金額として明確に効くように調整。
 *  Phase 1D-39: 傑作 (masterpiece) を更に ×1.2 し、 究極品質に振り切ったときの
 *  リターンを際立たせる (2.20 → 2.65)。 */
const TIER_MULTIPLIER = {
  poor:        0.55,  // unchanged
  decent:      0.80,  // unchanged
  fine:        1.00,  // unchanged
  great:       1.45,  // unchanged from 1D-36
  masterpiece: 2.65,  // 1D-36: 1.80 → 2.20、 1D-39: 2.20 → 2.65 (= ×1.2 buff)
};

/**
 * 出品 ext の期待売却価格 (GUM) を計算する。
 *
 * 計算式:
 *   base × tier × speedMultiplier × seller_boost
 *
 *   base: rarity の標準価格
 *   tier: 査定 tier (poor〜masterpiece)
 *   speedMultiplier: 出品速度 (fast 0.85 / standard 1.00 / premium 1.20)
 *   seller_boost: 担当者が「商」属性持ちなら 1.10 倍 (= +10%)
 *
 * @param {object} warehouseItem  state.warehouse の 1 要素
 * @param {object} ext            extensions.json の 1 要素
 * @param {string} speedId        SALE_SPEED_OPTIONS の id
 * @param {object} seller         出品担当ヒーロー (factory hero) | null
 */
export function estimateSalePrice(warehouseItem, ext, speedId, seller) {
  const base = BASE_PRICE_BY_RARITY[ext?.rarity] || 300;
  const tier = warehouseItem?.appraisal?.tier || "fine";
  const tierMul = TIER_MULTIPLIER[tier] || 1.0;
  const speed   = SALE_SPEED_BY_ID[speedId] || SALE_SPEED_OPTIONS[1];
  const boost   = seller && Array.isArray(seller.attributes) && seller.attributes.includes("sho") ? 1.10 : 1.0;
  const gross   = base * tierMul * speed.priceMultiplier * boost;
  // 手数料控除前 (= 表示用); 純収益は別途計算
  return Math.round(gross);
}

/** 純収益 (= gross × (1 - 手数料率)) */
export function netSaleRevenue(gross) {
  return Math.round(gross * (1 - MARKET_FEE_RATE));
}

/** 担当者の rarity 要件チェック。
 *  原則 ext と同等以上の rarity が必要だが、「商」属性持ちは任意 OK。 */
export function canSellExt(seller, ext) {
  if (!seller) return false;
  if (Array.isArray(seller.attributes) && seller.attributes.includes("sho")) return true;
  const RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
  return (RANK[seller.rarity] || 0) >= (RANK[ext?.rarity] || 0);
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

/** Phase 1D-7: 1 名の雇用契約金 (rarity 別)。
 *  プラン費用は候補生成のための先行投資、こちらは候補ごとに個別契約
 *  するための一時金。ノービス系 (Common) ほど安い。 */
export const HIRE_COST_BY_RARITY = {
  common:    100,
  uncommon:  300,
  rare:      800,
  epic:     2500,
  legendary: 8000,
};

export function hireCostFor(hero) {
  const r = hero?.rarity || "common";
  return HIRE_COST_BY_RARITY[r] || HIRE_COST_BY_RARITY.common;
}

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
