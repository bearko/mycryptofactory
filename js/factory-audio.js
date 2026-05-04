/**
 * factory-audio.js — BGM + SE 管理 (Phase 1D-6)
 *
 * - BGM: 全画面共通で 1 つの Audio 要素をループ再生する。
 *        画面遷移は CSS の hide/show なので継続再生される。
 *        ブラウザの autoplay policy により、初回はユーザー操作後 (タイトル
 *        画面タップなど) に play() を呼ぶ必要がある。
 * - SE:  毎回新しい Audio() を作成して 1 ショット再生 (同時再生に対応)。
 *        同じ SE が短時間に大量発火するケース (クラフト値獲得) には
 *        簡易スロットルを噛ませる。
 *
 * 音量や mute は将来 settings 画面から制御する想定で、API は外に出して
 * おく。
 */

/** 同梱の Audio フォルダへの相対パス。Vercel (Linux) は case-sensitive なので
 *  実際のディレクトリ名 (Audio) と完全一致させる。 */
const AUDIO_BASE = "./Audio/";

const BGM_FILE = "tooldev.mp3";
const SE_FILES = {
  /** ヒーローがクラフト値を獲得した瞬間 */
  craftGain:    "crash.mp3",
  /** オークション落札 / 出品成約 (取引成立) */
  saleSettled:  "open_treasure.mp3",
  /** クラフト確認画面で「クラフト開始」を押した瞬間 */
  craftStart:   "production.mp3",
  /** エクステンション完成画面の表示時 */
  craftDone:    "cp-mining-complete.mp3",
};

/** デフォルト音量 (0..1)。BGM は控えめ、SE は中ぐらい。 */
const BGM_VOLUME = 0.32;
const SE_VOLUME  = 0.55;

/** SE の連発防止スロットル (ms)。同じ key が間隔以下で発火したら無視。
 *  craftGain は数百ms間隔でも発火しうるので 80ms 程度で間引く。 */
const SE_THROTTLE_MS = {
  craftGain:    80,
  craftStart:   200,
  craftDone:    500,
  saleSettled:  500,
};

let _bgmEl = null;
let _muted = false;
const _lastSeAt = {};

/** BGM 用 Audio 要素を遅延作成 (file 取得前提) */
function ensureBgm() {
  if (_bgmEl) return _bgmEl;
  _bgmEl = new Audio(AUDIO_BASE + BGM_FILE);
  _bgmEl.loop = true;
  _bgmEl.volume = BGM_VOLUME;
  // 初回 play 時の autoplay 拒否を握り潰すため、 silent catch にする想定
  return _bgmEl;
}

/** BGM を再生開始 (既に再生中なら何もしない)。
 *  ブラウザの autoplay 制限により最初のユーザー操作後に呼ぶこと。
 *  promise を返さない (失敗時はサイレント)。 */
export function playBgm() {
  if (_muted) return;
  const el = ensureBgm();
  if (!el.paused && !el.ended) return;
  const p = el.play();
  if (p && typeof p.then === "function") {
    p.catch(() => { /* autoplay blocked: 諦める (次のユーザー操作で再 try されること期待) */ });
  }
}

/** BGM 一時停止 */
export function pauseBgm() {
  if (_bgmEl) _bgmEl.pause();
}

/** mute トグル */
export function setMuted(v) {
  _muted = !!v;
  if (_muted) pauseBgm();
  else        playBgm();
}
export function isMuted() { return _muted; }

/** BGM 音量設定 (0..1) */
export function setBgmVolume(v) {
  const el = ensureBgm();
  el.volume = Math.max(0, Math.min(1, v));
}

/** SE を 1 ショット再生 (同時再生に対応するため毎回新しい Audio 要素を作る)。
 *  スロットルにより同じ key の連発は間引く。
 *
 *  @param {keyof SE_FILES} seKey
 */
export function playSe(seKey) {
  if (_muted) return;
  const file = SE_FILES[seKey];
  if (!file) return;
  // 連発スロットル
  const now = Date.now();
  const wait = SE_THROTTLE_MS[seKey] || 0;
  if (wait > 0) {
    const last = _lastSeAt[seKey] || 0;
    if (now - last < wait) return;
    _lastSeAt[seKey] = now;
  }
  const a = new Audio(AUDIO_BASE + file);
  a.volume = SE_VOLUME;
  a.play().catch(() => { /* user gesture not yet present, ignore */ });
}

/** SE 全種をプリロード (任意)。タイトル画面などで一度呼んでおくと
 *  初回再生のラグを減らせる。 */
export function preloadAllSe() {
  for (const file of Object.values(SE_FILES)) {
    const a = new Audio(AUDIO_BASE + file);
    a.preload = "auto";
    // 何もしない (Audio オブジェクトは破棄されるが内部キャッシュには載る)
    a.load?.();
  }
}
