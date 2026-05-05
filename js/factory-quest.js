/**
 * factory-quest.js — クエスト master データ + 進行ロジック (Phase 1C scaffold)
 *
 * Phase 1C-1 (本 PR) のスコープ:
 *  - 通常 4 ノード × 3 難易度 (初級 / 中級 / 上級) = 12 クエスト
 *  - 各クエストは duration (週) + base questLevel + 主要 reward 素材 を持つ
 *  - 成功 / 失敗 を 1 回最終判定する簡易モデル (5 戦闘 → 95.5%^5 モデルは
 *    後続 PR で導入)
 *
 * Out of scope (後続 PR):
 *  - ランドノード 9 種 + ランドセクタ通行証
 *  - 5 戦闘 + レアエネミー + 金宝箱
 *  - ファクトリーレベルに応じた難易度 unlock (現状すべて選択可能 = 仮置き)
 */

import { ELEMENTS, HERO_STATE } from "./factory-hero.js";

/** 難易度 enum */
export const QUEST_DIFFICULTY = {
  EASY:   "easy",
  NORMAL: "normal",
  HARD:   "hard",
};

/** 難易度ごとのデフォルト所要週数 (ユーザー指定) */
export const QUEST_DURATION_WEEKS = {
  easy:   8,
  normal: 12,
  hard:   16,
};

/** 難易度ごとの基準 quest level (= パーティ合計値の下限目安)。
 *  team quest level >= base なら成功率 100%、未満なら割合に応じて低下。 */
export const QUEST_BASE_LEVEL = {
  easy:    80,
  normal: 200,
  hard:   400,
};

/**
 * 通常ノード定義。各 node は主要 reward 素材 (= 多めに出る) を 1 つ持ち、
 * 高ランク帯 (= hard 難易度) のみ高ランク素材を追加で落とす。
 *
 * ユーザー指定:
 *   アバカス       → 通常素材全般。高ランク帯なし
 *   アタナソフ     → 鉄多め。hard でクロムも
 *   アンティキティラ → 銅多め。hard でチタンも
 *   ホレリス       → 亜鉛多め。hard でタングステンも
 */
export const NORMAL_NODES = [
  {
    id: "abacus",
    nameJa: "アバカス",
    nameEn: "Abacus",
    primaryMat: null,    // 全般 = 偏り無し
    poolNormal: ["iron", "copper", "zinc"],
    poolHighTier: [],    // 高ランク帯なし
    note: "ja:通常素材を満遍なく入手|en:Balanced normal-material rewards",
  },
  {
    id: "atanasoff",
    nameJa: "アタナソフ",
    nameEn: "Atanasoff",
    primaryMat: "iron",
    // Phase 1D-15: ノード単位で 1 種類の通常素材だけが手に入る (= 銅 / 亜鉛 は出ない)
    poolNormal: ["iron"],
    poolHighTier: ["chromium"],
    note: "ja:鉄専門 (hard でクロム)|en:Iron-only (hard adds chromium)",
  },
  {
    id: "antikythera",
    nameJa: "アンティキティラ",
    nameEn: "Antikythera",
    primaryMat: "copper",
    poolNormal: ["copper"],
    poolHighTier: ["titanium"],
    note: "ja:銅専門 (hard でチタン)|en:Copper-only (hard adds titanium)",
  },
  {
    id: "hollerith",
    nameJa: "ホレリス",
    nameEn: "Hollerith",
    primaryMat: "zinc",
    poolNormal: ["zinc"],
    poolHighTier: ["tungsten"],
    note: "ja:亜鉛専門 (hard でタングステン)|en:Zinc-only (hard adds tungsten)",
  },
];

/**
 * Phase 1D-12: ランドノード定義 (9 種)。各ランドにメインのランド素材 1 種 +
 * サブの通常素材を持つ。レア素材 (highTier) は出ない設計 (ユーザー仕様)。
 *
 * 通行証: state.landPasses Set で管理 (default: 1 番目に選んだランドが
 *   home land = 無料保有)。それ以外は 500 GUM で購入。
 */
export const LAND_NODES = [
  { id: "ocean",      nameJa: "Ocean",      nameEn: "Ocean",      primaryMat: "aquamarine",     poolNormal: ["aquamarine","aquamarine","aquamarine","iron","copper","zinc"], poolHighTier: [] },
  { id: "strawberry", nameJa: "Strawberry", nameEn: "Strawberry", primaryMat: "rhodochrosite",  poolNormal: ["rhodochrosite","rhodochrosite","rhodochrosite","iron","copper","zinc"], poolHighTier: [] },
  { id: "tangerine",  nameJa: "Tangerine",  nameEn: "Tangerine",  primaryMat: "topaz",          poolNormal: ["topaz","topaz","topaz","iron","copper","zinc"], poolHighTier: [] },
  { id: "lime",       nameJa: "Lime",       nameEn: "Lime",       primaryMat: "peridot",        poolNormal: ["peridot","peridot","peridot","iron","copper","zinc"], poolHighTier: [] },
  { id: "graphite",   nameJa: "Graphite",   nameEn: "Graphite",   primaryMat: "onyx",           poolNormal: ["onyx","onyx","onyx","iron","copper","zinc"], poolHighTier: [] },
  { id: "grape",      nameJa: "Grape",      nameEn: "Grape",      primaryMat: "amethyst",       poolNormal: ["amethyst","amethyst","amethyst","iron","copper","zinc"], poolHighTier: [] },
  { id: "sage",       nameJa: "Sage",       nameEn: "Sage",       primaryMat: "jade",           poolNormal: ["jade","jade","jade","iron","copper","zinc"], poolHighTier: [] },
  { id: "blueberry",  nameJa: "Blueberry",  nameEn: "Blueberry",  primaryMat: "lapis",          poolNormal: ["lapis","lapis","lapis","iron","copper","zinc"], poolHighTier: [] },
  { id: "ruby",       nameJa: "Ruby",       nameEn: "Ruby",       primaryMat: "garnet",         poolNormal: ["garnet","garnet","garnet","iron","copper","zinc"], poolHighTier: [] },
];

/** ランドセクター通行証の 1 枚あたり費用 (GUM) */
export const LAND_PASS_COST = 500;

export const NODE_BY_ID = {};
for (const n of NORMAL_NODES) NODE_BY_ID[n.id] = n;
for (const n of LAND_NODES)   NODE_BY_ID[n.id] = n;

/** チームのクエストレベル合計を計算する。
 *  - 各ヒーローの 4 元素値合計 (craftLevel と同様) を加算
 *  - ただし stamina/HP 比率で減衰する (ユーザー仕様):
 *    questLevel = element_sum × (current_stamina / max_stamina)
 *  - これにより HP が減ったヒーローは貢献度が下がる
 */
/**
 * Phase 1D-11: 1 ヒーローのクエストレベル + 内訳を返す。
 *  base = 4 元素値合計
 *  hpRatio = current / max
 *  noBoost = 「農」属性持ち → 1.5、無 → 1.0
 *  ql = round(base × hpRatio × noBoost)
 *
 *  @returns {{ base: number, hpRatio: number, hpRatioPct: number,
 *              hasNo: boolean, noBoost: number, ql: number,
 *              currentHp: number, maxHp: number }}
 */
export function heroQuestLevelBreakdown(hero) {
  const e = hero?.element || {};
  const base = (e.garuda || 0) + (e.ifrit || 0) + (e.leviathan || 0) + (e.tiamat || 0);
  const cur = hero?.stamina?.current ?? 0;
  const max = hero?.stamina?.max ?? 0;
  const hpRatio = max > 0 ? (cur / max) : 1;
  const hasNo = Array.isArray(hero?.attributes) && hero.attributes.includes("no");
  const noBoost = hasNo ? 1.5 : 1.0;
  const ql = Math.round(base * hpRatio * noBoost);
  return {
    base,
    hpRatio,
    hpRatioPct: Math.round(hpRatio * 100),
    hasNo,
    noBoost,
    ql,
    currentHp: cur,
    maxHp: max,
  };
}

export function teamQuestLevel(team) {
  if (!Array.isArray(team)) return 0;
  let total = 0;
  for (const h of team) {
    if (!h || !h.element) continue;
    const elSum = (h.element.garuda || 0) + (h.element.ifrit || 0) +
                  (h.element.leviathan || 0) + (h.element.tiamat || 0);
    const ratio = h.stamina && h.stamina.max > 0
      ? (h.stamina.current / h.stamina.max)
      : 1;
    // 「農」属性を持つヒーローは 1.5 倍ブースト (Phase 1D-1)
    const no = Array.isArray(h.attributes) && h.attributes.includes("no") ? 1.5 : 1.0;
    total += Math.round(elSum * ratio * no);
  }
  return total;
}

/**
 * パーティ quest level / 必要 quest level の比率 → 成功率を返す。
 *
 * ユーザー指定:
 *   100%+: 100%
 *   80-99%: 80%
 *   50-79%: 60%
 *   30-49%: 40%
 *   ~29%:   挑戦不可 (= -1)
 *
 * @returns {number} 0.0-1.0、-1 は挑戦不可
 */
export function questSuccessRate(teamLevel, baseLevel) {
  if (baseLevel <= 0) return 1;
  const ratio = teamLevel / baseLevel;
  if (ratio >= 1.0)  return 1.0;
  if (ratio >= 0.8)  return 0.8;
  if (ratio >= 0.5)  return 0.6;
  if (ratio >= 0.3)  return 0.4;
  return -1; // 挑戦不可
}

/** 成功率 → マイのコメント key (i18n) を返す */
export function successRateCommentKey(rate) {
  if (rate < 0)    return "quest.mai.tooLow";
  if (rate >= 1.0) return "quest.mai.confident";
  if (rate >= 0.8) return "quest.mai.likely";
  if (rate >= 0.5) return "quest.mai.uncertain";
  return "quest.mai.risky";
}

/**
 * クエスト成功時の素材 reward を生成。
 *
 * 仕様:
 *  - 各エネミーを倒すたびに宝箱がドロップ → 成功 = 5 個ドロップ
 *  - 宝箱 1 個 = 該当 node の poolNormal から 1 種抽選 + 1-2 個
 *  - hard 難易度では 5 個中 1-2 個が高ランク帯素材 (poolHighTier) になる
 *
 * @param {object} node      NORMAL_NODES の 1 つ
 * @param {string} difficulty "easy" | "normal" | "hard"
 * @returns {Record<string, number>}  { 素材 id: 個数 }
 */
export function rollQuestRewards(node, difficulty, rng = Math.random) {
  const out = {};
  const dropCount = 5; // 5 戦闘 → 5 ドロップ
  const useHighTierSlots = (difficulty === "hard" && node.poolHighTier.length > 0)
    ? Math.floor(rng() * 2) + 1   // 1 or 2 個
    : 0;
  for (let i = 0; i < dropCount; i++) {
    const useHigh = i < useHighTierSlots;
    const pool = useHigh ? node.poolHighTier : node.poolNormal;
    const matId = pool[Math.floor(rng() * pool.length)];
    const qty   = useHigh ? 1 : (Math.floor(rng() * 2) + 1);
    out[matId] = (out[matId] || 0) + qty;
  }
  return out;
}

/** クエスト名 (難易度サフィックス込み) を返す。i18n は呼び出し側で翻訳。 */
export function questDisplayName(node, difficulty, lang) {
  const base = lang === "en" ? node.nameEn : node.nameJa;
  const diff = QUEST_DIFFICULTY_LABEL[difficulty] || difficulty;
  const diffLbl = lang === "en" ? diff.en : diff.ja;
  return `${base} (${diffLbl})`;
}

const QUEST_DIFFICULTY_LABEL = {
  easy:   { ja: "初級", en: "Easy" },
  normal: { ja: "中級", en: "Normal" },
  hard:   { ja: "上級", en: "Hard" },
};
export { QUEST_DIFFICULTY_LABEL };
