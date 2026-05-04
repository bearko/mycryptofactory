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
  makeFactoryHero,
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
  ALL_MATERIAL_IDS,
} from "./factory-material.js";
import {
  pickAppraisalJudges,
  rollJudgeScore,
  buildJudgeComment,
  appraisalTotalTier,
} from "./factory-appraisal.js";
import {
  ATTRIBUTE_LABEL,
  ATTRIBUTES,
} from "./factory-attributes.js";
import { MAI_HELP } from "./mai-help.js";
import {
  TUTORIALS,
  makeInitialTutorialState,
  INITIAL_HERO_IDS,
  INITIAL_UNLOCKED_EXT_IDS,
} from "./factory-tutorial.js";
import {
  playBgm,
  playSe,
  preloadAllSe,
} from "./factory-audio.js";
import {
  HIRE_PLANS,
  PLAN_BY_ID,
  canBeRecruiter,
  heroCapAtFactoryLevel,
  HIRE_WAIT_WEEKS,
  hireCostFor,
  rollHireCandidates,
  SALE_SPEED_OPTIONS,
  SALE_SPEED_BY_ID,
  MARKET_FEE_RATE,
  estimateSalePrice,
  netSaleRevenue,
  canSellExt,
} from "./factory-market.js";
import {
  QUEST_DIFFICULTY,
  QUEST_DURATION_WEEKS,
  QUEST_BASE_LEVEL,
  QUEST_DIFFICULTY_LABEL,
  NORMAL_NODES,
  NODE_BY_ID,
  teamQuestLevel,
  questSuccessRate,
  successRateCommentKey,
  rollQuestRewards,
} from "./factory-quest.js";

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
   *    progress:{...}, targets:{...}, qualityRatio: number, qualityTier: string,
   *    appraisal: { judges:[{heroId,score,comment}], totalScore, tier } } */
  warehouse: /** @type {Array<object>} */ ([]),
  /** Phase 1B-4 品評会の表示中データ (5 名審査員 + 各点数 + 合計) */
  pendingAppraisal: /** @type {object | null} */ (null),
  /** Phase 1D-3 ファクトリーレベル (Phase 1D-3 では 1 固定。
   *  level-up フローは別 PR で実装予定) */
  factoryLevel: 1,
  /** Phase 1D-3 進行中の雇用プラン
   *  { planId, recruiterId, startedAtTick, candidates? }
   *  candidates が null → まだ待機中 (1 ヶ月待ち)
   *  candidates が array → 候補出揃い、選ぶ前
   */
  activeHire: /** @type {object | null} */ (null),
  /** Phase 1D-7: 定員溢れで一時保留中の候補 idx (fire modal で fire 後に再雇用される) */
  pendingHireCandIdx: /** @type {number | null} */ (null),
  /** Phase 1D-3 マーケットビュー UI: 現在開いているタブ */
  marketTab: "warehouse",  // "warehouse" | "hire" | "sell"
  /** Phase 1D-4 進行中の出品 (warehouse から販売中の ext)
   *  各要素: { id, warehouseIdx, sellerId, speedId, listedAtTick,
   *          weeks, expectedPrice, status: "listed"|"sold" } */
  activeSales: /** @type {Array<object>} */ ([]),
  /** Phase 1D-4 出品 modal の現在ピック中 ext (warehouse index) */
  sellPickedIdx: -1,
  /** Phase 1C-1 クエスト関連 */
  questTeam: /** @type {Array<number|null>} */ ([null, null, null]),  // 3 枠
  activeQuest: /** @type {object | null} */ (null),
  /**  { nodeId, difficulty, team:[heroId|null × 3], successRate,
   *     startedAtTick, durationWeeks, progress: 0..1 } */
  questPickedNodeId: null,
  questPickedDifficulty: "easy",
  pendingQuestResult: /** @type {object | null} */ (null),
  /** Phase 1D-5 チュートリアル: 各画面の初回表示フラグ。
   *  trigger 後 true にして再表示しないようにする (将来 localStorage 化予定)。 */
  tutorial: makeInitialTutorialState(),
  /** Phase 1D-5 解放済みエクステンション。初期は 4 件 (ノービス系)。
   *  ファクトリーレベル up や本編進行で増える。 */
  unlockedExtIds: /** @type {Set<number>} */ (new Set(INITIAL_UNLOCKED_EXT_IDS)),
};

const QUEST_TEAM_SIZE = 3;

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
  // Phase 1C-1: アクティブクエストの 1 tick 進行
  if (state.activeQuest) {
    tickActiveQuest();
  }
  // Phase 1D-3: 雇用プラン進行 (1 ヶ月で候補生成)
  if (state.activeHire) {
    tickActiveHire();
  }
  // Phase 1D-4: 出品 tick (完了で GUM 加算)
  if (state.activeSales.length > 0) {
    tickActiveSales();
  }
  // Phase 1B-5: 任意 RESTING ヒーロー (= activeCraft / activeQuest 配属外) の自動回復
  tickPassiveRestRecovery();
  // Notifications/floats の TTL GC + 描画更新
  pruneEphemerals();
  renderHeader();
  renderWorkshop();
  renderNotifications();
  renderOrderPanel();
  renderQuestOverlay();
}

/** activeCraft が存在するときの 1 tick 処理。
 *
 *  ユーザー仕様 (Phase 1B 改修):
 *   - 進捗率と「ノルマ達成率 (4 色 target)」は独立した別物
 *   - 進捗 (timeProgress) は時間経過で 0 → 1 に進み、100% で完成扱い
 *   - 着手している人数 + クラフトレベルに応じて少しずつ早くなる
 *   - 1 人でも稼働中なら進捗が進行 (全員睡眠なら止まる)
 *   - 4 色のノルマ達成は完成時の品質 tier 評価に使う (達成度別 mai コメント)
 *
 *  処理:
 *   - 配属ヒーローごとに stamina decay / recovery 処理
 *   - 起きているヒーローはクラフト値獲得をロール (4 色を貯める)
 *   - 起きているヒーローはパッシブ発動をロール
 *   - 稼働中ヒーローが居れば timeProgress を加算
 *   - timeProgress >= 1 で triggerCraftCompletion */
function tickActiveCraft() {
  const ac = state.activeCraft;
  if (!ac) return;
  let activeWorkers = 0;
  let totalCraftLv = 0;
  for (let slotIdx = 0; slotIdx < ac.team.length; slotIdx++) {
    const heroId = ac.team[slotIdx];
    if (heroId == null) continue;
    const hero = findHero(heroId);
    if (!hero) continue;
    // 1. stamina 状態遷移
    if (hero.state === HERO_STATE.RESTING) {
      adjustStamina(hero, staminaRecoverPerTick(hero));
      if (isFullyRested(hero)) hero.state = HERO_STATE.CRAFTING;
    } else {
      adjustStamina(hero, -staminaDecayPerTick(hero));
      if (isExhausted(hero)) {
        hero.state = HERO_STATE.RESTING;
        continue;
      }
    }
    if (hero.state === HERO_STATE.RESTING) continue;
    activeWorkers++;
    totalCraftLv += craftLevel(hero);
    // 2. 4 色獲得ロール (完成判定には影響せず、品質 tier の素材)
    const gain = rollCraftGain(hero);
    if (gain) {
      ac.progress[gain.element] = (ac.progress[gain.element] || 0) + gain.value;
      pushSpriteFloat(slotIdx, gain.element, gain.value);
      // Phase 1D-6: クラフト値獲得 SE (連発防止スロットルあり)
      playSe("craftGain");
    }
    // 3. パッシブ発動ロール
    const passive = rollPassiveTrigger(hero);
    if (passive) {
      ac.progress[passive.element] = (ac.progress[passive.element] || 0) + passive.value;
      pushPassiveNotification(hero, passive);
    }
  }
  // 4. 時間進捗 timeProgress を加算 (1 人でも働いていれば進む)
  if (activeWorkers > 0) {
    const totalTicks = (ac.durationWeeks || 1) * SECONDS_PER_WEEK;
    const baseDelta  = 1 / totalTicks;
    // 人数ボーナス: 追加 1 人ごとに +10% (1 人 = +0% / 5 人 = +40%)
    const heroBonus  = (activeWorkers - 1) * 0.10;
    // クラフトLv ボーナス: 1000 で +50% 上限
    const lvBonus    = Math.min(0.5, totalCraftLv / 2000);
    const factor     = 1 + heroBonus + lvBonus;
    ac.timeProgress  = Math.min(1, (ac.timeProgress || 0) + baseDelta * factor);
  }
  // 5. 完了判定 (時間進捗 100%)
  if ((ac.timeProgress || 0) >= 1) {
    triggerCraftCompletion(ac);
  }
}

/** 完成判定発火 ─ activeCraft を pendingCompletion に移し、
 *  Mai の通知 → 完成画面を順に表示する。 */
function triggerCraftCompletion(ac) {
  // 実所要週数 (timeProgress 0 → 1 までの実時間)
  const elapsedTicks = state.tickCount - (ac.startedAtTick || 0);
  const actualWeeks  = Math.max(1, Math.ceil(elapsedTicks / SECONDS_PER_WEEK));
  // 品質 tier はノルマ (4 色 target) の達成度で評価:
  //   - 全色 target を達成: ratio で good/excellent 振り分け
  //   - target>0 の色で 1 つでも未達: under (= 「基準値未達」mai コメント)
  let progSum = 0, tgtSum = 0;
  let allMet = true;
  for (const k of ELEMENTS) {
    const cur = ac.progress[k] || 0;
    const tgt = ac.targets[k]  || 0;
    progSum += cur;
    tgtSum  += tgt;
    if (tgt > 0 && cur < tgt) allMet = false;
  }
  const qualityRatio = tgtSum > 0 ? progSum / tgtSum : 1;
  const qualityTier  = pickQualityTier(qualityRatio, allMet);

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

/** 品質 tier の判定。
 *  Phase 1B 改修: 完了は「時間進捗 100%」で起こるので、ノルマ (4 色 target)
 *  を満たしているかどうかは独立して評価する。
 *
 *  - allMet === false: 1 色でも未達 → "under" (基準値未達)
 *  - allMet === true + ratio >= 1.5: "excellent" (大幅オーバー)
 *  - それ以外: "good" (達成)
 */
function pickQualityTier(ratio, allMet) {
  if (!allMet) return "under";
  if (ratio >= 1.5) return "excellent";
  return "good";
}

/** activeCraft / activeQuest の team 外で RESTING になっているヒーローを
 *  自動回復させる。手動「休憩」ボタンで RESTING 入りしたヒーローや、
 *  過去のクラフト/クエストで疲れたヒーローが対象。 */
function tickPassiveRestRecovery() {
  const skip = new Set();
  for (const id of state.activeCraft?.team || []) if (id != null) skip.add(id);
  for (const id of state.activeQuest?.team || []) if (id != null) skip.add(id);
  for (const hero of state.ownedHeroes) {
    if (!hero) continue;
    if (hero.state !== HERO_STATE.RESTING) continue;
    if (skip.has(hero.heroId)) continue;
    adjustStamina(hero, staminaRecoverPerTick(hero));
    if (isFullyRested(hero)) hero.state = HERO_STATE.IDLE;
  }
}

/** ─── Quest tick (Phase 1C-1) ───────────────────────────────────── */

function tickActiveQuest() {
  const aq = state.activeQuest;
  if (!aq) return;
  // 進捗 = elapsed ticks / total ticks
  const elapsed = state.tickCount - aq.startedAtTick;
  const totalTicks = aq.durationWeeks * SECONDS_PER_WEEK;
  aq.progress = Math.min(1, elapsed / totalTicks);
  if (aq.progress >= 1) {
    triggerQuestComplete(aq);
  }
}

function triggerQuestComplete(aq) {
  const success = Math.random() <= aq.successRate;
  const node = NODE_BY_ID[aq.nodeId];
  let rewards = {};
  if (success && node) rewards = rollQuestRewards(node, aq.difficulty);

  // 報酬を所持素材に追加
  if (success) {
    for (const [matId, qty] of Object.entries(rewards)) {
      state.materials[matId] = (state.materials[matId] || 0) + qty;
    }
  }

  // 配属ヒーローの HP を 0 にして RESTING 入り (ユーザー仕様):
  // 「成功しても編成中のヒーローの体力がゼロになる」
  for (const id of aq.team) {
    if (id == null) continue;
    const h = findHero(id);
    if (!h) continue;
    h.stamina.current = 0;
    h.state = HERO_STATE.RESTING;
  }

  state.pendingQuestResult = {
    nodeId: aq.nodeId,
    difficulty: aq.difficulty,
    team: aq.team.slice(),
    success,
    rewards,
    finishedAt: { year: state.year, month: state.month, week: state.week },
  };
  state.activeQuest = null;
  // Mai ポップアップ → 閉じるとレポート画面
  maiSays(success ? "quest.mai.success" : "quest.mai.failure", {
    onClose: openQuestResultScreen,
  });
}

/** ─── Quest selection / start view (Phase 1C-1) ─────────────────── */

function openQuestView() {
  pauseTime();
  $("questView")?.classList.remove("hidden");
  // 初回オープンで pickedNodeId 未設定なら最初のノード+初級を仮選択
  if (!state.questPickedNodeId) state.questPickedNodeId = NORMAL_NODES[0].id;
  if (!state.questPickedDifficulty) state.questPickedDifficulty = "easy";
  renderQuestView();
}
function closeQuestView() {
  $("questView")?.classList.add("hidden");
  resumeTime();
}

function renderQuestView() {
  // ノード一覧 (4 通常ノード)
  $("questNodeList").innerHTML = NORMAL_NODES.map(n => {
    const sel = n.id === state.questPickedNodeId ? " quest-node--sel" : "";
    return `<button type="button" class="quest-node${sel}" data-node="${n.id}">
      <span class="quest-node__name">${escapeHtml(n.nameJa)}</span>
      <span class="quest-node__note">${escapeHtml(extractNote(n.note, getLang()))}</span>
    </button>`;
  }).join("");

  // 難易度ボタン
  $("questDiffList").innerHTML = ["easy", "normal", "hard"].map(d => {
    const sel = d === state.questPickedDifficulty ? " quest-diff--sel" : "";
    const label = QUEST_DIFFICULTY_LABEL[d][getLang() === "en" ? "en" : "ja"];
    return `<button type="button" class="quest-diff${sel}" data-diff="${d}">
      <span class="quest-diff__label">${escapeHtml(label)}</span>
      <span class="quest-diff__weeks">${QUEST_DURATION_WEEKS[d]}${ti18n("craft.weeks").replace("{n}", "").trim() || "wk"}</span>
    </button>`;
  }).join("");

  // パーティ (3 枠) — クラフト編成と同じノリで heroes 一覧から pick
  const team = state.questTeam.map(id => id == null ? null : findHero(id));
  $("questTeamSlots").innerHTML = state.questTeam.map((id, idx) => {
    if (id == null) return `<div class="quest-team__slot" data-slot="${idx}">+</div>`;
    const h = findHero(id);
    if (!h) return `<div class="quest-team__slot" data-slot="${idx}">?</div>`;
    return `<div class="quest-team__slot quest-team__slot--filled" data-slot="${idx}" title="${escapeHtml(tHero(h.heroId, h.nameJa))}">
      <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="quest-team__slot-name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
    </div>`;
  }).join("");

  // ヒーロー候補リスト (questing/crafting/resting ではないもの優先表示)
  const eligible = state.ownedHeroes.slice().sort((a, b) => {
    // 優先: idle → resting (HP min) → questing/crafting (assigned に出てこないが念の為)
    const rank = (h) => {
      if (state.questTeam.includes(h.heroId)) return 0;
      if (h.state === HERO_STATE.IDLE) return 1;
      if (h.state === HERO_STATE.RESTING) return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });
  $("questHeroPick").innerHTML = eligible.slice(0, 30).map(h => {
    const inTeam = state.questTeam.includes(h.heroId);
    const stamPct = h.stamina.max > 0 ? (h.stamina.current / h.stamina.max * 100) : 0;
    const ql = Math.round(((h.element.garuda || 0) + (h.element.ifrit || 0) +
                           (h.element.leviathan || 0) + (h.element.tiamat || 0)) * (stamPct / 100));
    return `<button type="button" class="quest-hero-pick${inTeam ? " quest-hero-pick--in" : ""}" data-hero="${h.heroId}" ${h.state === HERO_STATE.CRAFTING ? "disabled" : ""}>
      <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="quest-hero-pick__name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
      <span class="quest-hero-pick__ql">QL ${ql}</span>
      <span class="quest-hero-pick__hp">HP ${h.stamina.current}/${h.stamina.max}</span>
    </button>`;
  }).join("");

  // 成功率 + マイのコメント
  const node = NODE_BY_ID[state.questPickedNodeId];
  const baseLv = QUEST_BASE_LEVEL[state.questPickedDifficulty];
  const teamLv = teamQuestLevel(team);
  const rate = node ? questSuccessRate(teamLv, baseLv) : -1;
  const commentKey = successRateCommentKey(rate);
  const startBtn = $("questStartBtn");
  if (rate < 0 || state.questTeam.filter(x => x != null).length === 0) {
    startBtn.disabled = true;
  } else {
    startBtn.disabled = false;
  }
  $("questSummary").innerHTML = `
    <div class="quest-summary__row">
      <span class="quest-summary__label">${escapeHtml(ti18n("quest.teamLevel"))}:</span>
      <strong>${teamLv}</strong>
      <span class="quest-summary__sep">/</span>
      <span class="quest-summary__base">${baseLv}</span>
    </div>
    <div class="quest-summary__row">
      <span class="quest-summary__label">${escapeHtml(ti18n("quest.successRate"))}:</span>
      <strong class="quest-summary__rate" data-rate="${rate < 0 ? "blocked" : Math.round(rate * 100)}">
        ${rate < 0 ? ti18n("quest.blocked") : (Math.round(rate * 100) + "%")}
      </strong>
    </div>
    <p class="quest-summary__mai">${escapeHtml(ti18n(commentKey))}</p>
  `;
}

function extractNote(note, lang) {
  // "ja:..|en:.." 形式
  const segs = (note || "").split("|");
  for (const s of segs) {
    const [l, ...rest] = s.split(":");
    if (l === lang) return rest.join(":");
  }
  return segs[0]?.split(":").slice(1).join(":") || "";
}

function startActiveQuest() {
  const node = NODE_BY_ID[state.questPickedNodeId];
  if (!node) return;
  const diff = state.questPickedDifficulty;
  const team = state.questTeam.slice();
  const teamHeroes = team.map(id => id == null ? null : findHero(id));
  const baseLv = QUEST_BASE_LEVEL[diff];
  const teamLv = teamQuestLevel(teamHeroes);
  const rate   = questSuccessRate(teamLv, baseLv);
  if (rate < 0) return;

  // ヒーローを QUESTING 状態に
  for (const id of team) {
    if (id == null) continue;
    const h = findHero(id);
    if (h) h.state = HERO_STATE.QUESTING;
  }

  state.activeQuest = {
    nodeId: node.id,
    difficulty: diff,
    team,
    successRate: rate,
    startedAtTick: state.tickCount,
    durationWeeks: QUEST_DURATION_WEEKS[diff],
    progress: 0,
  };
  closeQuestView();
  renderQuestOverlay();
}

/** ─── Quest progress overlay (top of workshop) ───────────────────── */
function renderQuestOverlay() {
  const host = $("questOverlay");
  if (!host) return;
  const aq = state.activeQuest;
  if (!aq) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  host.classList.remove("hidden");
  const node = NODE_BY_ID[aq.nodeId];
  const pctVal = Math.floor((aq.progress || 0) * 100);
  const teamHtml = aq.team.filter(id => id != null).slice(0, 3).map(id => {
    const h = findHero(id);
    if (!h) return "";
    return `<img class="quest-overlay__hero" src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />`;
  }).join("");
  host.innerHTML = `
    <div class="quest-overlay__left">${teamHtml}</div>
    <div class="quest-overlay__right">
      <span class="quest-overlay__node">${escapeHtml(ti18n("quest.nodeLabel"))}: ${escapeHtml(node?.nameJa || aq.nodeId)}</span>
      <span class="quest-overlay__status">${escapeHtml(ti18n("quest.inProgress"))} ${pctVal}%</span>
    </div>
    <div class="quest-overlay__bar"><div class="quest-overlay__bar-fill" style="width:${pctVal}%"></div></div>
  `;
}

/** ─── Quest result screen (Phase 1C-1) ────────────────────────────── */

function openQuestResultScreen() {
  if (!state.pendingQuestResult) return;
  pauseTime();
  $("questResultModal")?.classList.remove("hidden");
  renderQuestResultScreen();
}

function renderQuestResultScreen() {
  const pq = state.pendingQuestResult;
  if (!pq) return;
  const node = NODE_BY_ID[pq.nodeId];
  const titleKey = pq.success ? "quest.result.success" : "quest.result.failure";
  $("questResultTitle").textContent = ti18n(titleKey);
  $("questResultTitle").setAttribute("data-success", pq.success ? "1" : "0");
  const subText = ti18n("quest.result.summary")
    .replace("{node}", node?.nameJa || pq.nodeId)
    .replace("{diff}", QUEST_DIFFICULTY_LABEL[pq.difficulty][getLang() === "en" ? "en" : "ja"]);
  $("questResultSummary").textContent = subText;

  // 報酬一覧
  const rewards = pq.rewards || {};
  const rewardItems = Object.entries(rewards);
  if (rewardItems.length === 0) {
    $("questResultRewards").innerHTML = `<p class="quest-result__no-reward">${escapeHtml(ti18n("quest.result.noReward"))}</p>`;
  } else {
    $("questResultRewards").innerHTML = rewardItems.map(([id, qty]) => {
      return `<div class="quest-result__reward">
        <img src="${materialIcon(id)}" alt="${escapeHtml(materialName(id, getLang()))}" onerror="this.style.opacity='0.2'" />
        <span class="quest-result__reward-name">${escapeHtml(materialName(id, getLang()))}</span>
        <strong class="quest-result__reward-qty">×${qty}</strong>
      </div>`;
    }).join("");
  }

  // 配属ヒーロー (HP 0 で帰還)
  $("questResultTeam").innerHTML = pq.team.filter(id => id != null).map(id => {
    const h = findHero(id);
    if (!h) return "";
    return `<div class="quest-result__hero">
      <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span>${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
      <span class="quest-result__hero-hp">HP 0/${h.stamina.max}</span>
    </div>`;
  }).join("");
}

function closeQuestResultScreen() {
  $("questResultModal")?.classList.add("hidden");
  state.pendingQuestResult = null;
  // クエストチームを reset (体力 0 のため再選択は別途)
  state.questTeam = [null, null, null];
  resumeTime();
  renderQuestOverlay();
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
  // Phase 1D-5: 工房レベル = 所有ヒーロー全員の craftLevel 合計
  const lvEl = $("factoryLvText");
  if (lvEl) {
    const total = state.ownedHeroes.reduce((s, h) => s + craftLevel(h), 0);
    lvEl.textContent = ti18n("header.factoryLv").replace("{n}", total.toLocaleString());
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

/** 士農工商バッジ HTML を生成。
 *  hero.attributes (string[]) の各属性を 1 文字 Kanji の小バッジで表示。 */
function renderHeroAttrBadges(hero) {
  if (!hero || !Array.isArray(hero.attributes) || hero.attributes.length === 0) {
    return "";
  }
  return `<span class="attr-badges">${hero.attributes.map(a => {
    const lbl = ATTRIBUTE_LABEL[a];
    if (!lbl) return "";
    return `<span class="attr-badge attr-badge--${a}" title="${escapeHtml(lbl[getLang() === "en" ? "en" : "ja"])}">${escapeHtml(lbl.ja)}</span>`;
  }).join("")}</span>`;
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

  // 合計 craftLevel (各ヒーローの craftLevel = ガルーダ GARUDA_WEIGHT 込み)
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
      // ガルーダは GARUDA_WEIGHT で表示 (factory 文脈での craft 寄与値)
      const val = elementValueForCraft(hero, key);
      return `<span class="hero-card__elem" title="${escapeHtml(elementLabel(key))}: ${val}">
        <img src="${elementIconUrl(key)}" alt="${escapeHtml(elementLabel(key))}" />
        <span class="hero-card__elem-val">${val}</span>
      </span>`;
    }).join("");
    // 「休憩」ボタン: HP 減 (cur < max) かつ assigned/CRAFTING/QUESTING 中でない
    //   → 手動で RESTING 入りさせて回復を強制する。
    const canRest = !assigned
      && hero.state !== HERO_STATE.CRAFTING
      && hero.state !== HERO_STATE.QUESTING
      && hero.stamina.current < hero.stamina.max;
    const restBtn = canRest
      ? `<button type="button" class="hero-card__rest-btn" data-rest-hero="${hero.heroId}" data-i18n="hero.actions.rest">休憩</button>`
      : "";
    return `<div class="${cardCls}" data-hero-id="${hero.heroId}" data-rarity="${hero.rarity}" data-assigned="${assigned ? "1" : "0"}">
      <div class="hero-card__head">
        <img class="hero-card__portrait" src="${portrait}" alt="" onerror="this.style.opacity='0.2'" />
        <div class="hero-card__head-info">
          <div class="hero-card__name-row">
            <span class="hero-card__name">${escapeHtml(name)}</span>
            ${renderHeroAttrBadges(hero)}
          </div>
          <div class="hero-card__state" data-state="${hero.state}">${escapeHtml(stateLbl)}</div>
        </div>
        ${restBtn}
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
  // Phase 1D-5: 初回ヒーロー画面でクラフトチーム編成の解説
  runTutorialOnce("heroTeam");
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
  // Phase 1D-5: 解放済みエクステンション (INITIAL_UNLOCKED_EXT_IDS) のみ表示。
  // ファクトリーレベル up や本編進行で state.unlockedExtIds に追加される。
  return EXTENSIONS.filter(e => {
    if ((e.rarity || "").toLowerCase() !== "common") return false;
    return state.unlockedExtIds.has(e.extId);
  });
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

/** Phase 1D-5: 所有素材インベントリ strip を描画 (アイコン + 名前 + 個数)。
 *  クラフト選択画面のヘッダー直下、「並び順」フィルターの上に表示される。 */
function renderCraftMatStrip() {
  const host = $("craftMatStrip");
  if (!host) return;
  const lang = getLang();
  host.innerHTML = ALL_MATERIAL_IDS.map(id => {
    const qty = state.materials[id] || 0;
    const cls = qty === 0 ? " craft-mat-chip--zero" : "";
    return `<span class="craft-mat-chip${cls}" title="${escapeHtml(materialName(id, lang))}">
      <img src="${materialIcon(id)}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="craft-mat-chip__name">${escapeHtml(materialName(id, lang))}</span>
      <span class="craft-mat-chip__qty">${qty}</span>
    </span>`;
  }).join("");
}

function renderExtList() {
  const host = $("extList");
  if (!host) return;
  const team = currentTeamHeroes();
  const list = sortedExtensions();
  $("craftSelectCount").textContent = ti18n("craft.select.count").replace("{n}", list.length);
  renderCraftMatStrip();
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
  // Phase 1D-5: 初回オープンでクラフト選択画面の解説
  runTutorialOnce("craftSelect");
}
function closeCraftView() {
  $("craftView")?.classList.add("hidden");
  resumeTime();
}

function pickExtForConfirm(extId) {
  state.craftPickedExtId = extId;
  setCraftScreen("confirm");
  renderConfirm();
  // Phase 1D-5: 初回確認画面でマイの解説 (ヒーロー編成有無で分岐)
  if (!state.tutorial.craftConfirm) {
    const filled = state.craftTeam.filter(id => id != null).length;
    const key = filled > 0 ? "craftConfirmWithTeam" : "craftConfirmNoTeam";
    state.tutorial.craftConfirm = true;  // どちらでも 1 回限り
    const lang = getLang() === "en" ? "en" : "ja";
    const lines = TUTORIALS[key]?.[lang] || TUTORIALS[key]?.ja || [];
    if (lines.length > 0) maiSaysSequence(lines);
  }
}

function startActiveCraft() {
  const ext = EXTENSION_BY_ID[String(state.craftPickedExtId)];
  if (!ext) return;
  const team = state.craftTeam.slice();
  const teamHeroes = currentTeamHeroes();
  // 安全チェック (ボタンが disabled でも念のため)
  const avail = craftAvailability(ext, teamHeroes, state.materials);
  if (!avail.materialOk) return;
  // Phase 1D-6: クラフト開始 SE
  playSe("craftStart");
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
    timeProgress: 0,                  // Phase 1B 改修: 時間進捗 (0..1)、完成判定の主役
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
  // Phase 1D-5: クラフト中ホームに戻った直後の初回解説
  // (時間進行が始まる前に、ホーム画面が表示されてから少し遅延して出す)
  if (!state.tutorial.craftInProgress) {
    setTimeout(() => runTutorialOnce("craftInProgress"), 600);
  }
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
  // 達成 = target===0 (= 不要な色で最初から達成扱い) or progress >= target
  elements.innerHTML = ELEMENTS.map(k => {
    const cur = ac.progress[k] || 0;
    const tgt = ac.targets[k] || 0;
    const reached = tgt === 0 || cur >= tgt;
    return `<span class="order-panel__el ${reached ? "order-panel__el--reached" : ""}" title="${escapeHtml(elementLabel(k))} ${cur}/${tgt}">
      <img class="order-panel__el-icon" src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
      <span class="order-panel__el-val"><strong>${cur}</strong>/<span class="order-panel__el-tgt">${tgt}</span></span>
    </span>`;
  }).join("");

  // 進捗バーは「時間進捗 (timeProgress)」を表示 ─ ノルマ達成率とは独立。
  // Phase 1B 改修: タイマーが 100% に到達したら完成、4 色のノルマは
  //                品質 tier 評価に使う独立メトリック。
  const pctRaw = (ac.timeProgress || 0) * 100;
  fill.style.width = pctRaw.toFixed(2) + "%";
  pct.textContent = Math.floor(pctRaw) + "%";
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
  $("heroDetailAttrs").innerHTML = renderHeroAttrBadges(hero);
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
  // Phase 1D-6: タイトルタップ = 最初のユーザー操作なので、ここで BGM 再生開始
  // (ブラウザの autoplay policy 突破のため、user gesture 直後で呼ぶ必要あり)
  playBgm();
  preloadAllSe();
  titleEl.classList.add("title-out");
  setTimeout(() => {
    titleEl.classList.add("hidden");
    titleEl.classList.remove("title-out");
    // Time starts only after the player taps in
    startTimeLoop();
    // Phase 1D-5: ホーム画面初回入りでマイのチュートリアル
    runTutorialOnce("home");
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
  // Phase 1D-7: workshop の MENU ボタン → 「戻る」表記に切替 (押下で close)
  setMenuButtonLabel("close");
  // submenu は閉じた状態でスタート
  $("marketSubmenu")?.classList.add("hidden");
  document.querySelectorAll(".menu-item[data-menu]").forEach(b => b.classList.remove("menu-item--active"));
}
function closeMenu() {
  $("menuOverlay")?.classList.add("hidden");
  $("marketSubmenu")?.classList.add("hidden");
  setMenuButtonLabel("open");
  resumeTime();
}

/** Phase 1D-7: workshop の MENU ボタンの label を切替。
 *  mode = "open" (= 「MENU」) / "close" (= 「戻る」) */
function setMenuButtonLabel(mode) {
  const btn = $("btnMenuOpen");
  if (!btn) return;
  if (mode === "close") {
    btn.textContent = ti18n("menu.back");
    btn.dataset.mode = "close";
  } else {
    btn.textContent = ti18n("menu.open");
    btn.dataset.mode = "open";
  }
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

/** ─── Mai navigator (Phase 1D-2) ─────────────────────────────────── */

/** 現在開いている画面に応じた help エントリのキーを返す。
 *  優先度: 開いている modal/view を上から評価し、最初にマッチした key を返す。 */
function currentMaiContext() {
  if (!$("questView")?.classList.contains("hidden"))   return "quest";
  if (!$("marketView")?.classList.contains("hidden"))  return "market";
  if (!$("heroView")?.classList.contains("hidden"))    return "hero";
  if (!$("craftView")?.classList.contains("hidden")) {
    return state.craftScreen === "confirm" ? "craftConfirm" : "craftSelect";
  }
  return "home";
}

function openMaiHelp() {
  const ctx = currentMaiContext();
  const help = MAI_HELP[ctx] || MAI_HELP.default;
  const modal = $("maiHelpModal");
  const titleEl = $("maiHelpTitle");
  const bodyEl  = $("maiHelpBody");
  if (!modal || !bodyEl || !titleEl) return;
  const lang = getLang() === "en" ? "en" : "ja";
  titleEl.textContent = lang === "en" ? help.titleEn : help.titleJa;
  bodyEl.textContent  = lang === "en" ? help.bodyEn  : help.bodyJa;
  modal.classList.remove("hidden");
  pauseTime();
}
function closeMaiHelp() {
  $("maiHelpModal")?.classList.add("hidden");
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
  // Phase 1D-5 修正: シーケンス進行中なら閉じずに次の行へ進める。
  // 最終行に到達したら通常 close 経路に流す。
  if (_maiSeqQueue.length > 0) {
    _maiSeqIdx++;
    if (_maiSeqIdx < _maiSeqQueue.length) {
      const body = $("maiModalBody");
      const btn  = $("maiModalClose");
      if (body) body.textContent = _maiSeqQueue[_maiSeqIdx];
      if (btn)  btn.textContent  = _maiSeqIdx < _maiSeqQueue.length - 1
        ? ti18n("mai.next") : ti18n("btn.close");
      return;  // モーダルは閉じない、次セリフだけ表示
    }
    // 最終行を表示し終わったので閉じる
    _maiSeqQueue = [];
    _maiSeqIdx = 0;
    const seqCb = _maiSeqOnClose;
    _maiSeqOnClose = null;
    $("maiModal")?.classList.add("hidden");
    const closeBtn = $("maiModalClose");
    if (closeBtn) closeBtn.textContent = ti18n("btn.close");
    if (seqCb) { seqCb(); return; }
    // sequence が onClose を持たないなら通常 close と同じ後始末
    const next = _maiNextAction;
    _maiNextAction = null;
    if (next) next();
    else      resumeTime();
    return;
  }
  // ── 通常 (単行 maiSays) の閉じ処理 ──
  $("maiModal")?.classList.add("hidden");
  const next = _maiNextAction;
  _maiNextAction = null;
  if (next) {
    next();
  } else {
    resumeTime();
  }
}

/** Esc / 背景タップ用: シーケンス途中でも強制的に閉じる (skip dialog) */
function forceCloseMaiModal() {
  _maiSeqQueue = [];
  _maiSeqIdx = 0;
  _maiSeqOnClose = null;
  closeMaiModal();
}

/** Phase 1D-5: マイの複数行セリフをシーケンス表示する。
 *  各行ごとに「次へ」ボタンで進み、最終行で「閉じる」になる。
 *
 *  @param {string[]} messages  ja or en 行の配列 (既にロケール済み)
 *  @param {object}   options   { onClose?: () => void } 全行終了時の callback
 */
let _maiSeqQueue = [];
let _maiSeqIdx   = 0;
let _maiSeqOnClose = null;
function maiSaysSequence(messages, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  _maiSeqQueue   = messages.slice();
  _maiSeqIdx     = 0;
  _maiSeqOnClose = options.onClose || null;
  const modal = $("maiModal");
  const body  = $("maiModalBody");
  const btn   = $("maiModalClose");
  if (!modal || !body || !btn) return;
  // 1 行目を表示。「次へ」 ↔ 「閉じる」 のラベル切替は closeMaiModal 側 (= ボタン
  // クリックハンドラ) が次行進行のたびに実施する。
  body.textContent = _maiSeqQueue[_maiSeqIdx];
  btn.textContent  = _maiSeqQueue.length > 1 ? ti18n("mai.next") : ti18n("btn.close");
  modal.classList.remove("hidden");
  pauseTime();
}

/** Phase 1D-5: 文脈に応じたチュートリアルを 1 度だけ表示する。
 *  state.tutorial.<key> が false のときに TUTORIALS[key] のセリフを順番に
 *  シーケンス表示し、終了時に true にする。
 *
 *  @param {string} key  TUTORIALS のキー (e.g. "home" / "craftSelect")
 *  @param {object} opts { onClose?: () => void }
 *  @returns {boolean} 表示したかどうか (既に true なら false を返す)
 */
function runTutorialOnce(key, opts = {}) {
  if (!key || !TUTORIALS[key]) return false;
  if (state.tutorial?.[key]) return false;
  const lang = getLang() === "en" ? "en" : "ja";
  const lines = TUTORIALS[key][lang] || TUTORIALS[key].ja || [];
  if (lines.length === 0) return false;
  state.tutorial[key] = true;
  maiSaysSequence(lines, opts);
  return true;
}

/** ─── Craft completion screen (Phase 1B-3) ───────────────────────── */
function openCompletionScreen() {
  if (!state.pendingCompletion) {
    // 万一 pendingCompletion が無い (= 直接呼ばれた) なら何もしない
    return;
  }
  const modal = $("craftDoneModal");
  if (!modal) return;
  // Phase 1D-6: 完成画面表示時のファンファーレ SE
  playSe("craftDone");
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

  // 4 色の達成状況: progress / target
  //   reached  = 達成 (緑) — target===0 (不要色) も「達成扱い」で緑字
  //   excellent = 大幅オーバー (target × 1.5+ / 金色)
  //   under    = 未達 (target>0 で progress<target / 赤)
  $("craftDoneElements").innerHTML = ELEMENTS.map(k => {
    const cur = pc.progress[k] || 0;
    const tgt = pc.targets[k]  || 0;
    let stat;
    if (tgt === 0)              stat = "reached";          // 不要色も達成扱い
    else if (cur >= tgt * 1.5)  stat = "excellent";
    else if (cur >= tgt)        stat = "reached";
    else                        stat = "under";
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
  // Phase 1B-3 では完成画面 close で完全 cleanup していたが、
  // Phase 1B-4 から「完成 → 品評会 → 倉庫格納」のフローになるため、
  // ここでは閉じて品評会 (appraisal) 画面を開く。
  $("craftDoneModal")?.classList.add("hidden");
  openAppraisalScreen();
}

/** ─── Market view: tabs (倉庫 / 雇用 / 出品) ────────────────────── */

function openMarketView() {
  pauseTime();
  $("marketView")?.classList.remove("hidden");
  renderMarketView();
}
function closeMarketView() {
  $("marketView")?.classList.add("hidden");
  resumeTime();
}

function setMarketTab(tab) {
  state.marketTab = tab;
  // タブボタン active 切替
  document.querySelectorAll("[data-market-tab]").forEach(btn => {
    btn.classList.toggle("market-view__tab--active",
      btn.getAttribute("data-market-tab") === tab);
  });
  // ボディ切替
  document.querySelectorAll("[data-market-tab-body]").forEach(el => {
    el.classList.toggle("hidden",
      el.getAttribute("data-market-tab-body") !== tab);
  });
  renderMarketView();
}

function renderMarketView() {
  if (state.marketTab === "warehouse") renderMarketWarehouse();
  else if (state.marketTab === "hire") renderMarketHire();
  else if (state.marketTab === "sell") renderMarketSell();
}

/** ─── 出品タブ (Phase 1D-4) ─────────────────────────────────────── */

function renderMarketSell() {
  // 進行中の販売
  const activeHtml = state.activeSales.length === 0
    ? `<p class="market-sell__empty-active">${escapeHtml(ti18n("sell.noActive"))}</p>`
    : state.activeSales.map(s => {
        const w = state.warehouse[s.warehouseIdx];
        const ext = EXTENSION_BY_ID[String(w?.extId)];
        const seller = findHero(s.sellerId);
        const elapsed = state.tickCount - s.listedAtTick;
        const total = s.weeks * SECONDS_PER_WEEK;
        const pct = Math.min(100, Math.floor(elapsed / total * 100));
        return `<div class="active-sale">
          <img src="${ext ? extIconUrl(w.extId) : ""}" alt="" class="active-sale__icon" onerror="this.style.opacity='0.2'" />
          <div class="active-sale__main">
            <div class="active-sale__name-row">
              <span class="active-sale__name">${escapeHtml(ext?.nameJa || "—")}</span>
              <span class="active-sale__speed">${escapeHtml(getLang() === "en" ? SALE_SPEED_BY_ID[s.speedId].nameEn : SALE_SPEED_BY_ID[s.speedId].nameJa)}</span>
            </div>
            <div class="active-sale__meta">
              <span>${escapeHtml(ti18n("sell.seller"))}: ${seller ? escapeHtml(tHero(seller.heroId, seller.nameJa)) : "—"}</span>
              <span class="active-sale__price">${s.expectedPrice.toLocaleString()} GUM</span>
            </div>
            <div class="active-sale__bar"><div class="active-sale__bar-fill" style="width:${pct}%"></div></div>
            <span class="active-sale__pct">${pct}%</span>
          </div>
        </div>`;
      }).join("");
  $("activeSalesList").innerHTML = activeHtml;

  // 出品候補 (warehouse 内 + まだ販売していない)
  const sellingIdxSet = new Set(state.activeSales.map(s => s.warehouseIdx));
  const candidates = state.warehouse
    .map((w, idx) => ({ w, idx }))
    .filter(({ idx }) => !sellingIdxSet.has(idx));

  $("sellableList").innerHTML = candidates.length === 0
    ? `<p class="market-sell__empty-cand">${escapeHtml(ti18n("sell.noCandidates"))}</p>`
    : candidates.map(({ w, idx }) => {
        const ext = EXTENSION_BY_ID[String(w.extId)];
        const tierLbl = w.appraisal ? ti18n("appraisal.tier." + w.appraisal.tier) : "—";
        return `<button type="button" class="sellable" data-warehouse-idx="${idx}">
          <img src="${extIconUrl(w.extId)}" alt="" class="sellable__icon" onerror="this.style.opacity='0.2'" />
          <span class="sellable__name">${escapeHtml(ext?.nameJa || "—")}</span>
          <span class="sellable__rarity" data-rarity="${ext?.rarity || "common"}">${escapeHtml(ti18n("rarity." + (ext?.rarity || "common")))}</span>
          ${w.appraisal ? `<span class="sellable__tier" data-tier="${w.appraisal.tier}">${escapeHtml(tierLbl)}</span>` : ""}
        </button>`;
      }).join("");
}

/** 出品 modal を開く */
function openSellModal(warehouseIdx) {
  state.sellPickedIdx = warehouseIdx;
  $("sellModal")?.classList.remove("hidden");
  pauseTime();
  // デフォルト 速度 = standard、seller = 未選択
  if (!_sellPickedSpeedId) _sellPickedSpeedId = "standard";
  _sellPickedSellerId = null;
  renderSellModal();
}

let _sellPickedSpeedId = null;
let _sellPickedSellerId = null;

function renderSellModal() {
  const idx = state.sellPickedIdx;
  if (idx < 0) return;
  const w = state.warehouse[idx];
  if (!w) return;
  const ext = EXTENSION_BY_ID[String(w.extId)];

  // ext 情報
  $("sellExtIcon").src = extIconUrl(w.extId);
  $("sellExtName").textContent = ext?.nameJa || "—";
  $("sellExtRarity").textContent = ti18n("rarity." + (ext?.rarity || "common"));
  $("sellExtRarity").setAttribute("data-rarity", ext?.rarity || "common");
  if (w.appraisal) {
    $("sellExtTier").textContent = ti18n("appraisal.tier." + w.appraisal.tier);
    $("sellExtTier").setAttribute("data-tier", w.appraisal.tier);
    $("sellExtTier").classList.remove("hidden");
  } else {
    $("sellExtTier").classList.add("hidden");
  }

  // 速度選択
  $("sellSpeedList").innerHTML = SALE_SPEED_OPTIONS.map(s => {
    const sel = s.id === _sellPickedSpeedId ? " sell-speed--sel" : "";
    const lang = getLang() === "en" ? "en" : "ja";
    return `<button type="button" class="sell-speed${sel}" data-speed="${s.id}">
      <span class="sell-speed__name">${escapeHtml(lang === "en" ? s.nameEn : s.nameJa)}</span>
      <span class="sell-speed__weeks">${s.weeks} ${escapeHtml(ti18n("sell.weeks"))}</span>
      <span class="sell-speed__desc">${escapeHtml(lang === "en" ? s.descEn : s.descJa)}</span>
    </button>`;
  }).join("");

  // 担当者候補 (rarity match or 商 attribute)
  const eligible = state.ownedHeroes.filter(h => {
    if (!canSellExt(h, ext)) return false;
    if (h.state === HERO_STATE.CRAFTING) return false;
    if (h.state === HERO_STATE.QUESTING) return false;
    return true;
  });
  $("sellSellerList").innerHTML = eligible.length === 0
    ? `<p class="sell-seller__empty">${escapeHtml(ti18n("sell.noSeller"))}</p>`
    : eligible.map(h => {
        const sel = h.heroId === _sellPickedSellerId ? " sell-seller--sel" : "";
        const sho = Array.isArray(h.attributes) && h.attributes.includes("sho");
        return `<button type="button" class="sell-seller${sel}" data-seller="${h.heroId}">
          <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
          <span class="sell-seller__name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
          <span class="sell-seller__rarity" data-rarity="${h.rarity}">${escapeHtml(ti18n("rarity." + h.rarity))}</span>
          ${sho ? `<span class="attr-badge attr-badge--sho" title="商">商</span>` : ""}
        </button>`;
      }).join("");

  // 推定価格 + 純収益
  const seller = findHero(_sellPickedSellerId);
  const expected = estimateSalePrice(w, ext, _sellPickedSpeedId, seller);
  const net = netSaleRevenue(expected);
  $("sellEstPrice").innerHTML = `
    <div class="sell-est__row">
      <span>${escapeHtml(ti18n("sell.gross"))}:</span>
      <strong>${expected.toLocaleString()} GUM</strong>
    </div>
    <div class="sell-est__row sell-est__row--small">
      <span>${escapeHtml(ti18n("sell.fee"))} (${Math.round(MARKET_FEE_RATE * 100)}%):</span>
      <span>-${(expected - net).toLocaleString()} GUM</span>
    </div>
    <div class="sell-est__row sell-est__row--total">
      <span>${escapeHtml(ti18n("sell.net"))}:</span>
      <strong>${net.toLocaleString()} GUM</strong>
    </div>
  `;

  // 出品ボタン enable/disable
  $("sellListBtn").disabled = !seller || _sellPickedSpeedId == null;
}

function startSale() {
  const idx = state.sellPickedIdx;
  if (idx < 0) return;
  const w = state.warehouse[idx];
  if (!w) return;
  const ext = EXTENSION_BY_ID[String(w.extId)];
  const seller = findHero(_sellPickedSellerId);
  if (!seller) return;
  const speed = SALE_SPEED_BY_ID[_sellPickedSpeedId] || SALE_SPEED_OPTIONS[1];
  const expected = estimateSalePrice(w, ext, _sellPickedSpeedId, seller);
  state.activeSales.push({
    id: ++_saleId,
    warehouseIdx: idx,
    sellerId: seller.heroId,
    speedId: _sellPickedSpeedId,
    listedAtTick: state.tickCount,
    weeks: speed.weeks,
    expectedPrice: expected,
    status: "listed",
  });
  closeSellModal();
  renderMarketSell();
}
let _saleId = 0;

function closeSellModal() {
  $("sellModal")?.classList.add("hidden");
  state.sellPickedIdx = -1;
  _sellPickedSellerId = null;
  resumeTime();
}

/** 出品 tick: 完了時に GUM 加算 + warehouse から削除 + 通知 */
function tickActiveSales() {
  if (state.activeSales.length === 0) return;
  const completed = [];
  for (const s of state.activeSales) {
    const elapsed = state.tickCount - s.listedAtTick;
    const total = s.weeks * SECONDS_PER_WEEK;
    if (elapsed >= total && s.status === "listed") {
      // 価格にランダム ±10% 変動
      const variance = (Math.random() - 0.5) * 0.2;
      const finalGross = Math.round(s.expectedPrice * (1 + variance));
      const net = netSaleRevenue(finalGross);
      state.gum += net;
      s.status = "sold";
      s.finalGross = finalGross;
      s.finalNet = net;
      completed.push(s);
    }
  }
  if (completed.length > 0) {
    // warehouse から削除 (高い idx から消すと shift しない)
    const idxToRemove = completed.map(s => s.warehouseIdx).sort((a, b) => b - a);
    for (const i of idxToRemove) state.warehouse.splice(i, 1);
    // 売却済みは activeSales からも除去 + 残り active sales の warehouseIdx を補正
    state.activeSales = state.activeSales.filter(s => s.status !== "sold");
    // 補正: 削除した warehouseIdx より大きい idx を持つ残 sale は idx を減算
    for (const removed of idxToRemove) {
      for (const s of state.activeSales) {
        if (s.warehouseIdx > removed) s.warehouseIdx -= 1;
      }
    }
    // Mai 通知
    const totalNet = completed.reduce((a, b) => a + b.finalNet, 0);
    // Phase 1D-6: 取引成立 SE
    playSe("saleSettled");
    maiSays("sell.mai.sold", { onClose: () => {} });
    // 通知本文に金額が出るように i18n を上書きするのは複雑なので、
    // とりあえず固定メッセージ + console
    console.log(`[market] ${completed.length} ext sold for total ${totalNet} GUM`);
    renderHeader();
  }
}

/** Phase 1D-3 雇用タブの描画 */
function renderMarketHire() {
  const ownedCount = state.ownedHeroes.length;
  const cap = heroCapAtFactoryLevel(state.factoryLevel);
  $("hireCapInfo").innerHTML = `
    <span class="hire-cap__label">${escapeHtml(ti18n("hire.cap"))}:</span>
    <strong class="hire-cap__num ${ownedCount >= cap ? "hire-cap__num--full" : ""}">${ownedCount}</strong>
    <span class="hire-cap__sep">/</span>
    <span class="hire-cap__max">${cap}</span>
    <span class="hire-cap__lv">${escapeHtml(ti18n("hire.factoryLv").replace("{n}", state.factoryLevel))}</span>
  `;

  // 雇用進行中?
  if (state.activeHire) {
    renderActiveHire();
    return;
  }

  // プラン一覧
  $("hirePlanList").innerHTML = HIRE_PLANS.map(p => {
    const lang = getLang() === "en" ? "en" : "ja";
    const candidatesAvailable = state.gum >= p.cost && ownedCount < cap;
    return `<div class="hire-plan ${!candidatesAvailable ? "hire-plan--disabled" : ""}" data-plan="${p.id}">
      <div class="hire-plan__head">
        <span class="hire-plan__name">${escapeHtml(lang === "en" ? p.nameEn : p.nameJa)}</span>
        <span class="hire-plan__cost">${p.cost.toLocaleString()} GUM</span>
      </div>
      <p class="hire-plan__desc">${escapeHtml(lang === "en" ? p.descEn : p.descJa)}</p>
      <div class="hire-plan__meta">
        <span>${escapeHtml(ti18n("hire.candidateCount").replace("{n}", p.candidateCount))}</span>
        <span>${escapeHtml(ti18n("hire.recruiterMin").replace("{rarity}", ti18n("rarity." + p.recruiterMinRarity)))}</span>
      </div>
      <button type="button" class="hire-plan__btn" data-pick-plan="${p.id}" ${!candidatesAvailable ? "disabled" : ""}>
        ${escapeHtml(ti18n("hire.choose"))}
      </button>
    </div>`;
  }).join("");

  $("hireRecruitArea").classList.add("hidden");
  $("hireProgressArea").classList.add("hidden");
}

/** プランを選んで採用担当者を選ぶ画面 */
function renderRecruiterPicker(planId) {
  const plan = PLAN_BY_ID[planId];
  if (!plan) return;
  $("hirePlanList").classList.add("hidden");
  $("hireRecruitArea").classList.remove("hidden");
  $("hireRecruitArea").setAttribute("data-active-plan", planId);
  $("hireProgressArea").classList.add("hidden");

  $("hireRecruitTitle").textContent = ti18n("hire.recruiterPickTitle")
    .replace("{plan}", getLang() === "en" ? plan.nameEn : plan.nameJa);

  // 採用担当者として配属可能なヒーロー (rarity 要件 + idle/resting/(crafting? questing? 配属外限定))
  const eligible = state.ownedHeroes.filter(h => {
    if (!canBeRecruiter(h, plan)) return false;
    if (h.state === HERO_STATE.CRAFTING) return false;
    if (h.state === HERO_STATE.QUESTING) return false;
    return true;
  });

  if (eligible.length === 0) {
    $("hireRecruitList").innerHTML = `<p class="hire-recruit__empty">${escapeHtml(ti18n("hire.noEligible"))}</p>`;
  } else {
    $("hireRecruitList").innerHTML = eligible.map(h => `
      <button type="button" class="hire-recruit__cand" data-recruiter="${h.heroId}">
        <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
        <span class="hire-recruit__name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
        <span class="hire-recruit__rarity" data-rarity="${h.rarity}">${escapeHtml(ti18n("rarity." + h.rarity))}</span>
      </button>
    `).join("");
  }
}

function startHirePlan(planId, recruiterId) {
  const plan = PLAN_BY_ID[planId];
  const recruiter = findHero(recruiterId);
  if (!plan || !recruiter) return;
  if (state.gum < plan.cost) return;
  state.gum -= plan.cost;
  state.activeHire = {
    planId,
    recruiterId,
    startedAtTick: state.tickCount,
    candidates: null,
  };
  renderHeader();
  // Phase 1D-7: 雇用開始 → そのままホームに戻して時間を進める
  closeMarketView();
  renderHireOverlay();
}

/** 雇用進行中の表示 */
function renderActiveHire() {
  $("hirePlanList").classList.add("hidden");
  $("hireRecruitArea").classList.add("hidden");
  $("hireProgressArea").classList.remove("hidden");

  const ah = state.activeHire;
  const plan = PLAN_BY_ID[ah.planId];
  const recruiter = findHero(ah.recruiterId);
  const lang = getLang() === "en" ? "en" : "ja";

  $("hireProgressInfo").innerHTML = `
    <p><strong>${escapeHtml(lang === "en" ? plan.nameEn : plan.nameJa)}</strong></p>
    <p>${escapeHtml(ti18n("hire.recruiter"))}: ${escapeHtml(recruiter ? tHero(recruiter.heroId, recruiter.nameJa) : "—")}</p>
  `;

  if (!ah.candidates) {
    // 待機中
    const elapsed = state.tickCount - ah.startedAtTick;
    const totalTicks = HIRE_WAIT_WEEKS * SECONDS_PER_WEEK;
    const pct = Math.min(100, Math.floor(elapsed / totalTicks * 100));
    $("hireProgressBody").innerHTML = `
      <p class="hire-progress__msg">${escapeHtml(ti18n("hire.waiting").replace("{n}", HIRE_WAIT_WEEKS))}</p>
      <div class="hire-progress__bar"><div class="hire-progress__bar-fill" style="width:${pct}%"></div></div>
      <span class="hire-progress__pct">${pct}%</span>
    `;
  } else {
    // 候補リスト (portrait + rarity + 4 元素 + 雇用コスト + 雇用ボタン)
    $("hireProgressBody").innerHTML = `
      <p class="hire-progress__msg">${escapeHtml(ti18n("hire.pickCandidate"))}</p>
      <div class="hire-cand-list">
        ${ah.candidates.map(c => {
          // 候補は heroes.json の元データから派生 (まだ owned ではない)
          const def = HERO_ROSTER.find(h => h.heroId === c.heroId);
          const cost = hireCostFor(c);
          const canAfford = state.gum >= cost;
          // 表示用に factory hero を組み立てる (attribute / element 値を引きたいので)
          const tmp = def ? makeFactoryHero(def) : null;
          const elementsHtml = tmp ? ELEMENTS.map(k => {
            const v = elementValueForCraft(tmp, k);
            return `<span class="hire-cand__el" title="${escapeHtml(elementLabel(k))}: ${v}">
              <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
              <strong>${v}</strong>
            </span>`;
          }).join("") : "";
          const attrsHtml = tmp ? renderHeroAttrBadges(tmp) : "";
          const portrait = tmp?.img?.() || "";
          return `<div class="hire-cand-card" data-rarity="${c.rarity}">
            <div class="hire-cand-card__head">
              <img class="hire-cand-card__portrait" src="${portrait}" alt="" onerror="this.style.opacity='0.2'" />
              <div class="hire-cand-card__name-block">
                <div class="hire-cand-card__name-row">
                  <span class="hire-cand-card__name">${escapeHtml(c.nameJa)}</span>
                  ${attrsHtml}
                </div>
                <span class="hire-cand-card__rarity" data-rarity="${c.rarity}">${escapeHtml(ti18n("rarity." + c.rarity))}</span>
              </div>
            </div>
            <div class="hire-cand-card__elements">${elementsHtml}</div>
            <div class="hire-cand-card__foot">
              <span class="hire-cand-card__cost">${cost.toLocaleString()} GUM</span>
              <button type="button" class="hire-cand-card__hire-btn" data-hire-cand="${c.heroId}" ${canAfford ? "" : "disabled"}>
                ${escapeHtml(ti18n("hire.hireBtn"))}
              </button>
            </div>
          </div>`;
        }).join("")}
      </div>
      <button type="button" class="hire-cand-skip" id="hireSkipBtn">${escapeHtml(ti18n("hire.skipAll"))}</button>
    `;
  }
}

function tickActiveHire() {
  const ah = state.activeHire;
  if (!ah || ah.candidates) {
    // 既に候補生成済みなら overlay の進捗 % のみ更新
    renderHireOverlay();
    return;
  }
  const elapsed = state.tickCount - ah.startedAtTick;
  if (elapsed >= HIRE_WAIT_WEEKS * SECONDS_PER_WEEK) {
    const plan = PLAN_BY_ID[ah.planId];
    const ownedIds = new Set(state.ownedHeroes.map(h => h.heroId));
    ah.candidates = rollHireCandidates(plan, ownedIds);
    // Phase 1D-7: Mai 通知 → 「次へ」 押下で雇用画面に直接遷移
    maiSays("hire.mai.candidatesReady", {
      onClose: () => {
        state.marketTab = "hire";
        openMarketView();
        setMarketTab("hire");
      },
    });
  }
  renderHireOverlay();
}

function pickHireCandidate(heroId) {
  const ah = state.activeHire;
  if (!ah || !ah.candidates) return;
  const candIdx = ah.candidates.findIndex(c => c.heroId === heroId);
  if (candIdx < 0) return;
  const cand = ah.candidates[candIdx];

  // Phase 1D-7: per-rarity 契約金チェック
  const cost = hireCostFor(cand);
  if (state.gum < cost) {
    maiSays("hire.mai.notEnoughGum");
    return;
  }

  // 所有上限チェック → 溢れたら fire modal を経由してリトライ
  const cap = heroCapAtFactoryLevel(state.factoryLevel);
  if (state.ownedHeroes.length >= cap) {
    state.pendingHireCandIdx = candIdx;
    maiSays("hire.mai.capReached", {
      onClose: () => openFireModal(),
    });
    return;
  }

  finalizeHire(candIdx);
}

/** 候補 idx のヒーローを実際に雇用する処理。
 *  GUM 控除 + ownedHeroes に追加 + 候補リストから除去 + Mai 通知。 */
function finalizeHire(candIdx) {
  const ah = state.activeHire;
  if (!ah || !ah.candidates) return;
  const cand = ah.candidates[candIdx];
  if (!cand) return;
  const cost = hireCostFor(cand);
  if (state.gum < cost) {
    maiSays("hire.mai.notEnoughGum");
    return;
  }
  state.gum -= cost;
  const def = HERO_ROSTER.find(h => h.heroId === cand.heroId);
  if (!def) return;
  const newHero = makeFactoryHero(def);
  state.ownedHeroes.push(newHero);
  // 候補リストから除去
  ah.candidates.splice(candIdx, 1);
  // 候補が尽きたら活動終了
  if (ah.candidates.length === 0) {
    state.activeHire = null;
  }
  renderHeader();
  renderHeroTeam();
  renderHeroList();
  renderHireOverlay();
  renderMarketHire();
  // Phase 1D-7: 雇用成功通知 (portrait 付き)
  showHireSuccessModal(newHero);
}

function skipAllHireCandidates() {
  state.activeHire = null;
  renderHireOverlay();
  renderMarketHire();
}

/** Phase 1D-7: 雇用成功 portrait 付きポップアップ */
function showHireSuccessModal(hero) {
  const modal = $("hireSuccessModal");
  if (!modal) return;
  $("hireSuccessPortrait").src = hero.img();
  $("hireSuccessName").textContent = tHero(hero.heroId, hero.nameJa);
  $("hireSuccessRarity").setAttribute("data-rarity", hero.rarity);
  $("hireSuccessRarity").textContent = ti18n("rarity." + hero.rarity);
  $("hireSuccessMsg").textContent = ti18n("hire.mai.hired").replace("{name}", tHero(hero.heroId, hero.nameJa));
  modal.classList.remove("hidden");
  pauseTime();
}
function closeHireSuccessModal() {
  $("hireSuccessModal")?.classList.add("hidden");
  resumeTime();
}

/** Phase 1D-7: 解雇 modal を開く (定員溢れ時 or 任意) */
let _fireOnConfirm = null;
function openFireModal() {
  const modal = $("fireModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  pauseTime();
  renderFireModal();
}
function closeFireModal() {
  $("fireModal")?.classList.add("hidden");
  // pending hire はここでは破棄しない (キャンセル時のみ pendingHireCandIdx をクリア)
  resumeTime();
}

/** 解雇候補 (= 解雇可能なヒーロー) */
function fireableHeroes() {
  // 割当中ヒーローの id を集計
  const blocked = new Set();
  // 採用担当
  if (state.activeHire?.recruiterId != null) blocked.add(state.activeHire.recruiterId);
  // クラフトチーム
  for (const id of state.craftTeam) if (id != null) blocked.add(id);
  // クエストチーム
  for (const id of (state.questTeam || [])) if (id != null) blocked.add(id);
  // 出品担当
  for (const sale of (state.activeSales || [])) {
    if (sale.sellerId != null) blocked.add(sale.sellerId);
  }
  return state.ownedHeroes.map(h => ({
    hero: h,
    fireable: !blocked.has(h.heroId),
    reason: blocked.has(h.heroId) ? "assigned" : null,
  }));
}

function renderFireModal() {
  const list = fireableHeroes();
  $("fireList").innerHTML = list.map(({ hero, fireable }) => {
    const cl = craftLevel(hero);
    const cls = fireable ? "fire-cand" : "fire-cand fire-cand--disabled";
    return `<button type="button" class="${cls}" data-fire="${hero.heroId}" ${fireable ? "" : "disabled"}>
      <img src="${hero.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="fire-cand__name">${escapeHtml(tHero(hero.heroId, hero.nameJa))}</span>
      <span class="fire-cand__rarity" data-rarity="${hero.rarity}">${escapeHtml(ti18n("rarity." + hero.rarity))}</span>
      <span class="fire-cand__cl">${escapeHtml(ti18n("hero.craftLevel"))}: ${cl}</span>
      ${!fireable ? `<span class="fire-cand__lock">${escapeHtml(ti18n("fire.locked"))}</span>` : ""}
    </button>`;
  }).join("");
}

/** 解雇実行: 選択ヒーローを ownedHeroes から除去 + pending hire があれば実行 */
function fireHero(heroId) {
  const idx = state.ownedHeroes.findIndex(h => h.heroId === heroId);
  if (idx < 0) return;
  const fired = state.ownedHeroes[idx];
  state.ownedHeroes.splice(idx, 1);
  // 解雇後の表示更新
  closeFireModal();
  renderHeader();
  renderHeroTeam();
  renderHeroList();
  // pending hire があれば再試行
  if (state.pendingHireCandIdx != null) {
    const candIdx = state.pendingHireCandIdx;
    state.pendingHireCandIdx = null;
    // ah.candidates が更新されてる可能性に備えて 1 度確認
    const ah = state.activeHire;
    if (ah?.candidates?.[candIdx]) {
      finalizeHire(candIdx);
    }
  }
  // 解雇通知
  maiSays("fire.mai.fired", { onClose: () => {} });
  console.log(`[fire] ${tHero(fired.heroId, fired.nameJa)} fired`);
}

function cancelFire() {
  state.pendingHireCandIdx = null;
  closeFireModal();
}

/** Phase 1D-7: ホーム画面 上部 overlay に「雇用中」インジケータを描画 */
function renderHireOverlay() {
  const host = $("hireOverlay");
  if (!host) return;
  const ah = state.activeHire;
  if (!ah) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  const plan = PLAN_BY_ID[ah.planId];
  const recruiter = findHero(ah.recruiterId);
  const lang = getLang() === "en" ? "en" : "ja";
  const planName = lang === "en" ? plan.nameEn : plan.nameJa;
  if (!ah.candidates) {
    // 待機中
    const elapsed = state.tickCount - ah.startedAtTick;
    const totalTicks = HIRE_WAIT_WEEKS * SECONDS_PER_WEEK;
    const pct = Math.min(100, Math.floor(elapsed / totalTicks * 100));
    host.innerHTML = `
      <span class="hire-overlay__label">${escapeHtml(ti18n("hire.overlay.waiting"))}:</span>
      <span class="hire-overlay__plan">${escapeHtml(planName)}</span>
      <span class="hire-overlay__bar"><span class="hire-overlay__bar-fill" style="width:${pct}%"></span></span>
      <span class="hire-overlay__pct">${pct}%</span>
    `;
  } else {
    // 候補出揃った
    host.innerHTML = `
      <span class="hire-overlay__label">${escapeHtml(ti18n("hire.overlay.ready"))}:</span>
      <span class="hire-overlay__plan">${escapeHtml(planName)}</span>
      <span class="hire-overlay__remain">${escapeHtml(ti18n("hire.overlay.candRemain").replace("{n}", ah.candidates.length))}</span>
    `;
  }
  host.classList.remove("hidden");
}

function renderMarketWarehouse() {
  const host = $("warehouseList");
  if (!host) return;
  if (state.warehouse.length === 0) {
    host.innerHTML = `<p class="warehouse-empty">${escapeHtml(ti18n("warehouse.empty"))}</p>`;
    return;
  }
  // 新しい順に表示
  const items = state.warehouse.slice().reverse();
  host.innerHTML = items.map((w, i) => {
    const ext = EXTENSION_BY_ID[String(w.extId)];
    const name = ext ? ext.nameJa : `ext ${w.extId}`;
    const rarityLbl = ext ? ti18n("rarity." + ext.rarity, ext.rarity) : "";
    const dateLbl = formatGameDate(w.achievedAt || { year: 2018, month: 12, week: 1 });
    const apr  = w.appraisal;
    const tierLbl = apr ? ti18n("appraisal.tier." + apr.tier) : "—";
    const score   = apr ? apr.totalScore : 0;
    return `<div class="warehouse-item" data-tier="${apr ? apr.tier : "fine"}" data-rarity="${ext ? ext.rarity : "common"}">
      <img class="warehouse-item__icon" src="${extIconUrl(w.extId)}" alt="" onerror="this.style.opacity='0.2'" />
      <div class="warehouse-item__main">
        <div class="warehouse-item__name-row">
          <span class="warehouse-item__name">${escapeHtml(name)}</span>
          <span class="warehouse-item__rarity" data-rarity="${ext ? ext.rarity : "common"}">${escapeHtml(rarityLbl)}</span>
        </div>
        <div class="warehouse-item__meta">
          <span class="warehouse-item__date">${escapeHtml(dateLbl)}</span>
          <span class="warehouse-item__duration">${ti18n("craft.weeks").replace("{n}", w.durationActualWeeks || 0)}</span>
        </div>
        ${apr ? `
        <div class="warehouse-item__score">
          <span class="warehouse-item__tier" data-tier="${apr.tier}">${escapeHtml(tierLbl)}</span>
          <span class="warehouse-item__score-num"><strong>${score}</strong> / 50</span>
        </div>` : ""}
      </div>
    </div>`;
  }).join("");
}

/** ─── Craft appraisal (Phase 1B-4) ───────────────────────────────── */

/** 品評会画面を開く ─ pendingCompletion をベースに 5 名審査員を抽選し、
 *  各点数を確定。アニメーションは CSS の reveal で順次表示する。 */
function openAppraisalScreen() {
  const pc = state.pendingCompletion;
  if (!pc) {
    // 万一 pendingCompletion 無しで呼ばれたら直接 cleanup
    finalizeCraftCleanup();
    return;
  }
  const judges = pickAppraisalJudges(state.ownedHeroes, 5);
  const evaluated = judges.map(j => {
    const score   = rollJudgeScore(pc.qualityTier);
    const comment = buildJudgeComment(j, score);
    return { heroId: j.heroId, name: j.nameJa, score, comment };
  });
  const totalScore = evaluated.reduce((s, j) => s + j.score, 0);
  const tier       = appraisalTotalTier(totalScore);

  state.pendingAppraisal = {
    extId: pc.extId,
    qualityTier: pc.qualityTier,
    judges: evaluated,
    totalScore,
    tier,
    revealCount: 0,           // アニメーションで何名分まで「表示済み」か
  };
  pauseTime();
  $("appraisalModal")?.classList.remove("hidden");
  renderAppraisalScreen();
  // 順次 reveal: 0.7 秒ごとに 1 名ずつ点数を出す
  scheduleAppraisalReveal();
}

let _appraisalRevealHandle = null;
function scheduleAppraisalReveal() {
  if (_appraisalRevealHandle) clearInterval(_appraisalRevealHandle);
  _appraisalRevealHandle = setInterval(() => {
    const pa = state.pendingAppraisal;
    if (!pa) { clearInterval(_appraisalRevealHandle); _appraisalRevealHandle = null; return; }
    if (pa.revealCount >= pa.judges.length) {
      clearInterval(_appraisalRevealHandle);
      _appraisalRevealHandle = null;
      // 全員 reveal 後に合計表示 + OK ボタン有効化
      renderAppraisalScreen();
      return;
    }
    pa.revealCount += 1;
    renderAppraisalScreen();
  }, 700);
}

function renderAppraisalScreen() {
  const pa = state.pendingAppraisal;
  if (!pa) return;
  const ext = EXTENSION_BY_ID[String(pa.extId)];
  $("appraisalExtName").textContent = ext ? ext.nameJa : `ext ${pa.extId}`;
  $("appraisalExtIcon").src = extIconUrl(pa.extId);

  // 審査員 5 名
  $("appraisalJudges").innerHTML = pa.judges.map((j, idx) => {
    const revealed = idx < pa.revealCount;
    const hero = findHero(j.heroId);
    const portrait = hero ? hero.img() : "";
    return `<div class="appraisal-judge ${revealed ? "appraisal-judge--revealed" : ""}" data-idx="${idx}">
      <img class="appraisal-judge__portrait" src="${portrait}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="appraisal-judge__name">${escapeHtml(tHero(j.heroId, j.name))}</span>
      <div class="appraisal-judge__score">
        ${revealed
          ? `<strong>${j.score}</strong><span class="appraisal-judge__score-max">/10</span>`
          : `<span class="appraisal-judge__thinking">…</span>`}
      </div>
      ${revealed ? `<p class="appraisal-judge__comment">${escapeHtml(j.comment)}</p>` : ""}
    </div>`;
  }).join("");

  // 合計 + tier ラベル (全員 reveal 後のみ)
  const allRevealed = pa.revealCount >= pa.judges.length;
  const totalEl = $("appraisalTotal");
  const tierEl  = $("appraisalTier");
  const okBtn   = $("appraisalClose");
  if (allRevealed) {
    totalEl.classList.remove("hidden");
    totalEl.innerHTML = `<span class="appraisal-total__label">${escapeHtml(ti18n("appraisal.total"))}</span>
      <strong class="appraisal-total__num">${pa.totalScore}</strong>
      <span class="appraisal-total__max">/50</span>`;
    tierEl.classList.remove("hidden");
    tierEl.textContent = ti18n("appraisal.tier." + pa.tier);
    tierEl.setAttribute("data-tier", pa.tier);
    okBtn.disabled = false;
  } else {
    totalEl.classList.add("hidden");
    tierEl.classList.add("hidden");
    okBtn.disabled = true;
  }
}

function closeAppraisalScreen() {
  if (_appraisalRevealHandle) {
    clearInterval(_appraisalRevealHandle);
    _appraisalRevealHandle = null;
  }
  $("appraisalModal")?.classList.add("hidden");
  finalizeCraftCleanup();
}

/** 完成 → 品評会 → 倉庫の最終処理。
 *  pendingCompletion + pendingAppraisal を warehouse に push し、
 *  配属ヒーローを IDLE に戻して各種状態をクリア + ホーム再描画。 */
function finalizeCraftCleanup() {
  const pc = state.pendingCompletion;
  const pa = state.pendingAppraisal;
  if (pc) {
    state.warehouse.push({
      extId: pc.extId,
      achievedAt: pc.achievedAt,
      achievedTicks: pc.achievedTicks,
      durationActualWeeks: pc.durationActualWeeks,
      progress: pc.progress,
      targets: pc.targets,
      qualityRatio: pc.qualityRatio,
      qualityTier: pc.qualityTier,
      appraisal: pa
        ? {
            judges: pa.judges.map(j => ({ heroId: j.heroId, score: j.score, comment: j.comment })),
            totalScore: pa.totalScore,
            tier: pa.tier,
          }
        : null,
    });
    for (const id of pc.team) {
      if (id == null) continue;
      const h = findHero(id);
      if (h && h.state === HERO_STATE.CRAFTING) h.state = HERO_STATE.IDLE;
    }
  }
  state.pendingCompletion = null;
  state.pendingAppraisal  = null;
  resumeTime();
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
    // Phase 1D-5: スタート時の所持ヒーローは INITIAL_HERO_IDS で指定した
    // 3 名 (シートン / 伊能忠敬 / ピタゴラス) のみ。
    // それ以降は market > 雇用 で増やす。
    const all = buildOwnedHeroes();
    const initialSet = new Set(INITIAL_HERO_IDS);
    state.ownedHeroes = all.filter(h => initialSet.has(h.heroId));
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
  renderQuestOverlay();
  renderHireOverlay();

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
  $("btnMenuOpen")?.addEventListener("click", () => {
    // Phase 1D-7: ラベルが「戻る」のときは close、それ以外は open
    const btn = $("btnMenuOpen");
    if (btn?.dataset.mode === "close") closeMenu();
    else openMenu();
  });
  $("menuOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "menuOverlay") closeMenu();
  });
  // メインメニュー (data-menu) のクリック
  document.querySelectorAll(".menu-item[data-menu]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-menu");
      // 一旦すべての active 状態をクリア
      document.querySelectorAll(".menu-item[data-menu]").forEach(b => b.classList.remove("menu-item--active"));
      // マーケットだけ submenu を開いて menuOverlay は閉じない
      if (key === "market") {
        btn.classList.add("menu-item--active");
        $("marketSubmenu")?.classList.remove("hidden");
        return;
      }
      // それ以外は menu を閉じてから view 遷移
      $("marketSubmenu")?.classList.add("hidden");
      closeMenu();
      if (key === "hero") { openHeroView(); return; }
      if (key === "craft") {
        if (state.activeCraft) { maiSays("mai.craftBusy"); return; }
        openCraftView();
        return;
      }
      if (key === "quest")  {
        if (state.activeQuest) { maiSays("mai.questBusy"); return; }
        openQuestView();
        return;
      }
      openStub(key);
    });
  });
  // マーケットサブメニュー (倉庫 / 雇用 / 出品) → 直接タブを開く
  document.querySelectorAll(".menu-item[data-market-tab-direct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-market-tab-direct");
      closeMenu();
      state.marketTab = tab;
      openMarketView();
      // openMarketView 後に setMarketTab を確実に呼ぶ (active class + body 切替)
      setMarketTab(tab);
    });
  });

  // ── Stub close ──
  $("stubClose")?.addEventListener("click", closeStub);

  // ── Mai modal: Phase 1D-8 画面下スピーチバブル + どこタップしても次へ ──
  // overlay 全体のクリックを 1 か所で受ける (= 「次へ」ボタン / カード内 / 背景
  // どこを押しても closeMaiModal が呼ばれる)。closeMaiModal はシーケンス
  // 進行中なら次行に進める、最終行 (= 「閉じる」 ラベル時) なら modal を閉じる。
  $("maiModal")?.addEventListener("click", () => closeMaiModal());
  // Esc は引き続き「skip dialog」として強制 close (シーケンス途中でも全閉)
  // → keydown ハンドラ側で forceCloseMaiModal を呼ぶ

  // ── Mai navigator: 各画面右上のマイアイコン → ヘルプモーダル ──
  document.querySelectorAll("[data-mai-help-btn]").forEach(btn => {
    btn.addEventListener("click", openMaiHelp);
  });
  $("maiHelpClose")?.addEventListener("click", closeMaiHelp);
  $("maiHelpModal")?.addEventListener("click", (e) => {
    if (e.target.id === "maiHelpModal") closeMaiHelp();
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
  $("appraisalClose")?.addEventListener("click", closeAppraisalScreen);

  // ── Market view: tabs (Phase 1B-5 + 1D-3) ──
  $("marketViewBack")?.addEventListener("click", closeMarketView);
  document.querySelectorAll("[data-market-tab]").forEach(btn => {
    btn.addEventListener("click", () => setMarketTab(btn.getAttribute("data-market-tab")));
  });
  // 雇用タブ: プラン選択 → 採用担当者 → 開始
  $("hirePlanList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-pick-plan]");
    if (!btn || btn.disabled) return;
    renderRecruiterPicker(btn.getAttribute("data-pick-plan"));
  });
  $("hireRecruitList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-recruiter]");
    if (!btn) return;
    const plan = $("hirePlanList")?.dataset.lastPlan;
    // よりシンプルに: state.marketTab + 直近で開いた recruit picker から
    // hire を起動する。data-recruiter 押下時は state から planId を引く必要がある
    // が、最後に renderRecruiterPicker(planId) を呼んだ時の planId を保持していない。
    // → recruit area 自体に data-plan を載せてからピックする方式に
    const planId = $("hireRecruitArea").getAttribute("data-active-plan");
    const recruiterId = parseInt(btn.getAttribute("data-recruiter"), 10);
    if (!planId || !Number.isFinite(recruiterId)) return;
    startHirePlan(planId, recruiterId);
  });
  // 雇用候補リストから 1 名選択 / 全員見送り
  $("hireProgressArea")?.addEventListener("click", (ev) => {
    const cand = ev.target.closest("[data-hire-cand]");
    if (cand) {
      const id = parseInt(cand.getAttribute("data-hire-cand"), 10);
      if (Number.isFinite(id)) pickHireCandidate(id);
      return;
    }
    if (ev.target.id === "hireSkipBtn") {
      skipAllHireCandidates();
    }
  });
  // 雇用画面で「← プラン選択に戻る」
  $("hireBackToPlans")?.addEventListener("click", () => {
    $("hirePlanList").classList.remove("hidden");
    $("hireRecruitArea").classList.add("hidden");
  });
  // Phase 1D-7: 雇用成功 popup close
  $("hireSuccessClose")?.addEventListener("click", closeHireSuccessModal);
  $("hireSuccessModal")?.addEventListener("click", (e) => {
    if (e.target.id === "hireSuccessModal") closeHireSuccessModal();
  });
  // Phase 1D-7: 解雇 modal
  $("fireList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-fire]");
    if (!btn || btn.disabled) return;
    const id = parseInt(btn.getAttribute("data-fire"), 10);
    if (Number.isFinite(id)) fireHero(id);
  });
  $("fireCancelBtn")?.addEventListener("click", cancelFire);
  $("fireModal")?.addEventListener("click", (e) => {
    if (e.target.id === "fireModal") cancelFire();
  });

  // ── Sell tab: 出品候補から ext タップ → 出品 modal ──
  $("sellableList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-warehouse-idx]");
    if (!btn) return;
    const idx = parseInt(btn.getAttribute("data-warehouse-idx"), 10);
    if (Number.isFinite(idx)) openSellModal(idx);
  });
  $("sellSpeedList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-speed]");
    if (!btn) return;
    _sellPickedSpeedId = btn.getAttribute("data-speed");
    renderSellModal();
  });
  $("sellSellerList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-seller]");
    if (!btn) return;
    const id = parseInt(btn.getAttribute("data-seller"), 10);
    if (Number.isFinite(id)) {
      _sellPickedSellerId = id;
      renderSellModal();
    }
  });
  $("sellListBtn")?.addEventListener("click", startSale);
  $("sellCancelBtn")?.addEventListener("click", closeSellModal);
  $("sellModal")?.addEventListener("click", (e) => {
    if (e.target.id === "sellModal") closeSellModal();
  });

  // ── Quest view (Phase 1C-1) ──
  $("questViewBack")?.addEventListener("click", closeQuestView);
  $("questNodeList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-node]");
    if (!btn) return;
    state.questPickedNodeId = btn.getAttribute("data-node");
    renderQuestView();
  });
  $("questDiffList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-diff]");
    if (!btn) return;
    state.questPickedDifficulty = btn.getAttribute("data-diff");
    renderQuestView();
  });
  $("questHeroPick")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-hero]");
    if (!btn) return;
    const hid = parseInt(btn.getAttribute("data-hero"), 10);
    if (!Number.isFinite(hid)) return;
    // toggle: 既に居れば外す、いなければ空きスロットへ
    const idx = state.questTeam.indexOf(hid);
    if (idx >= 0) {
      state.questTeam[idx] = null;
    } else {
      const empty = state.questTeam.indexOf(null);
      if (empty >= 0) state.questTeam[empty] = hid;
    }
    renderQuestView();
  });
  $("questTeamSlots")?.addEventListener("click", (ev) => {
    const slot = ev.target.closest(".quest-team__slot--filled");
    if (!slot) return;
    const idx = parseInt(slot.getAttribute("data-slot"), 10);
    if (Number.isFinite(idx)) {
      state.questTeam[idx] = null;
      renderQuestView();
    }
  });
  $("questStartBtn")?.addEventListener("click", startActiveQuest);
  $("questResultClose")?.addEventListener("click", closeQuestResultScreen);

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
    // 「休憩」ボタン: クリック伝播を止めてカード本体への反応を抑止
    const restBtn = ev.target.closest("[data-rest-hero]");
    if (restBtn) {
      ev.stopPropagation();
      const hid = parseInt(restBtn.getAttribute("data-rest-hero"), 10);
      if (Number.isFinite(hid)) {
        const h = findHero(hid);
        if (h) {
          h.state = HERO_STATE.RESTING;
          renderHeroList();
          renderHeroTeam();
        }
      }
      return;
    }
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
    if (state.pendingAppraisal != null && !$("appraisalModal")?.classList.contains("hidden")) {
      renderAppraisalScreen();
    }
    if (!$("marketView")?.classList.contains("hidden")) renderMarketView();
    if (!$("questView")?.classList.contains("hidden")) renderQuestView();
    if (state.pendingQuestResult != null && !$("questResultModal")?.classList.contains("hidden")) {
      renderQuestResultScreen();
    }
    renderQuestOverlay();
    renderHireOverlay();
    if (!$("fireModal")?.classList.contains("hidden")) renderFireModal();
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
    if (!$("appraisalModal")?.classList.contains("hidden")) return; // 明示閉じ専用
    if (!$("sellModal")?.classList.contains("hidden")) { closeSellModal(); return; }
    if (!$("hireSuccessModal")?.classList.contains("hidden")) { closeHireSuccessModal(); return; }
    if (!$("fireModal")?.classList.contains("hidden")) { cancelFire(); return; }
    if (!$("heroDetailPopup")?.classList.contains("hidden")) { closeHeroDetailPopup(); return; }
    if (!$("maiHelpModal")?.classList.contains("hidden")) { closeMaiHelp(); return; }
    if (!$("maiModal")?.classList.contains("hidden")) { forceCloseMaiModal(); return; }
    if (!$("helpOverlay")?.classList.contains("hidden")) { closeHelp(); return; }
    if (!$("stubView")?.classList.contains("hidden")) { closeStub(); return; }
    if (!$("marketView")?.classList.contains("hidden")) { closeMarketView(); return; }
    if (!$("questView")?.classList.contains("hidden")) { closeQuestView(); return; }
    if (!$("questResultModal")?.classList.contains("hidden")) return; // 明示閉じ専用
    if (!$("menuOverlay")?.classList.contains("hidden")) { closeMenu(); return; }
  });
}

init();

// Expose APP_VERSION for debug / future ranking submit
if (typeof window !== "undefined") window.__MCF_VERSION = APP_VERSION;
