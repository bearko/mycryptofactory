// 期限 8 年・クリア・節目（SPEC-001）。実行: node --test tests/goal.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEADLINE_WEEKS, yearEndMilestone, levelMilestone, isWithinDeadline, splitWeeks, remainingTime,
} from "../js/factory-goal.js";
import { weeksSinceStart } from "../js/platform.js";

test("期限は 384 週 = 2026 年 12 月 1 週", () => {
  assert.equal(DEADLINE_WEEKS, 384);
  assert.equal(weeksSinceStart({ year: 2026, month: 12, week: 1, startYear: 2018 }), DEADLINE_WEEKS);
  assert.equal(weeksSinceStart({ year: 2026, month: 11, week: 4, startYear: 2018 }), DEADLINE_WEEKS - 1);
});

test("各年の終わりは 48 週ごと、8 年目まで", () => {
  assert.equal(yearEndMilestone(0), null);
  assert.equal(yearEndMilestone(47), null);
  assert.equal(yearEndMilestone(48), "year1");
  assert.equal(yearEndMilestone(96), "year2");
  assert.equal(yearEndMilestone(384), "year8");
  assert.equal(yearEndMilestone(385), null);
  assert.equal(yearEndMilestone(432), null); // 9 年目の終わりは節目ではない
});

test("工房 Lv の節目：Lv 2〜4 と Lv 5 = クリア", () => {
  assert.equal(levelMilestone(1), null);
  assert.equal(levelMilestone(2), "lv2");
  assert.equal(levelMilestone(4), "lv4");
  assert.equal(levelMilestone(5), "clear");
  assert.equal(levelMilestone(6), null);
});

test("期限の内側：383 週まで", () => {
  assert.equal(isWithinDeadline(383), true);
  assert.equal(isWithinDeadline(384), false);
});

test("週数を年・月・週に分ける", () => {
  assert.deepEqual(splitWeeks(0), { years: 0, months: 0, weeks: 0 });
  assert.deepEqual(splitWeeks(150), { years: 3, months: 1, weeks: 2 });
  assert.deepEqual(splitWeeks(-5), { years: 0, months: 0, weeks: 0 });
});

test("期限までの残り", () => {
  assert.deepEqual(remainingTime(0), { years: 8, months: 0, weeks: 0 });
  assert.deepEqual(remainingTime(383), { years: 0, months: 0, weeks: 1 });
  assert.deepEqual(remainingTime(400), { years: 0, months: 0, weeks: 0 });
});
