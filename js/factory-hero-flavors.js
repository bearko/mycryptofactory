/**
 * factory-hero-flavors.js — ヒーローのフレーバーセリフプール (Phase 1D-19)
 *
 * 工房のヒーロースプライト左上に短い吹き出しで表示するセリフ集。
 * シーンごとに 6 種類前後のセリフを用意して、発火時にランダム抽選する。
 *
 * 使い方 (main.js 側):
 *   import { pickHeroFlavor } from "./factory-hero-flavors.js";
 *   const text = pickHeroFlavor("craftStart");  // → "やるぞー！" などをランダム返却
 *   pushHeroFlavor(heroId, text);               // → 工房 sprite の左上に吹き出し
 */

/** シーン別セリフプール (ja / en) */
export const HERO_FLAVOR_LINES = {
  /** クラフト開始 (startActiveCraft) */
  craftStart: {
    ja: ["やるぞー！", "任されよう！", "よし来た！", "任された！", "腕が鳴るな", "見ていろよ"],
    en: ["Let's go!", "On it!", "All right!", "Trust me!", "Itching to start!", "Watch this!"],
  },

  /** Idle 状態が 1 週間経過 (state は IDLE で staminaTickIdle を週単位で監視) */
  idleBored: {
    ja: ["ヒマだな……", "指示を待つ", "ぼーっ", "暇潰しでも", "暇だ……", "次は何を？"],
    en: ["Bored…", "Awaiting orders", "Just chilling", "Got a job for me?", "Twiddling my thumbs", "What's next?"],
  },

  /** クエスト開始 (startActiveQuest) */
  questStart: {
    ja: ["いってくる！", "ザクザク掘るぞ", "出発だ！", "任せとけ", "良い旅を♪", "宝の予感"],
    en: ["Off I go!", "Time to dig!", "Heading out!", "Leave it to me", "Wish me luck♪", "I smell loot!"],
  },

  /** Trade / Auction 派遣 (startSale) */
  saleStart: {
    ja: ["いってくる！", "稼ぐぞー", "商談、行ってきます", "高く売るぞ", "良い客に♪", "腕の見せ所"],
    en: ["Off to market!", "Time to earn!", "Closing the deal", "I'll get top price", "Find a buyer♪", "My specialty!"],
  },

  /** クラフト・クエストでスタミナ 0 → RESTING 入り (= 体力ゼロ休憩) */
  restingZero: {
    ja: ["疲れた……", "少し休む", "眠い……", "もう動けん", "Zzz…", "ちょっと寝る"],
    en: ["So tired…", "Need a break", "Sleepy…", "Out of juice", "Zzz…", "Bedtime"],
  },

  /** パッシブ発動 (pushPassiveNotification) — テキストはスキル名を渡す */
  passive: {
    ja: ["{name}！", "{name} 発動！", "今だ、{name}！"],
    en: ["{name}!", "{name}!!", "Now, {name}!"],
  },
};

/**
 * シーンキー + 言語からセリフを 1 つランダム抽選して返す。
 *  passive シーンは extra.name で skill 名を埋め込み。
 *
 *  @param {keyof HERO_FLAVOR_LINES} sceneKey
 *  @param {"ja"|"en"} lang
 *  @param {{ name?: string }} [extra]
 *  @returns {string|null}
 */
export function pickHeroFlavor(sceneKey, lang, extra = {}) {
  const pool = HERO_FLAVOR_LINES[sceneKey];
  if (!pool) return null;
  const arr = pool[lang === "en" ? "en" : "ja"];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const tmpl = arr[Math.floor(Math.random() * arr.length)];
  if (extra.name) return tmpl.replace("{name}", extra.name);
  return tmpl;
}
