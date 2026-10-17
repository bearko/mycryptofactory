// 設定（SPEC-005）。実行: node --test tests/settings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings, readSettings, writeSettings, isReducedMotion,
} from "../js/factory-settings.js";

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test("既定値と、壊れた値の正規化", () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(normalizeSettings({ bgmOn: "no", seVolume: 3, bgmVolume: -1, motion: "wild" }),
    { bgmOn: true, seOn: true, bgmVolume: 0, seVolume: 1, motion: "auto" });
});

test("書いて読むと戻る", () => {
  const st = mem();
  assert.equal(writeSettings(st, { bgmOn: false, seOn: true, bgmVolume: 0.4, seVolume: 0.7, motion: "reduce" }), true);
  assert.deepEqual(readSettings(st), { bgmOn: false, seOn: true, bgmVolume: 0.4, seVolume: 0.7, motion: "reduce" });
});

test("壊れた JSON・使えない localStorage でも既定値", () => {
  assert.deepEqual(readSettings(mem({ [SETTINGS_KEY]: "{oops" })), { ...DEFAULT_SETTINGS });
  const bad = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); } };
  assert.deepEqual(readSettings(bad), { ...DEFAULT_SETTINGS });
  assert.equal(writeSettings(bad, DEFAULT_SETTINGS), false);
});

test("演出を減らす：設定か端末のどちらかで", () => {
  assert.equal(isReducedMotion({ motion: "auto" }, false), false);
  assert.equal(isReducedMotion({ motion: "auto" }, true), true);
  assert.equal(isReducedMotion({ motion: "reduce" }, false), true);
});
