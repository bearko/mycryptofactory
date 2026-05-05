/**
 * factory-craft.js — エクステンション + クラフト関連の純粋ロジック
 *
 * - data/extensions.json を fetch して EXTENSIONS にロード
 * - 各 ext のレシピ (必要素材 2 normal + 1 land) を ext.id から決定的に生成
 *   (= データに recipe フィールドがないため、id を seed にした deterministic pick)
 * - クラフト所要時間 (週単位) を rarity + チームレベルから計算
 *
 * Phase 1B では Common のみを扱う。
 */

import {
  NORMAL_MATERIAL_IDS,
  LAND_MATERIAL_IDS,
} from "./factory-material.js";
import { GARUDA_WEIGHT } from "./factory-hero.js";

/** 全エクステ定義 (loadExtensions() 後に populated) */
export const EXTENSIONS = [];
/** id ルックアップ */
export const EXTENSION_BY_ID = {};

let _loadingPromise = null;

export function loadExtensions() {
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = fetch("./data/extensions.json")
    .then(r => {
      if (!r.ok) throw new Error(`extensions.json fetch failed: ${r.status}`);
      return r.json();
    })
    .then(arr => {
      EXTENSIONS.length = 0;
      for (const e of arr) {
        EXTENSIONS.push(e);
        EXTENSION_BY_ID[String(e.extId)] = e;
      }
      return EXTENSIONS;
    });
  return _loadingPromise;
}

/** ext.params を 4 元素値に変換。HP→garuda / PHY→ifrit / INT→leviathan / AGI→tiamat。
 *  ガルーダ (HP) は他パラメータと比べて 6 倍程度大きいので、ヒーロー側 craft 値と
 *  整合させるため GARUDA_WEIGHT (= 1/6) で割って返す (Phase 1B 改修)。 */
export function extElementTargets(ext) {
  const p = ext.params || {};
  return {
    garuda:    Math.round((p.hp  || 0) * GARUDA_WEIGHT),
    ifrit:     p.phy || 0,
    leviathan: p.int || 0,
    tiamat:    p.agi || 0,
  };
}

/** ext.id を seed にした deterministic な疑似乱数 (0..1)。
 *  小規模な hash で十分なので xorshift32-ish。 */
function seededRand(seed, salt) {
  let x = (seed * 2654435761 ^ salt * 1597334677) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17; x >>>= 0;
  x ^= x << 5;  x >>>= 0;
  return x / 0xFFFFFFFF;
}

function pickNFromList(list, n, seed, saltBase) {
  const pool = list.slice();
  const out = [];
  for (let k = 0; k < n && pool.length > 0; k++) {
    const idx = Math.floor(seededRand(seed, saltBase + k) * pool.length) % pool.length;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** ext.id ベースで「通常素材 2 種 + ランド素材 1 種」を deterministic 生成。
 *  必要量はパラメータ合計 (HP+PHY+INT+AGI) を素材数で割って ceil。
 *  Phase 1B では rarity=Common のみ想定。
 *
 * @returns {Array<{ id: string, qty: number }>}
 */
export function recipeFor(ext) {
  if (!ext) return [];
  const seed = ext.extId || 0;
  const normals = pickNFromList(NORMAL_MATERIAL_IDS, 2, seed, 100);
  const land    = pickNFromList(LAND_MATERIAL_IDS,   1, seed, 200);
  // 必要量はざっくり: ext のパラメータ合計を 30 で割って ceil (1 以上)
  const sum = (ext.params?.hp ?? 0) + (ext.params?.phy ?? 0) +
              (ext.params?.int ?? 0) + (ext.params?.agi ?? 0);
  const baseQty = Math.max(1, Math.ceil(sum / 30));
  // 通常素材を多め、ランドを 1 個固定
  return [
    { id: normals[0], qty: baseQty },
    { id: normals[1], qty: Math.max(1, Math.ceil(baseQty / 2)) },
    { id: land[0],    qty: 1 },
  ];
}

/** rarity ごとのデフォルト所要週数 (1 月 = 4 週として、Common = 3 ヶ月 = 12 週) */
export const DEFAULT_DURATION_WEEKS = {
  common:    12,
  uncommon:  16,
  rare:      24,
  epic:      36,
  legendary: 48,
};

/** Phase 1D-22: 工房レベルごとに作れる最大 rarity (= レアリティゲート)
 *  Lv 1 → Common のみ
 *  Lv 2 → + Uncommon
 *  Lv 3 → + Rare
 *  Lv 4 → + Epic
 *  Lv 5 → + Legendary
 */
const RARITY_RANK_FOR_GATE = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
export function maxRarityForFactoryLevel(factoryLevel) {
  if (factoryLevel >= 5) return "legendary";
  if (factoryLevel >= 4) return "epic";
  if (factoryLevel >= 3) return "rare";
  if (factoryLevel >= 2) return "uncommon";
  return "common";
}
export function rarityAllowedAtFactoryLevel(rarity, factoryLevel) {
  const max = maxRarityForFactoryLevel(factoryLevel);
  return (RARITY_RANK_FOR_GATE[(rarity || "").toLowerCase()] || 1)
       <= (RARITY_RANK_FOR_GATE[max] || 1);
}

/** 全エクステからシリーズ名 → ext[] のマップを構築する。
 *  EXTENSIONS が load 済みなら呼び出すたびに最新になる。 */
export function extsBySeries() {
  const map = {};
  for (const e of EXTENSIONS) {
    const s = e.series || "";
    if (!map[s]) map[s] = [];
    map[s].push(e);
  }
  return map;
}

/** Phase 1D-22: 「シリーズが解放済み + 工房 Lv で許可された rarity」かを返す。
 *  クラフト選択画面はこの関数で対象 ext をフィルタする。
 *
 *  @param {object} ext
 *  @param {Set<string>} unlockedSeries
 *  @param {number} factoryLevel
 *  @returns {boolean}
 */
export function isExtUnlocked(ext, unlockedSeries, factoryLevel) {
  if (!ext) return false;
  if (!(unlockedSeries instanceof Set)) return false;
  if (!unlockedSeries.has(ext.series)) return false;
  return rarityAllowedAtFactoryLevel(ext.rarity, factoryLevel || 1);
}

/** 「未取得シリーズ」のリスト (= レシピドロップの抽選母集団) を返す。 */
export function lockedSeriesList(unlockedSeries) {
  const seen = new Set();
  const out = [];
  for (const e of EXTENSIONS) {
    const s = e.series || "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    if (!(unlockedSeries instanceof Set) || !unlockedSeries.has(s)) out.push(s);
  }
  return out;
}

/**
 * 所要時間 (週) を rarity + チームのクラフトレベル合計から計算。
 * クラフトレベルが高いほど短縮。最大 50% 短縮まで。
 *
 * - Common デフォルト: 12 週
 * - チームクラフトレベル合計が 1000 で 50% 短縮 (フロアあり)
 *
 * @param {object} ext             ext entry from extensions.json
 * @param {Array<object>} team     factory hero objects (filled or null)
 * @returns {number} 推定週数 (>= 1)
 */
export function estimateDurationWeeks(ext, team) {
  const base = DEFAULT_DURATION_WEEKS[ext?.rarity] || 12;
  if (!Array.isArray(team)) return base;
  // ガルーダ GARUDA_WEIGHT 重みでチーム合計 craftLevel を取得
  const total = teamCraftLevelTotal(team);
  // 0 → 1.0 倍、1000 → 0.5 倍、それ以上は 0.5 倍で頭打ち
  const speedup = Math.min(0.5, total / 2000);
  return Math.max(1, Math.ceil(base * (1 - speedup)));
}

/** ext のアイコン URL (MCH master の image_file_path 規約に従う) */
export function extIconUrl(extId) {
  return `https://raw.githubusercontent.com/bearko/mycryptoheroes/main/Image/Extensions/${extId}.png`;
}

/** 並び替え用比較関数: extId の昇順 (≒ 古いノービス系から並ぶ) */
export function sortByIdAsc(a, b) { return a.extId - b.extId; }

/** 並び替え: 必要パラメータ合計の昇順 (= 簡単なやつから) */
export function sortBySumAsc(a, b) {
  const sa = (a.params?.hp || 0) + (a.params?.phy || 0) + (a.params?.int || 0) + (a.params?.agi || 0);
  const sb = (b.params?.hp || 0) + (b.params?.phy || 0) + (b.params?.int || 0) + (b.params?.agi || 0);
  return sa - sb;
}

/** ext.params 合計値を返す (HP × GARUDA_WEIGHT + PHY + INT + AGI)。
 *  ガルーダ (HP) は他パラメータと比べて大きいので GARUDA_WEIGHT で集計し、
 *  クラフトLv 要件 / sort などの比較が公平になるよう揃える。 */
export function paramSum(ext) {
  const p = ext?.params || {};
  return Math.round(
    (p.hp || 0) * GARUDA_WEIGHT +
    (p.phy || 0) +
    (p.int || 0) +
    (p.agi || 0)
  );
}

/** クラフトに必要なチームのクラフトレベル下限 (ext のパラメータ合計 × 0.5)。
 *  チームの craftLevel 合計がこれ以上ならレベル要件 OK。 */
export function craftLevelRequiredFor(ext) {
  return Math.ceil(paramSum(ext) * 0.5);
}

/** チームの craftLevel 合計を計算する。null スロットは 0 として扱う。
 *  - ガルーダ (HP) は GARUDA_WEIGHT の重みで集計 (paramSum と整合)
 *  - 「工」属性を持つヒーローは 1.5 倍ブースト (Phase 1D-1) */
export function teamCraftLevelTotal(team) {
  if (!Array.isArray(team)) return 0;
  let total = 0;
  for (const h of team) {
    if (!h || !h.element) continue;
    const base = (h.element.garuda || 0) * GARUDA_WEIGHT +
                 (h.element.ifrit || 0) +
                 (h.element.leviathan || 0) +
                 (h.element.tiamat || 0);
    const ko = Array.isArray(h.attributes) && h.attributes.includes("ko") ? 1.5 : 1.0;
    total += base * ko;
  }
  return Math.round(total);
}

/** recipe を満たすために、現在の inventory で何個ずつ素材が足りないかを返す。
 *  足りていれば 0、不足分は正の整数。
 *  @returns {Record<string, number>}  例: { iron: 0, copper: 2, amethyst: 0 }
 */
export function materialShortageFor(recipe, inventory) {
  const out = {};
  if (!Array.isArray(recipe)) return out;
  for (const m of recipe) {
    const have = (inventory && inventory[m.id]) || 0;
    out[m.id] = Math.max(0, (m.qty || 0) - have);
  }
  return out;
}

/**
 * クラフト可否を判定する。
 *
 * @param {object} ext         extensions.json のエントリ
 * @param {Array<object|null>} team  factory hero objects (filled or null)
 * @param {Record<string, number>} inventory  state.materials
 * @returns {{
 *   status: "ok" | "level" | "material",
 *   levelOk: boolean,
 *   materialOk: boolean,
 *   shortage: Record<string, number>,
 *   totalShortage: number,
 *   requiredLevel: number,
 *   teamLevel: number,
 * }}
 *
 * 優先度:
 *   1. material が不足 → status: "material" (赤字表示が必要)
 *   2. craft level 不足 → status: "level" (黄ラベル)
 *   3. 両方 OK → status: "ok" (緑ラベル)
 */
export function craftAvailability(ext, team, inventory) {
  const requiredLevel = craftLevelRequiredFor(ext);
  const teamLevel = teamCraftLevelTotal(team);
  const levelOk = teamLevel >= requiredLevel;
  const recipe = recipeFor(ext);
  const shortage = materialShortageFor(recipe, inventory);
  const totalShortage = Object.values(shortage).reduce((s, v) => s + v, 0);
  const materialOk = totalShortage === 0;
  let status = "ok";
  if (!materialOk) status = "material";
  else if (!levelOk) status = "level";
  return { status, levelOk, materialOk, shortage, totalShortage, requiredLevel, teamLevel };
}

/** rarity のランク (sort 用)。高い rarity ほど大きい数値。 */
const RARITY_RANK = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
function rarityRank(ext) { return RARITY_RANK[(ext?.rarity || "").toLowerCase()] || 0; }

/**
 * 「クラフト可能順」並び替え。
 *
 * Tier 1: totalShortage 昇順 (素材が足りているものを優先 = 0 が先頭)
 * Tier 2: rarity 降順 (作れるものの中では高レアリティを上に)
 * Tier 3: extId 昇順 (シリーズ若い順)
 *
 * 注: team / inventory に依存するので、クロージャで返す。
 */
export function sortByCraftability(team, inventory) {
  return (a, b) => {
    const sa = craftAvailability(a, team, inventory).totalShortage;
    const sb = craftAvailability(b, team, inventory).totalShortage;
    if (sa !== sb) return sa - sb;
    const ra = rarityRank(a), rb = rarityRank(b);
    if (ra !== rb) return rb - ra;
    return a.extId - b.extId;
  };
}
