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
  return {
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
  };
}

/** クラフトレベル = 4 元素値の合計。チームレベルは合計値を加算する。 */
export function craftLevel(hero) {
  if (!hero || !hero.element) return 0;
  const e = hero.element;
  return (e.garuda || 0) + (e.ifrit || 0) + (e.leviathan || 0) + (e.tiamat || 0);
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
