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
    poolNormal: ["iron", "iron", "iron", "copper", "zinc"],
    poolHighTier: ["chromium"],
    note: "ja:鉄多め (hard でクロム)|en:Iron-heavy (hard adds chromium)",
  },
  {
    id: "antikythera",
    nameJa: "アンティキティラ",
    nameEn: "Antikythera",
    primaryMat: "copper",
    poolNormal: ["copper", "copper", "copper", "iron", "zinc"],
    poolHighTier: ["titanium"],
    note: "ja:銅多め (hard でチタン)|en:Copper-heavy (hard adds titanium)",
  },
  {
    id: "hollerith",
    nameJa: "ホレリス",
    nameEn: "Hollerith",
    primaryMat: "zinc",
    poolNormal: ["zinc", "zinc", "zinc", "iron", "copper"],
    poolHighTier: ["tungsten"],
    note: "ja:亜鉛多め (hard でタングステン)|en:Zinc-heavy (hard adds tungsten)",
  },
];

export const NODE_BY_ID = {};
for (const n of NORMAL_NODES) NODE_BY_ID[n.id] = n;

/** チームのクエストレベル合計を計算する。
 *  - 各ヒーローの 4 元素値合計 (craftLevel と同様) を加算
 *  - ただし stamina/HP 比率で減衰する (ユーザー仕様):
 *    questLevel = element_sum × (current_stamina / max_stamina)
 *  - これにより HP が減ったヒーローは貢献度が下がる
 */
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
