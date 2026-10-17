// bearko.games 共通基盤（総合スコア）に送る成績。実行: node --test tests/platform.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weeksSinceStart, scoreMetrics, reportProgress, finalizeScore,
  rtaCheckpointFor, isRtaAvailable, isRtaRunning, rtaStart, rtaMilestone, rtaAbort,
} from "../js/platform.js";

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

test("期限で止めたあとは送らない", () => {
  const sent = [];
  globalThis.window = { BearkoGames: { submitScore: (m, o) => { sent.push([m, o]); return Promise.resolve({ ok: true }); } } };
  try {
    const st = { factoryLevel: 3, questClearCount: 2 };
    finalizeScore(st);
    assert.equal(st.scoreFrozen, true);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0][1], { quiet: true });
    st.factoryLevel = 5; st.lv5Weeks = 400;
    reportProgress(st, { milestone: true });
    finalizeScore(st);
    assert.equal(sent.length, 1);
  } finally {
    delete globalThis.window;
  }
});

test("RTA：節目 → 区切り。年の終わりは送らない", () => {
  assert.equal(rtaCheckpointFor("lv2"), "lv2");
  assert.equal(rtaCheckpointFor("lv4"), "lv4");
  assert.equal(rtaCheckpointFor("clear"), "clear");
  assert.equal(rtaCheckpointFor("year1"), null);
  assert.equal(rtaCheckpointFor("year8"), null);
});

test("RTA：計測中だけ区切り・中断を送り、clear で終わる", () => {
  const calls = [];
  const rta = {
    start: (o) => { calls.push(["start", o]); return Promise.resolve({ ok: true }); },
    checkpoint: (id, o) => { calls.push(["checkpoint", id, o]); return Promise.resolve({ ok: true }); },
    abort: () => { calls.push(["abort"]); return Promise.resolve({ ok: true }); },
  };
  globalThis.window = { BearkoGames: { rta } };
  try {
    rtaMilestone("lv2", 1); // 計測していない
    rtaAbort();
    assert.equal(calls.length, 0);
    assert.equal(isRtaAvailable(), true);
    rtaStart(60);
    assert.deepEqual(calls[0], ["start", { regulation: "factory-lv5", timerOffset: 60 }]);
    rtaMilestone("year1", 1000);
    rtaMilestone("lv2", 2000);
    rtaMilestone("clear", 3000);
    assert.equal(isRtaRunning(), false);
    rtaMilestone("lv3", 4000);
    rtaAbort();
    assert.deepEqual(calls.slice(1), [["checkpoint", "lv2", { igtMs: 2000 }], ["checkpoint", "clear", { igtMs: 3000 }]]);
    rtaStart(0);
    rtaAbort();
    assert.deepEqual(calls.at(-1), ["abort"]);
  } finally {
    delete globalThis.window;
  }
});

test("RTA：SDK がない・例外を出すときも例外を出さない", () => {
  assert.equal(isRtaAvailable(), false);
  assert.doesNotThrow(() => { rtaStart(); rtaMilestone("lv2", 1); rtaAbort(); });
  globalThis.window = { BearkoGames: { rta: { start() { throw new Error("x"); }, checkpoint() { throw new Error("x"); }, abort() { throw new Error("x"); } } } };
  try {
    assert.doesNotThrow(() => { rtaStart(); rtaMilestone("lv2", 1); rtaAbort(); });
  } finally {
    delete globalThis.window;
  }
});
