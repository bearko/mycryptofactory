// 設定（SPEC-005・SPEC-011）。実行: node --test tests/settings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings, readSettings, writeSettings, isReducedMotion,
  snapVolume, volumeLabel,
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

test("SPEC-011：音量は 20 段階（5% 刻み）に丸め、0..1 に収める", () => {
  assert.equal(snapVolume(0.37), 0.35);
  assert.equal(snapVolume(0.62), 0.6);
  assert.equal(snapVolume(0.999), 1);
  assert.equal(snapVolume(0.024), 0);
  assert.equal(snapVolume(-1), 0);
  assert.equal(snapVolume(3), 1);
  assert.equal(snapVolume(0.65), 0.65);
  assert.equal(snapVolume("x", 0.5), 0.5);
  assert.equal(snapVolume(NaN, 1), 1);
  assert.equal(snapVolume(undefined), 0);
  // 読み書きの途中でも丸める（いままでの保存はそのまま読める）
  assert.deepEqual(normalizeSettings({ bgmVolume: 0.37, seVolume: 0.62 }), { ...DEFAULT_SETTINGS, bgmVolume: 0.35, seVolume: 0.6 });
  assert.deepEqual(readSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ bgmVolume: 0.5, seVolume: 1 }) })),
    { ...DEFAULT_SETTINGS, bgmVolume: 0.5, seVolume: 1 });
});

test("SPEC-011：画面に出す段階。0 は OFF、ほかは「65%」", () => {
  assert.equal(volumeLabel(0), "OFF");
  assert.equal(volumeLabel(0, "オフ"), "オフ");
  assert.equal(volumeLabel(0.65), "65%");
  assert.equal(volumeLabel(1), "100%");
  assert.equal(volumeLabel(0.37), "35%");
  assert.equal(volumeLabel(0.02), "OFF");
});

test("演出を減らす：設定か端末のどちらかで", () => {
  assert.equal(isReducedMotion({ motion: "auto" }, false), false);
  assert.equal(isReducedMotion({ motion: "auto" }, true), true);
  assert.equal(isReducedMotion({ motion: "reduce" }, false), true);
});
