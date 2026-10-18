/**
 * tools/sim/auction-compare.mjs — オークションとマーケットの手取りを比べる（SPEC-018 3.9）
 *
 *   node tools/sim/auction-compare.mjs
 *
 * 査定 × レアリティごとに、マーケットの 3 つの速さとオークションの
 * 「1 回の手取り」と「1 週あたりの手取り」を並べる。オークションは出品料 100 GUM を引いた期待値で、
 * 開催までの待ちは月のどこで出品するかで 1〜4 週（平均 2.5 週）とする。担当は商でない・人気シリーズでないとき（素）と、
 * 商・人気シリーズのとき（盛）の 2 通り。
 */
import {
  estimateSalePrice, netSaleRevenue, SALE_SPEED_OPTIONS,
  auctionAttention, auctionBasePrice, auctionOutcome, AUCTION_LISTING_FEE,
} from "../../js/factory-market.js";

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const TIERS = ["poor", "decent", "fine", "great", "masterpiece"];
const AVG_WAIT_WEEKS = 2.5;
const N = 4000;

function auctionEv(w, ext, sho, popular) {
  const att = auctionAttention({ tier: w.appraisal.tier, rarity: ext.rarity, sho, popular }).total;
  const base = auctionBasePrice(w, ext);
  let net = 0, fail = 0;
  for (let s = 1; s <= N; s++) {
    const o = auctionOutcome({ base, attention: att, seed: s * 2654435761 });
    if (o.sold) net += o.net; else fail++;
  }
  return { att, ev: Math.round(net / N - AUCTION_LISTING_FEE), fail: fail / N };
}

const rows = [];
for (const rarity of RARITIES) {
  for (const tier of TIERS) {
    const w = { appraisal: { tier } }, ext = { rarity };
    const market = Object.fromEntries(SALE_SPEED_OPTIONS.map((sp) => {
      const net = netSaleRevenue(estimateSalePrice(w, ext, sp.id, null));
      return [sp.id, { net, perWeek: Math.round(net / sp.weeks) }];
    }));
    const plain = auctionEv(w, ext, false, false);
    const boosted = auctionEv(w, ext, true, true);
    rows.push({ rarity, tier, market, plain, boosted });
  }
}

const pct = (x) => `${Math.round(x * 100)}%`;
console.log("| レアリティ | 査定 | 速度重視 1 週 | 相場 4 週 | 価格重視 8 週 | オークション 素（注目度・不成立） | オークション 盛（商・人気） | 素÷相場 | 盛÷価格重視 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const m = r.market;
  console.log(`| ${r.rarity} | ${r.tier} | ${m.fast.net} | ${m.standard.net} | ${m.premium.net} | ${r.plain.ev}（${r.plain.att}・${pct(r.plain.fail)}） | ${r.boosted.ev}（${r.boosted.att}・${pct(r.boosted.fail)}） | ${(r.plain.ev / m.standard.net).toFixed(2)} | ${(r.boosted.ev / m.premium.net).toFixed(2)} |`);
}
console.log("");
console.log(`1 週あたり（オークションは待ち ${AVG_WAIT_WEEKS} 週で割る）`);
console.log("| レアリティ | 査定 | 速度重視 | 相場 | 価格重視 | オークション 素 | オークション 盛 |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  const m = r.market;
  console.log(`| ${r.rarity} | ${r.tier} | ${m.fast.perWeek} | ${m.standard.perWeek} | ${m.premium.perWeek} | ${Math.round(r.plain.ev / AVG_WAIT_WEEKS)} | ${Math.round(r.boosted.ev / AVG_WAIT_WEEKS)} |`);
}
