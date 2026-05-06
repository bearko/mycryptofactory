/**
 * tools/sim/quest-balance.mjs — クエストバランス検証
 *
 * Phase β2-1 の rank+rarity スケール導入後、 各レアリティ rank で
 * easy / normal / hard をどれだけクリアできるかを検証。
 */
import fs from "fs";
const heroes = JSON.parse(fs.readFileSync("data/heroes.json", "utf8"));

const RARITY_QUEST_MULT = { common: 1.0, uncommon: 1.5, rare: 2.5, epic: 4.0, legendary: 6.0 };
const GW = 1 / 6;
const QUEST_BASE = { easy: 350, normal: 1100, hard: 3000 };

function questLv(hero, rank) {
  const e = hero;
  const rMult = 1 + 0.4 * rank;
  const rarMult = RARITY_QUEST_MULT[hero.rarity] || 1;
  const elSum = (e.hpMax || 0) * GW + (e.basePhy || 0) + (e.baseInt || 0) + (e.baseAgi || 0);
  const hasNo = (hero.attributes || []).includes("no");
  return Math.round(elSum * rMult * rarMult * (hasNo ? 1.5 : 1.0));
}

function rate(t, b) {
  const r = t / b;
  if (r >= 1) return 100;
  if (r >= 0.8) return 80;
  if (r >= 0.5) return 60;
  if (r >= 0.3) return 40;
  return 0;  // blocked
}

function teamLv5(rarity, rank) {
  // 5 highest-questLv heroes of given rarity, no node bonus, no skill bonus
  const list = heroes.filter(h => h.rarity === rarity).map(h => questLv(h, rank));
  return list.sort((a, b) => b - a).slice(0, 5).reduce((s, x) => s + x, 0);
}

console.log("=== Quest team Lv 5 (top 5 heroes, no node bonus, no skill) ===\n");
console.log("rarity     ".padEnd(12), "rank0".padStart(6), "rank1".padStart(6), "rank3".padStart(6), "rank5".padStart(6));
for (const r of ["common", "uncommon", "rare", "epic", "legendary"]) {
  console.log("  " + r.padEnd(10),
    String(teamLv5(r, 0)).padStart(6),
    String(teamLv5(r, 1)).padStart(6),
    String(teamLv5(r, 3)).padStart(6),
    String(teamLv5(r, 5)).padStart(6));
}

console.log("\n=== Success rate per difficulty (Easy 350 / Normal 1100 / Hard 3000) ===\n");
console.log("rarity   rank   easy   normal   hard");
for (const rarity of ["common", "uncommon", "rare", "epic", "legendary"]) {
  for (const rank of [0, 1, 3, 5]) {
    const lv = teamLv5(rarity, rank);
    console.log(
      ("  " + rarity).padEnd(11),
      String(rank).padStart(2),
      String(rate(lv, QUEST_BASE.easy) + "%").padStart(6),
      String(rate(lv, QUEST_BASE.normal) + "%").padStart(8),
      String(rate(lv, QUEST_BASE.hard) + "%").padStart(7),
    );
  }
}

console.log("\n=== Common + 農 boost on easy (= 既存「Common rank5 農 vs Legendary rank0 no-no」逆転チェック) ===\n");
const commonNoTop5 = heroes.filter(h => h.rarity === "common" && (h.attributes || []).includes("no"))
  .map(h => questLv(h, 5)).sort((a,b)=>b-a).slice(0,5);
const legendaryNoNoTop5 = heroes.filter(h => h.rarity === "legendary" && !(h.attributes || []).includes("no"))
  .map(h => questLv(h, 0)).sort((a,b)=>b-a).slice(0,5);
console.log("  Common 農 rank5 top5 sum:", commonNoTop5.reduce((s,x)=>s+x,0));
console.log("  Legendary no-農 rank0 top5 sum:", legendaryNoNoTop5.reduce((s,x)=>s+x,0));
console.log("  逆転:", commonNoTop5.reduce((s,x)=>s+x,0) > legendaryNoNoTop5.reduce((s,x)=>s+x,0) ? "YES (BUG)" : "NO ✓");
