/**
 * tools/sim/skill-balance.mjs — エクステンションスキルのバランス簡易シミュ
 *
 * 倉庫サイズ別に効果がどの程度蓄積するかを実データで検証する。
 * 各シナリオ:
 *   1. 倉庫 5 個 (= 序盤): カテゴリ偏りなしランダム
 *   2. 倉庫 20 個 (= 中盤): 偏らせると過剰になるか?
 *   3. 倉庫 50 個 (= 終盤): スタッキング上限が機能しているか?
 *   4. 倉庫を「PHY 系のみ」 で固めた場合の questLvBoost 上限
 *
 * 実行:
 *   node tools/sim/skill-balance.mjs
 */

import fs from "fs";
import {
  resolveExtSkill,
  aggregateEffectsFromResolved,
  EFFECT_DEFS,
  RARITY_SCALE,
  ARCHETYPES,
  SERIES_ARCHETYPE_MAP,
} from "../../js/factory-ext-skill.js";

const exts = JSON.parse(fs.readFileSync("data/extensions.json", "utf8"));
const RNG = mulberry32(20260506);
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pick(arr) { return arr[Math.floor(RNG() * arr.length)]; }
function pickN(arr, n) {
  const out = [];
  const pool = arr.slice();
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(RNG() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function showAggregate(label, items) {
  const skills = items.map(e => resolveExtSkill(e));
  const eff = aggregateEffectsFromResolved(skills);
  console.log(`\n=== ${label} (n=${items.length}) ===`);
  const rarityCounts = items.reduce((a, e) => { a[e.rarity] = (a[e.rarity] || 0) + 1; return a; }, {});
  console.log("  rarity:", JSON.stringify(rarityCounts));
  for (const [t, v] of Object.entries(eff).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(20)} = ${v.toFixed(1)}%`);
  }
}

// ── Scenario 1: 序盤 (5 commons random) ──
const commons = exts.filter(e => e.rarity === "common");
showAggregate("序盤: Common 5 個ランダム", pickN(commons, 5));

// ── Scenario 2: 中盤 (20 mixed) ──
const midPool = exts.filter(e => ["common", "uncommon", "rare"].includes(e.rarity));
showAggregate("中盤: Common-Rare 20 個ランダム", pickN(midPool, 20));

// ── Scenario 3: 終盤 (50 mixed all rarities) ──
showAggregate("終盤: 50 個ランダム (全レアリティ)", pickN(exts, 50));

// ── Scenario 4: PHY questLv に絞った 30 個 ──
const phyQuestExt = exts.filter(e => SERIES_ARCHETYPE_MAP[e.series] === "phy-quest-lv");
showAggregate("特化: phy-quest-lv 30 個 (= 全 rarity から)", pickN(phyQuestExt, Math.min(30, phyQuestExt.length)));

// ── Scenario 5: 倉庫 1 個 (Legendary)  ──
const legendaries = exts.filter(e => e.rarity === "legendary");
showAggregate("単体最強: Legendary 1 個", [pick(legendaries)]);

// ── Scenario 6: 倉庫 100 個 (= ストック乱用) ──
showAggregate("乱用: 100 個ランダム", pickN(exts, Math.min(100, exts.length)));

// ── Headroom check: 各効果の単独 max ──
console.log("\n=== 各効果の Common→Legendary 単独 base ===");
for (const [t, def] of Object.entries(EFFECT_DEFS)) {
  const c = (def.base * RARITY_SCALE.common).toFixed(1);
  const l = (def.base * RARITY_SCALE.legendary).toFixed(1);
  console.log(`  ${t.padEnd(20)} C ${c}%  ↔  L ${l}%`);
}
