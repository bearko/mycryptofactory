/**
 * main.js — MyCryptoFactory v2.0.0 (Phase 0 shell)
 *
 * Phase 0 scope:
 *   - Title screen (legacy) → workshop view
 *   - Header: week + GUM + circle gauge + lang/help buttons
 *   - Workshop view: background + (placeholder) hero sprites + MENU button
 *   - Order panel (currently always "no order"; orders come in Phase 1)
 *   - Time progression: 1 week = 7 seconds, paused while menu/stub open
 *   - Menu modal with 6 items (all but Settings → "coming soon" stub)
 *
 * Out of scope (Phase 1+):
 *   - Crafting (orders / recipes / progress / hero assignment)
 *   - Quests (node selection, materials)
 *   - Shop (buy materials)
 *   - Market (sell crafted exts)
 *   - Hero assignment / params (Garuda / Ifrit / Leviathan / Tiamat)
 */

import {
  initI18n,
  getLang,
  setLang,
  onLangChange,
  applyDataI18n,
  t as ti18n,
  tHero,
} from "./i18n.js";
import { loadHeroes, HERO_ROSTER } from "./heroes.js";
import {
  buildOwnedHeroes,
  craftLevel,
  elementValueForCraft,
  ELEMENTS,
  elementIconUrl,
  HERO_STATE,
  staminaDecayPerTick,
  staminaRecoverPerTick,
  rollCraftGain,
  rollPassiveTrigger,
  isFullyRested,
  isExhausted,
  adjustStamina,
} from "./factory-hero.js";
import {
  loadExtensions,
  EXTENSIONS,
  EXTENSION_BY_ID,
  extElementTargets,
  recipeFor,
  estimateDurationWeeks,
  extIconUrl,
  sortByIdAsc,
  sortBySumAsc,
  craftAvailability,
  sortByCraftability,
  teamCraftLevelTotal,
  craftLevelRequiredFor,
} from "./factory-craft.js";
import {
  MATERIALS,
  materialName,
  materialIcon,
  buildInitialInventory,
} from "./factory-material.js";

const APP_VERSION = "alpha";
const TEAM_SIZE = 5;

/** ─── State ──────────────────────────────────────────────────────── */
const state = {
  // Calendar (in-game time). Game starts 2018年 12月 1週.
  year: 2018,
  month: 12,
  week: 1, // 1..4 within month
  weekProgress: 0, // 0..6 (seconds elapsed within current week, ticks 1/sec)
  // Resources
  gum: 500,
  // Active craft (Phase 1B). Set when player taps クラフト開始.
  // { extId, team: [heroId|null × 5], targets: {...}, progress: {...},
  //   recipe: [{id, qty}], startedAtWeek: <int>, durationWeeks: <int> }
  activeCraft: null,
  // Pause flags (any !==0 means time is paused)
  pauseFlags: 0,
  // Phase 1A: hero roster + craft team
  ownedHeroes: /** @type {ReturnType<typeof buildOwnedHeroes>} */ ([]),
  craftTeam: /** @type {Array<number|null>} */ (new Array(TEAM_SIZE).fill(null)),
  // Hero list UI
  heroSort: "cl-desc",
  /** Where the hero view should return to when the player taps ←戻る.
   *  "home"  — close hero view and resume on the workshop
   *  "craft" — close hero view and re-open the craft confirmation screen
   *           (so picking a team for an in-flight craft confirmation flows naturally)
   */
  heroReturnTo: "home",
  // Material inventory (Phase 1B 仮置き — 全種 10 個ずつ)。
  // 入手手段 (クエスト/ショップ) は別 Phase で実装予定。
  materials: /** @type {Record<string, number>} */ (buildInitialInventory(10)),
  // Craft view UI (Phase 1B)
  // デフォルトは「クラフト可能順」(素材足りる→高レアリティ→シリーズ若い順)
  craftSort: "craftability",
  craftScreen: "select",   // "select" | "confirm"
  craftPickedExtId: null,  // ext currently being confirmed
  /** Phase 1B-2 通知キュー: パッシブ発動などのテキストを格納し、
   *  ヘッダー下のバナーに最新数件を流し込む。auto-fade で消える。
   *  各要素: { id: number, text: string, element: string, value: number,
   *          createdTick: number } */
  notifications: /** @type {Array<object>} */ ([]),
  /** Phase 1B-2 工房スプライト浮上値 (+N) のキュー。
   *  各 tick で発生したクラフト値獲得を一覧表示し、CSS animation で消える。
   *  各要素: { id: number, slotIdx: number, element: string, value: number,
   *          createdTick: number } */
  spriteFloats: /** @type {Array<object>} */ ([]),
  /** モノトニック tick カウンタ (notifications/spriteFloats の time-based GC 用) */
  tickCount: 0,
  /** 直近にタップされた工房ヒーロー (詳細ポップアップ表示用) */
  popupHeroId: null,
  /** クラフト完了直後 ─ Mai の通知 → 完成画面 → 倉庫格納 までの一時保持。
   *  activeCraft からそのままコピーされ、完成画面を閉じるときに warehouse に
   *  push され null に戻る。 */
  pendingCompletion: /** @type {object | null} */ (null),
  /** 完成済みエクステンションの倉庫 (Phase 1B-3 で push、Phase 1B-5 のマーケット
   *  ＞倉庫タブで一覧表示する想定)。各要素:
   *  { extId, achievedAt:{year,month,week}, achievedTicks, durationActualWeeks,
   *    progress:{...}, targets:{...}, qualityRatio: number, qualityTier: string } */
  warehouse: /** @type {Array<object>} */ ([]),
};

/** 通知バナー / 浮上値ともに 4 秒 = 4 tick で消える */
const NOTIFICATION_TTL_TICKS = 4;

const TICK_INTERVAL_MS = 1000;        // 1 in-game tick per real second
const SECONDS_PER_WEEK = 7;           // 1 week = 7 ticks
const WEEKS_PER_MONTH = 4;            // simplified: 4 weeks/month
let _tickHandle = null;

/** ─── DOM helpers ────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

/** ─── Time progression ──────────────────────────────────────────── */
function startTimeLoop() {
  if (_tickHandle) return;
  _tickHandle = setInterval(onTick, TICK_INTERVAL_MS);
}
function stopTimeLoop() {
  if (_tickHandle) { clearInterval(_tickHandle); _tickHandle = null; }
}

function pauseTime() { state.pauseFlags++; }
function resumeTime() {
  state.pauseFlags = Math.max(0, state.pauseFlags - 1);
}

function onTick() {
  if (state.pauseFlags > 0) return;
  state.tickCount += 1;
  state.weekProgress += 1;
  if (state.weekProgress >= SECONDS_PER_WEEK) {
    advanceWeek();
  }
  // Phase 1B-2: クラフト中の per-tick simulation (4色獲得 / HP消費 / 睡眠 / パッシブ)
  if (state.activeCraft) {
    tickActiveCraft();
  }
  // Notifications/floats の TTL GC + 描画更新
  pruneEphemerals();
  renderHeader();
  renderWorkshop();
  renderNotifications();
  renderOrderPanel();
}

/** activeCraft が存在するときの 1 tick 処理。
 *  - 配属ヒーローごとに stamina decay / recovery 処理
 *  - 起きているヒーローはクラフト値獲得をロール
 *  - 起きているヒーローはパッシブ発動をロール
 *  - 進捗 (state.activeCraft.progress) を加算 */
function tickActiveCraft() {
  const ac = state.activeCraft;
  if (!ac) return;
  for (let slotIdx = 0; slotIdx < ac.team.length; slotIdx++) {
    const heroId = ac.team[slotIdx];
    if (heroId == null) continue;
    const hero = findHero(heroId);
    if (!hero) continue;
    // 1. stamina 状態遷移
    if (hero.state === HERO_STATE.RESTING) {
      // 回復 → max まで戻れば CRAFTING に戻る
      adjustStamina(hero, staminaRecoverPerTick(hero));
      if (isFullyRested(hero)) hero.state = HERO_STATE.CRAFTING;
    } else {
      // 消費 → 0 で RESTING に落ちる (このターンは獲得しない)
      adjustStamina(hero, -staminaDecayPerTick(hero));
      if (isExhausted(hero)) {
        hero.state = HERO_STATE.RESTING;
        continue;
      }
    }
    // 睡眠中は 4 色獲得 / パッシブ なし
    if (hero.state === HERO_STATE.RESTING) continue;
    // 2. 4 色獲得ロール
    const gain = rollCraftGain(hero);
    if (gain) {
      ac.progress[gain.element] = (ac.progress[gain.element] || 0) + gain.value;
      pushSpriteFloat(slotIdx, gain.element, gain.value);
    }
    // 3. パッシブ発動ロール
    const passive = rollPassiveTrigger(hero);
    if (passive) {
      ac.progress[passive.element] = (ac.progress[passive.element] || 0) + passive.value;
      pushPassiveNotification(hero, passive);
    }
  }
  // 4. クラフト完了判定 (target>0 の全色が target を満たす = 進捗 100%)
  if (isCraftComplete(ac)) {
    triggerCraftCompletion(ac);
  }
}

/** target > 0 の色がすべて progress >= target に到達したか。
 *  target = 0 の色は無視 (= 不要色)。 */
function isCraftComplete(ac) {
  for (const k of ELEMENTS) {
    const tgt = ac.targets[k] || 0;
    if (tgt <= 0) continue;
    if ((ac.progress[k] || 0) < tgt) return false;
  }
  return true;
}

/** 完成判定発火 ─ activeCraft を pendingCompletion に移し、
 *  Mai の通知 → 完成画面を順に表示する。 */
function triggerCraftCompletion(ac) {
  // 実所要週数 (進捗 0 → 完了までの実時間)
  const elapsedTicks = state.tickCount - (ac.startedAtTick || 0);
  const actualWeeks  = Math.max(1, Math.ceil(elapsedTicks / SECONDS_PER_WEEK));
  // 品質 ratio = 全色合計 (cap なし) / 全色 target 合計
  let progSum = 0, tgtSum = 0;
  for (const k of ELEMENTS) {
    progSum += ac.progress[k] || 0;
    tgtSum  += ac.targets[k]  || 0;
  }
  const qualityRatio = tgtSum > 0 ? progSum / tgtSum : 1;
  const qualityTier  = pickQualityTier(qualityRatio);

  state.pendingCompletion = {
    extId: ac.extId,
    team:  ac.team.slice(),
    progress: { ...ac.progress },
    targets:  { ...ac.targets },
    startedAt: ac.startedAt,
    achievedAt: { year: state.year, month: state.month, week: state.week },
    achievedTicks: elapsedTicks,
    durationActualWeeks: actualWeeks,
    durationEstimateWeeks: ac.durationWeeks,
    qualityRatio,
    qualityTier,
  };
  state.activeCraft = null;

  // 配属ヒーローはまず CRAFTING を解除 (RESTING のままなら回復継続するので、
  // ここでは触らず → 完成画面 close 時に IDLE に戻す)
  // → ただし Workshop sprite から消えてしまうのは活発感が削がれるので、
  //   pendingCompletion 中も視覚的に残しておきたい。
  // 解決: workshop render は state.activeCraft / state.pendingCompletion の
  //   どちらかが非 null ならスプライト維持する。

  // Mai 通知 → 閉じると完成画面へ
  maiSays("comp.maiNotice", { onClose: openCompletionScreen });
}

/** quality ratio から「素晴らしい / 普通 / 下回り」のいずれかを返す。
 *  下回り は通常の完了 (全色 target 達成) では発生しないが、将来
 *  「時間切れで強制完了」を入れたときに使えるよう経路を残しておく。 */
function pickQualityTier(ratio) {
  // 全色到達 = ratio >= 1.0 のはず。1.5+ は overshoot (素晴らしい)。
  if (ratio < 1.0) return "under";
  if (ratio >= 1.5) return "excellent";
  return "good";
}

/** クラフト値獲得時の浮上 +N (CSS animation 経由で 1 秒後に消える) */
function pushSpriteFloat(slotIdx, element, value) {
  const id = ++_floatId;
  state.spriteFloats.push({ id, slotIdx, element, value, createdTick: state.tickCount });
}
let _floatId = 0;

/** パッシブ発動の通知バナー追加 */
function pushPassiveNotification(hero, passive) {
  const id = ++_notifId;
  const heroName = tHero(hero.heroId, hero.nameJa);
  // 「甲斐姫の「浪切」発動！ティアマト+４」形式
  const text = ti18n("notif.passive")
    .replace("{hero}", heroName)
    .replace("{passive}", passive.passiveName)
    .replace("{element}", elementLabel(passive.element))
    .replace("{value}", String(passive.value));
  state.notifications.push({
    id, text, element: passive.element, value: passive.value,
    createdTick: state.tickCount,
  });
}
let _notifId = 0;

/** 古い通知 / 浮上値を捨てる */
function pruneEphemerals() {
  const cutoff = state.tickCount - NOTIFICATION_TTL_TICKS;
  state.notifications = state.notifications.filter(n => n.createdTick > cutoff);
  state.spriteFloats  = state.spriteFloats.filter(f => f.createdTick > cutoff);
}

function advanceWeek() {
  state.weekProgress = 0;
  state.week += 1;
  if (state.week > WEEKS_PER_MONTH) {
    state.week = 1;
    state.month += 1;
    if (state.month > 12) {
      state.month = 1;
      state.year += 1;
    }
  }
  // hook for future: tick orders, decay materials, etc.
}

/** ─── Header rendering ──────────────────────────────────────────── */
function formatDate(lang) {
  const { year, month, week } = state;
  if (lang === "en") return `${year} ${monthNameEn(month)} W${week}`;
  return `${year}年 ${month}月 ${week}週`;
}
function monthNameEn(m) {
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] || String(m);
}

function renderHeader() {
  const dateEl = $("factoryDate");
  if (dateEl) dateEl.textContent = formatDate(getLang());
  const gumEl = $("factoryGum");
  if (gumEl) gumEl.textContent = state.gum.toLocaleString();
  const gauge = $("weekGaugeFill");
  if (gauge) {
    const pct = (state.weekProgress / SECONDS_PER_WEEK) * 100;
    gauge.setAttribute("stroke-dasharray", `${pct.toFixed(2)} 100`);
  }
}

/** ─── Hero view rendering ──────────────────────────────────────── */

const ELEMENT_LABEL_KEY = {
  garuda:    "elem.garuda",
  ifrit:     "elem.ifrit",
  leviathan: "elem.leviathan",
  tiamat:    "elem.tiamat",
};

function findHero(heroId) {
  return state.ownedHeroes.find(h => h.heroId === heroId) || null;
}

function sortedHeroesForList() {
  const arr = state.ownedHeroes.slice();
  switch (state.heroSort) {
    case "garuda":    return arr.sort((a, b) => b.element.garuda - a.element.garuda);
    case "ifrit":     return arr.sort((a, b) => b.element.ifrit - a.element.ifrit);
    case "leviathan": return arr.sort((a, b) => b.element.leviathan - a.element.leviathan);
    case "tiamat":    return arr.sort((a, b) => b.element.tiamat - a.element.tiamat);
    case "rarity": {
      const rk = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1, normal: 0 };
      return arr.sort((a, b) => (rk[b.rarity] ?? 0) - (rk[a.rarity] ?? 0));
    }
    case "cl-desc":
    default:
      return arr.sort((a, b) => craftLevel(b) - craftLevel(a));
  }
}

function heroStateLabel(stateValue) {
  switch (stateValue) {
    case HERO_STATE.CRAFTING: return ti18n("hero.state.crafting");
    case HERO_STATE.QUESTING: return ti18n("hero.state.questing");
    case HERO_STATE.RESTING:  return ti18n("hero.state.resting");
    case HERO_STATE.IDLE:
    default:                  return ti18n("hero.state.idle");
  }
}

function elementLabel(key) {
  return ti18n(ELEMENT_LABEL_KEY[key] || ("elem." + key));
}

function renderHeroTeam() {
  const host = $("heroTeamSlots");
  if (!host) return;
  const html = state.craftTeam.map((heroId, idx) => {
    if (heroId == null) {
      return `<div class="hero-team__slot" data-slot="${idx}" title="${escapeHtml(ti18n("hero.team.empty"))}">+</div>`;
    }
    const hero = findHero(heroId);
    if (!hero) {
      return `<div class="hero-team__slot" data-slot="${idx}">?</div>`;
    }
    const portrait = hero.img();
    const name = tHero(hero.heroId, hero.nameJa);
    return `<div class="hero-team__slot hero-team__slot--filled" data-slot="${idx}" title="${escapeHtml(name)}">
      <img src="${portrait}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="hero-team__slot-name">${escapeHtml(name)}</span>
    </div>`;
  }).join("");
  host.innerHTML = html;
  renderHeroTeamSummary();
}

/** クラフトチーム編成画面のライブプレビュー (合計 craftLv + 4 元素合計)。
 *  ヒーローを add/remove するたびに renderHeroTeam → 本関数も更新される。 */
function renderHeroTeamSummary() {
  const totalEl = $("heroTeamTotal");
  const elsEl   = $("heroTeamElements");
  if (!totalEl || !elsEl) return;

  // 合計 craftLevel (各ヒーローの craftLevel = ガルーダ 1/3 込み)
  let totalLv = 0;
  const elTotals = { garuda: 0, ifrit: 0, leviathan: 0, tiamat: 0 };
  for (const heroId of state.craftTeam) {
    if (heroId == null) continue;
    const h = findHero(heroId);
    if (!h) continue;
    totalLv += craftLevel(h);
    for (const k of ELEMENTS) elTotals[k] += elementValueForCraft(h, k);
  }

  totalEl.textContent = ti18n("hero.team.totalLevel").replace("{n}", totalLv.toLocaleString());

  elsEl.innerHTML = ELEMENTS.map(k => `<span class="hero-team__el" title="${escapeHtml(elementLabel(k))}: ${elTotals[k]}">
    <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
    <strong>${elTotals[k]}</strong>
  </span>`).join("");
}

function renderHeroList() {
  const host = $("heroList");
  if (!host) return;
  const heroes = sortedHeroesForList();
  if (heroes.length === 0) {
    host.innerHTML = `<p class="hero-list-empty">${escapeHtml(ti18n("hero.list.empty"))}</p>`;
    return;
  }
  const inTeam = new Set(state.craftTeam.filter(id => id != null));
  host.innerHTML = heroes.map(hero => {
    const portrait = hero.img();
    const name = tHero(hero.heroId, hero.nameJa);
    const cl = craftLevel(hero);
    const stamPct = hero.stamina.max > 0
      ? Math.max(0, Math.min(100, (hero.stamina.current / hero.stamina.max) * 100))
      : 0;
    const assigned = inTeam.has(hero.heroId);
    const stateLbl = assigned ? ti18n("hero.state.assigned") : heroStateLabel(hero.state);
    const cardCls = "hero-card" + (assigned ? " hero-card--assigned" : "");
    const elementsHtml = ELEMENTS.map(key => {
      // ガルーダは 1/3 で表示 (factory 文脈での craft 寄与値)
      const val = elementValueForCraft(hero, key);
      return `<span class="hero-card__elem" title="${escapeHtml(elementLabel(key))}: ${val}">
        <img src="${elementIconUrl(key)}" alt="${escapeHtml(elementLabel(key))}" />
        <span class="hero-card__elem-val">${val}</span>
      </span>`;
    }).join("");
    return `<div class="${cardCls}" data-hero-id="${hero.heroId}" data-rarity="${hero.rarity}" data-assigned="${assigned ? "1" : "0"}">
      <div class="hero-card__head">
        <img class="hero-card__portrait" src="${portrait}" alt="" onerror="this.style.opacity='0.2'" />
        <div>
          <div class="hero-card__name">${escapeHtml(name)}</div>
          <div class="hero-card__state" data-state="${hero.state}">${escapeHtml(stateLbl)}</div>
        </div>
      </div>
      <div class="hero-card__elements">${elementsHtml}</div>
      <div class="hero-card__stamina" title="${escapeHtml(ti18n("hero.stamina"))}: ${hero.stamina.current}/${hero.stamina.max}">
        <div class="hero-card__stamina-fill" style="width:${stamPct.toFixed(1)}%"></div>
      </div>
      <div class="hero-card__cl">${escapeHtml(ti18n("hero.craftLevel"))}: <strong>${cl.toLocaleString()}</strong></div>
    </div>`;
  }).join("");
}

function openHeroView() {
  pauseTime();
  $("heroView")?.classList.remove("hidden");
  renderHeroTeam();
  renderHeroList();
}
/**
 * Hero view を閉じる。
 * state.heroReturnTo === "craft" のときはクラフト確認画面に戻り、
 * それ以外はホームに戻る。
 */
function closeHeroView() {
  $("heroView")?.classList.add("hidden");
  if (state.heroReturnTo === "craft" && state.craftPickedExtId != null) {
    state.heroReturnTo = "home";
    // 既に craftView は開いた状態に戻すが、stays paused (craftView が pauseTime を保つ)
    state.craftScreen = "confirm";
    setCraftScreen("confirm");
    $("craftView")?.classList.remove("hidden");
    renderConfirm();
    // hero view 側で resumeTime はせず、craft view 側 (= ホームに戻るとき) で resume する
    return;
  }
  state.heroReturnTo = "home";
  resumeTime();
}

/** ─── Hero card click → toggle team membership (Phase 1A: simple add/remove) ── */
function onHeroCardClick(heroId) {
  const idx = state.craftTeam.indexOf(heroId);
  if (idx >= 0) {
    // Already in team → remove
    state.craftTeam[idx] = null;
  } else {
    // Find first empty slot
    const empty = state.craftTeam.indexOf(null);
    if (empty < 0) return; // team full
    state.craftTeam[empty] = heroId;
  }
  renderHeroTeam();
  renderHeroList();
}

function onTeamSlotClick(slot) {
  // Remove the hero in that slot
  if (state.craftTeam[slot] != null) {
    state.craftTeam[slot] = null;
    renderHeroTeam();
    renderHeroList();
  }
}

/** Minimal HTML escaper */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ─── Craft view (Phase 1B) ─────────────────────────────────── */

const ELEMENT_OF_STAT = { hp: "garuda", phy: "ifrit", int: "leviathan", agi: "tiamat" };

function commonExtensions() {
  return EXTENSIONS.filter(e => (e.rarity || "").toLowerCase() === "common");
}
function sortedExtensions() {
  const arr = commonExtensions();
  if (state.craftSort === "sum-asc") return arr.sort(sortBySumAsc);
  if (state.craftSort === "id-asc")  return arr.sort(sortByIdAsc);
  // default: "craftability" — 素材足りる順 → 高レアリティ → シリーズ若い順
  return arr.sort(sortByCraftability(currentTeamHeroes(), state.materials));
}

function setCraftScreen(name) {
  state.craftScreen = name;
  const view = $("craftView");
  if (!view) return;
  view.setAttribute("data-craft-screen", name);
  view.querySelectorAll("[data-craft-section]").forEach(el => {
    el.classList.toggle("hidden", el.getAttribute("data-craft-section") !== name);
  });
  // header title swap
  const titleEl = $("craftViewTitle");
  if (titleEl) {
    titleEl.textContent = ti18n(name === "confirm" ? "craft.confirm.title" : "craft.select.title");
  }
}

function renderExtList() {
  const host = $("extList");
  if (!host) return;
  const team = currentTeamHeroes();
  const list = sortedExtensions();
  $("craftSelectCount").textContent = ti18n("craft.select.count").replace("{n}", list.length);
  host.innerHTML = list.map(ext => {
    const targets = extElementTargets(ext);
    const dur = estimateDurationWeeks(ext, team);
    const recipe = recipeFor(ext);
    const avail = craftAvailability(ext, team, state.materials);

    // 素材アイコン + 必要量 (不足時は赤字 + "have/qty" 表示)
    const matRows = recipe.map(m => {
      const have = state.materials[m.id] || 0;
      const short = avail.shortage[m.id] > 0;
      const cls = short ? "ext-row__mat ext-row__mat--short" : "ext-row__mat";
      const label = short ? `${have}/${m.qty}` : `×${m.qty}`;
      return `<span class="${cls}" title="${escapeHtml(materialName(m.id, getLang()))} (${have}/${m.qty})">
        <img class="ext-row__mat-icon" src="${materialIcon(m.id)}" alt="" onerror="this.style.opacity='0.2'" />
        <span>${escapeHtml(materialName(m.id, getLang()))} ${label}</span>
      </span>`;
    }).join("");

    const elements = ELEMENTS.map(k => `<span class="ext-row__el">
      <span class="ext-row__el-dot ext-row__el-dot--${k}"></span>
      <span class="ext-row__el-val">${targets[k]}</span>
    </span>`).join("");

    // クラフト可否ラベル (アイコン下)
    const availLabel = ti18n("craft.avail." + avail.status);
    return `<div class="ext-row" data-ext-id="${ext.extId}">
      <div class="ext-row__icon-col">
        <img class="ext-row__icon" src="${extIconUrl(ext.extId)}" alt="" onerror="this.style.opacity='0.2'" />
        <span class="ext-row__avail ext-row__avail--${avail.status}" title="${escapeHtml(availLabel)}">${escapeHtml(availLabel)}</span>
      </div>
      <div class="ext-row__main">
        <div class="ext-row__name-row">
          <span class="ext-row__name">${escapeHtml(ext.nameJa)}</span>
          <span class="ext-row__rarity" data-rarity="${ext.rarity}">${escapeHtml(ti18n("rarity." + ext.rarity, ext.rarity))}</span>
        </div>
        <span class="ext-row__series">${escapeHtml(ext.series || "")}</span>
        <span class="ext-row__duration">${ti18n("craft.weeks").replace("{n}", dur)}</span>
      </div>
      <div class="ext-row__details">
        <div class="ext-row__elements">${elements}</div>
        <div class="ext-row__materials">${matRows}</div>
      </div>
    </div>`;
  }).join("");
}

function currentTeamHeroes() {
  return state.craftTeam.map(id => id == null ? null : findHero(id));
}

function renderConfirm() {
  const ext = EXTENSION_BY_ID[String(state.craftPickedExtId)];
  if (!ext) return;
  $("confirmExtIcon").src = extIconUrl(ext.extId);
  $("confirmExtName").textContent = ext.nameJa;
  $("confirmExtSeries").textContent = (ext.series || "") + " · " + ti18n("rarity." + ext.rarity, ext.rarity);
  const team = currentTeamHeroes();
  const dur = estimateDurationWeeks(ext, team);
  $("confirmDuration").textContent = ti18n("craft.duration.estimate").replace("{n}", dur);

  // Targets (icons only — no text label, just dot/icon + value)
  const targets = extElementTargets(ext);
  $("confirmTargets").innerHTML = ELEMENTS.map(k => {
    const v = targets[k];
    return `<div class="craft-confirm__target" title="${escapeHtml(elementLabel(k))}: ${v}">
      <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
      <strong>${v}</strong>
    </div>`;
  }).join("");

  // Materials (赤字 if shortage; 表示形式 = "×4 (在庫:10)")
  const recipe = recipeFor(ext);
  const avail = craftAvailability(ext, team, state.materials);
  $("confirmMaterials").innerHTML = recipe.map(m => {
    const have = state.materials[m.id] || 0;
    const short = avail.shortage[m.id] > 0;
    const rowCls = short ? "craft-confirm__mat-row craft-confirm__mat-row--short" : "craft-confirm__mat-row";
    const qtyText = ti18n("craft.material.qtyHave")
      .replace("{qty}", m.qty)
      .replace("{have}", have);
    return `<div class="${rowCls}">
      <img src="${materialIcon(m.id)}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="craft-confirm__mat-name">${escapeHtml(materialName(m.id, getLang()))}</span>
      <span class="craft-confirm__mat-qty">${escapeHtml(qtyText)}</span>
    </div>`;
  }).join("");

  // Team slots (clickable — tap = open hero view, same as 変更 button)
  $("confirmTeamSlots").innerHTML = state.craftTeam.map((heroId, idx) => {
    if (heroId == null) {
      return `<div class="craft-confirm__team-slot" data-slot="${idx}" role="button" tabindex="0" title="${escapeHtml(ti18n("hero.team.empty"))}">+</div>`;
    }
    const hero = findHero(heroId);
    if (!hero) return `<div class="craft-confirm__team-slot" data-slot="${idx}">?</div>`;
    const name = tHero(hero.heroId, hero.nameJa);
    return `<div class="craft-confirm__team-slot craft-confirm__team-slot--filled" data-slot="${idx}" role="button" tabindex="0" title="${escapeHtml(name)}">
      <img src="${hero.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="craft-confirm__team-slot-name">${escapeHtml(name)}</span>
    </div>`;
  }).join("");

  // Team summary: 合計クラフトLv (要件不足は橙) + 4 色合計
  const teamLv = teamCraftLevelTotal(team);
  const reqLv  = craftLevelRequiredFor(ext);
  const totalEl = $("confirmTeamTotal");
  if (totalEl) {
    const insufficient = teamLv < reqLv;
    totalEl.classList.toggle("craft-confirm__team-total--insufficient", insufficient);
    totalEl.textContent = ti18n("craft.team.totalLevel")
      .replace("{n}", teamLv.toLocaleString())
      .replace("{req}", reqLv.toLocaleString());
  }
  const elsEl = $("confirmTeamElements");
  if (elsEl) {
    // ガルーダ 1/3 換算済みの合計 (個別ヒーロー表示と整合)
    const elTotals = { garuda: 0, ifrit: 0, leviathan: 0, tiamat: 0 };
    for (const h of team) {
      if (!h) continue;
      for (const k of ELEMENTS) elTotals[k] += elementValueForCraft(h, k);
    }
    elsEl.innerHTML = ELEMENTS.map(k => `<span class="craft-confirm__team-el" title="${escapeHtml(elementLabel(k))}: ${elTotals[k]}">
      <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
      <strong>${elTotals[k]}</strong>
    </span>`).join("");
  }

  // Warning + start button enable/disable
  // 仕様 (Phase 1B): material 不足 / level 不足 のいずれでも開始不可。
  //  - material 不足: 確認画面で不足分を購入する導線を将来追加予定 (今は警告のみ)
  //  - level 不足:    編成変更で要件を満たせる可能性があるため、変更ボタンで遷移可能
  const filled = state.craftTeam.filter(id => id != null).length;
  const warn = $("confirmWarning");
  const startBtn = $("confirmStartBtn");
  let warnMsg = "";
  const canStart = filled > 0 && avail.materialOk && avail.levelOk;
  if (filled === 0) warnMsg = ti18n("craft.warn.noTeam");
  else if (!avail.materialOk) warnMsg = ti18n("craft.warn.noMaterial");
  else if (!avail.levelOk) {
    warnMsg = ti18n("craft.warn.lowLevel")
      .replace("{cur}", teamLv.toLocaleString())
      .replace("{req}", reqLv.toLocaleString());
  }
  if (warnMsg) {
    warn.textContent = warnMsg;
    warn.classList.remove("hidden");
  } else {
    warn.classList.add("hidden");
  }
  startBtn.disabled = !canStart;
}

function openCraftView() {
  pauseTime();
  state.craftScreen = "select";
  state.craftPickedExtId = null;
  setCraftScreen("select");
  $("craftView")?.classList.remove("hidden");
  // 並び替えセレクトを state に同期 (HTML 上のデフォルト選択と取りこぼしが出ないように)
  const sortSel = $("craftSortSel");
  if (sortSel) sortSel.value = state.craftSort;
  renderExtList();
}
function closeCraftView() {
  $("craftView")?.classList.add("hidden");
  resumeTime();
}

function pickExtForConfirm(extId) {
  state.craftPickedExtId = extId;
  setCraftScreen("confirm");
  renderConfirm();
}

function startActiveCraft() {
  const ext = EXTENSION_BY_ID[String(state.craftPickedExtId)];
  if (!ext) return;
  const team = state.craftTeam.slice();
  const teamHeroes = currentTeamHeroes();
  // 安全チェック (ボタンが disabled でも念のため)
  const avail = craftAvailability(ext, teamHeroes, state.materials);
  if (!avail.materialOk) return;
  const targets = extElementTargets(ext);
  const dur = estimateDurationWeeks(ext, teamHeroes);
  const recipe = recipeFor(ext);

  // Deduct materials from inventory.
  for (const m of recipe) {
    state.materials[m.id] = Math.max(0, (state.materials[m.id] || 0) - (m.qty || 0));
  }

  state.activeCraft = {
    extId: ext.extId,
    team,
    targets,
    progress: { garuda: 0, ifrit: 0, leviathan: 0, tiamat: 0 },
    recipe,
    startedAt: { year: state.year, month: state.month, week: state.week },
    startedAtTick: state.tickCount,   // 実所要時間 (週) を完成時に算出するため
    durationWeeks: dur,
  };
  // Mark assigned heroes as crafting (state machine — stamina tick comes Phase 1C)
  for (const id of team) {
    if (id == null) continue;
    const h = findHero(id);
    if (h) h.state = HERO_STATE.CRAFTING;
  }
  closeCraftView();
  renderOrderPanel();
  renderWorkshop();
}

/** ─── Order panel rendering (Phase 1B-2 ・ mockup 準拠版) ──────── */
function renderOrderPanel() {
  const panel = $("orderPanel");
  const desc = $("orderDesc");
  const meta = $("orderMeta");
  const elements = $("orderElements");
  const fill = $("orderBarFill");
  const pct = $("orderPct");
  const icon = $("orderIcon");
  if (!panel) return;

  // 進行中クラフトなし & 完成待ちなし → empty state
  if (!state.activeCraft && !state.pendingCompletion) {
    panel.classList.add("order-panel--empty");
    desc.textContent = ti18n("order.none");
    meta.textContent = "";
    elements.innerHTML = "";
    fill.style.width = "0%";
    pct.textContent = "";
    icon.innerHTML = "";
    return;
  }
  // 進行中 (or 完成 Mai 通知 → 完成画面の間も表示維持)
  const ac = state.activeCraft || state.pendingCompletion;
  const ext = EXTENSION_BY_ID[String(ac.extId)];
  panel.classList.remove("order-panel--empty");
  icon.innerHTML = `<img src="${extIconUrl(ac.extId)}" alt="" onerror="this.style.opacity='0.2'" />`;
  desc.textContent = ext ? ext.nameJa : `ext ${ac.extId}`;

  // メタ行: レアリティ + 完成予定 (= 開始日 + durationWeeks)
  const eta = computeEtaDate(ac);
  const rarityLbl = ext ? ti18n("rarity." + ext.rarity, ext.rarity) : "";
  meta.innerHTML = `
    <span class="order-panel__rarity" data-rarity="${ext?.rarity || ""}">${escapeHtml(rarityLbl)}</span>
    <span class="order-panel__eta">${escapeHtml(ti18n("order.eta"))}: ${escapeHtml(formatGameDate(eta))}</span>
  `;

  // 4 色ゲージ (アイコン + 現在/目標、縦積み)
  elements.innerHTML = ELEMENTS.map(k => {
    const cur = ac.progress[k] || 0;
    const tgt = ac.targets[k] || 0;
    const reached = tgt > 0 && cur >= tgt;
    return `<span class="order-panel__el ${reached ? "order-panel__el--reached" : ""}" title="${escapeHtml(elementLabel(k))} ${cur}/${tgt}">
      <img class="order-panel__el-icon" src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
      <span class="order-panel__el-val"><strong>${cur}</strong>/<span class="order-panel__el-tgt">${tgt}</span></span>
    </span>`;
  }).join("");

  // 進捗バー (4 色合計の達成率)
  const totalCur = ELEMENTS.reduce((s, k) => s + Math.min(ac.progress[k] || 0, ac.targets[k] || 0), 0);
  const totalTgt = Math.max(1, ELEMENTS.reduce((s, k) => s + (ac.targets[k] || 0), 0));
  const pctVal = Math.min(100, Math.floor((totalCur / totalTgt) * 100));
  fill.style.width = pctVal + "%";
  pct.textContent = pctVal + "%";
}

/** activeCraft.startedAt + durationWeeks から完成予定日を計算 */
function computeEtaDate(ac) {
  const start = ac.startedAt; // {year, month, week}
  // activeCraft は durationWeeks、pendingCompletion は durationEstimateWeeks
  let weeks = ac.durationWeeks ?? ac.durationEstimateWeeks ?? 0;
  let y = start.year, m = start.month, w = start.week;
  while (weeks > 0) {
    w += 1;
    if (w > WEEKS_PER_MONTH) { w = 1; m += 1; }
    if (m > 12) { m = 1; y += 1; }
    weeks -= 1;
  }
  return { year: y, month: m, week: w };
}

function formatGameDate(d) {
  if (getLang() === "en") return `${d.year} ${monthNameEn(d.month)} W${d.week}`;
  return `${d.year}年${d.month}月${d.week}週`;
}

/** ─── Workshop hero sprites + floating gain numbers ──────────────── */

/** 工房スプライトを動的更新する。
 *  - スプライト本体 (.workshop-hero) は配属が変わるまで DOM 維持し、
 *    属性 (sleeping クラス / stamina width) のみ更新する → CSS animation
 *    が tick ごとに再起動するのを防ぐ。
 *  - +N 浮上値は「その tick で発生したもの」だけ append する (1 秒で消える)。
 *  - bounce アニメも同上で、新規 float があるスロットだけ class を付け直す。
 */
function renderWorkshop() {
  const host = $("workshopHeroes");
  if (!host) return;
  // activeCraft が無くても、pendingCompletion (= 完成モーダル表示中) の間は
  // 直前の team を表示し続ける ─ 突然 sprite が消えないようにする。
  const ac = state.activeCraft || state.pendingCompletion;
  if (!ac) {
    host.innerHTML = "";
    host.dataset.fingerprint = "";
    return;
  }
  // 配属が変わった (heroId 列が変わった) ときだけ全 rebuild。それ以外は属性更新のみ。
  const fingerprint = ac.team.join(",");
  if (host.dataset.fingerprint !== fingerprint) {
    host.dataset.fingerprint = fingerprint;
    host.innerHTML = ac.team.map((heroId, slotIdx) => {
      if (heroId == null) return "";
      const hero = findHero(heroId);
      if (!hero) return "";
      const pos = WORKSHOP_SLOT_POS[slotIdx] || WORKSHOP_SLOT_POS[0];
      return `<div class="workshop-hero" data-slot="${slotIdx}" data-hero-id="${hero.heroId}"
        style="left:${pos.x}; top:${pos.y};"
        title="${escapeHtml(tHero(hero.heroId, hero.nameJa))}">
        <span class="workshop-hero__sleep hidden" title="${escapeHtml(ti18n("hero.state.resting"))}">💤</span>
        <img class="workshop-hero__img" src="${hero.img()}" alt="" onerror="this.style.opacity='0.2'" />
        <div class="workshop-hero__stam"><div class="workshop-hero__stam-fill"></div></div>
        <div class="workshop-hero__floats"></div>
      </div>`;
    }).join("");
  }
  // ── 属性更新 (sleeping / stamina) ──
  for (let slotIdx = 0; slotIdx < ac.team.length; slotIdx++) {
    const heroId = ac.team[slotIdx];
    if (heroId == null) continue;
    const sprite = host.querySelector(`.workshop-hero[data-slot="${slotIdx}"]`);
    if (!sprite) continue;
    const hero = findHero(heroId);
    if (!hero) continue;
    const sleeping = hero.state === HERO_STATE.RESTING;
    sprite.classList.toggle("workshop-hero--sleeping", sleeping);
    sprite.querySelector(".workshop-hero__sleep")?.classList.toggle("hidden", !sleeping);
    const stamPct = hero.stamina.max > 0
      ? Math.max(0, Math.min(100, (hero.stamina.current / hero.stamina.max) * 100))
      : 0;
    const fill = sprite.querySelector(".workshop-hero__stam-fill");
    if (fill) fill.style.width = stamPct.toFixed(1) + "%";
  }
  // ── 今 tick で発生した floats / bounce を反映 (=既存の DOM に追加だけ) ──
  // 既に DOM に存在する float-id を集めて差分だけ append + bounce class を一度だけ付ける
  const liveFloats = state.spriteFloats.filter(f => f.createdTick === state.tickCount);
  const bouncedSlots = new Set();
  for (const f of liveFloats) {
    const sprite = host.querySelector(`.workshop-hero[data-slot="${f.slotIdx}"]`);
    if (!sprite) continue;
    const floatHost = sprite.querySelector(".workshop-hero__floats");
    if (!floatHost) continue;
    if (floatHost.querySelector(`[data-float-id="${f.id}"]`)) continue;
    const span = document.createElement("span");
    span.className = `workshop-hero__float workshop-hero__float--${f.element}`;
    span.setAttribute("data-float-id", String(f.id));
    span.textContent = `+${f.value}`;
    floatHost.appendChild(span);
    // CSS animation 終了後に DOM から消す (1.0s)
    setTimeout(() => span.remove(), 1100);
    bouncedSlots.add(f.slotIdx);
  }
  // bounce クラス: 該当スロットに 1 度だけ付与し、アニメ終了後に自動除去
  for (const slotIdx of bouncedSlots) {
    const sprite = host.querySelector(`.workshop-hero[data-slot="${slotIdx}"]`);
    if (!sprite) continue;
    sprite.classList.remove("workshop-hero--bounce");
    // フォース reflow して即時に再付与 → アニメ再開
    void sprite.offsetWidth;
    sprite.classList.add("workshop-hero--bounce");
    setTimeout(() => sprite.classList.remove("workshop-hero--bounce"), 460);
  }
}

/** 工房内の 5 配置座標 (workshop 領域の % 座標) */
const WORKSHOP_SLOT_POS = [
  { x: "12%", y: "55%" },
  { x: "30%", y: "60%" },
  { x: "48%", y: "55%" },
  { x: "66%", y: "60%" },
  { x: "82%", y: "55%" },
];

/** ─── Passive notification banner ────────────────────────────────── */
/** 通知バナーの差分更新。
 *  - 新規 notification (data-id がまだ DOM に存在しないもの) のみ append
 *    → 既存通知の CSS animation が再起動しない
 *  - 古くなって state から消えた notification は DOM からも除去
 *  - 表示数は 3 件まで (古い順から DOM ごと削除)
 */
function renderNotifications() {
  const host = $("notifBanner");
  if (!host) return;
  if (state.notifications.length === 0) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  host.classList.remove("hidden");

  const stateIds = new Set(state.notifications.map(n => String(n.id)));
  // 1. DOM 上にあって state に無いものを除去
  Array.from(host.children).forEach(child => {
    const id = child.getAttribute("data-id");
    if (!id || !stateIds.has(id)) child.remove();
  });
  // 2. state にあって DOM 上に無いものを append (新着のみ)
  for (const n of state.notifications) {
    if (host.querySelector(`[data-id="${n.id}"]`)) continue;
    const div = document.createElement("div");
    div.className = `notif notif--${n.element}`;
    div.setAttribute("data-id", String(n.id));
    div.innerHTML = `<span class="notif__text">${escapeHtml(n.text)}</span>`;
    host.appendChild(div);
  }
  // 3. 表示数を 3 件に制限 (古いものから DOM ごと削除)
  while (host.children.length > 3) host.firstElementChild.remove();
}

/** ─── Hero detail popup (tap workshop sprite) ────────────────────── */
function openHeroDetailPopup(heroId) {
  const hero = findHero(heroId);
  if (!hero) return;
  state.popupHeroId = heroId;
  const modal = $("heroDetailPopup");
  if (!modal) return;
  modal.classList.remove("hidden");
  pauseTime();
  renderHeroDetailPopup();
}

function renderHeroDetailPopup() {
  if (state.popupHeroId == null) return;
  const hero = findHero(state.popupHeroId);
  if (!hero) return;
  const name = tHero(hero.heroId, hero.nameJa);
  const stamPct = hero.stamina.max > 0
    ? Math.max(0, Math.min(100, (hero.stamina.current / hero.stamina.max) * 100))
    : 0;
  const stateLbl = heroStateLabel(hero.state);
  $("heroDetailPortrait").src = hero.img();
  $("heroDetailName").textContent = name;
  $("heroDetailState").textContent = stateLbl;
  $("heroDetailState").setAttribute("data-state", hero.state);
  $("heroDetailRarity").textContent = ti18n("rarity." + hero.rarity, hero.rarity);
  $("heroDetailRarity").setAttribute("data-rarity", hero.rarity);
  $("heroDetailStaminaText").textContent = `${hero.stamina.current} / ${hero.stamina.max}`;
  $("heroDetailStaminaFill").style.width = stamPct.toFixed(1) + "%";
  $("heroDetailCl").textContent = craftLevel(hero).toLocaleString();
  // 4 色の craft 寄与値 (1/3 重み込み)
  $("heroDetailElements").innerHTML = ELEMENTS.map(k => {
    const v = elementValueForCraft(hero, k);
    return `<div class="hero-detail__el">
      <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" />
      <span class="hero-detail__el-label">${escapeHtml(elementLabel(k))}</span>
      <strong class="hero-detail__el-val">${v}</strong>
    </div>`;
  }).join("");
  // パッシブ
  const pBlock = $("heroDetailPassive");
  if (hero.passiveName) {
    pBlock.innerHTML = `<span class="hero-detail__passive-label">${escapeHtml(ti18n("hero.passive"))}:</span>
      <strong>${escapeHtml(hero.passiveName)}</strong>`;
    pBlock.classList.remove("hidden");
  } else {
    pBlock.classList.add("hidden");
  }
}
function closeHeroDetailPopup() {
  $("heroDetailPopup")?.classList.add("hidden");
  state.popupHeroId = null;
  resumeTime();
}

/** ─── Title screen ──────────────────────────────────────────────── */
function dismissTitle() {
  const titleEl = $("titleView");
  if (!titleEl || titleEl.classList.contains("hidden")) return;
  titleEl.classList.add("title-out");
  setTimeout(() => {
    titleEl.classList.add("hidden");
    titleEl.classList.remove("title-out");
    // Time starts only after the player taps in
    startTimeLoop();
  }, 380);
}

function syncLangToggleActive() {
  const cur = getLang();
  document.querySelectorAll("#langToggle .lang-btn").forEach(btn => {
    const isActive = btn.getAttribute("data-lang") === cur;
    btn.classList.toggle("lang-btn--active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  const headerBtn = $("btnLangToggle");
  if (headerBtn) headerBtn.textContent = cur === "en" ? "EN" : "JP";
}

/** ─── Menu / stub views ─────────────────────────────────────────── */
function openMenu() {
  pauseTime();
  $("menuOverlay")?.classList.remove("hidden");
}
function closeMenu() {
  $("menuOverlay")?.classList.add("hidden");
  resumeTime();
}

function openStub(menuKey) {
  const titleKey = "menu." + menuKey;
  const stub = $("stubView");
  const stubTitle = $("stubTitle");
  if (stubTitle) stubTitle.textContent = ti18n(titleKey);
  stub?.classList.remove("hidden");
  pauseTime();
}
function closeStub() {
  $("stubView")?.classList.add("hidden");
  resumeTime();
}

/** Mai のセリフを表示する汎用モーダル。
 *  - messageKey: i18n キー (e.g. "mai.craftBusy")
 *  - options.onClose: モーダルを閉じたあとに呼ばれる callback。
 *    (next action がある場合は resumeTime をスキップし、callback 側に
 *    pause/resume 管理を委ねる ─ 完成画面など連続表示用)
 */
let _maiNextAction = null;
function maiSays(messageKey, options = {}) {
  const modal = $("maiModal");
  const body  = $("maiModalBody");
  if (!modal || !body) return;
  body.textContent = ti18n(messageKey);
  modal.classList.remove("hidden");
  pauseTime();
  _maiNextAction = options.onClose || null;
}
function closeMaiModal() {
  $("maiModal")?.classList.add("hidden");
  const next = _maiNextAction;
  _maiNextAction = null;
  if (next) {
    // next 側で pauseTime を再呼びするので、ここでは resume しない
    next();
  } else {
    resumeTime();
  }
}

/** ─── Craft completion screen (Phase 1B-3) ───────────────────────── */
function openCompletionScreen() {
  if (!state.pendingCompletion) {
    // 万一 pendingCompletion が無い (= 直接呼ばれた) なら何もしない
    return;
  }
  const modal = $("craftDoneModal");
  if (!modal) return;
  pauseTime();
  modal.classList.remove("hidden");
  renderCompletionScreen();
}

function renderCompletionScreen() {
  const pc = state.pendingCompletion;
  if (!pc) return;
  const ext = EXTENSION_BY_ID[String(pc.extId)];
  $("craftDoneIcon").src = extIconUrl(pc.extId);
  $("craftDoneName").textContent = ext ? ext.nameJa : `ext ${pc.extId}`;
  $("craftDoneRarity").textContent = ext ? ti18n("rarity." + ext.rarity, ext.rarity) : "";
  $("craftDoneRarity").setAttribute("data-rarity", ext ? ext.rarity : "common");

  // 所要時間 (実際 vs 予定)
  const dur = $("craftDoneDuration");
  dur.textContent = ti18n("comp.duration")
    .replace("{actual}", String(pc.durationActualWeeks))
    .replace("{est}",    String(pc.durationEstimateWeeks));

  // 4 色の達成状況: progress / target、達成は緑字、未達 (target>0 で progress<target) は赤字
  $("craftDoneElements").innerHTML = ELEMENTS.map(k => {
    const cur = pc.progress[k] || 0;
    const tgt = pc.targets[k]  || 0;
    let stat = "neutral";
    if (tgt > 0) {
      if (cur >= tgt * 1.5) stat = "excellent";
      else if (cur >= tgt)  stat = "reached";
      else                  stat = "under";
    }
    return `<div class="craft-done__el craft-done__el--${stat}">
      <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
      <span class="craft-done__el-label">${escapeHtml(elementLabel(k))}</span>
      <strong class="craft-done__el-val">${cur}</strong>
      <span class="craft-done__el-sep">/</span>
      <span class="craft-done__el-tgt">${tgt}</span>
    </div>`;
  }).join("");

  // 品質ラベル + マイのコメント
  $("craftDoneQuality").textContent = ti18n("comp.tier." + pc.qualityTier);
  $("craftDoneQuality").setAttribute("data-tier", pc.qualityTier);
  $("craftDoneMaiSays").textContent = ti18n("comp.maiComment." + pc.qualityTier);
}

function closeCompletionScreen() {
  const pc = state.pendingCompletion;
  $("craftDoneModal")?.classList.add("hidden");
  if (pc) {
    // 1. 完成 ext を倉庫に格納 (Phase 1B-5 のマーケット>倉庫タブから参照)
    state.warehouse.push({
      extId: pc.extId,
      achievedAt: pc.achievedAt,
      achievedTicks: pc.achievedTicks,
      durationActualWeeks: pc.durationActualWeeks,
      progress: pc.progress,
      targets: pc.targets,
      qualityRatio: pc.qualityRatio,
      qualityTier: pc.qualityTier,
    });
    // 2. 配属ヒーローを IDLE に戻す (RESTING のままならそのまま継続だが、
    //    新規クラフトの編成からも外れているので、UI 上 IDLE 復帰でよい)
    for (const id of pc.team) {
      if (id == null) continue;
      const h = findHero(id);
      if (h && (h.state === HERO_STATE.CRAFTING)) h.state = HERO_STATE.IDLE;
    }
  }
  state.pendingCompletion = null;
  resumeTime();
  // 工房スプライトと order panel をリフレッシュ
  renderWorkshop();
  renderOrderPanel();
}

/** ─── Help overlay ──────────────────────────────────────────────── */
function openHelp() {
  pauseTime();
  $("helpOverlay")?.classList.remove("hidden");
}
function closeHelp() {
  $("helpOverlay")?.classList.add("hidden");
  resumeTime();
}

/** ─── Init ─────────────────────────────────────────────────────── */
async function init() {
  // i18n bootstrap
  try {
    await initI18n();
    applyDataI18n(document);
    syncLangToggleActive();
  } catch (e) {
    console.warn("[init] i18n load failed", e);
  }

  // Hero data — used by Phase 1A hero list / craft team
  try {
    await loadHeroes();
    state.ownedHeroes = buildOwnedHeroes();
  } catch (e) {
    console.warn("[init] heroes.json load failed", e);
  }
  // Extension master data (Phase 1B craft view)
  try {
    await loadExtensions();
  } catch (e) {
    console.warn("[init] extensions.json load failed", e);
  }

  // Initial render
  renderHeader();
  renderOrderPanel();
  renderHeroTeam();
  renderHeroList();
  renderWorkshop();
  renderNotifications();

  // ── Title screen → tap to start ──
  const titleEl = $("titleView");
  if (titleEl) {
    titleEl.addEventListener("click", (ev) => {
      if (ev.target.closest("#langToggle")) return;
      dismissTitle();
    });
    titleEl.addEventListener("keydown", (ev) => {
      if (ev.target.closest("#langToggle")) return;
      if (ev.key === "Enter" || ev.key === " ") dismissTitle();
    });
  }

  // ── Lang toggle (title) ──
  $("langToggle")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-lang]");
    if (!btn) return;
    ev.stopPropagation();
    setLang(btn.getAttribute("data-lang"));
  });

  // ── Header lang toggle (always available) ──
  $("btnLangToggle")?.addEventListener("click", () => {
    setLang(getLang() === "en" ? "ja" : "en");
  });

  // ── Help ──
  $("btnHelpOpen")?.addEventListener("click", openHelp);
  $("btnHelpClose")?.addEventListener("click", closeHelp);
  $("helpOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "helpOverlay") closeHelp();
  });

  // ── Menu open/close ──
  $("btnMenuOpen")?.addEventListener("click", openMenu);
  $("menuOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "menuOverlay") closeMenu();
  });
  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-menu");
      closeMenu();
      // Phase 1A: 'hero' menu opens the real hero view
      if (key === "hero") { openHeroView(); return; }
      // Phase 1B: 'craft' menu opens the real craft view —
      //   ただし他のクラフトが進行中ならマイが説明して開かない (並列クラフト禁止)
      if (key === "craft") {
        if (state.activeCraft) { maiSays("mai.craftBusy"); return; }
        openCraftView();
        return;
      }
      openStub(key);
    });
  });

  // ── Stub close ──
  $("stubClose")?.addEventListener("click", closeStub);

  // ── Mai modal close ──
  $("maiModalClose")?.addEventListener("click", closeMaiModal);
  $("maiModal")?.addEventListener("click", (e) => {
    if (e.target.id === "maiModal") closeMaiModal();
  });

  // ── Workshop sprite tap → ヒーロー詳細ポップアップ ──
  $("workshopHeroes")?.addEventListener("click", (ev) => {
    const sprite = ev.target.closest(".workshop-hero");
    if (!sprite) return;
    const id = parseInt(sprite.getAttribute("data-hero-id"), 10);
    if (Number.isFinite(id)) openHeroDetailPopup(id);
  });
  $("heroDetailClose")?.addEventListener("click", closeHeroDetailPopup);
  $("heroDetailPopup")?.addEventListener("click", (e) => {
    if (e.target.id === "heroDetailPopup") closeHeroDetailPopup();
  });

  // ── 完成画面 (Phase 1B-3) ──
  $("craftDoneClose")?.addEventListener("click", closeCompletionScreen);
  // 完成画面は背景タップでは閉じない (重要画面なので明示クリック必須)

  // ── Craft view bindings (Phase 1B) ──
  $("craftViewBack")?.addEventListener("click", () => {
    if (state.craftScreen === "confirm") {
      // back to select within the same view
      setCraftScreen("select");
      renderExtList();
    } else {
      closeCraftView();
    }
  });
  $("craftSortSel")?.addEventListener("change", (ev) => {
    state.craftSort = ev.target.value;
    renderExtList();
  });
  $("extList")?.addEventListener("click", (ev) => {
    const row = ev.target.closest(".ext-row");
    if (!row) return;
    const id = parseInt(row.getAttribute("data-ext-id"), 10);
    if (Number.isFinite(id)) pickExtForConfirm(id);
  });
  // 「変更」ボタン or チームスロットタップ → ヒーロー画面へ (戻り先=craft)
  function gotoHeroFromCraft() {
    state.heroReturnTo = "craft";
    closeCraftView();
    openHeroView();
  }
  $("confirmChangeTeamBtn")?.addEventListener("click", gotoHeroFromCraft);
  $("confirmTeamSlots")?.addEventListener("click", (ev) => {
    const slot = ev.target.closest(".craft-confirm__team-slot");
    if (!slot) return;
    gotoHeroFromCraft();
  });
  $("confirmTeamSlots")?.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const slot = ev.target.closest(".craft-confirm__team-slot");
    if (!slot) return;
    ev.preventDefault();
    gotoHeroFromCraft();
  });
  $("confirmStartBtn")?.addEventListener("click", startActiveCraft);

  // ── Hero view: back button + sort change + card/slot clicks ──
  $("heroViewBack")?.addEventListener("click", closeHeroView);
  $("heroSortSel")?.addEventListener("change", (ev) => {
    state.heroSort = ev.target.value;
    renderHeroList();
  });
  $("heroList")?.addEventListener("click", (ev) => {
    const card = ev.target.closest(".hero-card");
    if (!card) return;
    const id = parseInt(card.getAttribute("data-hero-id"), 10);
    if (Number.isFinite(id)) onHeroCardClick(id);
  });
  $("heroTeamSlots")?.addEventListener("click", (ev) => {
    const slot = ev.target.closest(".hero-team__slot--filled");
    if (!slot) return;
    const idx = parseInt(slot.getAttribute("data-slot"), 10);
    if (Number.isFinite(idx)) onTeamSlotClick(idx);
  });

  // ── Lang change → re-render header (date format changes) ──
  onLangChange(() => {
    syncLangToggleActive();
    renderHeader();
    renderOrderPanel();
    renderHeroTeam();
    renderHeroList();
    renderWorkshop();
    renderNotifications();
    if (state.popupHeroId != null) renderHeroDetailPopup();
    if (state.pendingCompletion != null && !$("craftDoneModal")?.classList.contains("hidden")) {
      renderCompletionScreen();
    }
    if (!$("craftView")?.classList.contains("hidden")) {
      if (state.craftScreen === "confirm") renderConfirm();
      else renderExtList();
      // Re-apply localized header title
      setCraftScreen(state.craftScreen);
    }
  });

  // ── Esc closes any open overlay ──
  // 完成画面 (craftDoneModal) は明示クリック必須なので Esc では閉じない。
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!$("craftDoneModal")?.classList.contains("hidden")) return; // 明示閉じ専用
    if (!$("heroDetailPopup")?.classList.contains("hidden")) { closeHeroDetailPopup(); return; }
    if (!$("maiModal")?.classList.contains("hidden")) { closeMaiModal(); return; }
    if (!$("helpOverlay")?.classList.contains("hidden")) { closeHelp(); return; }
    if (!$("stubView")?.classList.contains("hidden")) { closeStub(); return; }
    if (!$("menuOverlay")?.classList.contains("hidden")) { closeMenu(); return; }
  });
}

init();

// Expose APP_VERSION for debug / future ranking submit
if (typeof window !== "undefined") window.__MCF_VERSION = APP_VERSION;
