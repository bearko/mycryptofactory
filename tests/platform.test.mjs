// bearko.games 共通基盤（総合スコア）に送る成績。実行: node --test tests/platform.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weeksSinceStart, scoreMetrics, reportProgress, finalizeScore,
  rtaCheckpointFor, isRtaAvailable, isRtaRunning, rtaStart, rtaMilestone, rtaAbort,
  trophiesFor, syncTrophies, CLEAR_3Y_WEEKS,
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

test("トロフィー：条件（SPEC-009 3.1）", () => {
  assert.deepEqual(trophiesFor({}), []);
  assert.deepEqual(trophiesFor({ factoryLevel: 1, craftedByRarity: { epic: 9, legendary: 0 } }), []);
  assert.deepEqual(trophiesFor({ factoryLevel: 2 }), ["factory.lv2"]);
  assert.deepEqual(trophiesFor({ factoryLevel: 3, craftedByRarity: { legendary: 1 } }), ["factory.lv2", "factory.legendary"]);
  assert.deepEqual(trophiesFor({ factoryLevel: 5, clearedWeeks: CLEAR_3Y_WEEKS }), ["factory.lv2", "factory.clear", "factory.clear3y"]);
  assert.deepEqual(trophiesFor({ factoryLevel: 5, clearedWeeks: CLEAR_3Y_WEEKS + 1 }), ["factory.lv2", "factory.clear"]);
  assert.deepEqual(trophiesFor({ factoryLevel: 5, clearedWeeks: null }), ["factory.lv2"], "期限を過ぎた Lv.5 はクリアではない");
  assert.equal(CLEAR_3Y_WEEKS, weeksSinceStart({ year: 2021, month: 12, week: 1, startYear: 2018 }));
});

test("トロフィー：まだ送っていないものだけ送る・SDK がない・失敗しても例外を出さない", async () => {
  assert.doesNotThrow(() => syncTrophies({ factoryLevel: 5, clearedWeeks: 100 }));
  const sent = [];
  globalThis.window = { BearkoGames: { unlockTrophy: (id) => { sent.push(id); return Promise.resolve({ ok: true }); } } };
  try {
    syncTrophies({ factoryLevel: 2 });
    syncTrophies({ factoryLevel: 2 });
    await syncTrophies({ factoryLevel: 3, craftedByRarity: { legendary: 2 } });
    assert.deepEqual(sent, ["factory.lv2", "factory.legendary"]);
    // 1 つずつ順に送る (前の返事が来てから次)
    const order = [];
    let release;
    globalThis.window.BearkoGames.unlockTrophy = (id) => { order.push(`start ${id}`); return new Promise((r) => { release = () => { order.push(`end ${id}`); r({ ok: true }); }; }); };
    const done = syncTrophies({ factoryLevel: 5, clearedWeeks: 100 });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(order, ["start factory.clear"]);
    release(); await new Promise((r) => setTimeout(r, 0));
    release(); await done;
    assert.deepEqual(order, ["start factory.clear", "end factory.clear", "start factory.clear3y", "end factory.clear3y"]);
    globalThis.window.BearkoGames.unlockTrophy = () => { throw new Error("x"); };
    assert.doesNotThrow(() => syncTrophies({ factoryLevel: 5, clearedWeeks: 300 }));
    globalThis.window.BearkoGames.unlockTrophy = () => Promise.reject(new Error("x"));
    assert.doesNotThrow(() => syncTrophies({ factoryLevel: 5, clearedWeeks: 100 }));
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    delete globalThis.window;
  }
});
