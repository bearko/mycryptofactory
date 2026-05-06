/**
 * factory-hero.js — MCH ヒーロー → MyCryptoFactory モデルアダプタ
 *
 * 元の MCH パラメータ (hpMax / basePhy / baseInt / baseAgi) を、
 * 工房経営シムの 4 元素 (ガルーダ / イフリート / リヴァイアサン / ティアマト) に
 * マッピング。
 *
 *   hpMax    → garuda    (緑) — クラフトの「ガルーダ要素」を貯める速度
 *   basePhy  → ifrit     (赤) — 「イフリート要素」を貯める速度
 *   baseInt  → leviathan (青) — 「リヴァイアサン要素」を貯める速度
 *   baseAgi  → tiamat    (黄) — 「ティアマト要素」を貯める速度
 *
 * ガルーダ (= 元 HP) は特別: クラフトの貯まり速度 + ヒーローの体力 (stamina)
 * の両方を兼ねる。クラフト/クエスト中に 0 まで減ると休憩 (state="resting")、
 * max まで戻ると idle に復帰。
 */

import { HERO_ROSTER, HERO_DEFS } from "./heroes.js";
import { inferAttributes, attributeBoostFactor } from "./factory-attributes.js";

/** ヒーロー状態の enum 値 */
export const HERO_STATE = {
  IDLE:     "idle",
  CRAFTING: "crafting",
  QUESTING: "questing",
  RESTING:  "resting",
};

/** 元素 (要素) の id 一覧。色や i18n キーはここから派生。 */
export const ELEMENTS = ["garuda", "ifrit", "leviathan", "tiamat"];

/**
 * 1 体の MCH ヒーロー定義 → factory ヒーロー state を組み立てる。
 * 同 heroId を 2 度呼ぶと同じ id ベースで別 instance ができてしまうので、
 * 上位 (factory-state) で 1 ヒーロー = 1 instance を保証する。
 *
 * @param {object} mchHero  HERO_ROSTER の 1 要素
 * @returns {{
 *   heroId: number, nameJa: string, rarity: string,
 *   passiveKey: string|null, passiveName: string|null,
 *   element: { garuda: number, ifrit: number, leviathan: number, tiamat: number },
 *   stamina: { current: number, max: number },
 *   state:   "idle" | "crafting" | "questing" | "resting",
 *   assignment: { kind: "craft" | "quest" | null, slot: number | null },
 *   img: () => string,
 * }}
 */
export function makeFactoryHero(mchHero) {
  const garuda    = mchHero.hpMax    ?? 0;
  const ifrit     = mchHero.basePhy  ?? 0;
  const leviathan = mchHero.baseInt  ?? 0;
  const tiamat    = mchHero.baseAgi  ?? 0;
  const factoryHero = {
    heroId:      mchHero.heroId,
    nameJa:      mchHero.nameJa || "",
    rarity:      mchHero.rarity || "common",
    passiveKey:  mchHero.passiveKey  || null,
    passiveName: mchHero.passiveName || null,
    element: { garuda, ifrit, leviathan, tiamat },
    stamina: { current: garuda, max: garuda },
    state:   HERO_STATE.IDLE,
    assignment: { kind: null, slot: null },
    img: typeof mchHero.img === "function" ? mchHero.img : (() => ""),
    /** 士農工商属性 (Phase 1D-1)。inferAttributes で割り当てる。 */
    attributes: /** @type {string[]} */ ([]),
    /** Phase 1D-20: ランクアップ強化レベル (0..RANK_MAX、初期 0)。
     *  rankMultiplier(hero) で 4 元素値に倍率がかかる。 */
    rank: 0,
  };
  factoryHero.attributes = inferAttributes(factoryHero);
  return factoryHero;
}

/** Phase 1D-20: ランクアップ最大値 (= 5 段階) */
export const RANK_MAX = 5;

/** ランクアップによるクラフトパワー倍率。
 *  - Rank 0: 1.0
 *  - Rank 1: 1.4
 *  - Rank 2: 1.8 (= Common Rank2 が Uncommon 初期値相当)
 *  - Rank 3: 2.2
 *  - Rank 4: 2.6
 *  - Rank 5: 3.0
 */
export function rankMultiplier(hero) {
  const r = Math.max(0, Math.min(RANK_MAX, hero?.rank || 0));
  return 1 + 0.4 * r;
}

/** ランクアップに必要な GUM コスト。
 *  - 基本: 100 GUM × (現ランク + 1) — Rank0→1=100、Rank4→5=500
 *  - レアリティ倍率: Common 1x / Uncommon 2x / Rare 4x / Epic 8x / Legendary 12x
 *
 *  Phase 1D-36: Legendary 倍率を 16x → 12x に緩和。
 *    旧: Legendary 全段ランクアップ = 100 × 15 × 16 = 24,000 GUM
 *    新: 100 × 15 × 12 = 18,000 GUM (= Legendary 1 個売却 30,000 で十分回収)
 */
const RANK_RARITY_MULT = {
  common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 12,
};
export function rankUpCost(hero) {
  if (!hero) return Infinity;
  const cur = hero.rank || 0;
  if (cur >= RANK_MAX) return Infinity;
  const rarityMult = RANK_RARITY_MULT[hero.rarity] || 1;
  return 100 * (cur + 1) * rarityMult;
}

/** ガルーダ (HP) は他パラメータと比べて 6 倍程度大きいので、
 *  craftLevel / 進捗計算では 1/6 の重みで集計する。
 *  (Phase 1D-1 では 1/3 だったが、まだ他クラフト値の倍ほど大きいので 1/6 に再調整) */
export const GARUDA_WEIGHT = 1 / 6;

/** Phase 1D-43: レアリティごとのクラフト力係数。
 *  rank-0 状態では Common/Uncommon の素ステ差が小さく (avg 48 vs 50)、
 *  rarity 違いが工期に体感差として現れなかった。レアリティ自体に
 *  「クラフト熟練」係数を持たせて、同レアリティ rank-0 ×5 では
 *  自身のレアリティ ext を短縮できないが、一段下のレア ext は短縮できる
 *  バランスにする。 (REQUIRED_CRAFT_LV_BY_RARITY と対で再調整。)
 *
 *  - Common    1.0 (基準)
 *  - Uncommon  1.5
 *  - Rare      2.5
 *  - Epic      4.0
 *  - Legendary 6.0
 */
export const RARITY_CRAFT_MULT = {
  common:    1.0,
  uncommon:  1.5,
  rare:      2.5,
  epic:      4.0,
  legendary: 6.0,
};
export function rarityCraftMult(hero) {
  return RARITY_CRAFT_MULT[(hero?.rarity || "").toLowerCase()] || 1.0;
}

/** クラフトレベル = ガルーダ × 1/6 + 他 3 元素 の合計 (整数に丸め)。
 *  + 工 属性を持つヒーローは 1.5 倍ブースト (Phase 1D-1)。
 *  + Phase 1D-20: ランクアップ倍率 (rankMultiplier) を適用。
 *  + Phase 1D-43: レアリティ係数 (rarityCraftMult) を適用。 */
export function craftLevel(hero) {
  if (!hero || !hero.element) return 0;
  const e = hero.element;
  const base = (e.garuda || 0) * GARUDA_WEIGHT +
               (e.ifrit || 0) +
               (e.leviathan || 0) +
               (e.tiamat || 0);
  const boost = attributeBoostFactor(hero, "ko"); // 工 = クラフト
  const rankMult = rankMultiplier(hero);
  const rarMult  = rarityCraftMult(hero);
  return Math.round(base * boost * rankMult * rarMult);
}

/** ヒーロー個別の元素値を「クラフト用 (= ガルーダ × GARUDA_WEIGHT)」に変換した表示値。
 *  - 内部データ (hero.element) は MCH 由来の生値のまま保持し、
 *    UI 表示と集計のときだけ garuda を GARUDA_WEIGHT に圧縮する。
 *  - これにより 1 か所変更すれば全画面 (hero list / team summary / confirm) が揃う。
 *
 *  @param {object} hero
 *  @param {"garuda"|"ifrit"|"leviathan"|"tiamat"} key
 *  @returns {number} 整数化された表示値
 */
export function elementValueForCraft(hero, key) {
  if (!hero || !hero.element) return 0;
  const raw = hero.element[key] || 0;
  const adj = key === "garuda" ? Math.round(raw * GARUDA_WEIGHT) : raw;
  // Phase 1D-20: ランクアップ倍率
  return Math.round(adj * rankMultiplier(hero));
}

/** Stamina が max まで戻ったか。Resting → Idle 遷移判定に使う。 */
export function isFullyRested(hero) {
  if (!hero || !hero.stamina) return true;
  return (hero.stamina.current ?? 0) >= (hero.stamina.max ?? 0);
}

/** Stamina が 0 か (= 強制休憩入り) */
export function isExhausted(hero) {
  if (!hero || !hero.stamina) return false;
  return (hero.stamina.current ?? 0) <= 0;
}

/**
 * Stamina を delta だけ動かす (負値で消費、正値で回復)。
 * クラフト/クエスト中は負値 (per-tick decay)、休憩中は正値 (回復)。
 * 0 でクランプ + max で頭打ち。
 *
 * @returns {boolean} stamina が境界 (0 / max) に到達したか
 */
export function adjustStamina(hero, delta) {
  if (!hero || !hero.stamina) return false;
  const before = hero.stamina.current;
  hero.stamina.current = Math.max(0, Math.min(hero.stamina.max, before + delta));
  return (before > 0 && hero.stamina.current === 0) ||
         (before < hero.stamina.max && hero.stamina.current === hero.stamina.max);
}

/** すべてのヒーローを HERO_ROSTER から factory モデルに変換して配列で返す。
 *  Phase 1A では「全 ロスタ = 所持ヒーロー」と仮定。Phase 1B+ で gating 予定。 */
export function buildOwnedHeroes() {
  const out = [];
  for (const h of HERO_ROSTER) out.push(makeFactoryHero(h));
  return out;
}

/** 元素アイコンのファイル名解決。Image/Factory/elem-<key>.webp 形式。 */
export function elementIconUrl(elementKey) {
  return "./Image/Factory/elem-" + elementKey + ".webp";
}

/** ─── Phase 1B-2: per-tick craft simulation ──────────────────────── */

/** クラフト中ヒーロー 1 名の 1 tick あたり stamina 消費量 (≥2)。
 *  hpMax (= raw garuda) が大きいヒーローほど絶対値は減るが相対比は同等。 */
export function staminaDecayPerTick(hero) {
  const max = hero?.stamina?.max || 0;
  return Math.max(2, Math.ceil(max / 60));
}

/** 睡眠中 (= resting) の 1 tick あたり回復量。
 *  ユーザー仕様: 「消費の 5 倍の速さで回復」。 */
export function staminaRecoverPerTick(hero) {
  return staminaDecayPerTick(hero) * 5;
}

/**
 * 1 tick の中で 1 ヒーローが「どの 4 色の値をいくら獲得するか」をロール。
 *
 * 仕様 (ユーザー指定):
 *  - クラフトレベルが高いヒーローほど頻度高く獲得
 *  - パラメータの高い色ほど 1 回の獲得値が大きい
 *
 * モデル:
 *  - 獲得 chance = clamp(0.4 + craftLevel / 300, 0.4, 0.9)
 *  - 獲得時は element を per-element 値で重み付き抽選
 *  - 獲得値 = max(1, round(elementValue * 0.1))
 *
 * 睡眠中ヒーローが渡されたら null を返す (ロールしない)。
 *
 * @returns {{ element: string, value: number } | null}
 */
export function rollCraftGain(hero, rng = Math.random) {
  if (!hero || hero.state === HERO_STATE.RESTING) return null;
  // 4 元素値 (ガルーダは GARUDA_WEIGHT で補正後、現状 1/6)
  // Phase 1D-20: ランクアップ倍率を全要素に適用
  const rMult = rankMultiplier(hero);
  const vals = ELEMENTS.map(k => {
    const raw = hero.element?.[k] || 0;
    const adj = k === "garuda" ? Math.round(raw * GARUDA_WEIGHT) : raw;
    return Math.round(adj * rMult);
  });
  const cl = vals[0] + vals[1] + vals[2] + vals[3];
  const chance = Math.min(0.9, Math.max(0.4, 0.4 + cl / 300));
  if (rng() > chance) return null;
  const total = vals.reduce((s, v) => s + Math.max(1, v), 0);
  let r = rng() * total;
  let pickedIdx = 0;
  for (let i = 0; i < ELEMENTS.length; i++) {
    r -= Math.max(1, vals[i]);
    if (r <= 0) { pickedIdx = i; break; }
  }
  const elKey = ELEMENTS[pickedIdx];
  const gain  = Math.max(1, Math.round(vals[pickedIdx] * 0.1));
  return { element: elKey, value: gain };
}

/**
 * 1 tick で hero がパッシブを発動するか判定。
 *
 * Phase 1B-2 では簡易モデル:
 *  - hero.passiveName が無いヒーローは発動しない
 *  - 睡眠中は発動しない
 *  - 発動 chance = 4% / tick
 *  - 発動時は random element に元素値 × 0.15 (min 3) をボーナス
 *
 * @returns {{ passiveName: string, element: string, value: number } | null}
 */
export function rollPassiveTrigger(hero, rng = Math.random) {
  if (!hero || hero.state === HERO_STATE.RESTING) return null;
  if (!hero.passiveName) return null;
  if (rng() > 0.04) return null;
  const elKey = ELEMENTS[Math.floor(rng() * ELEMENTS.length)];
  const raw = hero.element?.[elKey] || 0;
  const adj = elKey === "garuda" ? Math.round(raw * GARUDA_WEIGHT) : raw;
  // Phase 1D-20: ランクアップ倍率
  const value = Math.max(3, Math.round(adj * 0.15 * rankMultiplier(hero)));
  return { passiveName: hero.passiveName, element: elKey, value };
}
