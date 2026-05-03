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
  ELEMENTS,
  elementIconUrl,
  HERO_STATE,
} from "./factory-hero.js";

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
  // Active order (null = no order). Phase 0 always null.
  order: null,
  // Pause flags (any !==0 means time is paused)
  pauseFlags: 0,
  // Phase 1A: hero roster + craft team
  ownedHeroes: /** @type {ReturnType<typeof buildOwnedHeroes>} */ ([]),
  craftTeam: /** @type {Array<number|null>} */ (new Array(TEAM_SIZE).fill(null)),
  // Hero list UI
  heroSort: "cl-desc",
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
    const stateLbl = inTeam.has(hero.heroId) ? ti18n("hero.state.assigned") : heroStateLabel(hero.state);
    const elementsHtml = ELEMENTS.map(key => {
      const val = hero.element[key] || 0;
      return `<span class="hero-card__elem" title="${escapeHtml(elementLabel(key))}">
        <img src="${elementIconUrl(key)}" alt="${escapeHtml(elementLabel(key))}" />
        <span class="hero-card__elem-val">${val}</span>
      </span>`;
    }).join("");
    return `<div class="hero-card" data-hero-id="${hero.heroId}" data-rarity="${hero.rarity}">
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
function closeHeroView() {
  $("heroView")?.classList.add("hidden");
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

  if (!state.order) {
    panel.classList.add("order-panel--empty");
    desc.textContent = ti18n("order.none");
    meta.textContent = "";
    elements.innerHTML = "";
    fill.style.width = "0%";
    pct.textContent = "";
    icon.innerHTML = "";
    return;
  }
  // Phase 1+: render real order here.
  panel.classList.remove("order-panel--empty");
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
      // Phase 1A: 'hero' menu opens the real hero view; rest still stub
      if (key === "hero") {
        openHeroView();
        return;
      }
      openStub(key);
    });
  });

  // ── Stub close ──
  $("stubClose")?.addEventListener("click", closeStub);

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
  });

  // ── Esc closes any open overlay ──
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!$("helpOverlay")?.classList.contains("hidden")) { closeHelp(); return; }
    if (!$("stubView")?.classList.contains("hidden")) { closeStub(); return; }
    if (!$("menuOverlay")?.classList.contains("hidden")) { closeMenu(); return; }
  });
}

init();

// Expose APP_VERSION for debug / future ranking submit
if (typeof window !== "undefined") window.__MCF_VERSION = APP_VERSION;
