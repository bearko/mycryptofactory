// bearko.games 共通基盤（総合スコア）に送る成績。実行: node --test tests/platform.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { weeksSinceStart, scoreMetrics, reportProgress } from "../js/platform.js";

test("ゲーム開始（2018 年 12 月 1 週）からの週数", () => {
  assert.equal(weeksSinceStart({ year: 2018, month: 12, week: 1, startYear: 2018 }), 0);
  assert.equal(weeksSinceStart({ year: 2019, month: 1, week: 1, startYear: 2018 }), 4);
  assert.equal(weeksSinceStart({ year: 2021, month: 12, week: 1, startYear: 2018 }), 144);
});

test("送る成績：Lv 5 の週数は Lv 5 のときだけ、クラフトは 0 のレアリティを入れない", () => {
  assert.deepEqual(scoreMetrics({ factoryLevel: 3, lv5Weeks: 99, questClearCount: 4, craftedByRarity: { common: 3, rare: 0 } }),
    { factoryLevel: 3, weeksToLv5: null, questsCleared: 4, crafted: { common: 3 } });
  assert.deepEqual(scoreMetrics({ factoryLevel: 5, lv5Weeks: 150 }), { factoryLevel: 5, weeksToLv5: 150, questsCleared: 0, crafted: {} });
});

test("SDK がなくても例外を出さない", () => {
  assert.doesNotThrow(() => reportProgress({ factoryLevel: 2 }, { milestone: true }));
});
