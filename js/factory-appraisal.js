/**
 * factory-appraisal.js — クラフト完成 ext の品評会 (5 名審査員 / 50 点満点)
 *
 * 仕様 (ユーザー指定):
 *  - Atribute「美術」を持つヒーローがランダムで 5 名選出
 *  - 各審査員が 10 点満点で評価 → 合計 50 点満点
 *  - 「基準値ぴったりなら 6 点」を基準に、品質 tier で平均値が変動
 *  - 得点に応じて一言コメント (キャラに合わせたフレーバーを含めたい)
 *
 * MCH ヒーロー JSON には attribute フィールドが無いため、Phase 1B-4 では
 * 「美術 / 文芸 / 音楽など芸術系」と思われる well-known ヒーローを ID で
 * 列挙するアプローチを取る。今後 attribute データが付いたら ART_HERO_IDS を
 * その filter に置き換える。
 */

import { ELEMENTS } from "./factory-hero.js";

/** 美術系ヒーロー (data/heroes.json から名前で抽出した 11 名) */
export const ART_HERO_IDS = [
  1001, // コナン・ドイル (文学)
  2004, // シューベルト (音楽)
  2039, // ドストエフスキー (文学)
  2049, // ショパン (音楽)
  3030, // シェイクスピア (文学)
  4021, // ゴッホ (美術)
  4030, // モーツァルト (音楽)
  5012, // バッハ (音楽)
  5024, // 葛飾北斎 (美術)
  5027, // ガリレオ・ガリレイ (学問だが知性派代表枠)
  5032, // 宮本武蔵 (剣豪兼書画家)
];

/** 美術ヒーローを ownedHeroes プールから 5 名 (もしくは可能な限り) 抽選。
 *  プール枯渇時は補欠として ownedHeroes から random fill する。
 *  クラフト中で配属中のヒーローは除外せず、純粋に random pick。
 */
export function pickAppraisalJudges(ownedHeroes, count = 5, rng = Math.random) {
  if (!Array.isArray(ownedHeroes) || ownedHeroes.length === 0) return [];
  const idSet = new Set(ART_HERO_IDS);
  // 1st pick: art heroes (player が所持しているもののみ)
  const artPool = ownedHeroes.filter(h => idSet.has(h.heroId));
  shuffleInPlace(artPool, rng);
  const picked = artPool.slice(0, count);
  // 補欠: 5 名に満たなければ ownedHeroes 全体から random で埋める
  if (picked.length < count) {
    const used = new Set(picked.map(h => h.heroId));
    const rest = ownedHeroes.filter(h => !used.has(h.heroId));
    shuffleInPlace(rest, rng);
    while (picked.length < count && rest.length > 0) picked.push(rest.shift());
  }
  return picked;
}

function shuffleInPlace(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * 審査員 1 名の点数 (0-10) を quality tier から決定的にロール。
 *
 * 仕様: 「基準値ぴったりなら 6 点」 → tier "good" の平均 = 6
 *   under     (target 未達)         平均 4 (2-6)
 *   good      (target 到達)          平均 6 (4-8)
 *   excellent (target × 1.5+ 大幅超) 平均 8 (6-10)
 *
 * variance: ±2 の uniform random、四捨五入。0-10 にクランプ。
 *
 * @param {"under"|"good"|"excellent"} qualityTier
 * @param {() => number} [rng]
 * @returns {number} 0-10 整数
 */
export function rollJudgeScore(qualityTier, rng = Math.random) {
  let mean;
  switch (qualityTier) {
    case "under":     mean = 4; break;
    case "excellent": mean = 8; break;
    case "good":
    default:          mean = 6; break;
  }
  const variance = rng() * 4 - 2;
  return Math.max(0, Math.min(10, Math.round(mean + variance)));
}

/** 5 名の合計点 → tier ラベル key を返す。
 *  20 未満: 凡作 / 20-29: 良作 / 30-39: 秀作 / 40-44: 名作 / 45-50: 傑作 */
export function appraisalTotalTier(total) {
  if (total >= 45) return "masterpiece";
  if (total >= 40) return "great";
  if (total >= 30) return "fine";
  if (total >= 20) return "decent";
  return "poor";
}

/**
 * 審査員 1 名のコメントを返す。well-known な美術ヒーローには専用のフレーバーを、
 * それ以外は score の高低に応じた汎用テンプレートを返す。
 *
 * @param {object} hero  factory-hero
 * @param {number} score 0-10
 * @returns {string} コメント (Japanese only ─ 翻訳は将来 i18n 化予定)
 */
export function buildJudgeComment(hero, score) {
  // ヒーロー固有のフレーバー (高/中/低の 3 段階)
  const flavor = HERO_FLAVOR[hero.heroId];
  if (flavor) {
    if (score >= 8) return flavor.high;
    if (score >= 5) return flavor.mid;
    return flavor.low;
  }
  // 汎用テンプレート
  return GENERIC_COMMENT[scoreBand(score)];
}

function scoreBand(score) {
  if (score >= 9) return "perfect";
  if (score >= 7) return "good";
  if (score >= 5) return "ok";
  if (score >= 3) return "weak";
  return "bad";
}

const GENERIC_COMMENT = {
  perfect: "完璧な出来栄えだ！",
  good:    "なかなか良い出来ですね。",
  ok:      "まずまず、及第点といったところか。",
  weak:    "うーん、もう少し詰められたかも……",
  bad:     "残念、見直しが必要だ。",
};

/** 美術系ヒーローの専用フレーバー (high/mid/low).
 *  キャラの史実 / 作品 / 個性に基づく一言。 */
const HERO_FLAVOR = {
  // 葛飾北斎
  5024: {
    high: "うむ、波の表現が……見事じゃ！",
    mid:  "悪くないが、富嶽三十六景には及ばぬか。",
    low:  "やり直しじゃ、線がなまっておる。",
  },
  // モーツァルト
  4030: {
    high: "頭の中で旋律が踊りますね、見事です♪",
    mid:  "悪くないけど、もうひと工夫ほしいな。",
    low:  "うーん、調子っぱずれかな。",
  },
  // ゴッホ
  4021: {
    high: "魂が燃えている……素晴らしい！",
    mid:  "情熱はあるが、構図に粗がある。",
    low:  "色も筆も、まだ覚醒しきっていない。",
  },
  // バッハ
  5012: {
    high: "対位法のごとく完璧な調和ですね。",
    mid:  "音は揃っているが、深みに欠ける。",
    low:  "基本からやり直すべきです。",
  },
  // シェイクスピア
  3030: {
    high: "All the world's a stage — 名舞台だ！",
    mid:  "良きも悪きも、ものに依る。",
    low:  "悲劇とは何かを学び直したまえ。",
  },
  // ショパン
  2049: {
    high: "繊細で美しい、ノクターンのような出来ですね。",
    mid:  "もう少しタッチを優しくしてはどうでしょう。",
    low:  "ちょっと……響きが固すぎますね。",
  },
  // シューベルト
  2004: {
    high: "歌うような素晴らしい仕上がりです！",
    mid:  "未完成のような、惜しさを感じる。",
    low:  "うーん、旋律が単調かな。",
  },
  // コナン・ドイル
  1001: {
    high: "君、これは芸術的傑作だ。Elementary！",
    mid:  "いくつかの手がかりは良いが、推理が足りない。",
    low:  "見落としが多すぎるな。",
  },
  // ドストエフスキー
  2039: {
    high: "罪と罰、その重みを感じる名作だ。",
    mid:  "葛藤は描けているが、まだ深まる余地がある。",
    low:  "これでは魂が震えぬ。",
  },
  // ガリレオ・ガリレイ
  5027: {
    high: "それでも傑作は美しい — 完璧な対称性だ。",
    mid:  "数値的には標準を満たしている。",
    low:  "計測してみたが、基準を下回っている。",
  },
  // 宮本武蔵
  5032: {
    high: "二天一流、見事に体現された一品なり。",
    mid:  "悪しからず、されど精進の余地あり。",
    low:  "未熟。修行を重ねよ。",
  },
};
