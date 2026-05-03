/**
 * i18n.js — JP/EN language switching
 *
 * Public API:
 *   getLang() / setLang(lang)
 *   t(key)                       — UI string lookup (data/i18n/ui.json)
 *   tHero(heroId, jaName)        — hero name lookup
 *   tExt(extId, jaName)          — extension name lookup
 *   tExtSkill(extId, jaName)     — extension active-skill name lookup
 *   tEnemy(enemyId, jaName)      — enemy name lookup
 *   tPassive(heroId, jaName)     — hero passive name lookup
 *   translateGameText(text)      — translates runtime-computed game text
 *                                   (effect strings like "PHYダメ 25-30%")
 *   onLangChange(handler)        — register a callback fired when lang changes
 *   applyDataI18n(root?)         — apply [data-i18n] attributes to text content
 *
 * Lang code: "ja" or "en". Default "ja". Persisted in localStorage("mct.lang").
 */

const LANG_KEY = "mct.lang";
const DEFAULT_LANG = "ja";

let _lang = DEFAULT_LANG;
let _ui = null;          // ui.json strings
let _heroes = null;      // heroes-en.json
let _exts = null;        // extensions-en.json
let _enemies = null;     // enemies-en.json
let _ready = false;
const _listeners = new Set();

export function getLang() { return _lang; }

export function setLang(lang) {
  if (lang !== "ja" && lang !== "en") return;
  if (lang === _lang) return;
  _lang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
  document.documentElement.setAttribute("lang", lang);
  applyDataI18n(document);
  for (const fn of _listeners) {
    try { fn(lang); } catch (e) { console.error("lang listener error", e); }
  }
}

export function onLangChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function isReady() { return _ready; }

/** Init: reads localStorage + fetches all i18n JSON files. */
export async function initI18n() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "ja" || stored === "en") _lang = stored;
  } catch (e) { /* ignore */ }
  document.documentElement.setAttribute("lang", _lang);

  const base = "data/i18n/";
  const [ui, heroes, exts, enemies] = await Promise.all([
    fetch(base + "ui.json").then(r => r.json()).catch(() => ({})),
    fetch(base + "heroes-en.json").then(r => r.json()).catch(() => ({})),
    fetch(base + "extensions-en.json").then(r => r.json()).catch(() => ({})),
    fetch(base + "enemies-en.json").then(r => r.json()).catch(() => ({})),
  ]);
  _ui = ui;
  _heroes = heroes;
  _exts = exts;
  _enemies = enemies;
  _ready = true;
}

/** UI string lookup. Returns key itself if not found. */
export function t(key, fallback) {
  if (!_ui) return fallback ?? key;
  const entry = _ui[key];
  if (!entry) return fallback ?? key;
  if (typeof entry === "string") return entry;
  return entry[_lang] ?? entry.ja ?? fallback ?? key;
}

function _lookupEn(table, id) {
  if (!table || id == null) return null;
  return table[String(id)] || null;
}

/** lang に関係なく EN 名を返すローレベルルックアップ。
 *  名前置換マップ構築のように「現在言語に依存させたくない」初期化処理から使う。 */
export function getEnHeroName(id)   { return _lookupEn(_heroes, id)?.name        || null; }
export function getEnEnemyName(id)  { return _lookupEn(_enemies, id)?.name       || null; }
export function getEnExtName(id)    { return _lookupEn(_exts, id)?.name          || null; }
export function getEnExtSkill(id)   { return _lookupEn(_exts, id)?.skillName     || null; }
export function getEnPassiveName(id){ return _lookupEn(_heroes, id)?.passiveName || null; }

/** Hero name. Returns JA name if EN unavailable. */
export function tHero(heroId, jaName) {
  if (_lang === "ja") return jaName ?? "";
  const e = _lookupEn(_heroes, heroId);
  return (e && e.name) ? e.name : (jaName ?? "");
}

export function tPassive(heroId, jaName) {
  if (_lang === "ja") return jaName ?? "";
  const e = _lookupEn(_heroes, heroId);
  return (e && e.passiveName) ? e.passiveName : (jaName ?? "");
}

/** Returns full English passive description (or JA fallback). */
export function tPassiveText(heroId, jaText) {
  if (_lang === "ja") return jaText ?? "";
  const e = _lookupEn(_heroes, heroId);
  const raw = (e && e.passiveText) ? e.passiveText : (jaText ?? "");
  return condensePassiveText(raw);
}

/**
 * Shorten the upstream MCH English passive text — verbose by default
 * ("After this hero uses an Active Skill, {triggerRate}% chance to trigger.
 *   / Decrease the first ally's PHY by 15% of this hero's PHY. / ...")
 * → terse game-y phrasing readable at a glance.
 */
function condensePassiveText(text) {
  if (!text) return "";
  let s = String(text);
  // Trigger preludes → compact tag at the start
  s = s.replace(/At the start of battle,?\s*\{triggerRate\}%\s*chance to trigger\.\s*\/?/gi, "[Battle start, {triggerRate}%]: ");
  s = s.replace(/At the start of battle,?\s*/gi, "[Battle start]: ");
  s = s.replace(/At the end of (?:the |this )?turn,?\s*\{triggerRate\}%\s*chance to trigger\.\s*\/?/gi, "[Turn end, {triggerRate}%]: ");
  s = s.replace(/At the start of (?:the |this )?turn,?\s*\{triggerRate\}%\s*chance to trigger\.\s*\/?/gi, "[Turn start, {triggerRate}%]: ");
  s = s.replace(/After this hero (?:uses|casts) an Active Skill,?\s*\{triggerRate\}%\s*chance to trigger\.\s*\/?/gi, "[After Active, {triggerRate}%]: ");
  s = s.replace(/After this hero takes damage(?: from an Active Skill)?,?\s*\{triggerRate\}%\s*chance to trigger\.\s*\/?/gi, "[On damaged, {triggerRate}%]: ");
  s = s.replace(/(?:If|When) this hero(?:'s)? HP (?:is|drops|becomes) (?:less than|below|under)\s*(\d+)% ,?\s*\{triggerRate\}%\s*chance to trigger(?: once)?\.\s*\/?/gi, "[HP<$1%, once, {triggerRate}%]: ");
  s = s.replace(/(?:If|When) this hero(?:'s)? HP (?:is|drops|becomes) (?:less than|below|under)\s*(\d+)% ,?\s*/gi, "[HP<$1%]: ");
  // "Deal damage to the first enemy equal to N% of this hero's PHY" → "first enemy: N% PHY"
  s = s.replace(/Deal damage to the first enemy equal to (\d+)% of this hero's (PHY|INT)\.?/gi, "front enemy: $1% $2 dmg.");
  s = s.replace(/Deal damage to the last enemy equal to (\d+)% of this hero's (PHY|INT)\.?/gi, "back enemy: $1% $2 dmg.");
  s = s.replace(/Deal damage to all enemies equal to (\d+)% of this hero's (PHY|INT)\.?/gi, "all enemies: $1% $2 dmg.");
  s = s.replace(/Deal damage to the enemy with the highest (PHY|INT|HP) equal to (\d+)% of this hero's (PHY|INT)\.?/gi, "highest-$1 enemy: $2% $3 dmg.");
  // Increase / Decrease X stat
  s = s.replace(/Increase the first ally's (PHY|INT|AGI|HP) by (\d+)% of this hero's (PHY|INT|AGI|HP)\.?/gi, "front ally: $1 +$2% (self $3).");
  s = s.replace(/Increase all allies' (PHY|INT|AGI|HP) by (\d+)% of this hero's (PHY|INT|AGI|HP)\.?/gi, "all allies: $1 +$2% (self $3).");
  s = s.replace(/Increase this hero's (PHY|INT|AGI|HP) by (\d+)% of this hero's (PHY|INT|AGI|HP)\.?/gi, "self: $1 +$2% (self $3).");
  s = s.replace(/Increase this hero's max (PHY|INT|AGI|HP) by (\d+)\.?/gi, "self: max-$1 +$2.");
  s = s.replace(/Decrease the first ally's (PHY|INT|AGI|HP) by (\d+)% of this hero's (PHY|INT|AGI|HP)\.?/gi, "front ally: $1 -$2% (self $3).");
  s = s.replace(/Decrease the first enemy's (PHY|INT|AGI|HP) by (\d+)% of this hero's (PHY|INT|AGI|HP)\.?/gi, "front enemy: $1 -$2% (self $3).");
  s = s.replace(/Decrease all enemies' (PHY|INT|AGI|HP) by (\d+)% of this hero's (PHY|INT|AGI|HP)\.?/gi, "all enemies: $1 -$2% (self $3).");
  // Status conditions
  s = s.replace(/\{successRate\}% chance to inflict (Bleed|Poison) on the (first|last|highest-PHY|highest-INT|highest-HP) enemy\.?/gi, "{successRate}% $2 enemy → $1.");
  s = s.replace(/\{successRate\}% chance to inflict (Bleed|Poison) on all enemies\.?/gi, "{successRate}% all enemies → $1.");
  // Generic cleanup
  s = s.replace(/this hero's /gi, "self ");
  s = s.replace(/this hero/gi, "self");
  s = s.replace(/\s*\/\s*/g, " · ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function tExt(extId, jaName) {
  if (_lang === "ja") return jaName ?? "";
  const e = _lookupEn(_exts, extId);
  return (e && e.name) ? e.name : (jaName ?? "");
}

export function tExtSkill(extId, jaName) {
  if (_lang === "ja") return jaName ?? "";
  const e = _lookupEn(_exts, extId);
  return (e && e.skillName) ? e.skillName : (jaName ?? "");
}

export function tEnemy(enemyId, jaName) {
  if (_lang === "ja") return jaName ?? "";
  const e = _lookupEn(_enemies, enemyId);
  return (e && e.name) ? e.name : (jaName ?? "");
}

// ─── Runtime text translation (computed effect strings, navigator etc.) ──

const RUNTIME_REPLACEMENTS = [
  // ─── 単語レベル (longer first to avoid partial overlap) ───
  [/PHY最高/g, "Highest PHY"],
  [/INT最高/g, "Highest INT"],
  [/HP最高/g,  "Highest HP"],
  [/AGI最高/g, "Highest AGI"],
  // 「敵INT -2」「敵PHY -1」: 既にカードのターゲット pill (Front 等) で陣営が
  // 分かるので「敵」プレフィックスは省略して PHY/INT/AGI/HP のみ残す。
  [/敵\s*INT\s*([+\-]?\d+)/g, "INT $1"],
  [/敵\s*PHY\s*([+\-]?\d+)/g, "PHY $1"],
  [/敵\s*AGI\s*([+\-]?\d+)/g, "AGI $1"],
  [/敵\s*HP\s*([+\-]?\d+)/g, "HP $1"],
  [/味方\s*INT\s*([+\-]?\d+)/g, "INT $1"],
  [/味方\s*PHY\s*([+\-]?\d+)/g, "PHY $1"],
  [/味方\s*AGI\s*([+\-]?\d+)/g, "AGI $1"],
  [/味方\s*HP\s*([+\-]?\d+)/g, "HP $1"],
  // 「ダメージ」を先に置換 → 残った「ダメ」だけを後で潰す。
  // 旧版は `/ダメ\b/g` を使っていたが JS の \b は非 ASCII の境界に発火しないため
  // 「25-30% ダメ」が翻訳されないままだった (shop カード券面で再発)。
  [/ダメージ/g, "DMG"],
  [/PHYダメ/g, "PHY DMG"],
  [/INTダメ/g, "INT DMG"],
  [/ダメ/g, "DMG"],
  [/PHY攻撃/g, "PHY attack"],
  [/INT攻撃/g, "INT attack"],
  [/出血/g, "Bleed"],
  [/毒/g, "Poison"],
  [/ドロー/g, "Draw"],
  [/ガード/g, "Guard"],
  [/シールド/g, "Shield"],
  [/回復/g, "Heal"],
  [/ダメージ/g, "DMG"],
  [/敵全体/g, "all enemies"],
  [/味方全体/g, "all allies"],
  [/先頭の敵/g, "the front enemy"],
  [/後尾の敵/g, "the back enemy"],
  [/中衛の敵/g, "the mid enemy"],
  [/先頭の味方/g, "the front ally"],
  [/後尾の味方/g, "the back ally"],
  [/中衛の味方/g, "the mid ally"],
  [/敵1体/g, "1 enemy"],
  [/敵\s*1\s*体/g, "1 enemy"],
  [/味方1人/g, "1 ally"],
  [/全員/g, "everyone"],
  [/自身/g, "self"],
  [/自分/g, "self"],
  [/に\s+/g, " to "],     // "敵に X" → "1 enemy to X"
  [/枚引く/g, "card(s)"],
  [/枚/g, ""],
  [/カードを/g, "cards "],
  [/その後、/g, "Then, "],
  [/その後/g, "Then "],
  [/想定/g, "est."],
  [/戦闘中ずっと/g, "for the whole battle"],
  [/戦闘開始時/g, "at battle start"],
  [/戦闘終了時/g, "at battle end"],
  [/ターン開始時/g, "at turn start"],
  [/ターン終了時/g, "at turn end"],
  [/ターン終了まで有効/g, "until end of turn"],
  [/ターン終了まで/g, "until end of turn"],
  // 「PHY を +2」「INT を -3」「AGI を +1」 → "PHY +2" 形式
  [/(PHY|INT|AGI|HP|Guard|Shield)\s*を\s*\+(\d+)/g, "$1 +$2"],
  [/(PHY|INT|AGI|HP|Guard|Shield)\s*を\s*-(\d+)/g, "$1 -$2"],
  [/(PHY|INT|AGI|HP|Guard|Shield)\s*を\s*\+(\d+)〜(\d+)/g, "$1 +$2~$3"],
  // 「Guardを 7 得る」「Shieldを 5 得る」→ "+7 Guard" / "+5 Shield"
  // 既に ガード→Guard / シールド→Shield 置換済みの状態で動く
  [/(Guard|Shield)\s*を\s*(\d+)\s*得る/g, "+$2 $1"],
  // 「INT を 2 下げる」「PHY を 1 上げる」 → "-2 INT" / "+1 PHY"
  [/(PHY|INT|AGI|HP)\s*を\s*(\d+)\s*下げる/g, "-$2 $1"],
  [/(PHY|INT|AGI|HP)\s*を\s*(\d+)\s*上げる/g, "+$2 $1"],
  // 「HP を回復係数 N% 分回復」→ "Heal N% of int coef"
  [/HP\s*を回復係数\s*(\d+)〜?(\d+)?%\s*分回復/g, (m, a, b) => b ? `Heal ${a}~${b}% of INT coef` : `Heal ${a}% of INT coef`],
  [/HP\s*を回復係数/g, "Heal of INT coef"],
  // 敵 / 味方 stand-alone (この後の所有格クリーンアップが効くよう、
  // 「敵の」「味方の」をここで先に消す)
  [/敵\s*の\s+/g, "enemy "],
  [/味方\s*の\s+/g, "ally "],
  [/敵/g, "enemy"],
  [/味方/g, "ally"],
  // 接続詞
  [/、/g, ", "],
  [/。/g, ". "],
  [/（/g, " ("],
  [/）/g, ") "],
  [/～/g, "~"],
  [/〜/g, "~"],
  [/×/g, "×"],
  // post-clean spaces
  [/ +/g, " "],
];

export function translateGameText(text) {
  if (_lang === "ja" || !text) return text ?? "";
  let out = String(text);
  for (const [pat, rep] of RUNTIME_REPLACEMENTS) {
    out = out.replace(pat, rep);
  }
  return out.trim();
}

/**
 * Translate MCT chapter / node codenames (Japanese ↔ English).
 * The full chapter name is "node : <codename>" in JA — we strip the prefix,
 * translate the codename, and rebuild as "node : <Codename>" for EN.
 *
 * Codenames are MCT proper nouns (well-known computers / pioneers / sites)
 * authored by the user; mapping list is fixed per user direction.
 */
const CHAPTER_NAME_MAP_JA_EN = {
  "アバカス":         "Abacus",
  "アタナソフ":       "Atanasoff",
  "アンティキティラ": "Antikythera",
  "ホレリス":         "Hollerith",
  "トロイ":           "Troy",
};

/** TargetSpec → short EN tag (e.g. "self" / "Front" / "All" / "Hi PHY").
 *  Falls back to raw label in JA mode. Designed for the card target pill
 *  which has very limited width (1–2 short words).
 */
const TARGET_LABEL_EN = {
  "self":             "Self",
  "ally.front":       "Front",
  "ally.mid":         "Mid",
  "ally.back":        "Back",
  "ally.foremost":    "Front",
  "ally.rearmost":    "Rear",
  "ally.all":         "All",
  "ally.random":      "Rnd",
  "ally.highest_phy": "Hi PHY",
  "ally.lowest_phy":  "Lo PHY",
  "ally.highest_int": "Hi INT",
  "ally.lowest_int":  "Lo INT",
  "ally.highest_hp":  "Hi HP",
  "ally.lowest_hp":   "Lo HP",
  "enemy.front":       "Front",
  "enemy.mid":         "Mid",
  "enemy.back":        "Back",
  "enemy.foremost":    "Front",
  "enemy.rearmost":    "Rear",
  "enemy.all":         "All",
  "enemy.random":      "Rnd",
  "enemy.highest_phy": "Hi PHY",
  "enemy.lowest_phy":  "Lo PHY",
  "enemy.highest_int": "Hi INT",
  "enemy.lowest_int":  "Lo INT",
  "enemy.highest_hp":  "Hi HP",
  "enemy.lowest_hp":   "Lo HP",
  "all":               "All",
  "all.random":        "AllRnd",
};

export function tTargetLabel(spec, jaLabel) {
  if (_lang === "ja") return jaLabel ?? spec ?? "";
  return TARGET_LABEL_EN[spec] || jaLabel || spec || "";
}

/** Caster role short EN labels (mirrors caster.js CASTER_ROLE_LABELS). */
const CASTER_ROLE_EN = {
  front:        "Front",
  mid:          "Mid",
  back:         "Back",
  foremost:     "Front",
  rearmost:     "Rear",
  highest_phy:  "Hi PHY",
  highest_int:  "Hi INT",
  highest_hp:   "Hi HP",
};

export function tCasterLabel(role, jaLabel) {
  if (_lang === "ja") return jaLabel ?? role ?? "";
  return CASTER_ROLE_EN[role] || jaLabel || role || "";
}

/**
 * 戦闘ログ (clog) で見かける慣用的な日本語フレーズを EN に短く翻訳する。
 * 動的に挿入されるヒーロー名・敵名・カード名は別途 tHero/tEnemy/tExt を
 * 通すので、ここはテンプレ部分のみカバー。
 */
const COMBAT_LOG_REPLACEMENTS = [
  // ── 角括弧つきヒーロー名・カード名 [XX] のラッパ
  [/が\【/g, " used ["],
  [/\】を使用/g, "]"],
  [/\】 ?発動！?/g, "] triggered!"],
  [/【/g, "["],
  [/】/g, "]"],
  // ── 状態異常 / 効果適用
  [/に出血\s*[×x]\s*(\d+)/g, " → Bleed×$1"],
  [/に毒\s*[×x]\s*(\d+)/g, " → Poison×$1"],
  [/出血\s*[×x]\s*(\d+)\s*追加/g, "Bleed×$1 added"],
  [/出血\s*[×x]\s*(\d+)\s*付与（敵全体）/g, "Bleed×$1 → all enemies"],
  [/出血\s*[×x]\s*(\d+)\s*付与（敵）/g, "Bleed×$1 → enemy"],
  [/出血\s*[×x]\s*(\d+)\s*付与/g, "Bleed×$1 applied"],
  [/毒\s*[×x]\s*(\d+)\s*付与（敵全体）/g, "Poison×$1 → all enemies"],
  [/毒\s*[×x]\s*(\d+)\s*付与（敵）/g, "Poison×$1 → enemy"],
  [/毒\s*[×x]\s*(\d+)\s*付与/g, "Poison×$1 applied"],
  [/出血ダメージ\s*(\d+)/g, "Bleed dmg $1"],
  [/毒ダメージ\s*(\d+)/g, "Poison dmg $1"],
  [/状態異常解除（自分）/g, "Status cleared (self)"],
  [/状態異常解除/g, "Status cleared"],
  // ── 戦闘ログ専用フレーズ
  [/休憩で HP\+(\d+)/g, "Rested for HP +$1"],
  [/購入:?\s*/g, "Purchased: "],
  [/シールド\s*\+?(\d+)/g, "Shield +$1"],
  [/ガード\s*\+(\d+)/g, "Guard +$1"],
  [/ドロー\s*(\d+)/g, "Draw $1"],
  [/カードを\s*(\d+)\s*枚引く/g, "draw $1"],
  [/捨て札をシャッフルして山に/g, "Reshuffled discard into deck"],
  [/クリティカル（PHY）/g, "Critical (PHY)"],
  [/クリティカル（INT）/g, "Critical (INT)"],
  [/敵クリティカル（PHY）/g, "Enemy critical (PHY)"],
  [/敵クリティカル（INT）/g, "Enemy critical (INT)"],
  [/不屈：?このターン被ダメ半減/g, "Steadfast: half DMG taken this turn"],
  [/不屈:?\s*ダメージ半減/g, "Steadfast: DMG halved"],
  [/不屈:?\s*ダメ半減/g, "Steadfast: DMG halved"],
  [/特殊ダメージ（最大HP\s*(\d+)%）→ HP-(\d+)/g, "Special DMG (max HP $1%) → HP -$2"],
  [/PHY全体攻撃\s*(\d+)%\s*→\s*合計ダメ\s*(\d+)/g, "PHY area $1% → total $2 DMG"],
  [/INT全体攻撃\s*(\d+)%\s*→\s*合計ダメ\s*(\d+)/g, "INT area $1% → total $2 DMG"],
  [/敵\s*PHY\s*(\d+)%\s*→\s*被ダメージ\s*(\d+)/g, "Enemy PHY $1% → DMG taken $2"],
  [/敵\s*INT\s*(\d+)%\s*→\s*被ダメージ\s*(\d+)/g, "Enemy INT $1% → DMG taken $2"],
  // プレイヤーの単体攻撃 clog "PHY攻撃 50% → 基礎4 カット8% → HP-4" 等
  [/PHY攻撃\s*(\d+)%\s*→\s*基礎(\d+)\s*カット(\d+)%/g, "PHY $1% → base $2 cut $3%"],
  [/INT攻撃\s*(\d+)%\s*→\s*基礎(\d+)\s*カット(\d+)%/g, "INT $1% → base $2 cut $3%"],
  [/\+脆弱(\d+)/g, "+Vuln $1"],
  [/脆弱/g, "Vuln"],
  [/敵\s*PHY\s*(-?\d+)/g, "Enemy PHY $1"],
  [/敵\s*INT\s*(-?\d+)/g, "Enemy INT $1"],
  [/リカバリー:\s*係数(.+)/g, "Recovery: coef $1"],
  [/HP\+(\d+)（自己回復）/g, "HP +$1 (self heal)"],
  [/HP\+(\d+)/g, "HP +$1"],
  [/HP-(\d+)/g, "HP -$1"],
  [/(\S+)\s*行動:\s*guard/g, "$1 action: guard"],
  [/(\S+)\s*行動:\s*buffSelf/g, "$1 action: self buff"],
  [/(\S+)\s*行動:\s*healSelf/g, "$1 action: self heal"],
  [/(\S+)\s*行動:\s*([a-zA-Z]+)/g, "$1 action: $2"],
  [/致死ダメージを耐えた！HP\s*1\s*で生存！/g, "Survived a lethal hit at HP 1!"],
  [/致死ダメ.*$/g, "Survived a lethal hit at HP 1!"],
  [/付与/g, "applied"],
  [/(\d+)\s*ダメ\b/g, "$1 DMG"],
  [/ダメージ/g, "DMG"],
  [/ダメ/g, "DMG"],
  [/(\d+)\s*回復/g, "+$1 HP"],
  // 休憩 / 自己回復 / 強化 のラベル
  [/自己回復/g, "self heal"],
  [/強化/g, "buff"],
  [/防御/g, "guard"],
  [/敵全体/g, "all enemies"],
  [/敵/g, "enemy"],
  [/（/g, " ("],
  [/）/g, ")"],
];

/**
 * Reverse name index: { jaName → enName } for heroes / extensions / enemies.
 * Built lazily from the loaded i18n JSON tables. The original game stores
 * proper-noun JA strings in many places (cards.js play(), boss intent etc.),
 * so the combat-log post-processor scans for any known JA name and swaps to
 * EN. We sort by length DESC so longer names match first ("ゴースト・上杉
 * 謙信" before "上杉謙信").
 */
let _nameJaEnIndex = null;
function ensureNameIndex() {
  if (_nameJaEnIndex) return _nameJaEnIndex;
  const out = new Map();
  // We don't have JA-side names here (only EN tables loaded). The runtime
  // injects them through tHero/tEnemy/tExt at the call site. For combat
  // log we instead rely on the calling code to swap names; this map stays
  // empty until we learn names dynamically.
  _nameJaEnIndex = out;
  return out;
}

/** Allow runtime registration of a JA→EN name mapping (called from main.js
 *  when heroes / enemies / extensions data is loaded). */
export function registerNameMapping(jaName, enName) {
  if (!jaName || !enName || jaName === enName) return;
  const idx = ensureNameIndex();
  idx.set(jaName, enName);
  _sortedKeys = null;
}

let _sortedKeys = null;
function sortedKeys() {
  if (_sortedKeys) return _sortedKeys;
  const idx = ensureNameIndex();
  _sortedKeys = [...idx.keys()].sort((a, b) => b.length - a.length);
  return _sortedKeys;
}

export function translateCombatLog(text) {
  if (_lang === "ja" || !text) return text ?? "";
  let out = String(text);
  // 1) Substitute proper nouns first (longest-first to avoid prefix collision)
  const idx = ensureNameIndex();
  for (const ja of sortedKeys()) {
    if (out.indexOf(ja) >= 0) {
      const en = idx.get(ja);
      out = out.split(ja).join(en);
    }
  }
  // 2) Pattern translations
  for (const [re, rep] of COMBAT_LOG_REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

export function tChapterName(jaName) {
  if (_lang === "ja" || !jaName) return jaName ?? "";
  // Match patterns "node : XXX" / "node :XXX" / bare "XXX"
  const m = String(jaName).match(/^(node\s*:\s*)?(.+)$/);
  const prefix = m && m[1] ? m[1] : "";
  const body   = m && m[2] ? m[2] : String(jaName);
  const en = CHAPTER_NAME_MAP_JA_EN[body];
  return en ? (prefix ? "node : " + en : en) : jaName;
}

/** Apply [data-i18n] attributes to update DOM text on lang change. */
export function applyDataI18n(root) {
  const r = root || document;
  // [data-i18n="key"] → element.textContent
  r.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const v = t(key);
    if (v != null) el.textContent = v;
  });
  // [data-i18n-html="key"] → element.innerHTML (for content with markup)
  r.querySelectorAll("[data-i18n-html]").forEach(el => {
    const key = el.getAttribute("data-i18n-html");
    if (!key) return;
    const v = t(key);
    if (v != null) el.innerHTML = v;
  });
  // [data-i18n-attr-<attr>="key"] → element.setAttribute(attr, t(key))
  // Used for placeholder, title, aria-label, etc.
  r.querySelectorAll("*").forEach(el => {
    for (const a of Array.from(el.attributes)) {
      if (!a.name.startsWith("data-i18n-attr-")) continue;
      const targetAttr = a.name.slice("data-i18n-attr-".length);
      const v = t(a.value);
      if (v != null) el.setAttribute(targetAttr, v);
    }
  });
}
