// 表示しないヒーロー（SPEC-014）。実行: node --test tests/excluded-heroes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXCLUDED_HERO_IDS } from "../js/heroes.js";
import { dropExcludedHeroes } from "../js/factory-save.js";

const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

test("猿田彦（2035）とレプリカ（12035）を表示しない", () => {
  assert.deepEqual([...EXCLUDED_HERO_IDS].sort(), [12035, 2035]);
});

test("data/heroes.json と英名の表に入っていない（GAS の同期で戻ったら落ちる）", () => {
  const heroes = json("data/heroes.json");
  assert.deepEqual(heroes.filter((h) => EXCLUDED_HERO_IDS.includes(h.heroId)), []);
  const en = json("data/i18n/heroes-en.json");
  assert.deepEqual(EXCLUDED_HERO_IDS.filter((id) => String(id) in en), []);
});

test("前のセーブで雇っていたら、記録を外して編成の ID を空ける", () => {
  const state = {
    ownedHeroes: [{ heroId: 1001, nameJa: "シートン" }, { heroId: 2035, nameJa: "x" }],
    craftTeam: [2035, 1001, null],
    questTeam: [null, 2035],
    activeCraft: { extId: 7, team: [2035, 1001] },
    hireCandidates: [{ heroId: 2035, nameJa: "x" }],
    gum: 2035,
    heroIdleSpokeAt: { 2035: 3 },
  };
  dropExcludedHeroes(state, EXCLUDED_HERO_IDS);
  assert.deepEqual(state.ownedHeroes, [{ heroId: 1001, nameJa: "シートン" }]);
  assert.deepEqual(state.craftTeam, [null, 1001, null]);
  assert.deepEqual(state.questTeam, [null, null]);
  assert.deepEqual(state.activeCraft.team, [null, 1001]);
  assert.deepEqual(state.hireCandidates, []);
  assert.equal(state.gum, 2035); // 編成でない数はそのまま
});
