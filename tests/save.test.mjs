// セーブ（SPEC-002）。実行: node --test tests/save.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SAVE_KEY, SAVE_VERSION, encodeState, decodeState, writeSave, readSave, clearSave, saveSummary,
} from "../js/factory-save.js";

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    has: (k) => m.has(k),
  };
}

const sample = () => ({
  year: 2021, month: 4, week: 2, factoryLevel: 3, gum: 1234,
  landPasses: new Set(["ruby"]),
  factoryLvPrompted: new Set([2, 3]),
  ownedHeroes: [{ heroId: 1001, nameJa: "シートン", img: () => "x.png", stamina: { current: 5, max: 10 } }],
  activeCraft: { extId: 7, team: [1001, null], nested: { tags: new Set(["a", "b"]) } },
  milestones: { lv2: 30 },
  clearedWeeks: null,
  pauseFlags: 2, notifications: [{ id: 1 }], craftScreen: "confirm",
  callback: () => 1,
});

test("Set（入れ子も）が戻り、関数と一時的なキーは保存しない", () => {
  const enc = encodeState(sample());
  const json = JSON.parse(JSON.stringify(enc));
  assert.equal("pauseFlags" in json, false);
  assert.equal("notifications" in json, false);
  assert.equal("craftScreen" in json, false);
  assert.equal("callback" in json, false);
  assert.equal("img" in json.ownedHeroes[0], false);
  assert.deepEqual(json.landPasses, { __set: ["ruby"] });

  const dec = decodeState(json);
  assert.ok(dec.landPasses instanceof Set && dec.landPasses.has("ruby"));
  assert.deepEqual([...dec.factoryLvPrompted], [2, 3]);
  assert.deepEqual([...dec.activeCraft.nested.tags], ["a", "b"]);
  assert.deepEqual(dec.activeCraft.team, [1001, null]);
  assert.equal(dec.clearedWeeks, null);
  assert.equal(dec.gum, 1234);
});

test("reviveObject は全オブジェクトに呼ばれる（img を付け直せる）", () => {
  const json = JSON.parse(JSON.stringify(encodeState(sample())));
  const dec = decodeState(json, {
    reviveObject(o) { if (typeof o.heroId === "number") o.img = () => `Image/Heroes/${o.heroId}.png`; },
  });
  assert.equal(dec.ownedHeroes[0].img(), "Image/Heroes/1001.png");
});

test("書いて読むと戻る", () => {
  const st = memoryStorage();
  assert.equal(writeSave(st, sample(), 42), true);
  const save = readSave(st);
  assert.equal(save.savedAt, 42);
  assert.equal(decodeState(save.state).factoryLevel, 3);
  assert.deepEqual(saveSummary(save), { year: 2021, month: 4, week: 2, factoryLevel: 3, cleared: false });
});

test("版が違う・壊れたセーブは null で、消える", () => {
  const old = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: SAVE_VERSION + 1, state: { year: 2020 } }) });
  assert.equal(readSave(old), null);
  assert.equal(old.has(SAVE_KEY), false);
  const broken = memoryStorage({ [SAVE_KEY]: "{not json" });
  assert.equal(readSave(broken), null);
  assert.equal(broken.has(SAVE_KEY), false);
  assert.equal(readSave(memoryStorage()), null);
});

test("localStorage が使えなくても例外を出さない", () => {
  const bad = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("denied"); } };
  assert.equal(writeSave(bad, sample()), false);
  assert.equal(readSave(bad), null);
  assert.doesNotThrow(() => clearSave(bad));
});

test("クリア済みの要約", () => {
  assert.equal(saveSummary({ state: { clearedWeeks: 200, factoryLevel: 5 } }).cleared, true);
});
