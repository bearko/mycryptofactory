// クラフト中のイベントの担当（#116）。実行: node --test tests/craft-event.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { craftEventCandidates } from "../js/factory-craft.js";

const h = (heroId) => ({ heroId });

test("ソウル注入は編成ヒーロー全員から選べる", () => {
  assert.deepEqual(craftEventCandidates([h(1), h(2)], "soul", null), { heroes: [h(1), h(2)], sameAsSoul: false });
});

test("オーラ付与ではソウル注入の担当を除く", () => {
  assert.deepEqual(craftEventCandidates([h(1), h(2)], "aura", 1), { heroes: [h(2)], sameAsSoul: false });
});

test("ほかに編成ヒーローがいなければ、ソウル注入と同じヒーローが担当する（先へ進めなくならない）", () => {
  assert.deepEqual(craftEventCandidates([h(1)], "aura", 1), { heroes: [h(1)], sameAsSoul: true });
  assert.deepEqual(craftEventCandidates([], "aura", 1), { heroes: [], sameAsSoul: false });
});
