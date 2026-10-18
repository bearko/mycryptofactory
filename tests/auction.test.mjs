// オークション（SPEC-018）の純関数。実行: node --test tests/auction.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auctionAttention, auctionBasePrice, auctionBidders, auctionBidderRange, auctionHammerPrice,
  auctionPriceRange, auctionOutcome, seededRng, pickPopularSeries, estimateSalePrice, netSaleRevenue,
  AUCTION_LISTING_FEE,
} from "../js/factory-market.js";

const fixed = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };

test("注目度：査定・レアリティ・商・人気シリーズの合計（SPEC-018 3.2）", () => {
  assert.deepEqual(auctionAttention({ tier: "fine", rarity: "rare", sho: false, popular: false }), { total: 30, parts: { tier: 20, rarity: 10, sho: 0, popular: 0 } });
  assert.equal(auctionAttention({ tier: "poor", rarity: "common" }).total, 0);
  assert.equal(auctionAttention({ tier: "masterpiece", rarity: "legendary", sho: true, popular: true }).total, 100);
  // 査定がないときは良作（マーケットの値段と同じ扱い）
  assert.equal(auctionAttention({ rarity: "uncommon" }).parts.tier, 20);
  assert.equal(AUCTION_LISTING_FEE, 100);
});

test("基準価格はマーケットの「相場に合わせる」と同じ（商の +10% は掛けない）", () => {
  const w = { appraisal: { tier: "great" } }, ext = { rarity: "epic" };
  assert.equal(auctionBasePrice(w, ext), estimateSalePrice(w, ext, "standard", null));
  assert.equal(auctionBasePrice(w, ext), 13050); // 9000 × 1.45
});

test("入札の数：注目度 ÷ 15 + 0〜2。凡作 Common は 3 回に 1 回 0 件", () => {
  assert.equal(auctionBidders(30, fixed(0)), 2);
  assert.equal(auctionBidders(30, fixed(0.999)), 4);
  assert.equal(auctionBidders(0, fixed(0.2)), 0);
  assert.equal(auctionBidders(0, fixed(0.4)), 1);
  assert.deepEqual(auctionBidderRange(100), [6, 8]);
  // 1/3 の確率で 0 件（乱数を均等にとる）
  let zero = 0; const N = 3000;
  for (let i = 0; i < N; i++) if (auctionBidders(0, () => (i + 0.5) / N) === 0) zero++;
  assert.equal(zero, N / 3);
});

test("落札額：基準価格 ×（0.8 + 注目度/100）× 0.9〜1.1", () => {
  assert.equal(auctionHammerPrice(3000, 30, fixed(0.5)), 3300);           // 良作 Rare ≒ 1.1 倍
  assert.equal(auctionHammerPrice(1000, 100, fixed(0.5)), 1800);          // 1.8 倍
  assert.deepEqual(auctionPriceRange(1000, 0), [720, 880]);
  assert.deepEqual(auctionPriceRange(1000, 100), [1620, 1980]);
  for (const r of [0, 0.25, 0.5, 0.9999]) {
    const p = auctionHammerPrice(1000, 50, fixed(r));
    const [lo, hi] = auctionPriceRange(1000, 50);
    assert.ok(p >= lo && p <= hi, `${p} in [${lo}, ${hi}]`);
  }
});

test("結果は種で決まる（セーブ・ロードで変わらない）。手取りは手数料 10% を引く", () => {
  const a = auctionOutcome({ base: 3000, attention: 30, seed: 12345 });
  assert.deepEqual(auctionOutcome({ base: 3000, attention: 30, seed: 12345 }), a);
  assert.equal(a.sold, true);
  assert.equal(a.net, netSaleRevenue(a.gross));
  // 注目度 0 の品は、種によって不成立になる。不成立なら手取り 0
  let none = 0;
  for (let s = 1; s <= 300; s++) { const o = auctionOutcome({ base: 300, attention: 0, seed: s }); if (!o.sold) { none++; assert.deepEqual(o, { sold: false, bidders: 0, gross: 0, net: 0 }); } }
  assert.ok(none > 60 && none < 140, `不成立 ${none}/300（期待は約 100）`);
});

test("seededRng：同じ種なら同じ並び、0 以上 1 未満", () => {
  const r1 = seededRng(7), r2 = seededRng(7), r3 = seededRng(8);
  const xs = [r1(), r1(), r1()];
  assert.deepEqual([r2(), r2(), r2()], xs);
  assert.notDeepEqual([r3(), r3(), r3()], xs);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});

test("今月の人気シリーズ：重ならずに 3 つ。少なければぜんぶ", () => {
  const p = pickPopularSeries(["A", "B", "C", "D", "E"], seededRng(1));
  assert.equal(p.length, 3);
  assert.equal(new Set(p).size, 3);
  assert.deepEqual(pickPopularSeries(["A", "B"], seededRng(1)).sort(), ["A", "B"]);
  assert.deepEqual(pickPopularSeries(["A", "A", "B"], fixed(0)), ["A", "B"]);
  assert.deepEqual(pickPopularSeries([], seededRng(1)), []);
});
