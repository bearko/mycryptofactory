// 設定（SPEC-005）：音（BGM・効果音のオン／オフと音量）と演出を減らす。DOM に触れない関数だけ (= tests/settings.test.mjs)
// 保存先は localStorage の mcf.settings。セーブ（mcf.save）とは別で、「はじめから」でも消えない

export const SETTINGS_KEY = "mcf.settings";

export const DEFAULT_SETTINGS = Object.freeze({
  bgmOn: true,
  seOn: true,
  bgmVolume: 1, // 0..1。既定の音量 (BGM 0.32 / SE 0.55) に掛ける
  seVolume: 1,
  motion: "auto", // "auto" = 端末の設定に合わせる / "reduce" = 減らす
});

const clamp01 = (v, d) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** 壊れた値・知らない値を既定に戻す */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    bgmOn: typeof s.bgmOn === "boolean" ? s.bgmOn : DEFAULT_SETTINGS.bgmOn,
    seOn: typeof s.seOn === "boolean" ? s.seOn : DEFAULT_SETTINGS.seOn,
    bgmVolume: clamp01(s.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
    seVolume: clamp01(s.seVolume, DEFAULT_SETTINGS.seVolume),
    motion: s.motion === "reduce" ? "reduce" : "auto",
  };
}

export function readSettings(storage) {
  try {
    const raw = storage && storage.getItem(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return normalizeSettings(null);
  }
}

export function writeSettings(storage, settings) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (e) {
    return false;
  }
}

/** 演出を減らすか。osPrefersReduced は matchMedia("(prefers-reduced-motion: reduce)").matches */
export function isReducedMotion(settings, osPrefersReduced) {
  return settings.motion === "reduce" || !!osPrefersReduced;
}
