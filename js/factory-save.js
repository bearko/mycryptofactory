// セーブ（SPEC-002）。DOM に触れない関数だけ (= tests/save.test.mjs)。localStorage は引数で受け取る

export const SAVE_KEY = "mcf.save";
export const SAVE_VERSION = 1;

/** 保存しない state のキー (表示のための一時的なもの・画面の途中の選択) */
export const TRANSIENT_KEYS = [
  "pauseFlags", "notifications", "spriteFloats", "heroFlavors", "popupHeroId",
  "endgameStats", "endgameScore", "timeSpeed20x",
  "craftScreen", "craftPickedExtId", "craftPickedRemakeIdx", "craftPickedCommissionId",
  "firePendingId", "pendingHireCandIdx", "sellPickedIdx", "heroReturnTo",
];

function encodeValue(v) {
  if (v instanceof Set) return { __set: [...v].map(encodeValue) };
  if (Array.isArray(v)) return v.map((x) => (typeof x === "function" ? null : encodeValue(x)));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === "function" || x === undefined) continue;
      out[k] = encodeValue(x);
    }
    return out;
  }
  return v;
}

/** state を JSON にできる形に直す (Set → { __set }、関数と一時的なキーは捨てる) */
export function encodeState(state) {
  const out = {};
  for (const [k, v] of Object.entries(state)) {
    if (TRANSIENT_KEYS.includes(k) || typeof v === "function" || v === undefined) continue;
    out[k] = encodeValue(v);
  }
  return out;
}

function decodeValue(v, revive) {
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, revive));
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "__set" && Array.isArray(v.__set)) {
      return new Set(v.__set.map((x) => decodeValue(x, revive)));
    }
    const out = {};
    for (const k of keys) out[k] = decodeValue(v[k], revive);
    if (revive) revive(out);
    return out;
  }
  return v;
}

/** encodeState の逆。reviveObject(obj) は (Set 以外の) 全オブジェクトに 1 回ずつ呼ぶ */
export function decodeState(data, { reviveObject } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[k] = decodeValue(v, reviveObject);
  return out;
}

/** 書く。容量オーバー・プライベートモードなどで失敗しても例外を出さず false */
export function writeSave(storage, state, now = Date.now()) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, savedAt: now, state: encodeState(state) }));
    return true;
  } catch (e) {
    return false;
  }
}

/** 消す */
export function clearSave(storage) {
  try { storage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

/** 読む。ない・壊れている・版が違うときは null (壊れている・版が違うものは消す)。中身はまだ encode された形 */
export function readSave(storage) {
  let raw;
  try { raw = storage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (raw == null) return null;
  let data;
  try { data = JSON.parse(raw); } catch (e) { data = null; }
  if (!data || data.v !== SAVE_VERSION || !data.state || typeof data.state !== "object") {
    clearSave(storage);
    return null;
  }
  return { savedAt: data.savedAt || 0, state: data.state };
}

/** タイトルに出す要約 */
export function saveSummary(save) {
  const s = (save && save.state) || {};
  return {
    year: s.year, month: s.month, week: s.week,
    factoryLevel: s.factoryLevel || 1,
    cleared: s.clearedWeeks != null,
  };
}

/**
 * 表示しないヒーロー（SPEC-014）を、読み込んだ state から外す（state を直接書き換える）。
 * ヒーローの記録（heroId と nameJa を持つもの）は配列から取り除き、編成（team・craftTeam・questTeam）の ID は null にする
 */
export function dropExcludedHeroes(state, ids) {
  const excluded = new Set(ids);
  const isTeamKey = (k) => /team$/i.test(k);
  const walk = (v, key) => {
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) {
        const x = v[i];
        if (x && typeof x === "object" && excluded.has(x.heroId) && "nameJa" in x) v.splice(i, 1);
        else if (isTeamKey(key) && excluded.has(x)) v[i] = null;
        else walk(x, key);
      }
    } else if (v && typeof v === "object" && !(v instanceof Set)) {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  walk(state, "");
  return state;
}
