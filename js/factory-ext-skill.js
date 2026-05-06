/**
 * factory-ext-skill.js — エクステンションのシリーズ共通スキル (Phase 2A)
 *
 * 設計詳細: docs/ext-skill-design.md
 *
 * - 各 ext は params の最大値で「カテゴリ」 (HP/PHY/INT/AGI) が決まる
 * - シリーズ単位で「アーキタイプ」が割り当てられ、 そのアーキタイプの効果が
 *   ext のスキルとなる
 * - レアリティで効果値スケール (Common 1.0 / Uncommon 1.4 / Rare 2.0 /
 *   Epic 3.0 / Legendary 4.5)
 * - 倉庫の全 ext から効果を集計 (= 同種は平方根スタッキング)
 *
 * デュエルでの装備効果は別仕様 (本モジュールは applicableInDuel: false)。
 */

import { GARUDA_WEIGHT } from "./factory-hero.js";

/** ext.params の最大値 (HP は GARUDA_WEIGHT 補正) でカテゴリを判定 */
export function dominantPower(ext) {
  const p = ext?.params || {};
  const adj = {
    hp:  (p.hp  || 0) * GARUDA_WEIGHT,
    phy: p.phy || 0,
    int: p.int || 0,
    agi: p.agi || 0,
  };
  let key = "phy", max = adj.phy;
  for (const k of ["hp", "int", "agi"]) {
    if (adj[k] > max) { key = k; max = adj[k]; }
  }
  return key;  // "hp" | "phy" | "int" | "agi"
}

/** カテゴリ → 表示用ラベルキー (i18n) */
export const CATEGORY_LABEL_KEY = {
  hp:  "skill.cat.hp",
  phy: "skill.cat.phy",
  int: "skill.cat.int",
  agi: "skill.cat.agi",
};

/** rarity 倍率 */
export const RARITY_SCALE = {
  common: 1.0, uncommon: 1.4, rare: 2.0, epic: 3.0, legendary: 4.5,
};

/** 効果定義 (= type → { label key, base value, cap, applicable } )
 *  - base は Common 基準。 effective value = base × RARITY_SCALE[rarity]
 *  - cap は集計後の % 上限 (= aggregateEffectsFromResolved で適用)。 倉庫を
 *    ストックしすぎても OP にならないようにする。
 *  - シミュレーション結果 (tools/sim/skill-balance.mjs) で調整済み。 */
export const EFFECT_DEFS = {
  staminaDecaySlow:  { labelKey: "skill.eff.staminaDecaySlow",  base: 3,  cap: 40, fmt: "pct", applicableInDuel: false },
  restTimeShort:     { labelKey: "skill.eff.restTimeShort",     base: 3,  cap: 40, fmt: "pct", applicableInDuel: false },
  questLvBoost:      { labelKey: "skill.eff.questLvBoost",      base: 3,  cap: 30, fmt: "pct", applicableInDuel: false },
  matYieldBoost:     { labelKey: "skill.eff.matYieldBoost",     base: 4,  cap: 40, fmt: "pct", applicableInDuel: false },
  recipeRateBoost:   { labelKey: "skill.eff.recipeRateBoost",   base: 4,  cap: 50, fmt: "pct", applicableInDuel: false },
  rareMatBoost:      { labelKey: "skill.eff.rareMatBoost",      base: 5,  cap: 40, fmt: "pct", applicableInDuel: false, minRarity: "rare" },
  craftLvBoost:      { labelKey: "skill.eff.craftLvBoost",      base: 3,  cap: 40, fmt: "pct", applicableInDuel: false },
  matCostReduce:     { labelKey: "skill.eff.matCostReduce",     base: 3,  cap: 40, fmt: "pct", applicableInDuel: false },
  hireSpeedBoost:    { labelKey: "skill.eff.hireSpeedBoost",    base: 4,  cap: 50, fmt: "pct", applicableInDuel: false },
  hireRareBoost:     { labelKey: "skill.eff.hireRareBoost",     base: 3,  cap: 25, fmt: "pct", applicableInDuel: false },
  tradePriceBoost:   { labelKey: "skill.eff.tradePriceBoost",   base: 4,  cap: 40, fmt: "pct", applicableInDuel: false },
  tradeSpeedBoost:   { labelKey: "skill.eff.tradeSpeedBoost",   base: 4,  cap: 50, fmt: "pct", applicableInDuel: false },
};

/** アーキタイプ定義 (= 効果セット)。値は base 比率で、 後で rarity scale が乗算される。 */
export const ARCHETYPES = {
  // HP 系 (= 8 シリーズ)
  "hp-stamina":      { category: "hp",  effects: [{ type: "staminaDecaySlow", weight: 1.0 }] },
  "hp-rest":         { category: "hp",  effects: [{ type: "restTimeShort", weight: 1.0 }, { type: "staminaDecaySlow", weight: 0.5 }] },
  // PHY 系 (= 83 シリーズ)
  "phy-quest-lv":    { category: "phy", effects: [{ type: "questLvBoost", weight: 1.0 }] },
  "phy-mat-yield":   { category: "phy", effects: [{ type: "matYieldBoost", weight: 1.0 }] },
  "phy-recipe":      { category: "phy", effects: [{ type: "recipeRateBoost", weight: 1.0 }] },
  "phy-rare-mat":    { category: "phy", effects: [{ type: "rareMatBoost", weight: 1.0 }] },
  "phy-mixed":       { category: "phy", effects: [{ type: "questLvBoost", weight: 0.6 }, { type: "matYieldBoost", weight: 0.6 }] },
  // INT 系 (= 60 シリーズ)
  "int-craft-lv":    { category: "int", effects: [{ type: "craftLvBoost", weight: 1.0 }] },
  "int-mat-cost":    { category: "int", effects: [{ type: "matCostReduce", weight: 1.0 }] },
  "int-mixed":       { category: "int", effects: [{ type: "craftLvBoost", weight: 0.6 }, { type: "matCostReduce", weight: 0.6 }] },
  // AGI 系 (= 27 シリーズ)
  "agi-hire-speed":  { category: "agi", effects: [{ type: "hireSpeedBoost", weight: 1.0 }] },
  "agi-hire-rare":   { category: "agi", effects: [{ type: "hireRareBoost", weight: 1.0 }] },
  "agi-trade-price": { category: "agi", effects: [{ type: "tradePriceBoost", weight: 1.0 }] },
  "agi-trade-speed": { category: "agi", effects: [{ type: "tradeSpeedBoost", weight: 1.0 }] },
};

/** シリーズ → アーキタイプの静的マップ (Phase 2A 初期割当)。
 *  178 シリーズ全てを手動配置。 多様性確保のため PHY/INT 系は
 *  各アーキタイプにバランス良く分散。
 *  バランス調整は後続 PR でシミュレーションを回しながら行う。
 */
export const SERIES_ARCHETYPE_MAP = {
  // ── HP 系 (8 series) ──
  "アーマー": "hp-stamina",
  "ブーツ": "hp-stamina",
  "マンドラゴラ": "hp-stamina",
  "モアイ": "hp-stamina",
  "エレファント": "hp-rest",
  "アクアリウム": "hp-rest",
  "サモンボード": "hp-rest",
  "バイナンスチャリティメダル": "hp-rest",

  // ── PHY 系 (83 series) ──
  // phy-quest-lv (17): 戦闘的なシリーズを優先
  "ブレード": "phy-quest-lv",
  "カタナ": "phy-quest-lv",
  "アックス": "phy-quest-lv",
  "ハルバード": "phy-quest-lv",
  "クロススピア": "phy-quest-lv",
  "ジャベリン": "phy-quest-lv",
  "レイピア": "phy-quest-lv",
  "ハンマー": "phy-quest-lv",
  "メイス": "phy-quest-lv",
  "フレイル": "phy-quest-lv",
  "ウィップ": "phy-quest-lv",
  "シックル": "phy-quest-lv",
  "サイバーソード": "phy-quest-lv",
  "ツインブレード": "phy-quest-lv",
  "メリケンサック": "phy-quest-lv",
  "鋏": "phy-quest-lv",
  "魔法剣": "phy-quest-lv",

  // phy-mat-yield (17): 動物・植物・食べ物系
  "タイガー": "phy-mat-yield",
  "ブル": "phy-mat-yield",
  "タートル": "phy-mat-yield",
  "ライオン": "phy-mat-yield",
  "カエル": "phy-mat-yield",
  "ピエロ": "phy-mat-yield",
  "スコーピオン": "phy-mat-yield",
  "象蟲": "phy-mat-yield",
  "プテラノドン": "phy-mat-yield",
  "プレシオサウルス": "phy-mat-yield",
  "パキケファロサウルス": "phy-mat-yield",
  "りんご": "phy-mat-yield",
  "梨": "phy-mat-yield",
  "ライム": "phy-mat-yield",
  "タンジェリン": "phy-mat-yield",
  "セージ": "phy-mat-yield",
  "ハンバーガー": "phy-mat-yield",

  // phy-recipe (17): 楽器・芸術系 (= ひらめきシリーズ)
  "クラヴィア": "phy-recipe",
  "ドラム": "phy-recipe",
  "シタール": "phy-recipe",
  "マラカス": "phy-recipe",
  "マレット": "phy-recipe",
  "グラス": "phy-recipe",
  "スタッフ": "phy-recipe",
  "モノクル": "phy-recipe",
  "筆パレ": "phy-recipe",
  "リボン": "phy-recipe",
  "パロット": "phy-recipe",
  "Sweet Fluffy and chewy": "phy-recipe",
  "羽織": "phy-recipe",
  "サイバースタッフ": "phy-recipe",
  "プランツインセクト": "phy-recipe",
  "ジュエルワームドラゴン": "phy-recipe",
  "ジュエルドラゴン": "phy-recipe",

  // phy-rare-mat (16): メダル・ジュエル・特殊系
  //   注: クラウンは AGI 系 (= dominant power が AGI) のため除外
  "MCHメダル": "phy-rare-mat",
  "SDNメダル": "phy-rare-mat",
  "MCSメダル": "phy-rare-mat",
  "ETHEREMON": "phy-rare-mat",
  "ルビー": "phy-rare-mat",
  "グラファイト": "phy-rare-mat",
  "シールドシステム": "phy-rare-mat",
  "観覧車": "phy-rare-mat",
  "合体ロボ": "phy-rare-mat",
  "帝国式魔導機甲兵": "phy-rare-mat",
  "ライドラゴン": "phy-rare-mat",
  "クロー": "phy-rare-mat",
  "ガントレット": "phy-rare-mat",
  "ナチュレゴーレム": "phy-rare-mat",
  "トラップ": "phy-rare-mat",
  "RYU.phy": "phy-rare-mat",  // 移動 (= phy-mixed → phy-rare-mat にしてバランス取り)

  // phy-mixed (16): 残り
  "シールド": "phy-mixed",
  "カブト": "phy-mixed",
  "ヨロイ": "phy-mixed",
  "マント": "phy-mixed",
  "ユミ": "phy-mixed",
  "シップ": "phy-mixed",
  "ステアリング": "phy-mixed",
  "グンバイ": "phy-mixed",
  "椅子": "phy-mixed",
  "ツノ": "phy-mixed",
  "いちごケーキ": "phy-mixed",
  "パンケーキ": "phy-mixed",
  "お寿司": "phy-mixed",
  "スワンボート": "phy-mixed",
  "日本人形": "phy-mixed",
  "キューティー": "phy-mixed",

  // ── INT 系 (60 series) ──
  // int-craft-lv (20): 知性的・道具系
  "マスケット": "int-craft-lv",
  "リボルバー": "int-craft-lv",
  "アルケブス": "int-craft-lv",
  "ハンドカノン": "int-craft-lv",
  "ボウガン": "int-craft-lv",
  "レーザーガン": "int-craft-lv",
  "ペン": "int-craft-lv",
  "ブック": "int-craft-lv",
  "リソグラフィ": "int-craft-lv",
  "コンパス": "int-craft-lv",
  "天体模型": "int-craft-lv",
  "液浸標本": "int-craft-lv",
  "オルゴール": "int-craft-lv",
  "ノード・ドール": "int-craft-lv",
  "ドールハウス": "int-craft-lv",
  "RYU.int": "int-craft-lv",
  "ボンネット": "int-craft-lv",
  "傘": "int-craft-lv",
  "ハット": "int-craft-lv",
  "サイハイ": "int-craft-lv",

  // int-mat-cost (20): 魔法・神秘系
  "ワンド": "int-mat-cost",
  "スクロール": "int-mat-cost",
  "リング": "int-mat-cost",
  "オフダ": "int-mat-cost",
  "鏡": "int-mat-cost",
  "ホーキ": "int-mat-cost",
  "タリスマン": "int-mat-cost",
  "マジックカード": "int-mat-cost",
  "魔法少女ステッキ&ブローチ": "int-mat-cost",
  "ギョク": "int-mat-cost",
  "クリプトスペルズ": "int-mat-cost",
  "妖精": "int-mat-cost",
  "ペガサス": "int-mat-cost",
  "ドラゴン": "int-mat-cost",
  "ドッグ": "int-mat-cost",
  "モンキー": "int-mat-cost",
  "スカル": "int-mat-cost",
  "ランタン": "int-mat-cost",
  "猫じゃらし": "int-mat-cost",
  "センス": "int-mat-cost",

  // int-mixed (20): 残り
  "ハープ": "int-mixed",
  "ニコ": "int-mixed",
  "ブーメラン": "int-mixed",
  "チャクラム": "int-mixed",
  "ゴブレット": "int-mixed",
  "サケ": "int-mixed",
  "スイーツ": "int-mixed",
  "グレープ": "int-mixed",
  "ブルーベリー": "int-mixed",
  "ラーメン": "int-mixed",
  "お花見弁当": "int-mixed",
  "雪だるま": "int-mixed",
  "イカダ": "int-mixed",
  "二輪車": "int-mixed",
  "パンジャンドラム": "int-mixed",
  "バッタ": "int-mixed",
  "モス": "int-mixed",
  "ロンギスクアマ": "int-mixed",
  "ステゴサウルス": "int-mixed",
  "メガロドン": "int-mixed",

  // ── AGI 系 (27 series) ──
  // agi-hire-speed (7)
  "ホース": "agi-hire-speed",
  "ルースター": "agi-hire-speed",
  "スネーク": "agi-hire-speed",
  "ハチ": "agi-hire-speed",
  "蝶々": "agi-hire-speed",
  "リミュラス": "agi-hire-speed",
  "ビートル": "agi-hire-speed",

  // agi-hire-rare (7)
  "ネックレス": "agi-hire-rare",
  "クラウン": "agi-hire-rare",
  "ベルト": "agi-hire-rare",
  "懐中時計": "agi-hire-rare",
  "オリフラム": "agi-hire-rare",
  "ホルン": "agi-hire-rare",
  "ヴァイオリン": "agi-hire-rare",

  // agi-trade-price (7)
  "ストロベリー": "agi-trade-price",
  "ナイフ": "agi-trade-price",
  "フルート": "agi-trade-price",
  "盆栽": "agi-trade-price",
  "財布": "agi-trade-price",
  "宇宙船": "agi-trade-price",
  "アンモナイト": "agi-trade-price",

  // agi-trade-speed (6)
  "ティラノサウルス": "agi-trade-speed",
  "トリケラトプス": "agi-trade-speed",
  "ゴーレム": "agi-trade-speed",
  "パンダマシン": "agi-trade-speed",
  "手裏剣": "agi-trade-speed",
  "バードキメラ": "agi-trade-speed",
};

/** rarity ↔ rank の比較ヘルパー (minRarity チェック用) */
const RARITY_RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };

/** ext + 実効 rarity から「スキル発動効果一覧」を返す。
 *  打ち直し済みの ext は呼び出し側で rarityOverride を渡すこと。
 *
 *  @param {object} ext  extensions.json の 1 要素
 *  @param {string} [effectiveRarity]  打ち直し後 rarity / null なら ext.rarity
 *  @returns {{
 *    category: "hp"|"phy"|"int"|"agi",
 *    archetypeId: string,
 *    rarity: string,
 *    effects: Array<{ type: string, value: number, labelKey: string }>,
 *  } | null}
 */
export function resolveExtSkill(ext, effectiveRarity = null) {
  if (!ext) return null;
  const rarity = (effectiveRarity || ext.rarity || "common").toLowerCase();
  const series = ext.series || "";
  const archetypeId = SERIES_ARCHETYPE_MAP[series];
  // 未割当シリーズはカテゴリの mixed / 単独効果にフォールバック
  const fallbackByCat = {
    hp:  "hp-stamina",
    phy: "phy-mixed",
    int: "int-mixed",
    agi: "agi-trade-speed",
  };
  const cat = dominantPower(ext);
  const aId = archetypeId || fallbackByCat[cat];
  const arch = ARCHETYPES[aId];
  if (!arch) return null;
  const scale = RARITY_SCALE[rarity] || 1.0;
  const rRank = RARITY_RANK[rarity] || 1;
  const effects = [];
  for (const eff of arch.effects) {
    const def = EFFECT_DEFS[eff.type];
    if (!def) continue;
    // minRarity ガード (= 例: rareMatBoost は Rare 以上で発動)
    if (def.minRarity && rRank < (RARITY_RANK[def.minRarity] || 1)) continue;
    const value = Math.round(def.base * eff.weight * scale * 10) / 10; // 0.1 単位丸め
    effects.push({ type: eff.type, value, labelKey: def.labelKey });
  }
  return {
    category: arch.category,
    archetypeId: aId,
    rarity,
    effects,
  };
}

/** 倉庫の全 ext からアクティブ効果を集計。 平方根スタッキング。
 *
 *  @param {Array<object>} warehouse  state.warehouse 配列
 *  @returns {Record<string, number>}  { effectType: aggregatedPercentage }
 *
 *  例: questLvBoost を持つ ext が 5 個 → 上位値からスタッキングで合算
 */
export function aggregateActiveEffects(warehouse) {
  if (!Array.isArray(warehouse) || warehouse.length === 0) return {};
  // type → [values] (降順) を集める
  const byType = {};
  for (const w of warehouse) {
    if (!w) continue;
    // 倉庫アイテムは ext lookup が必要だが、 動的 import 回避のため
    //   呼び出し側で ext を解決済みの「resolved」 配列を渡せる API も用意
    // → 引数を「ext lookup function」で受け取る代わりに、 ここでは
    //   warehouse item に extId が入っている前提で、 lookup は呼び出し側で
    //   事前に解決して { ext, rarityOverride } を含む配列を渡す形 にする…
    // → ただし旧形式互換のため w.extId / w.rarityOverride をそのまま処理して、
    //   ext lookup は呼び出し側 helper に任せる API も提供する。
  }
  return byType;  // 実体は aggregateEffectsFromResolved に集約
}

/** 既に `resolveExtSkill` 済みの skills 配列から効果を集計。
 *  @param {Array<{effects: Array<{type, value}>}|null>} skills
 *  @returns {Record<string, number>}
 */
export function aggregateEffectsFromResolved(skills) {
  const byType = {};
  for (const sk of skills) {
    if (!sk) continue;
    for (const e of sk.effects) {
      if (!byType[e.type]) byType[e.type] = [];
      byType[e.type].push(e.value);
    }
  }
  const out = {};
  for (const [t, arr] of Object.entries(byType)) {
    arr.sort((a, b) => b - a);  // 降順
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
      total += arr[i] / Math.sqrt(i + 1);  // 1 位は 1.0 / 2 位は 1/√2 / 3 位は 1/√3 ...
    }
    // Phase 2A: 効果ごとの上限 (cap) を適用 (= 倉庫ストック乱用で OP 化を防止)
    const cap = EFFECT_DEFS[t]?.cap || 100;
    out[t] = Math.min(cap, Math.round(total * 10) / 10);
  }
  return out;
}

/** UI 表示用: 効果の短縮テキスト (i18n 経由) を返す。
 *  caller は ti18n を渡す必要あり (= ESM の循環避け)。
 *
 *  @param {{type, value}} effect
 *  @param {(key: string, fb?: string) => string} ti18n
 *  @returns {string}  例: "クエストLv +3.0%"
 */
export function formatEffectText(effect, ti18n) {
  const def = EFFECT_DEFS[effect.type];
  if (!def) return "";
  const lbl = ti18n(def.labelKey, effect.type);
  const sign = effect.value >= 0 ? "+" : "";
  return `${lbl} ${sign}${effect.value.toFixed(1)}%`;
}

/** ext に紐づくスキルのフル文字列 (複数効果は中点で連結)。
 *  Workshop / 倉庫 / 完成画面 で 1 行表示する用途。 */
export function formatSkillSummary(ext, ti18n, effectiveRarity = null) {
  const sk = resolveExtSkill(ext, effectiveRarity);
  if (!sk || sk.effects.length === 0) return "";
  return sk.effects.map(e => formatEffectText(e, ti18n)).join(" / ");
}
