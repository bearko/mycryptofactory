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

const APP_VERSION = "2.0.0";
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
};

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
  state.weekProgress += 1;
  if (state.weekProgress >= SECONDS_PER_WEEK) {
    advanceWeek();
  }
  renderHeader();
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
}

/** ─── Order panel rendering ─────────────────────────────────────── */
function renderOrderPanel() {
  const panel = $("orderPanel");
  const desc = $("orderDesc");
  const meta = $("orderMeta");
  const elements = $("orderElements");
  const fill = $("orderBarFill");
  const pct = $("orderPct");
  const icon = $("orderIcon");
  if (!panel) return;

  // No order + no active craft → empty state
  if (!state.activeCraft) {
    panel.classList.add("order-panel--empty");
    desc.textContent = ti18n("order.none");
    meta.textContent = "";
    elements.innerHTML = "";
    fill.style.width = "0%";
    pct.textContent = "";
    icon.innerHTML = "";
    return;
  }
  // Active craft (Phase 1B; per-tick progress comes in Phase 1C)
  const ac = state.activeCraft;
  const ext = EXTENSION_BY_ID[String(ac.extId)];
  panel.classList.remove("order-panel--empty");
  icon.innerHTML = `<img src="${extIconUrl(ac.extId)}" alt="" onerror="this.style.opacity='0.2'" />`;
  desc.textContent = ext ? ext.nameJa : `ext ${ac.extId}`;
  meta.innerHTML = `<span>${escapeHtml(ti18n("order.duration").replace("{n}", ac.durationWeeks))}</span>`;
  // 4 element gauges (small, on the right)
  elements.innerHTML = ELEMENTS.map(k => {
    const cur = ac.progress[k] || 0;
    const tgt = ac.targets[k] || 0;
    return `<span class="order-panel__el" title="${escapeHtml(elementLabel(k))} ${cur}/${tgt}">
      <span class="order-panel__el-icon order-panel__el-icon--${k}"></span>
      <span class="order-panel__el-val">${cur}/${tgt}</span>
    </span>`;
  }).join("");
  const totalCur = ELEMENTS.reduce((s, k) => s + (ac.progress[k] || 0), 0);
  const totalTgt = Math.max(1, ELEMENTS.reduce((s, k) => s + (ac.targets[k] || 0), 0));
  const pctVal = Math.min(100, Math.floor((totalCur / totalTgt) * 100));
  fill.style.width = pctVal + "%";
  pct.textContent = pctVal + "%";
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
 *  messageKey は i18n のキー (e.g. "mai.craftBusy") を指定。
 *  時間は止めずに上にかぶせるだけにする (短い通知用)。 */
function maiSays(messageKey) {
  const modal = $("maiModal");
  const body  = $("maiModalBody");
  if (!modal || !body) return;
  body.textContent = ti18n(messageKey);
  modal.classList.remove("hidden");
  pauseTime();
}
function closeMaiModal() {
  $("maiModal")?.classList.add("hidden");
  resumeTime();
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
    if (!$("craftView")?.classList.contains("hidden")) {
      if (state.craftScreen === "confirm") renderConfirm();
      else renderExtList();
      // Re-apply localized header title
      setCraftScreen(state.craftScreen);
    }
  });

  // ── Esc closes any open overlay ──
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!$("maiModal")?.classList.contains("hidden")) { closeMaiModal(); return; }
    if (!$("helpOverlay")?.classList.contains("hidden")) { closeHelp(); return; }
    if (!$("stubView")?.classList.contains("hidden")) { closeStub(); return; }
    if (!$("menuOverlay")?.classList.contains("hidden")) { closeMenu(); return; }
  });
}

init();

// Expose APP_VERSION for debug / future ranking submit
if (typeof window !== "undefined") window.__MCF_VERSION = APP_VERSION;
