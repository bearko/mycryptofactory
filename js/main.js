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
import { loadHeroes, HERO_ROSTER, HERO_DEFS } from "./heroes.js";
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
  rankMultiplier,
  rankUpCost,
  RANK_MAX,
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
  isExtUnlocked,
  rarityAllowedAtFactoryLevel,
  maxRarityForFactoryLevel,
  lockedSeriesList,
} from "./factory-craft.js";
import {
  MATERIALS,
  materialName,
  materialIcon,
  buildInitialInventory,
  ALL_MATERIAL_IDS,
  NORMAL_MATERIAL_IDS,
  HIGH_TIER_MATERIAL_IDS,
  LAND_MATERIAL_IDS,
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
  INITIAL_UNLOCKED_SERIES,
} from "./factory-tutorial.js";
import {
  playBgm,
  playSe,
  preloadAllSe,
} from "./factory-audio.js";
import {
  pickHeroFlavor,
} from "./factory-hero-flavors.js";
import {
  calcFactoryScore,
  submitFactoryScore,
  getRankingApiUrl,
  setRankingApiUrl,
  getPlayerName,
  setPlayerName,
  fetchFactoryRanking,
} from "./factory-ranking-client.js";
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
  LAND_NODES,
  LAND_PASS_COST,
  NODE_BY_ID,
  teamQuestLevel,
  heroQuestLevelBreakdown,
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
  // Phase 1D-21: 初期 GUM を 500 → 1000 に増額。最初の 1 体 Common 雇用 (300 GUM)
  // + 工房レベルアップへの足がかり (1000 GUM) を立ち上げ序盤で達成しやすく。
  gum: 1000,
  // Active craft (Phase 1B). Set when player taps クラフト開始.
  // { extId, team: [heroId|null × 5], targets: {...}, progress: {...},
  //   recipe: [{id, qty}], startedAtWeek: <int>, durationWeeks: <int> }
  activeCraft: null,
  // Pause flags (any !==0 means time is paused)
  pauseFlags: 0,
  // Phase 1D-9: 設定 > 時間2倍速 トグル (1 tick = 500ms)
  timeSpeed2x: false,
  /** Phase 1D-21: 20倍速 (テスト/バランス調整用) */
  timeSpeed20x: false,
  // Phase 1A: hero roster + craft team
  ownedHeroes: /** @type {ReturnType<typeof buildOwnedHeroes>} */ ([]),
  craftTeam: /** @type {Array<number|null>} */ (new Array(TEAM_SIZE).fill(null)),
  // Hero list UI
  heroSort: "cl-desc",
  /** Phase 1D-27: ヒーロー一覧のレアリティフィルタ ("all" | "common" | ...) */
  heroFilterRarity: "all",
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
  /** Phase 1D-19: ヒーロー sprite 左上に出すフレーバーセリフキュー。
   *  各要素: { id, heroId, text, createdTick } */
  heroFlavors: /** @type {Array<object>} */ ([]),
  /** Phase 1D-19: idle ヒーローが「ヒマだな」発言済みの最後の week カウンタ。
   *  heroId → state.weekCount を入れて、同じ week で 2 回以上発話しない。 */
  heroIdleSpokeAt: /** @type {Record<number, number>} */ ({}),
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
  /** Phase 1D-21: 工房レベルアップに必要な GUM (Lv N → N+1)
   *  Lv1→2 = 1,000 / Lv2→3 = 3,000 / Lv3→4 = 8,000 / Lv4→5 = 20,000 */
  // (定数は state ではなく定数 FACTORY_LV_UP_COST_TABLE で管理)
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
  /** Phase 1D-12: ヒーロー画面 (= 編成 view) で選択中のタブ */
  heroTeamTab: "craft",  // "craft" | "quest"
  /** Phase 1D-12: クエスト画面で表示中のノードタイプ ("normal" / "land") */
  questNodeType: "normal",
  /** Phase 1D-12: 所有ランドセクター通行証 (id Set)。
   *  最初に選んだランドが home land (無料)。それ以外は 500 GUM で購入。 */
  landPasses: /** @type {Set<string>} */ (new Set()),
  /** Phase 1D-12: home land = 最初に保有したランド id (= 通行証無料 land) */
  homeLand: /** @type {string | null} */ (null),
  pendingQuestResult: /** @type {object | null} */ (null),
  /** Phase 1D-5 チュートリアル: 各画面の初回表示フラグ。
   *  trigger 後 true にして再表示しないようにする (将来 localStorage 化予定)。 */
  tutorial: makeInitialTutorialState(),
  /** Phase 1D-5 解放済みエクステンション。初期は 4 件 (ノービス系)。
   *  ファクトリーレベル up や本編進行で増える。 */
  unlockedExtIds: /** @type {Set<number>} */ (new Set(INITIAL_UNLOCKED_EXT_IDS)),
  /** Phase 1D-22: 解放済みシリーズ (= レシピ所持リスト)。クラフト可能 ext は
   *  unlockedSeries × factoryLevel で動的に決定 (= isExtUnlocked)。 */
  unlockedSeries: /** @type {Set<string>} */ (new Set(INITIAL_UNLOCKED_SERIES)),
  /** Phase 1D-24: 解雇確認 popup で「対象 hero」を一時保持 */
  firePendingId: /** @type {number | null} */ (null),
  /** Phase 1D-25: 前回の出品担当 (default 選択用) */
  lastSaleSellerId: /** @type {number | null} */ (null),
  /** Phase 1D-25: 工房レベルアップを Mai が既に提案した target レベル群 */
  factoryLvPrompted: /** @type {Set<number>} */ (new Set()),
  /** Phase 1D-26: ランキング集計用統計 (累計) */
  heroHireCount: /** @type {number} */ (0),
  /** Phase 1D-26: 10 年エンディング (2028年11月4週) を既に発火したか */
  endgameTriggered10y: /** @type {boolean} */ (false),
  /** Phase 1D-26: 50 年エンディング (2068年12月4週) を既に発火したか */
  endgameTriggered50y: /** @type {boolean} */ (false),
  /** Phase 1D-30: GUM 閾値到達によるスポット雇用の既発火マーカー (one-shot)。
   *  値は閾値そのもの (e.g. 2000)。 */
  spontaneousGumHits: /** @type {Set<number>} */ (new Set()),
  /** Phase 1D-30: スポット雇用がキャップ満員などで保留された場合の next-target。 */
  pendingSpontaneousRarity: /** @type {string | null} */ (null),
  /** Phase 1D-22: クエスト結果画面が閉じた後に発火する recipe drop の理由 i18n キー
   *  (success 時に確率で設定、closeQuestResultScreen で消化) */
  pendingRecipeReason: /** @type {string | null} */ (null),
  /** Phase 1D-32: 赤字 (gum < 0) に陥った最初の tick。回復したら null に戻す。
   *  6 ヶ月 (= 6 * WEEKS_PER_MONTH * SECONDS_PER_WEEK ticks) 経過後に
   *  ヒーロー離職の判定に使う。 */
  deficitStartedAtTick: /** @type {number | null} */ (null),
  /** Phase 1D-32: 初めて赤字になったときのマイ助言を出したか (one-shot) */
  deficitAdvised: /** @type {boolean} */ (false),
  /** Phase 1D-32: 初赤字時のマイ助言を「他のモーダル close 後」に出すための予約フラグ。
   *  onTick の冒頭 (pauseFlags === 0) で消化される。 */
  pendingDeficitAdvice: /** @type {boolean} */ (false),
  /** Phase 1D-32: 最後に「ヒーロー離職」を発火した tick (= 3 ヶ月クールダウン管理) */
  lastAttritionTick: /** @type {number | null} */ (null),
  /** Phase 1D-32: ゲームオーバー (= ヒーロー 0 名) を確定したか */
  gameOverTriggered: /** @type {boolean} */ (false),
  /** Phase 1D-32: 受注クラフト依頼 (1 ヶ月で再生成、最大 3 件保持)。
   *  各要素: { id, extId, deadlineTick, rewardGum, generatedAtTick, generatedAt: {year,month,week} } */
  commissions: /** @type {Array<object>} */ ([]),
  /** Phase 1D-32: 受注クラフトの最後の生成週カウンタ (= 月次再生成のロック) */
  lastCommissionGenAtMonth: /** @type {number | null} */ (null),
  /** Phase 1D-32: 受注クラフト confirm 画面で picker から選択された commission の id */
  craftPickedCommissionId: /** @type {number | null} */ (null),
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
function currentTickInterval() {
  // Phase 1D-9: 設定 > 時間2倍速 が ON なら interval を半分にする
  // Phase 1D-21: 時間20倍速 (テスト用) があれば優先 (= 50ms / tick)
  if (state.timeSpeed20x) return Math.round(TICK_INTERVAL_MS / 20);
  return state.timeSpeed2x ? Math.round(TICK_INTERVAL_MS / 2) : TICK_INTERVAL_MS;
}
function startTimeLoop() {
  if (_tickHandle) return;
  _tickHandle = setInterval(onTick, currentTickInterval());
}
function stopTimeLoop() {
  if (_tickHandle) { clearInterval(_tickHandle); _tickHandle = null; }
}
/** Phase 1D-9: 速度設定変更時に tick loop を新 interval で再起動 */
function restartTimeLoopWithSpeed() {
  if (_tickHandle) {
    stopTimeLoop();
    startTimeLoop();
  }
}
/** Phase 1D-9: 設定 submenu の トグルラベル更新 */
function refreshSettingsSubmenu() {
  const btn = $("settingSpeed2x");
  if (btn) {
    const lbl = ti18n("settings.speed2x");
    const st  = state.timeSpeed2x ? ti18n("settings.on") : ti18n("settings.off");
    btn.textContent = `${lbl}: ${st}`;
  }
  // Phase 1D-21: 20x mode toggle
  const btn20 = $("settingSpeed20x");
  if (btn20) {
    const lbl20 = ti18n("settings.speed20x");
    const st20  = state.timeSpeed20x ? ti18n("settings.on") : ti18n("settings.off");
    btn20.textContent = `${lbl20}: ${st20}`;
  }
}

function pauseTime() { state.pauseFlags++; }
function resumeTime() {
  state.pauseFlags = Math.max(0, state.pauseFlags - 1);
}

/** Phase 1D-21: 工房レベルアップ
 *  Phase 1D-23: 条件付き + 多段プレビュー対応 */
const FACTORY_LV_UP_COST_TABLE = {
  1: 1000,    // Lv1→2
  2: 3000,    // Lv2→3
  3: 8000,    // Lv3→4
  4: 20000,   // Lv4→5
};
function factoryLvUpCost(currentLv) {
  return FACTORY_LV_UP_COST_TABLE[currentLv] || Infinity;
}

/** 工房レベル N → N+1 の条件 list を返す。
 *  各条件は { label, met, current, required } の形。 */
function factoryLvUpConditions(targetLv) {
  const ownedHeroes = state.ownedHeroes || [];
  const heroCount = ownedHeroes.length;
  const maxRank = ownedHeroes.reduce((m, h) => Math.max(m, h.rank || 0), 0);
  const rank2plus = ownedHeroes.filter(h => (h.rank || 0) >= 2).length;
  const rank4plus = ownedHeroes.filter(h => (h.rank || 0) >= 4).length;
  const rank5plus = ownedHeroes.filter(h => (h.rank || 0) >= 5).length;
  const crafted = state.craftCompletedCount || 0;
  const sold = state.saleCompletedCount || 0;
  const bestCommon = (state.appraisalBest?.common) || 0;
  const bestUncommon = (state.appraisalBest?.uncommon) || 0;
  const cond = (label, current, required) => ({
    label, current, required, met: current >= required,
  });
  if (targetLv === 2) return [
    cond("ヒーロー雇用 4 体以上", heroCount, 4),
    cond("エクステンションを 1 個以上クラフト", crafted, 1),
    cond("出品成立 1 件以上", sold, 1),
  ];
  if (targetLv === 3) return [
    cond("ヒーロー雇用 6 体以上", heroCount, 6),
    cond("エクステンションを 5 個以上クラフト", crafted, 5),
    cond("ランク 2 以上のヒーローを 1 体以上保有", rank2plus, 1),
  ];
  if (targetLv === 4) return [
    cond("ヒーロー雇用 8 体以上", heroCount, 8),
    cond("エクステンションを 15 個以上クラフト", crafted, 15),
    cond("Common 査定 25 点以上を達成", bestCommon, 25),
    cond("ランク 4 以上のヒーローを 1 体以上保有", rank4plus, 1),
  ];
  if (targetLv === 5) return [
    cond("ヒーロー雇用 12 体以上", heroCount, 12),
    cond("エクステンションを 30 個以上クラフト", crafted, 30),
    cond("Uncommon 査定 30 点以上を達成", bestUncommon, 30),
    cond("ランク 5 のヒーローを 2 体以上保有", rank5plus, 2),
  ];
  return [];
}

/** Lv N → N+1 で解放されること */
function factoryLvUpUnlocks(targetLv) {
  if (targetLv === 2) return [
    "Uncommon エクステンションのレシピが解放対象に",
    "ヒーロー上限 7 → 9 名",
    "中級クエスト解禁",
    "ドラエグプラン (Uncommon〜Rare 雇用) 解禁",
  ];
  if (targetLv === 3) return [
    "Rare エクステンションのレシピが解放対象に",
    "ヒーロー上限 9 → 11 名",
    "上級クエスト解禁",
    "ベビドラプラン (Rare〜Epic 雇用) 解禁",
  ];
  if (targetLv === 4) return [
    "Epic エクステンションのレシピが解放対象に",
    "ヒーロー上限 11 → 12 名",
    "ブルドラプラン (Epic〜Legendary 雇用) 解禁",
    "デュエルモード解禁 (将来実装)",
  ];
  if (targetLv === 5) return [
    "Legendary エクステンションのレシピが解放対象に",
    "ヒーロー上限 12 → 15 名",
    "レッドラプラン (Legendary 雇用) 解禁",
  ];
  return [];
}

/** Phase 1D-25: Lv N → N+1 で増設される設備の名前 + アイコン URL */
const FACTORY_LV_EQUIPMENT = {
  2: { nameJa: "魔法の壺",   nameEn: "Magic Cauldron",  iconUrl: "https://www.mycryptoheroes.net/_nuxt/img/magic.2660aed.webp",      bgUrl: "https://www.mycryptoheroes.net/_nuxt/img/201.c7d01d6.gif" },
  3: { nameJa: "搬送レーン", nameEn: "Transport Lane",  iconUrl: "https://www.mycryptoheroes.net/_nuxt/img/transport.c803000.webp",  bgUrl: "https://www.mycryptoheroes.net/_nuxt/img/202.50fc514.gif" },
  4: { nameJa: "具現カプセル", nameEn: "Embodiment Capsule", iconUrl: "https://www.mycryptoheroes.net/_nuxt/img/embodiment.ef33f6e.webp", bgUrl: "https://www.mycryptoheroes.net/_nuxt/img/203.5269736.gif" },
};

/** Phase 1D-25: 工房レベルアップを推奨するマイのお伺い popup を 1 度だけ出す。
 *  GUM が必要額を満たした + 条件をすべて達成 + まだ Mai に促されていない とき。
 */
function maybeWorkshopLvPrompt() {
  const cur = state.factoryLevel || 1;
  if (cur >= 5) return;
  const target = cur + 1;
  state.factoryLvPrompted = state.factoryLvPrompted || new Set();
  if (state.factoryLvPrompted.has(target)) return;
  const check = canFactoryLvUp(target);
  if (!check.ok) return;
  state.factoryLvPrompted.add(target);
  const equip = FACTORY_LV_EQUIPMENT[target];
  const lang = getLang() === "en" ? "en" : "ja";
  const equipName = equip ? (lang === "en" ? equip.nameEn : equip.nameJa) : "";
  const lines = lang === "en"
    ? [
        "Your workshop is bustling! How about leveling it up to expand?",
        equip ? `New equipment ready: ${equipName}!` : "",
        `Workshop Lv ${cur} → ${target}: ${factoryLvUpCost(cur).toLocaleString()} GUM`,
      ].filter(Boolean)
    : [
        "工房が活気に溢れてきましたね！そろそろ工房をレベルアップするのはいかがでしょう？",
        equip ? `工房を拡張するための設備をご用意しました！(${equipName})` : "",
        `工房 Lv ${cur} → ${target}: ${factoryLvUpCost(cur).toLocaleString()} GUM`,
      ].filter(Boolean);
  // Mai シーケンス → 閉じたら工房レベルアップ画面を開く
  maiSaysSequence(lines, { onClose: () => openFactoryLvUpView() });
}

/** ─── Phase 1D-26: 10 年 / 50 年エンディング ──────────────────── */

/** 現在の活動データ (ランキング送信 + 活動レポート用) */
function gatherFactoryStats() {
  return {
    gum: state.gum || 0,
    factoryLevel: state.factoryLevel || 1,
    craftCount: state.craftCompletedCount || 0,
    hireCount: state.heroHireCount || 0,
    saleCount: state.saleCompletedCount || 0,
    appraisalBest: state.appraisalBest || {},
    ownedHeroCount: (state.ownedHeroes || []).length,
    seriesCount: (state.unlockedSeries instanceof Set) ? state.unlockedSeries.size : 0,
    landPassCount: (state.landPasses instanceof Set) ? state.landPasses.size : 0,
    yearWeek: `${state.year}-${state.month}-${state.week}`,
  };
}

/** 10 年エンディング: マイ → スコア結果 → 活動レポート → 続行案内 */
function triggerEndgame10y() {
  pauseTime();
  const lang = getLang() === "en" ? "en" : "ja";
  maiSaysSequence(
    lang === "en"
      ? [
          "10 years have passed! Thank you for the journey.",
          "Let me tally up your achievements and calculate your score.",
        ]
      : [
          "10 年間お疲れ様でした！",
          "ここまでの実績を元にスコアを計算しますね。",
        ],
    { onClose: () => openRankingScoreView(true) }  // true = 10y mode (ランキング登録可能)
  );
}

/** 50 年エンディング: マイ → 完全終局レポート (ランキング登録対象外) */
function triggerEndgame50y() {
  pauseTime();
  const lang = getLang() === "en" ? "en" : "ja";
  maiSaysSequence(
    lang === "en"
      ? [
          "50 years have passed! Thank you so much for playing all this time.",
          "The game's official play period ends here. Take a look at the final report!",
        ]
      : [
          "50 年間お疲れ様でした！ゲームとしてのプレイ期間はここまでです。",
          "ここまで遊んでくださり本当にありがとうございます！活動レポートをご覧ください。",
        ],
    { onClose: () => openActivityReport(true) }  // true = final 50y report
  );
}

/** スコア + ランキング登録 view を開く */
function openRankingScoreView(isRanking) {
  const stats = gatherFactoryStats();
  const result = calcFactoryScore(stats);
  state.endgameStats = stats;
  state.endgameScore = result;
  const view = $("rankingScoreView");
  if (!view) {
    // フォールバック: 結果を console
    console.log("[ranking] score:", result.score, result.breakdown);
    return;
  }
  view.classList.remove("hidden");
  renderRankingScoreView();
}
function closeRankingScoreView() {
  $("rankingScoreView")?.classList.add("hidden");
}

function renderRankingScoreView() {
  const result = state.endgameScore;
  if (!result) return;
  const lang = getLang() === "en" ? "en" : "ja";
  const { score, breakdown: bd } = result;
  $("rankingScoreNum").textContent = score.toLocaleString();
  $("rankingScoreBreakdown").innerHTML = `
    <li><span>${escapeHtml(lang === "en" ? "GUM (base)" : "保有 GUM (基礎値)")}</span><strong>${bd.gum.toLocaleString()}</strong></li>
    <li><span>${escapeHtml(lang === "en" ? `Craft × ${bd.craftCount}` : `クラフト数 × ${bd.craftCount}`)}</span><strong>×${bd.craftMult.toFixed(2)}</strong></li>
    <li><span>${escapeHtml(lang === "en" ? `Hire ${bd.hireCount} (fewer = better)` : `雇用 ${bd.hireCount} 名 (少ないほど高倍率)`)}</span><strong>×${bd.hireMult.toFixed(2)}</strong></li>
    <li><span>${escapeHtml(lang === "en" ? `Workshop Lv ${bd.factoryLevel}` : `工房 Lv ${bd.factoryLevel}`)}</span><strong>×${bd.factoryMult.toFixed(2)}</strong></li>
    <li><span>${escapeHtml(lang === "en" ? `Best Common appraisal ${bd.bestCommon}/50` : `Common 最高査定 ${bd.bestCommon}/50`)}</span><strong>×${bd.appraisalMult.toFixed(2)}</strong></li>
  `;
  // 既存名を default に
  const nameInput = $("rankingPlayerName");
  if (nameInput && !nameInput.value) nameInput.value = getPlayerName();
  // submit ボタン: ランキング API URL が無ければ無効化
  const submitBtn = $("rankingSubmitBtn");
  if (submitBtn) {
    const apiAvail = !!getRankingApiUrl();
    submitBtn.disabled = !apiAvail;
    submitBtn.textContent = apiAvail
      ? ti18n("ranking.submitBtn", "ランキングに登録")
      : ti18n("ranking.noApi", "(API 未設定)");
  }
  // 状態リセット
  $("rankingStatus").textContent = "";
}

async function submitRankingNow() {
  const result = state.endgameScore;
  const stats  = state.endgameStats;
  if (!result || !stats) return;
  const nameInput = $("rankingPlayerName");
  const name = (nameInput?.value || "").trim().slice(0, 30);
  if (!name) {
    $("rankingStatus").textContent = ti18n("ranking.needName", "名前を入力してください");
    return;
  }
  setPlayerName(name);
  $("rankingStatus").textContent = ti18n("ranking.submitting", "送信中…");
  const payload = {
    playerName: name,
    score: result.score,
    gum: stats.gum,
    factoryLevel: stats.factoryLevel,
    craftCount: stats.craftCount,
    hireCount: stats.hireCount,
    saleCount: stats.saleCount,
    appraisalBest: stats.appraisalBest?.common || 0,
    yearWeek: stats.yearWeek,
    version: "1D-26",
  };
  const res = await submitFactoryScore(payload);
  if (res.ok) {
    $("rankingStatus").textContent = ti18n("ranking.submitOk", "登録しました！");
    $("rankingSubmitBtn").disabled = true;
  } else {
    $("rankingStatus").textContent = (ti18n("ranking.submitFail", "送信失敗: ") + (res.error || ""));
  }
}

/** スコア画面を閉じて活動レポートに進む (10 年エンドの場合 = 引き続きプレイ案内) */
function proceedToActivityReport() {
  closeRankingScoreView();
  openActivityReport(false);
}

/** 活動レポート view */
function openActivityReport(isFinal50y) {
  const stats = gatherFactoryStats();
  state.endgameStats = stats;
  const view = $("activityReportView");
  if (!view) return;
  view.classList.remove("hidden");
  view.setAttribute("data-final", isFinal50y ? "1" : "0");
  renderActivityReport(isFinal50y);
}
function closeActivityReport() {
  const isFinal = $("activityReportView")?.getAttribute("data-final") === "1";
  $("activityReportView")?.classList.add("hidden");
  resumeTime();
  // 10 年エンドの場合のみ、引き続きプレイ可能の Mai 案内
  if (!isFinal) {
    const lang = getLang() === "en" ? "en" : "ja";
    setTimeout(() => maiSaysSequence(
      lang === "en"
        ? [
            "Ranking entries close at this point, but you can keep playing!",
            "If you want to start over, just reload the browser.",
          ]
        : [
            "ランキングでの集計期間はここまでですが、ゲームは引き続き遊べます！",
            "最初からやり直したい場合はブラウザリロードをお願いします。",
          ],
      { onClose: () => {} }
    ), 200);
  }
}

function renderActivityReport(isFinal50y) {
  const stats = state.endgameStats || gatherFactoryStats();
  const lang = getLang() === "en" ? "en" : "ja";
  const title = isFinal50y
    ? (lang === "en" ? "50-Year Activity Report" : "50 年間 活動レポート")
    : (lang === "en" ? "10-Year Activity Report" : "10 年間 活動レポート");
  $("activityReportTitle").textContent = title;
  const rows = [
    [lang === "en" ? "GUM held" : "保有 GUM", stats.gum.toLocaleString()],
    [lang === "en" ? "Workshop Lv" : "工房レベル", `Lv ${stats.factoryLevel}`],
    [lang === "en" ? "Hired heroes" : "雇用ヒーロー数", stats.hireCount.toLocaleString()],
    [lang === "en" ? "Heroes owned" : "現在所持ヒーロー", stats.ownedHeroCount.toLocaleString()],
    [lang === "en" ? "Crafts completed" : "クラフト完了数", stats.craftCount.toLocaleString()],
    [lang === "en" ? "Sales completed" : "出品成立数", stats.saleCount.toLocaleString()],
    [lang === "en" ? "Best Common appraisal" : "Common 最高査定", `${stats.appraisalBest?.common || 0} / 50`],
    [lang === "en" ? "Best Uncommon appraisal" : "Uncommon 最高査定", `${stats.appraisalBest?.uncommon || 0} / 50`],
    [lang === "en" ? "Recipes (series)" : "解放シリーズ数", stats.seriesCount.toLocaleString()],
    [lang === "en" ? "Land passes" : "ランド通行証", stats.landPassCount.toLocaleString()],
  ];
  $("activityReportTable").innerHTML = rows.map(([k, v]) => `
    <tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>
  `).join("");
  // 50 年版は close ボタンを「閉じる」固定 (続行案内なし)
  const btn = $("activityReportClose");
  if (btn) btn.textContent = ti18n("ranking.report.close", "閉じる");
}

/** 全条件 + GUM 充足判定 */
function canFactoryLvUp(targetLv) {
  const conds = factoryLvUpConditions(targetLv);
  if (conds.length === 0) return { ok: false, reason: "max" };
  const cost = factoryLvUpCost(targetLv - 1);
  if ((state.gum || 0) < cost) return { ok: false, reason: "gum", missing: cost - (state.gum || 0) };
  for (const c of conds) {
    if (!c.met) return { ok: false, reason: "cond" };
  }
  return { ok: true, cost };
}

/** Phase 1D-23: 工房レベルアップ popup を開く */
function openFactoryLvUpView() {
  const view = $("factoryLvUpView");
  if (!view) return;
  pauseTime();
  view.classList.remove("hidden");
  renderFactoryLvUpView();
}
function closeFactoryLvUpView() {
  $("factoryLvUpView")?.classList.add("hidden");
  resumeTime();
}

function renderFactoryLvUpView() {
  const host = $("factoryLvUpList");
  if (!host) return;
  const cur = state.factoryLevel || 1;
  const targets = [2, 3, 4, 5];
  host.innerHTML = targets.map(t => {
    const isReached = cur >= t;
    const isCurrentTarget = !isReached && cur === t - 1;
    const cost = factoryLvUpCost(t - 1);
    const conds = factoryLvUpConditions(t);
    const unlocks = factoryLvUpUnlocks(t);
    const canCheck = canFactoryLvUp(t);
    const canDo = isCurrentTarget && canCheck.ok;
    const condsHtml = conds.map(c => `
      <li class="flv__cond ${c.met ? "flv__cond--met" : ""}">
        <span class="flv__cond-mark">${c.met ? "✓" : "・"}</span>
        <span class="flv__cond-label">${escapeHtml(c.label)}</span>
        <span class="flv__cond-num">${c.current.toLocaleString()} / ${c.required.toLocaleString()}</span>
      </li>
    `).join("");
    const unlocksHtml = unlocks.map(u => `<li>${escapeHtml(u)}</li>`).join("");
    let actionHtml;
    if (isReached) {
      actionHtml = `<div class="flv__action-done">達成済み</div>`;
    } else if (isCurrentTarget) {
      actionHtml = `<button type="button" class="flv__action-btn" data-flv-up="${t}" ${canDo ? "" : "disabled"}>
        Lv ${t - 1} → ${t} に上げる (${cost.toLocaleString()} GUM)
      </button>`;
    } else {
      actionHtml = `<div class="flv__action-locked">前のレベルを先に達成</div>`;
    }
    // Phase 1D-25: 設備アイコン (Lv2-4)
    const equip = FACTORY_LV_EQUIPMENT[t];
    const lang = getLang() === "en" ? "en" : "ja";
    const equipName = equip ? (lang === "en" ? equip.nameEn : equip.nameJa) : "";
    const equipHtml = equip
      ? `<div class="flv__equipment">
          <img class="flv__equip-icon" src="${equip.iconUrl}" alt="${escapeHtml(equipName)}" onerror="this.style.opacity='0.2'" />
          <div class="flv__equip-text">
            <span class="flv__equip-label">${escapeHtml(ti18n("factoryLvUp.newEquipment", "増設される設備"))}</span>
            <strong class="flv__equip-name">${escapeHtml(equipName)}</strong>
          </div>
        </div>`
      : "";
    return `<section class="flv__row" data-target="${t}" data-state="${isReached ? "done" : isCurrentTarget ? "current" : "future"}">
      <header class="flv__head">
        <span class="flv__lv-label">Lv ${t - 1} → Lv ${t}</span>
        <span class="flv__cost">${cost.toLocaleString()} GUM</span>
      </header>
      ${equipHtml}
      <ul class="flv__conds">${condsHtml}</ul>
      <p class="flv__unlocks-label">解放されること:</p>
      <ul class="flv__unlocks">${unlocksHtml}</ul>
      ${actionHtml}
    </section>`;
  }).join("");
}

/** Phase 1D-23: ホーム画面の「目標」バナーを描画 */
function renderHomeGoalBanner() {
  const host = $("homeGoalBanner");
  const text = $("homeGoalBannerText");
  if (!host || !text) return;
  const cur = state.factoryLevel || 1;
  if (cur >= 5) {
    text.textContent = ti18n("goal.maxed", "工房は最大 Lv.5 に到達しました！");
    host.classList.remove("hidden");
    return;
  }
  const tmpl = ti18n("goal.label", "目標：工房を Lv.{n} にしよう！");
  text.textContent = tmpl.replace("{n}", String(cur + 1));
  host.classList.remove("hidden");
}

function tryFactoryLevelUp(targetLv) {
  const cur = state.factoryLevel || 1;
  if (targetLv == null) targetLv = cur + 1;
  if (cur >= 5) {
    maiSays("settings.factoryLvMax");
    return;
  }
  if (targetLv !== cur + 1) return;
  // Phase 1D-32: 赤字中はレベルアップ不可
  if ((state.gum || 0) < 0) {
    maiSays("settings.deficitNoLvUp");
    return;
  }
  const check = canFactoryLvUp(targetLv);
  if (!check.ok) {
    if (check.reason === "gum") maiSays("settings.factoryLvNotEnoughGum");
    else maiSays("settings.factoryLvCondFail");
    return;
  }
  state.gum -= check.cost;
  state.factoryLevel = cur + 1;
  // Phase 1D-23: 工房レベルアップ専用 SE (facilities.mp3)
  playSe("factoryLvDone");
  renderHeader();
  renderFactoryLvUpView();
  // 解放内容 + 祝賀コメントをマイから
  const unlocks = factoryLvUpUnlocks(state.factoryLevel);
  const congrats = `工房 Lv ${state.factoryLevel} に到達！\n` +
    "解放: " + unlocks.join(" / ");
  // Phase 1D-30: 工房レベルアップ時の「評判」によるスポット雇用 (1 つ上の rarity)。
  //   雇用プランの最低 recruiter 要件 (例: Uncommon 雇用には Uncommon 必須) に
  //   引っかかって詰まないよう、レベルアップを節目に rarity を 1 段引き上げて
  //   無償で 1 名加入させる。
  //   レベルアップの Mai シーケンス閉じてから (onClose で) 連鎖的に発火させる
  //   ことで、modal 重複や maiSays のボディ上書きによるフリーズを防ぐ。
  const targetRarity = nextRarityAboveOwned();
  maiSaysSequence([
    `工房 Lv ${state.factoryLevel} に到達しました！おめでとうございます♪`,
    "解放: " + unlocks.join(" / "),
  ], {
    onClose: () => setTimeout(() => triggerSpontaneousHire(targetRarity, "factoryLv"), 200),
  });
  // ホーム画面の目標バナーも更新
  renderHomeGoalBanner();
}

/** ─── Phase 1D-30: スポット雇用 (= 評判によるヒーロー加入) ─── */

const RARITY_ORDER_FOR_SPONT = ["common", "uncommon", "rare", "epic", "legendary"];

/** 所有ヒーローの最高 rarity の 1 段上を返す。
 *  全員 common なら uncommon。誰も居なければ uncommon。
 *  既に legendary を持っているなら legendary を返す (頭打ち)。 */
function nextRarityAboveOwned() {
  const owned = state.ownedHeroes || [];
  let maxIdx = -1;
  for (const h of owned) {
    const idx = RARITY_ORDER_FOR_SPONT.indexOf(h.rarity || "common");
    if (idx > maxIdx) maxIdx = idx;
  }
  // 誰も居ない (=新規工房) → uncommon から始める
  if (maxIdx < 0) return "uncommon";
  return RARITY_ORDER_FOR_SPONT[Math.min(RARITY_ORDER_FOR_SPONT.length - 1, maxIdx + 1)];
}

/** Phase 1D-30: GUM 閾値到達時のスポット雇用 (one-shot)。
 *  順序は値が小さい順 — 同 tick で複数閾値を跨いだ場合は最大 rarity 1 名のみ。 */
const SPONTANEOUS_GUM_THRESHOLDS = [
  { gum:  2000, rarity: "uncommon" },
  { gum:  5000, rarity: "rare"     },
  { gum: 10000, rarity: "epic"     },
  { gum: 30000, rarity: "legendary" },
];

/** 所持 GUM が閾値を初めて超えていたらスポット雇用を発火する。
 *  複数閾値をまたいだ場合は最大の rarity を 1 名だけ加入させ、跨いだ閾値全てを
 *  既発火マーカーに登録する (= 巻き戻して GUM が減っても再発火しない)。 */
function checkSpontaneousGumHire() {
  if (!(state.spontaneousGumHits instanceof Set)) {
    state.spontaneousGumHits = new Set(state.spontaneousGumHits || []);
  }
  const cur = state.gum || 0;
  let triggered = null; // 一番 rarity 高い閾値を採用
  for (const t of SPONTANEOUS_GUM_THRESHOLDS) {
    if (state.spontaneousGumHits.has(t.gum)) continue;
    if (cur >= t.gum) {
      state.spontaneousGumHits.add(t.gum);
      triggered = t; // 後ろの閾値ほど rarity が高い順なので上書きで OK
    }
  }
  if (triggered) {
    setTimeout(() => triggerSpontaneousHire(triggered.rarity, "gum"), 600);
  }
}

/** rarity を指定してスポット雇用を起動する。
 *  - 候補が居ない / キャップ満員なら保留 (state.pendingSpontaneousRarity)
 *  - 起動するときは: マイ「工房の評判を聞いて、採用の申込みがありました！」
 *    → onClose で実際に加入処理 + showHireSuccessModal
 *
 *  @param {string} rarity   "common" | "uncommon" | "rare" | "epic" | "legendary"
 *  @param {string} [source] "factoryLv" | "gum" — ロギング用
 */
function triggerSpontaneousHire(rarity, source) {
  if (!rarity) return;
  // 既に保留中があれば 1 件ずつ処理 (重ねない)
  if (state.pendingSpontaneousRarity) return;
  // Phase α 修正: 他のモーダルが開いている (= pauseFlags > 0) ときに maiSays を
  //   重ねると body / _maiNextAction が上書きされ pauseFlags の累積取りこぼしで
  //   フリーズする (= 2,000 GUM 到達と他完了報告の同時発火バグ)。pauseFlags が
  //   0 に戻った tick で onTick の retry 経路が再試行する。
  if (state.pauseFlags > 0) {
    state.pendingSpontaneousRarity = rarity;
    return;
  }
  // キャップ満員 → 保留
  const cap = heroCapAtFactoryLevel(state.factoryLevel);
  if ((state.ownedHeroes || []).length >= cap) {
    state.pendingSpontaneousRarity = rarity;
    return;
  }
  // 該当 rarity で未所有のヒーローを 1 名抽選
  const ownedIds = new Set(state.ownedHeroes.map(h => h.heroId));
  const pool = HERO_ROSTER.filter(h => h.rarity === rarity && !ownedIds.has(h.heroId));
  // 該当 rarity が払底 → 1 段下にフォールバック
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (!pick) {
    const idx = RARITY_ORDER_FOR_SPONT.indexOf(rarity);
    for (let i = idx - 1; i >= 0 && !pick; i--) {
      const fallback = RARITY_ORDER_FOR_SPONT[i];
      const altPool = HERO_ROSTER.filter(h => h.rarity === fallback && !ownedIds.has(h.heroId));
      pick = altPool[Math.floor(Math.random() * altPool.length)];
    }
  }
  if (!pick) return;  // 全 rarity 在庫払底 (理論上ほぼ無い) → 諦め
  // マイの一言 → 受領 → 成功モーダル
  state.pendingSpontaneousRarity = rarity;
  maiSays("mai.spontaneousHire", {
    onClose: () => {
      // 再度キャップチェック (保留 → 再開時に既に枠埋まってる可能性に備え)
      const cap2 = heroCapAtFactoryLevel(state.factoryLevel);
      if ((state.ownedHeroes || []).length >= cap2) {
        // 保留継続 (rarity は state.pendingSpontaneousRarity に残す)
        return;
      }
      const def = HERO_ROSTER.find(h => h.heroId === pick.heroId);
      if (!def) { state.pendingSpontaneousRarity = null; return; }
      const newHero = makeFactoryHero(def);
      state.ownedHeroes.push(newHero);
      state.heroHireCount = (state.heroHireCount || 0) + 1;
      state.pendingSpontaneousRarity = null;
      renderHeader();
      renderHeroTeam?.();
      renderHeroList?.();
      renderWorkshop?.();
      // 既存の雇用成功モーダルを再利用
      showHireSuccessModal(newHero);
    },
  });
}

/** ─── Phase 1D-32: 赤字機能 (deficit) ─── */

/** 赤字発生から離職開始までの猶予 (= 6 ヶ月) */
const DEFICIT_GRACE_TICKS = 6 * WEEKS_PER_MONTH * SECONDS_PER_WEEK;
/** 離職クールダウン (= 3 ヶ月ごとに 1 名) */
const DEFICIT_ATTRITION_INTERVAL_TICKS = 3 * WEEKS_PER_MONTH * SECONDS_PER_WEEK;

/** GUM 変動後に呼ぶ。負債開始 / 解消 / 初回助言フラグの更新を行う。
 *  - 負 → 正 に戻った: deficitStartedAtTick / lastAttritionTick をクリア
 *  - 正 → 負 に変化: deficitStartedAtTick = 現 tick
 *  - 初めて 負 になった: pendingDeficitAdvice = true (= 次の onTick で発火)
 *
 *  助言の maiSaysSequence をここで直接呼ばないのは、hire-success モーダル等の
 *  最中に呼ばれるとマイの吹き出しが裏に隠れてフリーズの原因になるため。
 *  → onTick の冒頭 (pauseFlags === 0) で消化する。 */
function checkDeficitTransition() {
  const isDeficit = (state.gum || 0) < 0;
  if (isDeficit) {
    if (state.deficitStartedAtTick == null) {
      state.deficitStartedAtTick = state.tickCount;
      state.lastAttritionTick = null;
    }
    if (!state.deficitAdvised && !state.pendingDeficitAdvice) {
      state.pendingDeficitAdvice = true;
    }
  } else {
    // 黒字復帰 → クリア (ただし deficitAdvised は再発動しない: 1 度だけ)
    state.deficitStartedAtTick = null;
    state.lastAttritionTick = null;
  }
}

/** 毎 tick の離職判定。猶予 6 ヶ月超 + 直近離職から 3 ヶ月経過で 1 名離職。 */
function tickDeficitAttrition() {
  if (state.gameOverTriggered) return;
  if (state.deficitStartedAtTick == null) return;
  const elapsed = state.tickCount - state.deficitStartedAtTick;
  if (elapsed < DEFICIT_GRACE_TICKS) return;
  // 直近離職から 3 ヶ月経過していなければ skip
  const sinceLast = state.lastAttritionTick == null
    ? Infinity
    : state.tickCount - state.lastAttritionTick;
  if (sinceLast < DEFICIT_ATTRITION_INTERVAL_TICKS) return;
  // ヒーロー全員から 1 名ランダム選出 (実働中も含む — 「給料未払い」設定なので例外無し)
  const heroes = state.ownedHeroes || [];
  if (heroes.length === 0) return;  // 既に空なら gameover trigger に任せる
  const idx = Math.floor(Math.random() * heroes.length);
  const leaver = heroes[idx];
  // 離職処理: ownedHeroes から除去 + craftTeam / questTeam / activeSale / activeHire からも除去
  heroes.splice(idx, 1);
  if (Array.isArray(state.craftTeam)) {
    for (let i = 0; i < state.craftTeam.length; i++) if (state.craftTeam[i] === leaver.heroId) state.craftTeam[i] = null;
  }
  if (Array.isArray(state.questTeam)) {
    for (let i = 0; i < state.questTeam.length; i++) if (state.questTeam[i] === leaver.heroId) state.questTeam[i] = null;
  }
  if (state.activeHire && state.activeHire.recruiterId === leaver.heroId) {
    state.activeHire = null;  // recruiter 居なくなる → 中断
  }
  // activeSale の seller として登録されている case はそのまま (seller は内側状態)
  state.lastAttritionTick = state.tickCount;
  // 通知
  const heroName = tHero(leaver.heroId, leaver.nameJa);
  maiSays("mai.deficitAttrition", { onClose: () => {} });
  // i18n の {hero} 置換は body 側で再利用 — closure で上書きする手間を避けるため、
  // ここでは notif にも push して保険をかける
  state.notifications.push({
    id: ++_notifId,
    text: ti18n("mai.deficitAttrition").replace("{hero}", heroName),
    element: "tiamat",  // 灰色寄りの色を使うため適当な要素に紐付け
    value: 0,
    createdTick: state.tickCount,
  });
  renderHeader();
  renderHeroTeam?.();
  renderHeroList?.();
  renderWorkshop?.();
  // 0 名 → ゲームオーバー
  if ((state.ownedHeroes || []).length === 0) {
    triggerDeficitGameOver();
  }
}

/** ヒーロー 0 名 → ゲームオーバー → ランキング登録画面へ */
function triggerDeficitGameOver() {
  if (state.gameOverTriggered) return;
  state.gameOverTriggered = true;
  pauseTime();
  maiSaysSequence([
    ti18n("mai.deficitGameOver"),
  ], { onClose: () => openRankingScoreView(true) });  // true = ランキング登録可能
}

/** ─── Phase 1D-32: 受注クラフト (commission) ─── */

const COMMISSION_REWARD_RATIO = 0.6;     // 通常販売価格の 60%
const COMMISSION_PER_REGEN    = 3;        // 月次 3 件
const COMMISSION_DEADLINE_BONUS_WEEKS = 3; // 通常 durationWeeks + 3 週を期限に

let _commissionId = 0;

/** 解放済みエクステンションのプールから rarity 重み付きで 1 つ抽選する */
function pickRandomUnlockedExt() {
  const all = Object.values(EXTENSION_BY_ID || {});
  const unlocked = all.filter(e => isExtUnlocked(e, state.unlockedSeries, state.factoryLevel));
  if (unlocked.length === 0) return null;
  // rarity 重み: common 高、legendary 低 (現在解放済の範囲で)
  const W = { common: 5, uncommon: 3, rare: 2, epic: 1, legendary: 0.4 };
  const totalW = unlocked.reduce((s, e) => s + (W[e.rarity] || 1), 0);
  let r = Math.random() * totalW;
  for (const e of unlocked) {
    r -= (W[e.rarity] || 1);
    if (r <= 0) return e;
  }
  return unlocked[unlocked.length - 1];
}

/** 受注の deadline 切れを毎 tick チェック。
 *  - 期限を過ぎた依頼は state.commissions から除去 (受けていないものは静かに消える)
 *  - 進行中 (= state.activeCraft.commissionId === c.id) の依頼が deadline を
 *    超えても直ちには中止しない (= craft 完了時に triggerCommissionResult が
 *    deadline と quality を判定する。期限超過なら報酬 0 で完了通知)。
 *    こちらでは依頼一覧からの除去のみ。 */
function tickCommissionDeadlines() {
  if (!Array.isArray(state.commissions) || state.commissions.length === 0) return;
  const acId = state.activeCraft?.commissionId;
  state.commissions = state.commissions.filter(c => {
    // 進行中の依頼は active craft 終了後に削除 (= triggerCraftCompletion で消化)
    if (c.id === acId) return true;
    return state.tickCount < c.deadlineTick;
  });
}

/** 受注の月次再生成 (advanceWeek の節目で呼ぶ)。
 *  既に該当月で生成済みならスキップ。 */
function maybeRegenerateCommissions() {
  const cur = state.month + state.year * 12;
  if (state.lastCommissionGenAtMonth === cur) return;
  state.lastCommissionGenAtMonth = cur;
  const out = [];
  for (let i = 0; i < COMMISSION_PER_REGEN; i++) {
    const ext = pickRandomUnlockedExt();
    if (!ext) break;
    // 期限: ext の durationWeeks 推定 + 3 週
    const baseDur = (ext.durationWeeks != null ? ext.durationWeeks : 4);
    const deadlineTicks = (baseDur + COMMISSION_DEADLINE_BONUS_WEEKS) * SECONDS_PER_WEEK;
    // 報酬: ext の expectedPrice (= 倉庫からの売却推定) × 60%
    //   estimateSalePrice は warehouseItem を要求するので簡易計算:
    //   ext.basePrice + rarity ボーナス (= getExtBasePrice 相当)
    //   → 既存定数が無ければ rarity から仮算出
    const rarityFloor = { common: 220, uncommon: 480, rare: 1200, epic: 3500, legendary: 11000 };
    const baseSell = (typeof estimateExtBasePrice === "function" ? estimateExtBasePrice(ext) : null)
      ?? (rarityFloor[ext.rarity] || 220);
    const reward = Math.round(baseSell * COMMISSION_REWARD_RATIO);
    out.push({
      id: ++_commissionId,
      extId: ext.extId,
      deadlineTick: state.tickCount + deadlineTicks,
      rewardGum: reward,
      generatedAtTick: state.tickCount,
      generatedAt: { year: state.year, month: state.month, week: state.week },
    });
  }
  state.commissions = out;
}

/** 受注クラフト picker view を開く */
function openCommissionView() {
  const view = $("commissionView");
  if (!view) return;
  // 初回オープン時に commission がまだ無ければ即生成
  if (!Array.isArray(state.commissions) || state.commissions.length === 0) {
    maybeRegenerateCommissions();
  }
  pauseTime();
  view.classList.remove("hidden");
  renderCommissionView();
}

function closeCommissionView() {
  $("commissionView")?.classList.add("hidden");
  resumeTime();
}

function renderCommissionView() {
  const host = $("commissionList");
  if (!host) return;
  const lang = getLang() === "en" ? "en" : "ja";
  const list = state.commissions || [];
  if (list.length === 0) {
    host.innerHTML = `<div class="commission-view__empty">${escapeHtml(ti18n("commission.empty"))}</div>`;
    return;
  }
  // activeCraft が既に動いていれば全 disable
  const isBusy = !!state.activeCraft;
  host.innerHTML = list.map(c => {
    const ext = EXTENSION_BY_ID[String(c.extId)];
    if (!ext) return "";
    const extName = lang === "en" ? (ext.nameEn || ext.nameJa) : ext.nameJa;
    const remainTicks = Math.max(0, c.deadlineTick - state.tickCount);
    const remainWeeks = Math.ceil(remainTicks / SECONDS_PER_WEEK);
    return `<div class="commission-card">
      <img class="commission-card__icon" src="${extIconUrl(ext.extId)}" alt="" onerror="this.style.opacity='0.2'" />
      <div class="commission-card__info">
        <span class="commission-card__name">${escapeHtml(extName)}</span>
        <span class="commission-card__meta">
          <span class="commission-card__deadline">${escapeHtml(ti18n("commission.deadline"))}: ${remainWeeks}${lang === "en" ? "w" : "週"}</span>
          <span class="commission-card__reward">${escapeHtml(ti18n("commission.reward"))}: ${c.rewardGum.toLocaleString()} GUM</span>
        </span>
      </div>
      <button type="button" class="commission-card__btn" data-commission-id="${c.id}" ${isBusy ? "disabled" : ""}>
        ${escapeHtml(ti18n("commission.start"))}
      </button>
    </div>`;
  }).join("");
}

/** picker で commission を選択 → 既存 craftView の confirm 画面に流し込む。
 *  craft.commissionId フラグを保持してその後の処理 (材料免除 / 完了処理) で参照。 */
function pickCommission(commissionId) {
  if (state.activeCraft) {
    maiSays("commission.busy");
    return;
  }
  const c = (state.commissions || []).find(x => x.id === commissionId);
  if (!c) return;
  state.craftPickedExtId = String(c.extId);
  state.craftPickedCommissionId = c.id;
  closeCommissionView();
  // 既存 craftView を開いて confirm 画面に直行
  const view = $("craftView");
  if (!view) return;
  pauseTime();
  view.classList.remove("hidden");
  setCraftScreen("confirm");
  renderConfirm();
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
  // Phase 1D-32: 受注クラフトの期限切れ判定 (進行中 commission の deadline 越え)
  tickCommissionDeadlines();
  // Phase 1D-32: 赤字 6 ヶ月超 → 3 ヶ月ごとに離職 → 0 名でゲームオーバー
  tickDeficitAttrition();
  // Phase 1D-32: 初赤字時のマイ助言を保留消化 (= 他モーダル閉じてから出す)。
  //   onTick は pauseFlags > 0 で早期 return するので、この時点で modal は無い。
  if (state.pendingDeficitAdvice) {
    state.pendingDeficitAdvice = false;
    state.deficitAdvised = true;
    maiSaysSequence([
      ti18n("mai.deficitFirst1"),
      ti18n("mai.deficitFirst2"),
      ti18n("mai.deficitCommissionHint"),
    ]);
    return;  // 後続の他チェックは次 tick で (= mai 開いたので pauseFlags > 0)
  }
  // Phase 1D-30: GUM 閾値到達によるスポット雇用チェック (one-shot)
  //   GUM が変動するパスは多くタイミングが分散するため、毎 tick の集約点として
  //   ここでチェックするのが最も安全。pauseFlags > 0 のときは onTick 自体が
  //   早期 return するので modal 重複の心配もない。
  checkSpontaneousGumHire();
  // 保留されていたスポット雇用 (キャップ解放時など) を再試行
  if (state.pendingSpontaneousRarity && (state.ownedHeroes || []).length < heroCapAtFactoryLevel(state.factoryLevel)) {
    const r = state.pendingSpontaneousRarity;
    state.pendingSpontaneousRarity = null;
    setTimeout(() => triggerSpontaneousHire(r, "retry"), 200);
  }
  // Notifications/floats の TTL GC + 描画更新
  pruneEphemerals();
  renderHeader();
  renderWorkshop();
  renderNotifications();
  renderProgressCards();
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
        // Phase 1D-19: クラフト中に体力ゼロ → 「疲れた…」セリフ
        pushHeroFlavor(hero.heroId, "restingZero");
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
      pushSpriteFloat(hero.heroId, gain.element, gain.value);
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
    const before = ac.timeProgress || 0;
    ac.timeProgress = Math.min(1, before + baseDelta * factor);
    // Phase 1D-27: 進捗 40% / 80% でクラフト中の介入イベント (魂注入 / オーラ付与) を起動
    if (!ac.event40Done && before < 0.40 && ac.timeProgress >= 0.40) {
      ac.event40Done = true;
      pauseTime();
      setTimeout(() => triggerCraftEvent("soul"), 200);
    }
    if (!ac.event80Done && before < 0.80 && ac.timeProgress >= 0.80) {
      ac.event80Done = true;
      pauseTime();
      setTimeout(() => triggerCraftEvent("aura"), 200);
    }
  }
  // 5. 完了判定 (時間進捗 100%)
  if ((ac.timeProgress || 0) >= 1) {
    triggerCraftCompletion(ac);
  }
}

/** ─── Phase 1D-27: クラフト中ユーザー介入イベント ─────────────── */

/** type = "soul" (40%) | "aura" (80%) */
function triggerCraftEvent(type) {
  state.craftEventType = type;
  state.craftEventPickedElement = null;
  state.craftEventPickedHeroId = null;
  const lang = getLang() === "en" ? "en" : "ja";
  const lines = type === "soul"
    ? (lang === "en"
        ? ["The blank extension is ready!", "Now let's inject the soul. Who will lead this?"]
        : ["エクステンションの素体ができたようです！", "続いて、ソウルを注入しましょう。誰に頼みますか？"])
    : (lang === "en"
        ? ["Time for the final touch!", "Let's bestow an aura on the extension. Who will lead this?"]
        : ["最後の仕上げです！", "エクステンションにオーラを付与しましょう。誰に頼みますか？"]);
  maiSaysSequence(lines, { onClose: () => openCraftEventPicker(type) });
}

function openCraftEventPicker(type) {
  const view = $("craftEventPicker");
  if (!view) {
    // フォールバック: 自動で適当な要素 + チームの先頭で実行
    const ac = state.activeCraft;
    if (!ac) { resumeTime(); return; }
    const heroId = ac.team.find(id => id != null);
    state.craftEventPickedElement = ELEMENTS[0];
    state.craftEventPickedHeroId = heroId;
    runCraftEventAnimation();
    return;
  }
  view.classList.remove("hidden");
  view.setAttribute("data-event-type", type);
  renderCraftEventPicker();
}

function closeCraftEventPicker() {
  $("craftEventPicker")?.classList.add("hidden");
}

function renderCraftEventPicker() {
  const ac = state.activeCraft;
  if (!ac) return;
  const lang = getLang() === "en" ? "en" : "ja";
  const type = state.craftEventType;
  $("craftEventTitle").textContent = type === "soul"
    ? (lang === "en" ? "Soul Injection" : "ソウル注入")
    : (lang === "en" ? "Aura Bestowal" : "オーラ付与");

  // Phase 1D-28: 現在のクラフト進捗 (各色 cur/tgt) を表示。
  //   これによりプレイヤーは「どの色が足りていないか」を見て注入対象を選べる。
  const progHost = $("craftEventPickerProgress");
  if (progHost) {
    progHost.innerHTML = ELEMENTS.map(k => {
      const cur = ac.progress[k] || 0;
      const tgt = ac.targets[k]  || 0;
      const reached = tgt === 0 || cur >= tgt;
      return `<span class="craft-event-picker__prog-el${reached ? " craft-event-picker__prog-el--reached" : ""}" title="${escapeHtml(elementLabel(k))} ${cur}/${tgt}">
        <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" onerror="this.style.opacity='0.2'" />
        <strong>${cur}</strong><span class="pe-tgt">/${tgt}</span>
      </span>`;
    }).join("");
  }

  // 1. 要素選択 (4 種)
  $("craftEventElements").innerHTML = ELEMENTS.map(k => {
    const sel = k === state.craftEventPickedElement ? " craft-event__el--sel" : "";
    return `<button type="button" class="craft-event__el${sel}" data-event-element="${k}">
      <img src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" />
      <span>${escapeHtml(elementLabel(k))}</span>
    </button>`;
  }).join("");

  // 2. クラフト編成ヒーローの中から担当を選ぶ
  const teamHeroes = (ac.team || []).filter(id => id != null).map(id => findHero(id)).filter(Boolean);
  $("craftEventHeroes").innerHTML = teamHeroes.length === 0
    ? `<p class="craft-event__empty">${escapeHtml(lang === "en" ? "No team heroes available." : "編成中のヒーローが居ません。")}</p>`
    : teamHeroes.map(h => {
        const sel = h.heroId === state.craftEventPickedHeroId ? " craft-event__hero--sel" : "";
        const cl = craftLevel(h);
        return `<button type="button" class="craft-event__hero${sel}" data-event-hero="${h.heroId}">
          <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
          <span class="craft-event__hero-name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
          <span class="craft-event__hero-cl">CL ${cl}</span>
          ${h.passiveName ? `<span class="craft-event__hero-passive">${escapeHtml(h.passiveName)}</span>` : ""}
        </button>`;
      }).join("");

  // 3. 「注入開始」ボタン (両方選択時のみ有効)
  const startBtn = $("craftEventStart");
  if (startBtn) {
    startBtn.disabled = !(state.craftEventPickedElement && state.craftEventPickedHeroId);
    startBtn.textContent = type === "soul"
      ? (lang === "en" ? "Start injection" : "注入開始")
      : (lang === "en" ? "Bestow aura" : "付与開始");
  }
}

/** ヒーローの enthusiasm セリフプール */
const CRAFT_EVENT_INTRO_LINES_JA = ["私にまかせろ！", "ついにこの時が！", "腕が鳴るぜ", "ドンと来い！", "全力でやる！"];
const CRAFT_EVENT_INTRO_LINES_EN = ["Leave it to me!", "Finally, my time!", "Itching to start!", "Bring it on!", "Full power!"];
const CRAFT_EVENT_OUTRO_LINES_JA = ["これでどうだ！", "終わった", "いっちょう上がり！", "いかがでしょう", "ふぅ…完璧だ"];
const CRAFT_EVENT_OUTRO_LINES_EN = ["How's that!", "Done.", "All finished!", "How is it?", "Whew, perfect."];

/** 注入開始 → アニメーション → 完了 */
function runCraftEventAnimation() {
  closeCraftEventPicker();
  const ac = state.activeCraft;
  const elKey = state.craftEventPickedElement;
  const heroId = state.craftEventPickedHeroId;
  const hero = findHero(heroId);
  if (!ac || !elKey || !hero) {
    resumeTime();
    return;
  }
  const lang = getLang() === "en" ? "en" : "ja";
  // 演出時間 + アイコン数: rarity + rank に比例
  const RARITY_BOOST = { common: 1, uncommon: 1.3, rare: 1.6, epic: 2, legendary: 2.5 };
  const rMult = 1 + 0.4 * (hero.rank || 0);
  const rarMult = RARITY_BOOST[hero.rarity] || 1;
  const iconCount = Math.round(8 + 12 * (rMult * rarMult - 1) / 5);  // ~8-20+
  // 1 アイコン あたりの増分: ヒーローの当該要素値 × 0.1〜
  const elemVal = elementValueForCraft(hero, elKey);
  const perIconGain = Math.max(2, Math.round(elemVal * 0.12));

  // 演出 view を開く
  const animView = $("craftEventAnim");
  if (animView) animView.classList.remove("hidden");
  $("craftEventAnimTitle").textContent = state.craftEventType === "soul"
    ? (lang === "en" ? "Injecting soul…" : "ソウル注入中…")
    : (lang === "en" ? "Bestowing aura…" : "オーラ付与中…");
  $("craftEventAnimHero").src = hero.img();
  $("craftEventAnimHero").className = `craft-event__anim-hero craft-event__anim-hero--shaking`;
  $("craftEventAnimExt").src = extIconUrl(ac.extId);
  $("craftEventAnimEl").innerHTML = `<img src="${elementIconUrl(elKey)}" alt="" /> <span>${escapeHtml(elementLabel(elKey))}</span>`;
  // Phase 1D-29: 演出冒頭でバフ SE。ソウル注入 / オーラ付与 共通。
  playSe("craftBuff");
  // 意気込み — 工房のフレーバーバブルと同じ見た目でヒーローアイコンに被せて表示
  const intro = (lang === "en" ? CRAFT_EVENT_INTRO_LINES_EN : CRAFT_EVENT_INTRO_LINES_JA);
  // Phase 1D-31: 工房と同じ吹き出しなので「ヒーロー名:「」」装飾は不要 (= セリフのみ)
  showCraftEventBubble(intro[Math.floor(Math.random() * intro.length)]);
  // 累計表示
  let total = 0;
  $("craftEventAnimTotal").textContent = `${total}`;

  // アイコン射出 (緩急つきで iconCount 回)
  const stage = $("craftEventAnimStage");
  if (stage) {
    // Phase 1D-28 fix: stage.innerHTML="" は hero/ext img まで吹き飛ばすので、
    //   旧 fly / pop 残骸だけ取り除く。
    stage.querySelectorAll(".craft-event__fly, .craft-event__pop").forEach(el => el.remove());
  }
  let fired = 0;
  // Phase 1D-28: 緩急演出 — 同じ間隔で打つのではなく、
  //   2-4 連の高速バースト → 短い余韻 → 次のバースト の繰り返し。
  //   さらに最後の 1 撃は溜め (+N が大きく出る)。
  let burstRemaining = 0;
  const planNextDelay = () => {
    const isLast = fired >= iconCount - 1;
    if (isLast) return 600; // 大溜めで最後を強調
    if (burstRemaining > 0) {
      burstRemaining--;
      return 70 + Math.random() * 50;       // バースト中: 70-120ms
    }
    burstRemaining = 1 + Math.floor(Math.random() * 3); // 次のバーストは 2-4 連
    return 280 + Math.random() * 160;        // 余韻: 280-440ms
  };
  const fireOne = () => {
    if (fired >= iconCount) {
      // 終了演出
      finishCraftEventAnim(hero, elKey, total, lang);
      return;
    }
    fired++;
    const isLast = fired === iconCount;
    // 飛ぶアイコンを spawn
    if (stage) {
      const ic = document.createElement("img");
      ic.src = elementIconUrl(elKey);
      ic.className = `craft-event__fly craft-event__fly--${elKey}`;
      stage.appendChild(ic);
      setTimeout(() => ic.remove(), 800);
    }
    // 0.5 秒後に着弾 → progress 加算 + ダメージ風 +N ポップ
    setTimeout(() => {
      // 最後の 1 撃はクリティカル風に大きめゲイン
      const isCrit = isLast;
      const wobble = 0.85 + Math.random() * 0.5;   // 0.85x-1.35x (緩急)
      const gain = Math.max(1, Math.round(perIconGain * wobble * (isCrit ? 2.4 : 1)));
      ac.progress[elKey] = (ac.progress[elKey] || 0) + gain;
      total += gain;
      $("craftEventAnimTotal").textContent = `${total}`;
      // +N ダメージ風 popup
      if (stage) {
        const pop = document.createElement("span");
        const big = gain >= perIconGain * 1.2 ? " craft-event__pop--big" : "";
        const crit = isCrit ? " craft-event__pop--crit" : "";
        pop.className = `craft-event__pop craft-event__pop--${elKey}${big}${crit}`;
        // 着弾位置をランダムに少しずらして連発時の重なりを避ける
        const dx = (Math.random() - 0.5) * 30;
        const dy = (Math.random() - 0.5) * 24;
        pop.style.right = `${60 - dx}px`;
        pop.style.top   = `calc(50% + ${dy}px)`;
        pop.textContent = `+${gain}`;
        stage.appendChild(pop);
        setTimeout(() => pop.remove(), 900);
      }
      playSe("craftGain");
    }, 500);
    setTimeout(fireOne, planNextDelay());
  };
  fireOne();
}

/** Phase 1D-29: 演出ステージ内でヒーローアイコンに被せて吹き出しを表示する。
 *  intro/outro 共通。同じ要素を使い回し、CSS animation を再起動する。 */
function showCraftEventBubble(text) {
  const bubble = $("craftEventAnimQuoteBubble");
  if (!bubble) return;
  bubble.classList.remove("hidden");
  bubble.textContent = text;
  // animation を再起動 (一度 hidden 化 → reflow → 再表示)
  bubble.style.animation = "none";
  void bubble.offsetWidth;
  bubble.style.animation = "";
}

function finishCraftEventAnim(hero, elKey, total, lang) {
  const outro = (lang === "en" ? CRAFT_EVENT_OUTRO_LINES_EN : CRAFT_EVENT_OUTRO_LINES_JA);
  // Phase 1D-31: 工房と同じ吹き出しなので「ヒーロー名:「」」装飾は不要 (= セリフのみ)
  showCraftEventBubble(outro[Math.floor(Math.random() * outro.length)]);
  // 1.2 秒後に閉じてホーム再開
  setTimeout(() => {
    $("craftEventAnim")?.classList.add("hidden");
    state.craftEventType = null;
    state.craftEventPickedElement = null;
    state.craftEventPickedHeroId = null;
    resumeTime();
    renderOrderPanel();
    renderWorkshop();
  }, 1200);
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

  // Phase 1D-32: 受注クラフトは別フローで完了処理 (倉庫入り無し / 報酬 GUM)
  if (ac.commissionId != null) {
    triggerCommissionResult(ac, allMet, qualityRatio);
    return;
  }

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

/** Phase 1D-32: 受注クラフトの完了処理。
 *   - 期限超過 OR 基準値未達 → 報酬なし
 *   - 双方 OK → 報酬 GUM 加算 + 速報タイル通知
 *   いずれの場合も extension は倉庫に入れない (= 依頼者に納品)。
 *   配属ヒーロー state は IDLE に戻す。
 */
function triggerCommissionResult(ac, allMet, qualityRatio) {
  const c = (state.commissions || []).find(x => x.id === ac.commissionId);
  const overDeadline = c ? state.tickCount > c.deadlineTick : false;
  const success = !!c && !overDeadline && allMet;
  const lang = getLang() === "en" ? "en" : "ja";
  const ext = EXTENSION_BY_ID[String(ac.extId)];
  const extName = ext ? (lang === "en" ? (ext.nameEn || ext.nameJa) : ext.nameJa) : `ext ${ac.extId}`;
  if (success && c) {
    state.gum += c.rewardGum;
    state.notifications.push({
      id: ++_notifId,
      text: ti18n("commission.success").replace("{reward}", c.rewardGum.toLocaleString()),
      element: "tiamat",
      value: 0,
      createdTick: state.tickCount,
    });
    playSe("saleSettled");
    checkDeficitTransition();  // 報酬で黒字復帰したらフラグクリア
  } else {
    // 失敗通知
    const reasonKey = overDeadline ? "commission.fail.deadline" : "commission.fail.target";
    state.notifications.push({
      id: ++_notifId,
      text: `[${extName}] ${ti18n(reasonKey)}`,
      element: "ifrit",
      value: 0,
      createdTick: state.tickCount,
    });
  }
  // 依頼を一覧から除去
  if (c) state.commissions = (state.commissions || []).filter(x => x.id !== c.id);
  // 配属ヒーローを IDLE に戻す
  for (const id of ac.team) {
    if (id == null) continue;
    const h = findHero(id);
    if (h && h.state === HERO_STATE.CRAFTING) h.state = HERO_STATE.IDLE;
  }
  state.activeCraft = null;
  state.craftPickedCommissionId = null;
  // 描画リフレッシュ
  renderHeader();
  renderNotifications();
  renderOrderPanel?.();
  renderWorkshop();
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
    if (skip.has(hero.heroId)) continue;
    if (hero.state === HERO_STATE.RESTING) {
      // 休憩中: stamina を回復
      adjustStamina(hero, staminaRecoverPerTick(hero));
      if (isFullyRested(hero)) hero.state = HERO_STATE.IDLE;
    } else if (hero.state === HERO_STATE.IDLE) {
      // Phase 1D-23: Idle 中の体力減少を廃止 (ユーザー仕様)。
      //   待機中のヒーローは体力を維持し、好きなタイミングで派遣できる。
      // 完全 idle なヒーローが 1 週間経過したら「ヒマだな…」発言だけ残す
      maybeIdleSpeak(hero);
    }
  }
}

/** Phase 1D-19: idle ヒーローが「ヒマだな…」と発言する判定。
 *  週単位で 1 ヒーローにつき高々 1 回。各 tick で軽い確率で発火。
 */
function maybeIdleSpeak(hero) {
  if (!hero || hero.state !== HERO_STATE.IDLE) return;
  const wkKey = (state.year * 1000) + (state.month * 50) + state.week;
  if (state.heroIdleSpokeAt[hero.heroId] === wkKey) return;  // 今週もう発言済み
  // 平均 5〜6 週に 1 回ペースで発言する程度の確率 (= 0.03 / tick × 7 tick/週 ≈ 0.21)
  if (Math.random() < 0.03) {
    state.heroIdleSpokeAt[hero.heroId] = wkKey;
    pushHeroFlavor(hero.heroId, "idleBored");
  }
}

/** ─── Quest tick (Phase 1C-1) ───────────────────────────────────── */

function tickActiveQuest() {
  const aq = state.activeQuest;
  if (!aq) return;
  // Phase 1D-29 fix: 他のモーダルが開いている間は完了通知を保留
  //   (同 tick での mai 重複呼び出しによる pauseFlags 不整合を回避)
  if (state.pauseFlags > 0) return;
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
  // Phase 1D-15: クエスト成功時のみ SE (失敗時は無音)
  if (success) playSe("questSuccess");
  // Phase 1D-22: クエスト成功で 12% の確率で未取得シリーズレシピが手に入る
  //   (発火は result 画面が閉じた後に showRecipePopup 起動)
  state.pendingRecipeReason = (success && Math.random() < 0.12) ? "recipe.from.quest" : null;
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

/** Phase 1D-15: 指定ノード × 難易度で得られる素材の期待ドロップ数 (range)
 *  を計算する。
 *
 *  rollQuestRewards の生成モデル:
 *    - dropCount = 5 (= 5 戦闘)
 *    - hard なら 1〜2 個が highTier、それ以外は normal
 *    - normal slot は qty 1〜2、highTier slot は qty 1
 *
 *  各素材について [min, max] のドロップ数 range を返す。
 *
 *  @returns {Record<string, { min: number, max: number, rare: boolean }>}
 */
function expectedQuestRewardRanges(node, difficulty) {
  if (!node) return {};
  const dropCount = 5;
  const hasHigh = difficulty === "hard" && node.poolHighTier?.length > 0;
  const minHigh = hasHigh ? 1 : 0;
  const maxHigh = hasHigh ? 2 : 0;
  const out = {};
  // Normal pool 内の素材集合 (重複は 1 つにまとめる)
  const normalPool = node.poolNormal || [];
  const uniqueNormals = [...new Set(normalPool)];
  const normalMaxSlots = dropCount - minHigh;       // 正規スロット最大個数 (= high 最少時)
  const normalMinSlots = Math.max(0, dropCount - maxHigh); // 正規スロット最少個数 (= high 最多時)
  for (const mat of uniqueNormals) {
    const occurrences = normalPool.filter(m => m === mat).length;
    const probPerSlot = normalPool.length > 0 ? occurrences / normalPool.length : 0;
    if (uniqueNormals.length === 1) {
      // pool に 1 種類しか無い場合 → 全 normal slot がこの素材
      out[mat] = {
        min: normalMinSlots,             // 全 slot が qty 1
        max: normalMaxSlots * 2,         // 全 slot が qty 2
        rare: false,
      };
    } else {
      // 複数種類 → 期待値ベースで ±1 の range を見積もる
      const expected = (normalMinSlots + normalMaxSlots) / 2 * probPerSlot * 1.5;
      out[mat] = {
        min: Math.max(0, Math.floor(expected - 0.5)),
        max: Math.max(1, Math.ceil(expected + 0.5)),
        rare: false,
      };
    }
  }
  if (hasHigh) {
    const highPool = node.poolHighTier;
    const uniqueHighs = [...new Set(highPool)];
    for (const mat of uniqueHighs) {
      const occurrences = highPool.filter(m => m === mat).length;
      const probPerSlot = highPool.length > 0 ? occurrences / highPool.length : 0;
      if (uniqueHighs.length === 1) {
        out[mat] = { min: minHigh, max: maxHigh, rare: true };
      } else {
        const expected = (minHigh + maxHigh) / 2 * probPerSlot * 1;
        out[mat] = {
          min: Math.max(0, Math.floor(expected)),
          max: Math.max(1, Math.ceil(expected)),
          rare: true,
        };
      }
    }
  }
  return out;
}

/** range を「×N」または「×N〜M」形式に整形 */
function formatRewardRange(r) {
  if (!r) return "";
  if (r.min === r.max) return `×${r.min}`;
  return `×${r.min}〜${r.max}`;
}

function renderQuestView() {
  const lang = getLang() === "en" ? "en" : "ja";

  // 1. ノードカード — 背景画像 + 名前 + 素材アイコン + 選択/購入 ボタン
  // Phase 1D-12: state.questNodeType で 通常ノード / ランドノード を切替
  const isLandTab = state.questNodeType === "land";
  const nodeList = isLandTab ? LAND_NODES : NORMAL_NODES;
  const cardsHost = $("questNodeCards");
  if (cardsHost) cardsHost.classList.toggle("quest-node-cards--land", isLandTab);
  cardsHost.innerHTML = nodeList.map(n => {
    const sel = n.id === state.questPickedNodeId ? " quest-node-card--sel" : "";
    const bgPrefix = isLandTab ? "quest-land" : "quest-node";
    const bg = `./Image/Factory/${bgPrefix}-${n.id}.png`;
    const matIds = [];
    const seen = new Set();
    for (const id of (n.poolNormal || [])) {
      if (!seen.has(id)) { seen.add(id); matIds.push(id); }
    }
    for (const id of (n.poolHighTier || [])) {
      if (!seen.has(id)) { seen.add(id); matIds.push(id); }
    }
    const matsHtml = matIds.map(id => {
      const isRare = (n.poolHighTier || []).includes(id);
      return `<img class="quest-node-card__mat${isRare ? " quest-node-card__mat--rare" : ""}" src="${materialIcon(id)}" alt="${escapeHtml(materialName(id, lang))}" title="${escapeHtml(materialName(id, lang))}" onerror="this.style.opacity='0.2'" />`;
    }).join("");
    const displayName = `node : ${lang === "en" ? (n.nameEn || n.nameJa) : n.nameJa}`;
    // Phase 1D-12 land: pass を持っていなければ locked 状態でカード表示
    const locked = isLandTab && !state.landPasses.has(n.id);
    const lockedCls = locked ? " quest-node-card--locked" : "";
    // Phase 1D-16: ホームランド未設定なら「初回のみ 0 GUM で加入」、それ以降は従来の「500 GUM 購入」
    const isFirstLand = isLandTab && state.homeLand == null;
    const buyLabel = isFirstLand
      ? ti18n("quest.land.joinFreeBtn")
      : ti18n("quest.land.buyBtn").replace("{n}", LAND_PASS_COST.toLocaleString());
    const btnHtml = locked
      ? `<button type="button" class="quest-node-card__buy-btn${isFirstLand ? " quest-node-card__buy-btn--free" : ""}" data-buy-land="${n.id}">${escapeHtml(buyLabel)}</button>`
      : `<button type="button" class="quest-node-card__sel-btn" data-node="${n.id}">${escapeHtml(ti18n("quest.pickBtn"))}</button>`;
    return `<div class="quest-node-card${sel}${lockedCls}" data-node-card="${locked ? "" : n.id}">
      <div class="quest-node-card__bg" style="background-image:url('${bg}')"></div>
      <span class="quest-node-card__name">${escapeHtml(displayName)}</span>
      <div class="quest-node-card__mats">${matsHtml}</div>
      ${btnHtml}
    </div>`;
  }).join("");

  // 2-A. 詳細プレビュー (左)
  const node = NODE_BY_ID[state.questPickedNodeId];
  const team = state.questTeam.map(id => id == null ? null : findHero(id));
  const baseLv = QUEST_BASE_LEVEL[state.questPickedDifficulty];
  const teamLv = teamQuestLevel(team);
  const rate = node ? questSuccessRate(teamLv, baseLv) : -1;
  const commentKey = successRateCommentKey(rate);
  const isHard = state.questPickedDifficulty === "hard";
  const detailMatIds = [];
  if (node) {
    const seen2 = new Set();
    for (const id of (node.poolNormal || [])) {
      if (!seen2.has(id)) { seen2.add(id); detailMatIds.push(id); }
    }
    if (isHard) {
      for (const id of (node.poolHighTier || [])) {
        if (!seen2.has(id)) { seen2.add(id); detailMatIds.push(id); }
      }
    }
  }
  const diffLabel = QUEST_DIFFICULTY_LABEL[state.questPickedDifficulty][lang];
  const rateText = rate < 0 ? ti18n("quest.blocked") : (Math.round(rate * 100) + "%");
  const rateAttr  = rate < 0 ? "blocked" : Math.round(rate * 100);
  // Phase 1D-15: 期待ドロップ数 range を計算 (難易度ごとの reward 見込み)
  const expectedRanges = node ? expectedQuestRewardRanges(node, state.questPickedDifficulty) : {};
  $("questDetailPanel").innerHTML = node ? `
    <div class="quest-detail-panel__info">
      <div class="quest-detail-panel__head">
        <span class="quest-detail-panel__name">node : ${escapeHtml(lang === "en" ? (node.nameEn || node.nameJa) : node.nameJa)}</span>
        <span class="quest-detail-panel__diff">${escapeHtml(diffLabel)}</span>
      </div>
      <div class="quest-detail-panel__mats-label">${escapeHtml(ti18n("quest.detail.mats"))}</div>
      <div class="quest-detail-panel__mats">
        ${detailMatIds.map(id => {
          const isRare = (node.poolHighTier || []).includes(id);
          const range = expectedRanges[id];
          const qtyTxt = range ? formatRewardRange(range) : "";
          return `<div class="quest-detail-panel__mat${isRare ? " quest-detail-panel__mat--rare" : ""}">
            <img src="${materialIcon(id)}" alt="${escapeHtml(materialName(id, lang))}" onerror="this.style.opacity='0.2'" />
            <span class="quest-detail-panel__mat-name">${escapeHtml(materialName(id, lang))}</span>
            <span class="quest-detail-panel__mat-qty">${escapeHtml(qtyTxt)}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="quest-detail-panel__lv">${escapeHtml(ti18n("quest.detail.questLv"))}: <strong>${teamLv}</strong> / ${baseLv}</div>
      <div class="quest-detail-panel__rate">${escapeHtml(ti18n("quest.detail.rate"))}: <strong data-rate="${rateAttr}">${escapeHtml(rateText)}</strong></div>
    </div>
    <div class="quest-detail-panel__mai">
      <div class="quest-detail-panel__mai-head">
        <img src="./Image/Factory/MAI_SD.png" alt="マイ" />
        <span class="quest-detail-panel__mai-name">${escapeHtml(ti18n("mai.name"))}</span>
      </div>
      <p>${escapeHtml(ti18n(commentKey))}</p>
    </div>
  ` : `<p class="quest-detail-panel__empty">${escapeHtml(ti18n("quest.detail.empty"))}</p>`;

  // 2-B. 難易度行 (右)
  // Phase 1D-25: 工房レベルで難易度をゲート
  //   easy: Lv 1〜 / normal: Lv 2〜 / hard: Lv 3〜
  const DIFF_REQUIRED_LV = { easy: 1, normal: 2, hard: 3 };
  $("questDiffRows").innerHTML = ["easy", "normal", "hard"].map(d => {
    const sel = d === state.questPickedDifficulty ? " quest-diff-row__btn--sel" : "";
    const label = QUEST_DIFFICULTY_LABEL[d][lang];
    const baseLvD = QUEST_BASE_LEVEL[d];
    const weeksD  = QUEST_DURATION_WEEKS[d];
    const reqLv   = DIFF_REQUIRED_LV[d];
    const lvOk    = (state.factoryLevel || 1) >= reqLv;
    // 当該難易度で取れる素材
    const matsForD = [];
    if (node) {
      const seen3 = new Set();
      for (const id of (node.poolNormal || [])) { if (!seen3.has(id)) { seen3.add(id); matsForD.push({ id, rare: false }); } }
      if (d === "hard") {
        for (const id of (node.poolHighTier || [])) { if (!seen3.has(id)) { seen3.add(id); matsForD.push({ id, rare: true }); } }
      }
    }
    const matsHtml = matsForD.slice(0, 6).map(m => `<img class="${m.rare ? "quest-diff-row__mat--rare" : ""}" src="${materialIcon(m.id)}" alt="${escapeHtml(materialName(m.id, lang))}" title="${escapeHtml(materialName(m.id, lang))}" onerror="this.style.opacity='0.2'" />`).join("");
    const lockHtml = lvOk ? "" :
      `<span class="quest-diff-row__lock">${escapeHtml(ti18n("quest.lock.factoryLv").replace("{n}", reqLv))}</span>`;
    const disabledCls = lvOk ? "" : " quest-diff-row__btn--locked";
    return `<div class="quest-diff-row__btn${sel}${disabledCls}">
      <span class="quest-diff-row__diff-name">${escapeHtml(label)}</span>
      <span class="quest-diff-row__field"><span class="quest-diff-row__field-label">Quest Lv.</span><span class="quest-diff-row__field-val">${baseLvD.toLocaleString()}</span></span>
      <span class="quest-diff-row__field"><span class="quest-diff-row__field-label">Week</span><span class="quest-diff-row__field-val">${weeksD}週</span></span>
      <span class="quest-diff-row__mats">${matsHtml}</span>
      ${lockHtml}
      <button type="button" class="quest-diff-row__sel-btn" data-diff="${d}" ${lvOk ? "" : "disabled"}>${escapeHtml(ti18n("quest.pickBtn"))}</button>
    </div>`;
  }).join("");

  // 3. パーティ (3 枠) — クラフト編成と同じノリで heroes 一覧から pick
  $("questTeamSlots").innerHTML = state.questTeam.map((id, idx) => {
    if (id == null) return `<div class="quest-team__slot" data-slot="${idx}">+</div>`;
    const h = findHero(id);
    if (!h) return `<div class="quest-team__slot" data-slot="${idx}">?</div>`;
    return `<div class="quest-team__slot quest-team__slot--filled" data-slot="${idx}" title="${escapeHtml(tHero(h.heroId, h.nameJa))}">
      <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="quest-team__slot-name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
    </div>`;
  }).join("");

  // Phase 1D-11: ヒーロー候補リスト — クエストレベル + ⓘ + HP
  const eligible = state.ownedHeroes.slice().sort((a, b) => {
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
    const bd = heroQuestLevelBreakdown(h);
    // Phase 1D-29: クラフト編成 (craftTeam) に居るだけのヒーローは選択可能。
    //   実際にクラフト中 (h.state === CRAFTING) のヒーローのみ disabled として
    //   「クラフト中」バッジを表示。sale / hire 占有は従来どおり disabled。
    const lockedByOther = isHeroLocked(h.heroId, { ignoreQuestTeam: true, ignoreCraftTeam: true });
    const isCrafting = h.state === HERO_STATE.CRAFTING;
    const disabled = isCrafting || lockedByOther;
    const busyTag = isCrafting
      ? `<span class="quest-hero-pick__busy-tag">${escapeHtml(ti18n("hero.state.crafting", "クラフト中"))}</span>`
      : "";
    return `<button type="button" class="quest-hero-pick${inTeam ? " quest-hero-pick--in" : ""}" data-hero="${h.heroId}" ${disabled ? "disabled" : ""}>
      <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="quest-hero-pick__name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
      <span class="quest-hero-pick__ql-row">
        <span class="quest-hero-pick__ql">QL ${bd.ql}</span>
        <span class="quest-hero-pick__ql-info" data-ql-info="${h.heroId}" title="${escapeHtml(ti18n("quest.qlInfo.title"))}">i</span>
      </span>
      <span class="quest-hero-pick__hp">HP ${h.stamina.current}/${h.stamina.max}</span>
      ${busyTag}
    </button>`;
  }).join("");

  // 出発 ボタン enable/disable
  // Phase 1D-29: ランドノード未取得 (= 通行証なし) で出発できないようガード追加。
  //   従来は Ocean (= LAND_NODES[0]) がデフォルト選択で買わずに depart できた。
  const startBtn = $("questStartBtn");
  const isLandTab2 = state.questNodeType === "land";
  const noLandPass = isLandTab2 && !(state.landPasses instanceof Set
    ? state.landPasses.has(state.questPickedNodeId)
    : false);
  if (rate < 0 || state.questTeam.filter(x => x != null).length === 0 || noLandPass) {
    startBtn.disabled = true;
  } else {
    startBtn.disabled = false;
  }
}

/** Phase 1D-11: ヒーロークエストレベル内訳ポップアップ */
function openQlInfoModal(heroId) {
  const hero = findHero(heroId);
  if (!hero) return;
  const bd = heroQuestLevelBreakdown(hero);
  const name = tHero(hero.heroId, hero.nameJa);
  const body = $("qlInfoBody");
  if (!body) return;
  body.innerHTML = `
    <div class="ql-info-row"><span style="font-weight:700">${escapeHtml(name)}</span></div>
    <div class="ql-info-row">
      <span>${escapeHtml(ti18n("quest.qlInfo.base"))}</span>
      <strong>${bd.base}</strong>
    </div>
    <div class="ql-info-row">
      <span>${escapeHtml(ti18n("quest.qlInfo.hpRatio"))} (${bd.currentHp}/${bd.maxHp})</span>
      <strong>×${bd.hpRatioPct}%</strong>
    </div>
    <div class="ql-info-row">
      <span>${escapeHtml(ti18n("quest.qlInfo.noBoost"))} ${bd.hasNo ? "✓ 農" : "—"}</span>
      <strong>×${bd.noBoost.toFixed(1)}</strong>
    </div>
    <div class="ql-info-row ql-info-row--total">
      <span>${escapeHtml(ti18n("quest.qlInfo.total"))}</span>
      <strong>${bd.ql}</strong>
    </div>
  `;
  $("qlInfoModal")?.classList.remove("hidden");
  pauseTime();
}
function closeQlInfoModal() {
  $("qlInfoModal")?.classList.add("hidden");
  resumeTime();
}

/** Phase 1D-12: ランドセクター通行証を購入 (or 最初のランドは無料 home 設定)。
 *  - 既に home land 未設定なら、選択ランドを home land に (無料)
 *  - 既に home land あり → 500 GUM で通行証購入
 *  - GUM 不足の場合は Mai 通知 + 何もしない */
function buyLandPass(landId) {
  if (!landId || state.landPasses.has(landId)) return;
  const isFirst = state.homeLand == null;
  if (isFirst) {
    // 最初のランドは home land = 無料
    state.homeLand = landId;
    state.landPasses.add(landId);
    state.questPickedNodeId = landId;
    maiSays("quest.land.mai.firstHome", { onClose: () => {} });
    renderHeader();
    renderQuestView();
    return;
  }
  // Phase 1D-32: 赤字中は通行証も買えない
  if ((state.gum || 0) < 0) {
    maiSays("quest.land.mai.deficitNoBuy");
    return;
  }
  if (state.gum < LAND_PASS_COST) {
    maiSays("quest.land.mai.notEnoughGum");
    return;
  }
  state.gum -= LAND_PASS_COST;
  state.landPasses.add(landId);
  state.questPickedNodeId = landId;
  maiSays("quest.land.mai.bought", { onClose: () => {} });
  renderHeader();
  renderQuestView();
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
  // Phase 1D-29: ランドノードは通行証必須。
  //   button enable/disable とは独立した二重ガード (例: 直接呼ばれた場合の対策)。
  if (state.questNodeType === "land") {
    const hasPass = state.landPasses instanceof Set && state.landPasses.has(node.id);
    if (!hasPass) return;
  }
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
  // Phase 1D-19 → 1D-26: クエスト出発のセリフ ("いってくる！" 等)
  //   closeQuestView 後 + workshop 描画後にプッシュしないと sprite が
  //   存在せず flavor バブルが付かない可能性あり。次フレーム + ホーム遷移
  //   が確定してから時差で発火する。
  setTimeout(() => {
    renderWorkshop();  // 念のため再描画 (sprite 有無を確実にする)
    team.filter(id => id != null).forEach((id, i) => {
      setTimeout(() => {
        pushHeroFlavor(id, "questStart");
        renderWorkshop();
      }, i * 280);
    });
  }, 250);
}

/** ─── Quest progress overlay (top of workshop) ───────────────────── */
function renderQuestOverlay() {
  const host = $("questOverlay");
  if (!host) {
    if (typeof renderQuestCard === "function") renderQuestCard();
    return;
  }
  const aq = state.activeQuest;
  if (!aq) {
    host.classList.add("hidden");
    host.innerHTML = "";
    if (typeof renderQuestCard === "function") renderQuestCard();
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
  if (typeof renderQuestCard === "function") renderQuestCard();
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
  // Phase 1D-22: 結果画面 close 後にシリーズレシピ獲得を試行
  if (state.pendingRecipeReason) {
    const reason = state.pendingRecipeReason;
    state.pendingRecipeReason = null;
    setTimeout(() => acquireRandomSeriesRecipe(reason), 350);
  }
}

/** クラフト値獲得時の浮上 +N (CSS animation 経由で 1 秒後に消える)。
 *  Phase 1D-12: slotIdx ではなく heroId をキーに使う (workshop が ownedHeroes
 *  全員を表示するようになり、slot 番号と sprite の対応が変わったため)。 */
function pushSpriteFloat(heroId, element, value) {
  const id = ++_floatId;
  state.spriteFloats.push({ id, heroId, element, value, createdTick: state.tickCount });
}
let _floatId = 0;

/** Phase 1D-19: ヒーローのフレーバーセリフを sprite 左上に表示する。
 *  シーンキー (= craftStart / questStart / saleStart / restingZero / idleBored
 *   / passive) からランダム抽選し、~2 秒で fade out する一時バブル。
 *
 *  @param {number} heroId
 *  @param {string} sceneKey  factory-hero-flavors.js の HERO_FLAVOR_LINES key
 *  @param {{ name?: string }} [extra]  passive 用の skill 名注入など
 */
function pushHeroFlavor(heroId, sceneKey, extra = {}) {
  const lang = getLang() === "en" ? "en" : "ja";
  const text = pickHeroFlavor(sceneKey, lang, extra);
  if (!text) return;
  const id = ++_flavorId;
  state.heroFlavors.push({ id, heroId, text, createdTick: state.tickCount });
}
let _flavorId = 0;

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
  // Phase 1D-14: パッシブ発動 SE
  playSe("passiveTrigger");
  // Phase 1D-19: ヒーロー sprite 左上に「[スキル名]！」セリフ
  pushHeroFlavor(hero.heroId, "passive", { name: passive.passiveName });
}
let _notifId = 0;

/** 古い通知 / 浮上値を捨てる */
function pruneEphemerals() {
  const cutoff = state.tickCount - NOTIFICATION_TTL_TICKS;
  state.notifications = state.notifications.filter(n => n.createdTick > cutoff);
  state.spriteFloats  = state.spriteFloats.filter(f => f.createdTick > cutoff);
  // Phase 1D-19: フレーバーセリフは ~2.5 秒で消えるので寿命短め
  // Phase 1D-26: 高速モードでも flavor バブルが消えにくいよう TTL を 3 → 6 に延長
  const flavorCutoff = state.tickCount - 6;
  state.heroFlavors = state.heroFlavors.filter(f => f.createdTick > flavorCutoff);
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
    // Phase 1D-32: 月初め (week=1 になった瞬間) に受注クラフトを再生成
    maybeRegenerateCommissions();
  }
  // Phase 1D-26: 10 年エンディング (2028年11月4週 終了 = 2028/12/1 直前)
  //   ランキング集計の締切。 集計画面 → 引き続きプレイ可能
  if (!state.endgameTriggered10y &&
      state.year === 2028 && state.month === 12 && state.week === 1) {
    state.endgameTriggered10y = true;
    setTimeout(triggerEndgame10y, 200);
  }
  // Phase 1D-26: 50 年エンディング (2068年12月4週 終了)。完全終局のレポート。
  if (!state.endgameTriggered50y &&
      state.year === 2069 && state.month === 1 && state.week === 1) {
    state.endgameTriggered50y = true;
    setTimeout(triggerEndgame50y, 200);
  }
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
  if (gumEl) {
    gumEl.textContent = state.gum.toLocaleString();
    // Phase 1D-32: 赤字 (gum < 0) は赤字表示クラスをトグル
    gumEl.classList.toggle("factory-gum--deficit", (state.gum || 0) < 0);
  }
  const gauge = $("weekGaugeFill");
  if (gauge) {
    const pct = (state.weekProgress / SECONDS_PER_WEEK) * 100;
    gauge.setAttribute("stroke-dasharray", `${pct.toFixed(2)} 100`);
  }
  // Phase 1D-10 (改): 工房レベル = ファクトリーレベル (state.factoryLevel)
  // ※ 旧: 全ヒーロー craftLevel 合計を表示していたが、本来の意味と乖離するため
  //   ファクトリーレベルの整数 (1〜5) を表示するよう変更。
  const lvEl = $("factoryLvText");
  if (lvEl) {
    lvEl.textContent = ti18n("header.factoryLv").replace("{n}", String(state.factoryLevel));
  }
  // Phase 1D-23: 目標バナー (workshop 上部) も連動更新
  if (typeof renderHomeGoalBanner === "function") renderHomeGoalBanner();
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

/** Phase 1D-24: ヒーローが現在「他作業」に占有されているかを判定する。
 *  クラフトチーム / クエストチーム / アクティブセール の seller / アクティブ
 *  雇用の recruiter のいずれかに既に割当済みなら true を返す。
 *
 *  @param {number} heroId
 *  @param {{ ignoreCraftTeam?: boolean, ignoreQuestTeam?: boolean,
 *           ignoreSale?: boolean, ignoreHire?: boolean }} [opts]
 */
function isHeroLocked(heroId, opts = {}) {
  if (heroId == null) return false;
  if (!opts.ignoreCraftTeam && Array.isArray(state.craftTeam) && state.craftTeam.includes(heroId)) return true;
  if (!opts.ignoreQuestTeam && Array.isArray(state.questTeam) && state.questTeam.includes(heroId)) return true;
  if (!opts.ignoreSale && Array.isArray(state.activeSales)
      && state.activeSales.some(s => s.sellerId === heroId)) return true;
  if (!opts.ignoreHire && state.activeHire && state.activeHire.recruiterId === heroId) return true;
  return false;
}

/** Phase 1D-27: factory-weighted な要素値で sort (= 表示と同じ尺度) */
function _elemDescSort(key) {
  return (a, b) => elementValueForCraft(b, key) - elementValueForCraft(a, key);
}

/** Phase 1D-27: 体力満タン想定のクエストレベル (= heroQuestLevelBreakdown.ql の HP=100% 相当) */
function _heroQuestLvFullHp(hero) {
  if (!hero || !hero.element) return 0;
  const e = hero.element;
  const sum = (e.garuda || 0) * GARUDA_WEIGHT_FOR_SORT + (e.ifrit || 0) + (e.leviathan || 0) + (e.tiamat || 0);
  const noBoost = Array.isArray(hero.attributes) && hero.attributes.includes("no") ? 1.5 : 1.0;
  const rMult = 1 + 0.4 * Math.max(0, Math.min(5, hero.rank || 0));
  return Math.round(sum * noBoost * rMult);
}
const GARUDA_WEIGHT_FOR_SORT = 1 / 6;

function sortedHeroesForList() {
  const arr = state.ownedHeroes.slice();
  // Phase 1D-27: rarity フィルタ
  let filtered = arr;
  if (state.heroFilterRarity && state.heroFilterRarity !== "all") {
    filtered = arr.filter(h => (h.rarity || "common") === state.heroFilterRarity);
  }
  switch (state.heroSort) {
    case "garuda":    return filtered.slice().sort(_elemDescSort("garuda"));
    case "ifrit":     return filtered.slice().sort(_elemDescSort("ifrit"));
    case "leviathan": return filtered.slice().sort(_elemDescSort("leviathan"));
    case "tiamat":    return filtered.slice().sort(_elemDescSort("tiamat"));
    case "ql-desc":   return filtered.slice().sort((a, b) => _heroQuestLvFullHp(b) - _heroQuestLvFullHp(a));
    case "rarity": {
      const rk = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1, normal: 0 };
      return filtered.slice().sort((a, b) => (rk[b.rarity] ?? 0) - (rk[a.rarity] ?? 0));
    }
    case "cl-desc":
    default:
      return filtered.slice().sort((a, b) => craftLevel(b) - craftLevel(a));
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

/** ─── Phase 1D-14: 士/農/工/商 適性別パッシブテキスト ─────────────
 *
 *  ヒーローの primary attribute を見て、3 種類のパッシブを
 *  決定論的に割り当てる:
 *
 *   工 (ko)  → クラフトパワー特定要素を + に。要素はヒーロー最強要素
 *               (factory-weighted) で固定、ボーナス値は rarity に比例
 *   農 (no)  → クエストの素材ドロップ強化。素材は heroId から
 *               決定論的に選ぶ
 *   商 (sho) → マーケットの 3 種特典 (期間短縮 / 金額アップ /
 *               低品質高売り) のうち 1 つ
 *   士 (shi) → デュエルが将来実装される旨の placeholder
 *
 *  実数値は表示用 (description のみ)。実ゲーム反映は Phase 1D-15+ で別途。 */

const PASSIVE_BONUS_BY_RARITY = {
  common: 3, uncommon: 4, rare: 5, epic: 6, legendary: 8,
};
/** "農" パッシブ用の素材プール。heroId から決定論的に 1 つ選ぶ。 */
const FARM_MATERIAL_POOL = [
  "iron", "copper", "zinc",
  "chromium", "titanium", "tungsten",
  "aquamarine", "rhodochrosite", "topaz", "peridot", "onyx",
  "amethyst", "jade", "lapis", "garnet",
];
/** "商" パッシブ用 3 種ボーナスの ID。0,1,2 を heroId % 3 で振る。 */
const MERCHANT_BONUS_KEYS = ["periodShort", "priceUp", "lowTierBoost"];

/** 文脈付きの primary 属性を返す (= attributes[0])。 */
function primaryAttrOf(hero) {
  return Array.isArray(hero?.attributes) && hero.attributes.length > 0
    ? hero.attributes[0]
    : null;
}

/** Phase 1D-25: ヒーロー固有のパッシブ説明を「複数行 (HTML)」で返す。
 *  ・全ヒーロー共通: クラフト時の最強要素 +N (= rollPassiveTrigger 相当)
 *  ・属性別: 工/農/商/士 の追加効果
 *  各行は HTML を含む (ガルーダ等の元素名を span.term-elem で色付け)。
 *
 *  @param {object} hero
 *  @param {"ja"|"en"} lang
 *  @returns {string[]} HTML 文字列の配列 (各要素 = 1 行)
 */
function passiveDescriptionLinesFor(hero, lang) {
  const lines = [];
  const isEn = lang === "en";
  const bonus = PASSIVE_BONUS_BY_RARITY[hero?.rarity] || 3;
  // 1. クラフト共通: 最強要素 +N
  if (hero) {
    const sorted = ELEMENTS.map(k => ({ key: k, val: elementValueForCraft(hero, k) }))
      .sort((a, b) => b.val - a.val);
    const top = sorted[0];
    if (top && top.val > 0) {
      const elHtml = colorTermElement(top.key, lang);
      lines.push(isEn
        ? `Craft: <strong>${elHtml}</strong> +${bonus}`
        : `クラフト時に${elHtml} <strong>+${bonus}</strong>`);
    }
  }
  // 2. 属性別 追加効果
  for (const attr of (hero?.attributes || [])) {
    if (attr === "ko") continue;  // 工 = クラフト系 (上の craft 共通で代替)
    if (attr === "no") {
      const id = (typeof hero.heroId === "number" ? hero.heroId : 0) | 0;
      const matId = FARM_MATERIAL_POOL[Math.abs(id) % FARM_MATERIAL_POOL.length];
      const matName = materialName(matId, lang);
      lines.push(isEn
        ? `Quest: <strong>${escapeHtml(matName)}</strong> drops more often`
        : `クエストで<strong>${escapeHtml(matName)}</strong>が掘りやすい`);
    } else if (attr === "sho") {
      const id = (typeof hero.heroId === "number" ? hero.heroId : 0) | 0;
      const key = MERCHANT_BONUS_KEYS[Math.abs(id) % MERCHANT_BONUS_KEYS.length];
      if (key === "periodShort") {
        lines.push(isEn ? "Market: faster sales" : "マーケットで成約までの期間が短くなる");
      } else if (key === "priceUp") {
        lines.push(isEn ? "Market: higher sale prices" : "マーケットで成約金額が上がる");
      } else {
        lines.push(isEn ? "Market: low-tier still fetches good prices" : "査定が低いエクステンションも高めに売れる");
      }
    } else if (attr === "shi") {
      lines.push(isEn ? "Duel: built for combat (TBA)" : "デュエルで活躍 (将来実装予定)");
    }
  }
  return lines;
}

/** Phase 1D-25: 元素名 (ガルーダ/イフリート/リヴァイアサン/ティアマト) を
 *  対応する色 + 太字の HTML span に変換 */
function colorTermElement(elKey, lang) {
  const name = elementLabel(elKey);
  return `<span class="term-elem term-elem--${elKey}">${escapeHtml(name)}</span>`;
}

/** 後方互換: 単一行版 (legacy 呼び出し)。最初の 1 行を text として返す。 */
function passiveDescriptionFor(hero, lang) {
  const lines = passiveDescriptionLinesFor(hero, lang);
  if (lines.length === 0) return "";
  // HTML タグを除去した plain text を返す (legacy textContent 用途のため)
  return lines[0].replace(/<[^>]+>/g, "");
}

/** Phase 1D-25: パッシブ説明 (HTML 配列) → <ul> HTML 文字列 */
function passiveDescriptionsHtml(hero, lang) {
  const lines = passiveDescriptionLinesFor(hero, lang);
  if (lines.length === 0) return "";
  return `<ul class="passive-lines">${lines.map(l => `<li>${l}</li>`).join("")}</ul>`;
}

/** Phase 1D-27: モード別フィルタ付きの passive 描画。
 *  mode = "craft" → クラフト共通行 (= 先頭) のみ
 *  mode = "quest" → 農属性行 (= "クエストで…が掘りやすい") のみ
 *  mode = "market" → 商属性行
 *  mode = "duel" → 士属性行
 *  mode = "all" or undef → 全部 */
function passiveDescriptionsHtmlByMode(hero, lang, mode) {
  const lines = passiveDescriptionLinesFor(hero, lang);
  if (lines.length === 0) return "";
  let filtered;
  if (mode === "craft")  filtered = lines.filter(l => /クラフト時|Craft:/.test(l));
  else if (mode === "quest")  filtered = lines.filter(l => /クエストで|Quest:/.test(l));
  else if (mode === "market") filtered = lines.filter(l => /マーケット|Market:/.test(l));
  else if (mode === "duel")   filtered = lines.filter(l => /デュエル|Duel:/.test(l));
  else filtered = lines;
  if (filtered.length === 0) return "";
  return `<ul class="passive-lines">${filtered.map(l => `<li>${l}</li>`).join("")}</ul>`;
}

// 旧 passiveDescriptionFor の attribute 別分岐は廃止 (上の lines 版に統合)。
// 互換用のスタブとして primary 取得関数だけ残す。
function _passiveDescriptionForLegacyDeleted_(hero, lang) {
  return ""; // 削除済み
  /*
  const isEn = lang === "en";
  const primary = primaryAttrOf(hero);
  if (!primary) return "";
  const bonus = PASSIVE_BONUS_BY_RARITY[hero.rarity] || 3;

  if (primary === "ko") {
    const sorted = ELEMENTS.map(k => ({ key: k, val: elementValueForCraft(hero, k) })).sort((a, b) => b.val - a.val);
    const top = sorted[0];
    if (!top || top.val <= 0) return isEn ? `Boosts craft power by +${bonus}` : `クラフト時にクラフトパワーを +${bonus}`;
    return isEn ? `Boosts ${elementLabel(top.key)} by +${bonus}` : `クラフト時に${elementLabel(top.key)}を +${bonus}`;
  }
  */

  return "";
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
  // Phase 1D-27: レアリティフィルタ chips を都度更新
  renderHeroRarityFilter();
  const host = $("heroList");
  if (!host) return;
  const heroes = sortedHeroesForList();
  if (heroes.length === 0) {
    host.innerHTML = `<p class="hero-list-empty">${escapeHtml(ti18n("hero.list.empty"))}</p>`;
    return;
  }
  // Phase 1D-12: 現在のタブに対応するチームで配属チェック
  const activeTeam = state.heroTeamTab === "quest" ? state.questTeam : state.craftTeam;
  const inTeam = new Set(activeTeam.filter(id => id != null));
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
    // Phase 1D-14 → Phase 1D-27: タブに応じてパッシブをフィルタ
    const tabMode = state.heroTeamTab === "quest" ? "quest" : "craft";
    const passiveLinesHtml = passiveDescriptionsHtmlByMode(hero, getLang() === "en" ? "en" : "ja", tabMode);
    const passiveBadge = hero.passiveName
      ? `<span class="hero-card__passive-name">${escapeHtml(hero.passiveName)}</span>`
      : "";
    const passiveLine = (passiveBadge || passiveLinesHtml)
      ? `<div class="hero-card__passive">${passiveBadge}${passiveLinesHtml}</div>`
      : "";
    // Phase 1D-20: ランク表示 (☆/★)
    const rankHtml = renderRankStars(hero.rank || 0);
    // Phase 1D-27: タブに応じて表示する Lv (Craft Lv ↔ Quest Lv) を切替
    const showQuestLv = state.heroTeamTab === "quest";
    const lvLabel = showQuestLv ? ti18n("quest.detail.questLv", "Quest Lv") : ti18n("hero.craftLevel");
    const lvVal   = showQuestLv ? _heroQuestLvFullHp(hero) : cl;
    return `<div class="${cardCls}" data-hero-id="${hero.heroId}" data-rarity="${hero.rarity}" data-assigned="${assigned ? "1" : "0"}">
      <div class="hero-card__head">
        <img class="hero-card__portrait" src="${portrait}" alt="" onerror="this.style.opacity='0.2'" />
        <div class="hero-card__head-info">
          <div class="hero-card__name-row">
            <span class="hero-card__name">${escapeHtml(name)}</span>
            ${renderHeroAttrBadges(hero)}
          </div>
          <div class="hero-card__rank">${rankHtml}</div>
          <div class="hero-card__state" data-state="${hero.state}">${escapeHtml(stateLbl)}</div>
        </div>
        ${restBtn}
      </div>
      <div class="hero-card__elements">${elementsHtml}</div>
      <div class="hero-card__stamina" title="${escapeHtml(ti18n("hero.stamina"))}: ${hero.stamina.current}/${hero.stamina.max}">
        <div class="hero-card__stamina-fill" style="width:${stamPct.toFixed(1)}%"></div>
      </div>
      <div class="hero-card__cl">${escapeHtml(lvLabel)}: <strong>${lvVal.toLocaleString()}</strong></div>
      ${passiveLine}
    </div>`;
  }).join("");
}

function openHeroView() {
  pauseTime();
  $("heroView")?.classList.remove("hidden");
  setHeroTeamTab(state.heroTeamTab || "craft");
  renderHeroTeam();
  renderQuestTeamPanel();
  renderHeroList();
  // Phase 1D-5: 初回ヒーロー画面でクラフトチーム編成の解説
  runTutorialOnce("heroTeam");
}

/** Phase 1D-20: 強化 view を開く */
function openHeroEnhanceView() {
  pauseTime();
  $("heroEnhanceView")?.classList.remove("hidden");
  renderHeroEnhanceList();
}
function closeHeroEnhanceView() {
  $("heroEnhanceView")?.classList.add("hidden");
  resumeTime();
}

/** Phase 1D-23: 体力満タン (= ratio 1) を仮定した hero の Lv 計算ヘルパー */
function _heroFullHpProjected(hero, rankOverride = null) {
  const rank = rankOverride == null ? (hero.rank || 0) : rankOverride;
  const rMult = 1 + 0.4 * Math.max(0, Math.min(RANK_MAX, rank));
  // 4 元素値 (ガルーダ重み込み + ランク倍率)
  const e = hero.element || {};
  const garudaW = Math.round((e.garuda || 0) * (1 / 6) * rMult);
  const ifrit   = Math.round((e.ifrit   || 0) * rMult);
  const lev     = Math.round((e.leviathan || 0) * rMult);
  const tia     = Math.round((e.tiamat  || 0) * rMult);
  const sum = garudaW + ifrit + lev + tia;
  const hasKo  = Array.isArray(hero.attributes) && hero.attributes.includes("ko");
  const hasNo  = Array.isArray(hero.attributes) && hero.attributes.includes("no");
  const hasSho = Array.isArray(hero.attributes) && hero.attributes.includes("sho");
  return {
    elements: { garuda: garudaW, ifrit, leviathan: lev, tiamat: tia },
    sum,
    craftLv:    Math.round(sum * (hasKo  ? 1.5 : 1.0)),
    questLv:    Math.round(sum * (hasNo  ? 1.5 : 1.0)),
    merchantLv: Math.round(sum * (hasSho ? 1.5 : 1.0)),
  };
}

/** Phase 1D-20: ヒーロー強化リストを描画
 *  Phase 1D-23: before/after の元素値 + Craft/Quest/Market Lv を併記 */
function renderHeroEnhanceList() {
  const host = $("heroEnhanceList");
  if (!host) return;
  const lang = getLang() === "en" ? "en" : "ja";
  const heroes = (state.ownedHeroes || []).slice().sort((a, b) => {
    if ((b.rank || 0) !== (a.rank || 0)) return (b.rank || 0) - (a.rank || 0);
    return craftLevel(b) - craftLevel(a);
  });
  host.innerHTML = heroes.map(hero => {
    const name = tHero(hero.heroId, hero.nameJa);
    const rank = hero.rank || 0;
    const isMax = rank >= RANK_MAX;
    const cost = isMax ? 0 : rankUpCost(hero);
    const insufficientGum = !isMax && (state.gum || 0) < cost;
    const starsHtml = renderRankStars(rank);

    // 現ランク (Before)
    const cur = _heroFullHpProjected(hero, rank);
    // 次ランク (After) — MAX 時は表示なし
    const nxt = isMax ? null : _heroFullHpProjected(hero, rank + 1);

    /** 値の比較表示: "120 → 150" (緑) */
    const cmp = (curV, nxtV) => nxt
      ? `<span class="ench-cmp"><span class="ench-cmp__cur">${curV.toLocaleString()}</span><span class="ench-cmp__arrow">→</span><span class="ench-cmp__nxt">${nxtV.toLocaleString()}</span></span>`
      : `<span class="ench-cmp"><span class="ench-cmp__cur ench-cmp__cur--max">${curV.toLocaleString()}</span></span>`;

    const elemRows = ELEMENTS.map(k => `
      <div class="ench-row">
        <img class="ench-row__icon" src="${elementIconUrl(k)}" alt="${escapeHtml(elementLabel(k))}" />
        <span class="ench-row__label">${escapeHtml(elementLabel(k))}</span>
        ${cmp(cur.elements[k], nxt ? nxt.elements[k] : 0)}
      </div>
    `).join("");
    // 適性別 Lv 行
    const lvRows = `
      <div class="ench-row ench-row--lv"><span class="ench-row__label" data-i18n="enhance.craftLv">${escapeHtml(ti18n("enhance.craftLv", "クラフトLv"))}</span>${cmp(cur.craftLv, nxt ? nxt.craftLv : 0)}</div>
      <div class="ench-row ench-row--lv"><span class="ench-row__label" data-i18n="enhance.questLv">${escapeHtml(ti18n("enhance.questLv", "クエストLv"))}</span>${cmp(cur.questLv, nxt ? nxt.questLv : 0)}</div>
      <div class="ench-row ench-row--lv"><span class="ench-row__label" data-i18n="enhance.merchantLv">${escapeHtml(ti18n("enhance.merchantLv", "マーチャントLv"))}</span>${cmp(cur.merchantLv, nxt ? nxt.merchantLv : 0)}</div>
    `;
    const btnHtml = isMax
      ? `<div class="hero-enhance-row__max">${escapeHtml(ti18n("enhance.maxRank"))}</div>`
      : `<button type="button" class="hero-enhance-row__btn" data-enhance-hero="${hero.heroId}" ${insufficientGum ? "disabled" : ""}>
          ${escapeHtml(ti18n("enhance.rankUpBtn")
            .replace("{rank}", rank).replace("{next}", rank + 1).replace("{gum}", cost.toLocaleString()))}
        </button>`;
    return `<div class="hero-enhance-row" data-rarity="${hero.rarity}">
      <img class="hero-enhance-row__portrait" src="${hero.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <div class="hero-enhance-row__main">
        <span class="hero-enhance-row__name">${escapeHtml(name)}</span>
        <div class="hero-enhance-row__rank-line">${starsHtml}</div>
        <div class="ench-detail">
          ${elemRows}
          <div class="ench-divider"></div>
          ${lvRows}
        </div>
      </div>
      ${btnHtml}
    </div>`;
  }).join("");
}

/** ランクスター表示 (右から塗りつぶし: ☆☆☆☆☆ → ☆☆☆☆★ → ★★★★★) */
function renderRankStars(rank) {
  const filled = Math.max(0, Math.min(RANK_MAX, rank || 0));
  const empty = RANK_MAX - filled;
  return `<span class="hero-rank">${"☆".repeat(empty)}<span class="hero-rank__filled">${"★".repeat(filled)}</span></span>`;
}

/** Phase 1D-20: ヒーローのランクを 1 段階アップ */
function rankUpHero(heroId) {
  const hero = findHero(heroId);
  if (!hero) return;
  const cur = hero.rank || 0;
  if (cur >= RANK_MAX) return;
  // Phase 1D-32: 赤字中はランクアップ不可
  if ((state.gum || 0) < 0) {
    maiSays("enhance.deficitNoRankUp");
    return;
  }
  const cost = rankUpCost(hero);
  if ((state.gum || 0) < cost) {
    maiSays("enhance.notEnoughGum");
    return;
  }
  state.gum -= cost;
  hero.rank = cur + 1;
  // ガルーダ (= stamina max) もランク連動で再計算 → 体力上限が伸びる感を出す
  // (current は割合保持) — オプション: rank 反映を体力 max にも適用
  // → ここでは element の garuda は不変、表示用 elementValueForCraft で
  //   rank 倍率かけるのみ。stamina max は MCH 由来のまま据え置き。
  renderHeader();
  renderHeroEnhanceList();
  // Phase 1D-23: ランクアップ専用 SE (mission.mp3)
  playSe("rankUpDone");
  pushHeroFlavor(hero.heroId, "passive", { name: `Rank ${hero.rank}` });
  // Phase 1D-22: ランクアップでレシピ獲得チャンス
  //   Rank 3 達成は確定 1 件、Rank 5 達成も確定 1 件、それ以外は 25% で抽選
  const newRank = hero.rank;
  let chance = 0.25;
  if (newRank === 3 || newRank === 5) chance = 1.0;
  if (Math.random() < chance) {
    setTimeout(() => acquireRandomSeriesRecipe("recipe.from.rankUp"), 500);
  }
}

/** Phase 1D-12: 編成 view のタブ切替 (craft / quest) */
function setHeroTeamTab(tab) {
  state.heroTeamTab = tab;
  document.querySelectorAll(".hero-team-tab").forEach(btn => {
    btn.classList.toggle("hero-team-tab--active",
      btn.getAttribute("data-team-tab") === tab);
  });
  document.querySelectorAll("[data-team-body]").forEach(el => {
    el.classList.toggle("hidden", el.getAttribute("data-team-body") !== tab);
  });
  // Phase 1D-27: タブ切替時にデフォルト sort を切替
  //   craft → クラフトLv (高い順) / quest → クエストLv (高い順)
  if (tab === "quest") {
    state.heroSort = "ql-desc";
  } else {
    if (state.heroSort === "ql-desc") state.heroSort = "cl-desc";
  }
  // sort セレクトの選択状態と表示項目を切替
  refreshHeroSortSelect();
  renderHeroList();
}

/** Phase 1D-27: レアリティフィルタ chips (All / Common / ... / Legendary) を描画。
 *  各 chip にレアリティ別の所持人数を表示。クリックで filter を切替。 */
function renderHeroRarityFilter() {
  const host = $("heroRarityFilter");
  if (!host) return;
  const counts = { all: 0, common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (const h of state.ownedHeroes || []) {
    counts.all++;
    counts[h.rarity || "common"] = (counts[h.rarity || "common"] || 0) + 1;
  }
  const cur = state.heroFilterRarity || "all";
  const lang = getLang() === "en" ? "en" : "ja";
  const allLabel = lang === "en" ? "All" : "全部";
  const chips = [
    { key: "all",       label: allLabel },
    { key: "common",    label: ti18n("rarity.common") },
    { key: "uncommon",  label: ti18n("rarity.uncommon") },
    { key: "rare",      label: ti18n("rarity.rare") },
    { key: "epic",      label: ti18n("rarity.epic") },
    { key: "legendary", label: ti18n("rarity.legendary") },
  ];
  host.innerHTML = chips.map(c => {
    const sel = c.key === cur ? " hero-filter__chip--active" : "";
    const dim = (c.key !== "all" && counts[c.key] === 0) ? " hero-filter__chip--zero" : "";
    return `<button type="button" class="hero-filter__chip${sel}${dim}" data-rarity-filter="${c.key}" data-rarity="${c.key}">
      <span class="hero-filter__chip-label">${escapeHtml(c.label)}</span>
      <span class="hero-filter__chip-count">${counts[c.key] || 0}</span>
    </button>`;
  }).join("");
}

/** Phase 1D-27: ソート select のオプションを現タブに応じて更新 */
function refreshHeroSortSelect() {
  const sel = $("heroSortSel");
  if (!sel) return;
  const tab = state.heroTeamTab || "craft";
  const lang = getLang() === "en" ? "en" : "ja";
  // Craft タブ: cl-desc / garuda / ifrit / leviathan / tiamat / rarity
  // Quest タブ: ql-desc / rarity (シンプルに)
  const optsCraft = [
    { value: "cl-desc",   label: ti18n("hero.sort.clDesc", "クラフトLv (高い順)") },
    { value: "ql-desc",   label: ti18n("hero.sort.qlDesc", "クエストLv (高い順)") },
    { value: "garuda",    label: ti18n("hero.sort.garuda") },
    { value: "ifrit",     label: ti18n("hero.sort.ifrit") },
    { value: "leviathan", label: ti18n("hero.sort.leviathan") },
    { value: "tiamat",    label: ti18n("hero.sort.tiamat") },
    { value: "rarity",    label: ti18n("hero.sort.rarity") },
  ];
  const optsQuest = [
    { value: "ql-desc",   label: ti18n("hero.sort.qlDesc", "クエストLv (高い順)") },
    { value: "cl-desc",   label: ti18n("hero.sort.clDesc", "クラフトLv (高い順)") },
    { value: "rarity",    label: ti18n("hero.sort.rarity") },
  ];
  const opts = tab === "quest" ? optsQuest : optsCraft;
  sel.innerHTML = opts.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("");
  sel.value = state.heroSort;
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

/** ─── Hero card click → toggle team membership ──
 *  Phase 1D-12: クラフトチーム / クエストチーム タブ切替対応。
 *  どちらか一方にしか入れない (mutually exclusive)。 */
function onHeroCardClick(heroId) {
  const tab = state.heroTeamTab || "craft";
  const team = tab === "quest" ? state.questTeam : state.craftTeam;
  const otherTeam = tab === "quest" ? state.craftTeam : state.questTeam;
  const idx = team.indexOf(heroId);
  if (idx >= 0) {
    // 既に居る → 外す
    team[idx] = null;
  } else {
    // Phase 1D-24: 他作業 (sale 担当 / hire recruiter / クラフト中 / クエスト中)
    //   占有のヒーローは編成不可 → Mai 通知して中断
    const hero = findHero(heroId);
    if (hero && (hero.state === HERO_STATE.CRAFTING || hero.state === HERO_STATE.QUESTING)) {
      maiSays("hero.lock.busy");
      return;
    }
    if (isHeroLocked(heroId, { ignoreCraftTeam: true, ignoreQuestTeam: true })) {
      maiSays("hero.lock.busy");
      return;
    }
    // mutually exclusive: 反対チームに居れば外しておく
    const otherIdx = otherTeam.indexOf(heroId);
    if (otherIdx >= 0) otherTeam[otherIdx] = null;
    // 空きスロットを探す
    const empty = team.indexOf(null);
    if (empty < 0) return;
    team[empty] = heroId;
  }
  renderHeroTeam();
  renderQuestTeamPanel();
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

/** Phase 1D-12: hero view のクエストチームスロットを描画 (3 枠) */
function renderQuestTeamPanel() {
  const host = $("heroQuestTeamSlots");
  if (!host) return;
  host.innerHTML = state.questTeam.map((heroId, idx) => {
    if (heroId == null) {
      return `<div class="hero-team__slot" data-quest-slot="${idx}" title="${escapeHtml(ti18n("hero.team.empty"))}">+</div>`;
    }
    const hero = findHero(heroId);
    if (!hero) return `<div class="hero-team__slot" data-quest-slot="${idx}">?</div>`;
    const name = tHero(hero.heroId, hero.nameJa);
    return `<div class="hero-team__slot hero-team__slot--filled" data-quest-slot="${idx}" title="${escapeHtml(name)}">
      <img src="${hero.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="hero-team__slot-name">${escapeHtml(name)}</span>
    </div>`;
  }).join("");
  // 合計クエストレベル (HP 比率込み + 農 boost)
  const totalEl = $("heroQuestTeamTotal");
  if (totalEl) {
    const total = state.questTeam.reduce((s, id) => {
      if (id == null) return s;
      const h = findHero(id);
      if (!h) return s;
      return s + heroQuestLevelBreakdown(h).ql;
    }, 0);
    totalEl.textContent = `${ti18n("hero.craftLevel").replace("クラフトLV","クエストLv") } : ${total.toLocaleString()}`;
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
  // Phase 1D-22: 「シリーズ解放済み + 工房 Lv 上限以下の rarity」を全件返す。
  // (関数名は legacy だが「現在クラフトできる ext 全件」の意味で使い続ける)
  return EXTENSIONS.filter(e => isExtUnlocked(e, state.unlockedSeries, state.factoryLevel));
}

/** Phase 1D-22: シリーズレシピを獲得する。
 *  - 既に所持していたら no-op で false を返す
 *  - 新規取得時は state.unlockedSeries に add + ポップアップ + SE 再生
 *
 *  @param {string} seriesName 例: "ブレード"
 *  @param {string} [reasonKey] i18n キー (e.g. "recipe.from.quest")
 *  @returns {boolean} 新規取得したか
 */
function acquireSeriesRecipe(seriesName, reasonKey = null) {
  if (!seriesName) return false;
  if (state.unlockedSeries.has(seriesName)) return false;
  state.unlockedSeries.add(seriesName);
  // 該当シリーズに含まれる ext のうち現工房 Lv で許可される Common 例 (= 通常表示するアイコン)
  const sample = EXTENSIONS.find(e => e.series === seriesName && rarityAllowedAtFactoryLevel(e.rarity, state.factoryLevel));
  showRecipePopup(seriesName, sample, reasonKey);
  playSe("recipeAcquire");
  return true;
}

/** ランダムに未取得シリーズを 1 つ選んで獲得を試みる。
 *  全シリーズ取得済みなら null を返す。 */
function acquireRandomSeriesRecipe(reasonKey = null) {
  const locked = lockedSeriesList(state.unlockedSeries);
  if (locked.length === 0) return null;
  const pick = locked[Math.floor(Math.random() * locked.length)];
  if (acquireSeriesRecipe(pick, reasonKey)) return pick;
  return null;
}

/** レシピ獲得ポップアップ表示 */
function showRecipePopup(seriesName, sampleExt, reasonKey) {
  const modal = $("recipePopup");
  if (!modal) return;
  pauseTime();
  const lang = getLang() === "en" ? "en" : "ja";
  const seriesLabel = seriesName;
  $("recipePopupSeries").textContent = seriesLabel;
  const iconImg = $("recipePopupIcon");
  if (iconImg) {
    if (sampleExt) {
      iconImg.src = extIconUrl(sampleExt.extId);
      iconImg.style.display = "";
    } else {
      iconImg.style.display = "none";
    }
  }
  const reason = reasonKey ? ti18n(reasonKey) : "";
  $("recipePopupReason").textContent = reason;
  // 工房 Lv で見える ext 名 (Common only at Lv 1) を列挙
  const visibles = EXTENSIONS.filter(e => e.series === seriesName && rarityAllowedAtFactoryLevel(e.rarity, state.factoryLevel));
  const list = $("recipePopupExts");
  if (list) {
    list.innerHTML = visibles.map(e => {
      const name = lang === "en" ? (e.nameEn || e.nameJa) : e.nameJa;
      return `<li class="recipe-popup__ext-item" data-rarity="${e.rarity}">
        <img src="${extIconUrl(e.extId)}" alt="" onerror="this.style.opacity='0.2'" />
        <span class="recipe-popup__ext-name">${escapeHtml(name)}</span>
        <span class="recipe-popup__ext-rarity" data-rarity="${e.rarity}">${escapeHtml(ti18n("rarity." + e.rarity, e.rarity))}</span>
      </li>`;
    }).join("");
  }
  modal.classList.remove("hidden");
}
function closeRecipePopup() {
  $("recipePopup")?.classList.add("hidden");
  resumeTime();
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
    // Phase 1D-24: クラフトLv 不足はエラー扱いにせず、素材不足のみ表示
    //   (Lv 不足は確認画面でマイがアドバイスする方針)
    const displayStatus = avail.status === "level" ? "ok" : avail.status;
    const availLabel = ti18n("craft.avail." + displayStatus);
    return `<div class="ext-row" data-ext-id="${ext.extId}">
      <div class="ext-row__icon-col">
        <img class="ext-row__icon" src="${extIconUrl(ext.extId)}" alt="" onerror="this.style.opacity='0.2'" />
        <span class="ext-row__avail ext-row__avail--${displayStatus}" title="${escapeHtml(availLabel)}">${escapeHtml(availLabel)}</span>
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
  // Phase 1D-32: 受注クラフトは素材不要 → 期限/報酬の表示に差し替え
  const recipe = recipeFor(ext);
  const avail = craftAvailability(ext, team, state.materials);
  if (state.craftPickedCommissionId != null) {
    const c = (state.commissions || []).find(x => x.id === state.craftPickedCommissionId);
    if (c) {
      const remainTicks = Math.max(0, c.deadlineTick - state.tickCount);
      const remainWeeks = Math.ceil(remainTicks / SECONDS_PER_WEEK);
      const langLocal = getLang() === "en" ? "en" : "ja";
      $("confirmMaterials").innerHTML = `
        <div class="craft-confirm__mat-row" style="background: rgba(196,163,90,0.12); border-radius: 4px; padding: 0.5rem;">
          <strong style="color: var(--accent);">${escapeHtml(ti18n("commission.title"))}</strong>
        </div>
        <div class="craft-confirm__mat-row">
          <span class="craft-confirm__mat-name">${escapeHtml(ti18n("commission.deadline"))}</span>
          <span class="craft-confirm__mat-qty" style="color: var(--ifrit); font-weight: 800;">${remainWeeks}${langLocal === "en" ? " weeks" : " 週"}</span>
        </div>
        <div class="craft-confirm__mat-row">
          <span class="craft-confirm__mat-name">${escapeHtml(ti18n("commission.reward"))}</span>
          <span class="craft-confirm__mat-qty" style="color: var(--accent); font-weight: 800;">${c.rewardGum.toLocaleString()} GUM</span>
        </div>`;
    }
  } else {
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
  }

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
  // 仕様 (Phase 1B → Phase 1D-24 改修):
  //  - material 不足: 開始不可 (赤字警告)
  //  - level 不足:    開始は許可。マイのアドバイスで品質低下の見込みを案内
  //  - filled === 0: 開始不可 (チーム編成が必要)
  // Phase 1D-32: 受注クラフト (= state.craftPickedCommissionId 設定中) は素材不要
  const isCommission = state.craftPickedCommissionId != null;
  const filled = state.craftTeam.filter(id => id != null).length;
  const warn = $("confirmWarning");
  const startBtn = $("confirmStartBtn");
  let warnMsg = "";
  let warnMode = "error";
  const canStart = filled > 0 && (isCommission || avail.materialOk);
  if (filled === 0) warnMsg = ti18n("craft.warn.noTeam");
  else if (!isCommission && !avail.materialOk) warnMsg = ti18n("craft.warn.noMaterial");
  else if (!avail.levelOk) {
    // Phase 1D-24: Mai のアドバイス文に切替 (赤字エラーではなく warning 風)
    warnMode = "advice";
    const ratio = reqLv > 0 ? (teamLv / reqLv) : 1;
    if (ratio < 0.5) {
      warnMsg = ti18n("craft.advice.tooLow")
        .replace("{cur}", teamLv.toLocaleString())
        .replace("{req}", reqLv.toLocaleString());
    } else if (ratio < 0.85) {
      warnMsg = ti18n("craft.advice.low")
        .replace("{cur}", teamLv.toLocaleString())
        .replace("{req}", reqLv.toLocaleString());
    } else {
      warnMsg = ti18n("craft.advice.borderline")
        .replace("{cur}", teamLv.toLocaleString())
        .replace("{req}", reqLv.toLocaleString());
    }
  }
  if (warnMsg) {
    warn.textContent = warnMsg;
    warn.classList.remove("hidden");
    warn.setAttribute("data-mode", warnMode);
  } else {
    warn.classList.add("hidden");
    warn.removeAttribute("data-mode");
  }
  startBtn.disabled = !canStart;
}

function openCraftView() {
  pauseTime();
  state.craftScreen = "select";
  state.craftPickedExtId = null;
  // Phase 1D-32: 通常 craft view を開いた時点で commission picker を解除する
  //   (= 受注クラフトはピッカー → 直接 confirm 経路で別途呼ばれる)
  state.craftPickedCommissionId = null;
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
  // Phase 1D-32: confirm を閉じた時点で commission 状態もクリア
  state.craftPickedCommissionId = null;
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
  // Phase 1D-32: 受注クラフトは素材不要なので materialOk をスキップ
  const isCommission = state.craftPickedCommissionId != null;
  const avail = craftAvailability(ext, teamHeroes, state.materials);
  if (!isCommission && !avail.materialOk) return;
  // Phase 1D-6: クラフト開始 SE
  playSe("craftStart");
  const targets = extElementTargets(ext);
  const dur = estimateDurationWeeks(ext, teamHeroes);
  const recipe = recipeFor(ext);

  // 素材消費 (受注クラフトはスキップ)
  if (!isCommission) {
    for (const m of recipe) {
      state.materials[m.id] = Math.max(0, (state.materials[m.id] || 0) - (m.qty || 0));
    }
  }

  // Phase 1D-32: 受注ID を activeCraft に伝播
  const commissionId = state.craftPickedCommissionId;
  state.activeCraft = {
    extId: ext.extId,
    team,
    targets,
    commissionId: commissionId != null ? commissionId : null,
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
  // Phase 1D-19: クラフト編成ヒーロー全員に「やるぞー！」系セリフを少し時差で
  team.filter(id => id != null).forEach((id, i) => {
    setTimeout(() => pushHeroFlavor(id, "craftStart"), 200 + i * 220);
  });
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
    // Phase 1D-13: 「クラフトする」遷移ボタンを表示
    const ah = $("orderActionHost");
    if (ah) {
      ah.innerHTML = `
        <div class="progress-card__actions">
          <div class="progress-card__action-row">
            <button type="button" class="progress-card__action-btn" data-craft-go="new">
              ${escapeHtml(ti18n("progress.craft.actionStart"))}
            </button>
          </div>
        </div>
      `;
    }
    return;
  }
  // 稼働中: アクションボタンは隠す
  const ah = $("orderActionHost");
  if (ah) ah.innerHTML = "";
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
/** Phase 1D-12: workshop に所有ヒーロー全員を常時表示する版。
 *  各ヒーローの状態 (idle / crafting / questing / resting) でアイコン
 *  +グレーアウト等を出し分け。クラフト中は +N 浮上 + bounce アニメ。
 *  クエスト中はグレーアウト + 「クエスト中」アイコン。 */
function renderWorkshop() {
  // Phase 1D-31: 工房レベルに応じた設備 GIF を切替表示。
  //   Lv1: 非表示 / Lv2: lv2-facility.gif / Lv3: lv3-facility.gif / Lv4+: lv4-facility.gif
  //   src を毎回触らないよう data-cur で前回値を保持。
  const facilityEl = $("workshopFacility");
  if (facilityEl) {
    const lv = state.factoryLevel || 1;
    let src = "";
    if (lv === 2)      src = "./Image/Factory/lv2-facility.gif";
    else if (lv === 3) src = "./Image/Factory/lv3-facility.gif";
    else if (lv >= 4)  src = "./Image/Factory/lv4-facility.gif";
    if (src) {
      if (facilityEl.getAttribute("data-cur") !== src) {
        facilityEl.src = src;
        facilityEl.setAttribute("data-cur", src);
      }
      facilityEl.classList.remove("hidden");
    } else {
      facilityEl.classList.add("hidden");
      facilityEl.removeAttribute("data-cur");
    }
  }
  const host = $("workshopHeroes");
  if (!host) return;
  const heroes = state.ownedHeroes;
  if (!heroes || heroes.length === 0) {
    host.innerHTML = "";
    host.dataset.fingerprint = "";
    return;
  }
  // 所有ヒーロー一覧 (heroId 列) の fingerprint で全 rebuild 判定
  const fingerprint = heroes.map(h => h.heroId).join(",");
  if (host.dataset.fingerprint !== fingerprint) {
    host.dataset.fingerprint = fingerprint;
    host.innerHTML = heroes.map((hero, idx) => {
      const pos = workshopSlotPosFor(idx, heroes.length);
      // Phase 1D-25 → 1D-27: 画面下のヒーロー (y% が大きい) ほど前面に。
      //   ただし z-index を 1〜10 の範囲に絞って、ポップアップ/モーダル
      //   (z-index 100+) より絶対に下になるよう抑制する。
      const yNum = parseFloat(pos.y) || 0;
      const z = Math.max(1, Math.round(yNum / 10));  // y=78% → z=8, y=33% → z=3
      return `<div class="workshop-hero" data-hero-id="${hero.heroId}"
        style="left:${pos.x}; top:${pos.y}; z-index:${z};"
        title="${escapeHtml(tHero(hero.heroId, hero.nameJa))}">
        <span class="workshop-hero__state-icon workshop-hero__state-icon--rest hidden" title="${escapeHtml(ti18n("hero.state.resting"))}">💤</span>
        <span class="workshop-hero__state-icon workshop-hero__state-icon--craft hidden" title="${escapeHtml(ti18n("hero.state.crafting"))}">⚒</span>
        <span class="workshop-hero__state-icon workshop-hero__state-icon--quest hidden" title="${escapeHtml(ti18n("hero.state.questing"))}">🗺</span>
        <img class="workshop-hero__img" src="${hero.img()}" alt="" onerror="this.style.opacity='0.2'" />
        <div class="workshop-hero__stam"><div class="workshop-hero__stam-fill"></div></div>
        <div class="workshop-hero__floats"></div>
        <div class="workshop-hero__flavors"></div>
      </div>`;
    }).join("");
  }
  // ── 属性更新 (state / stamina) ──
  for (const hero of heroes) {
    const sprite = host.querySelector(`.workshop-hero[data-hero-id="${hero.heroId}"]`);
    if (!sprite) continue;
    const isResting  = hero.state === HERO_STATE.RESTING;
    const isCrafting = hero.state === HERO_STATE.CRAFTING;
    const isQuesting = hero.state === HERO_STATE.QUESTING;
    sprite.classList.toggle("workshop-hero--sleeping", isResting);
    sprite.classList.toggle("workshop-hero--questing", isQuesting);
    sprite.classList.toggle("workshop-hero--crafting", isCrafting);
    sprite.querySelector(".workshop-hero__state-icon--rest")?.classList.toggle("hidden", !isResting);
    sprite.querySelector(".workshop-hero__state-icon--craft")?.classList.toggle("hidden", !isCrafting);
    sprite.querySelector(".workshop-hero__state-icon--quest")?.classList.toggle("hidden", !isQuesting);
    const stamPct = hero.stamina.max > 0
      ? Math.max(0, Math.min(100, (hero.stamina.current / hero.stamina.max) * 100))
      : 0;
    const fill = sprite.querySelector(".workshop-hero__stam-fill");
    if (fill) fill.style.width = stamPct.toFixed(1) + "%";
  }
  // ── 今 tick で発生した floats / bounce を反映 (heroId キー) ──
  const liveFloats = state.spriteFloats.filter(f => f.createdTick === state.tickCount);
  const bouncedHeroIds = new Set();
  for (const f of liveFloats) {
    const sprite = host.querySelector(`.workshop-hero[data-hero-id="${f.heroId}"]`);
    if (!sprite) continue;
    const floatHost = sprite.querySelector(".workshop-hero__floats");
    if (!floatHost) continue;
    if (floatHost.querySelector(`[data-float-id="${f.id}"]`)) continue;
    const span = document.createElement("span");
    span.className = `workshop-hero__float workshop-hero__float--${f.element}`;
    span.setAttribute("data-float-id", String(f.id));
    span.textContent = `+${f.value}`;
    floatHost.appendChild(span);
    setTimeout(() => span.remove(), 1100);
    bouncedHeroIds.add(f.heroId);
  }
  // ── Phase 1D-19: フレーバーセリフを sprite 左上に append ──
  const liveFlavors = state.heroFlavors.filter(f => f.createdTick === state.tickCount);
  for (const f of liveFlavors) {
    const sprite = host.querySelector(`.workshop-hero[data-hero-id="${f.heroId}"]`);
    if (!sprite) continue;
    const flavorHost = sprite.querySelector(".workshop-hero__flavors");
    if (!flavorHost) continue;
    if (flavorHost.querySelector(`[data-flavor-id="${f.id}"]`)) continue;
    const span = document.createElement("span");
    span.className = "workshop-hero__flavor";
    span.setAttribute("data-flavor-id", String(f.id));
    span.textContent = f.text;
    flavorHost.appendChild(span);
    // Phase 1D-29: フレーバー表示中はヒーロー本体ごと最前面に押し出して、
    //   隣接ヒーローの sprite にバブルが隠されないようにする。
    sprite.classList.add("workshop-hero--has-flavor");
    setTimeout(() => {
      span.remove();
      // 残り flavor が 0 件になったら最前面化を解除
      if (!flavorHost.querySelector(".workshop-hero__flavor")) {
        sprite.classList.remove("workshop-hero--has-flavor");
      }
    }, 2400);
  }
  for (const hid of bouncedHeroIds) {
    const sprite = host.querySelector(`.workshop-hero[data-hero-id="${hid}"]`);
    if (!sprite) continue;
    sprite.classList.remove("workshop-hero--bounce");
    void sprite.offsetWidth;
    sprite.classList.add("workshop-hero--bounce");
    setTimeout(() => sprite.classList.remove("workshop-hero--bounce"), 460);
  }
}

/** Phase 1D-13: 工房内の 12 固定配置座標 (workshop 領域の % 座標)。
 *
 *   上段 (2F バルコニー): 9, 10, 11, 12
 *   中段 (1F 工作スペース): 3, 5, 6
 *   下段 (1F 床面)        : 1, 2, 4, 7, 8
 *
 *   ヒーローが床の上に立っているように見える位置を狙ったが、設備拡張時に
 *   壁/装置を貫通しない範囲で近似している。配属順 (slotIdx) と画面上の番号
 *   が一致するように並べる。 */
const WORKSHOP_SLOT_POS = [
  { x: "23%", y: "78%" },   // 1: 床下段 左
  { x: "44%", y: "80%" },   // 2: 床下段 中
  { x: "63%", y: "70%" },   // 3: 中段右
  { x: "85%", y: "62%" },   // 4: 床下段 右端
  { x: "60%", y: "55%" },   // 5: 中段中央
  { x: "33%", y: "57%" },   // 6: 中段左寄り
  { x: "10%", y: "63%" },   // 7: 床下段 最左
  { x: "70%", y: "82%" },   // 8: 床下段 右
  { x: "18%", y: "33%" },   // 9: 2F バルコニー左
  { x: "44%", y: "30%" },   // 10: 2F バルコニー中央
  { x: "60%", y: "30%" },   // 11: 2F バルコニー中央右
  { x: "82%", y: "17%" },   // 12: 2F バルコニー右上
];

/** Phase 1D-12 → Phase 1D-13: ヒーロー数に応じた workshop 配置座標。
 *  もともと 5 列 × 3 行のグリッドだったが、ユーザー仕様の 12 固定スロットに
 *  差し替え。13 名以上 (= cap 拡張) になった場合は modulo でラップする。 */
function workshopSlotPosFor(idx, total) {
  return WORKSHOP_SLOT_POS[idx % WORKSHOP_SLOT_POS.length] || WORKSHOP_SLOT_POS[0];
}

/** ─── Phase 1D-13: Progress cards (Craft / Quest / Market) ─────────
 *  ホーム画面の右ペイン (PC) / 下部カルーセル (モバイル) に表示する
 *  3 枚のカード。Craft カードは既存 order-panel をそのまま再利用するため
 *  ここでは Quest / Market のみ実装する。 */

/** Quest progress card 描画 */
function renderQuestCard() {
  const host = $("questCard");
  if (!host) return;
  const aq = state.activeQuest;
  if (!aq) {
    // 未稼働: 空メッセージ + 通常 / ランド ボタン
    const heroAvail = countQuestEligibleHeroes();
    const noHero = heroAvail === 0;
    const noteHtml = noHero ? `<p class="progress-card__action-note">${escapeHtml(ti18n("progress.quest.noHero"))}</p>` : "";
    host.innerHTML = `
      <div class="progress-card__empty">${escapeHtml(ti18n("progress.quest.empty"))}</div>
      <div class="progress-card__actions">
        <div class="progress-card__action-row">
          <button type="button" class="progress-card__action-btn" data-quest-go="normal" ${noHero ? "disabled" : ""}>
            ${escapeHtml(ti18n("progress.quest.actionNormal"))}
          </button>
          ${noHero ? noteHtml : ""}
        </div>
        <div class="progress-card__action-row">
          <button type="button" class="progress-card__action-btn" data-quest-go="land" ${noHero ? "disabled" : ""}>
            ${escapeHtml(ti18n("progress.quest.actionLand"))}
          </button>
        </div>
      </div>
    `;
    return;
  }
  const node = NODE_BY_ID[aq.nodeId];
  const lang = getLang() === "en" ? "en" : "ja";
  const nodeName = node ? (lang === "en" ? (node.nameEn || node.nameJa) : node.nameJa) : aq.nodeId;
  const pctVal = Math.floor((aq.progress || 0) * 100);
  const heroesHtml = aq.team.filter(id => id != null).slice(0, 3).map(id => {
    const h = findHero(id);
    if (!h) return "";
    return `<img class="quest-card-row__hero" src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />`;
  }).join("");
  const statusLbl = ti18n("progress.quest.statusInProgress");
  host.innerHTML = `
    <div class="quest-card-row">
      <div class="quest-card-row__heroes">${heroesHtml}</div>
      <div class="quest-card-row__node">
        <span class="quest-card-row__node-name">${escapeHtml(ti18n("quest.nodeLabel"))}: ${escapeHtml(nodeName)}</span>
        <span class="quest-card-row__node-status">${escapeHtml(statusLbl)}</span>
      </div>
    </div>
    <div class="quest-card__bar">
      <div class="quest-card__bar-fill" style="width:${pctVal}%"></div>
      <span class="quest-card__pct">${pctVal}%</span>
    </div>
  `;
}

/** クエストに行ける(IDLE な)ヒーロー人数を返す */
function countQuestEligibleHeroes() {
  if (!Array.isArray(state.ownedHeroes)) return 0;
  return state.ownedHeroes.filter(h => h.state === HERO_STATE.IDLE).length;
}

/** Trade を担当できる(IDLE な)ヒーロー人数を返す */
function countTradeEligibleHeroes() {
  if (!Array.isArray(state.ownedHeroes)) return 0;
  return state.ownedHeroes.filter(h => h.state === HERO_STATE.IDLE).length;
}

/** Phase 1D-13: オークション出品料 (placeholder)。実装時に factory-market に移管予定。 */
const AUCTION_LISTING_FEE = 100;

/** Market progress card 描画 (Trade + Auction の 2 サブカード)
 *
 *  各サブカードは未稼働 (active sale なし) のとき遷移ボタンを表示する。
 *  ボタンの disable 優先度 (ユーザー仕様):
 *    1. エクステンション不足 (warehouse 空)
 *    2. GUM 不足 (auction のみ)
 *    3. ヒーロー不足 (trade を担当できる IDLE ヒーローなし)
 */
function renderMarketCard() {
  const host = $("marketCard");
  if (!host) return;
  const lang = getLang() === "en" ? "en" : "ja";

  const hasExt = Array.isArray(state.warehouse) && state.warehouse.length > 0;
  const hasHero = countTradeEligibleHeroes() > 0;
  const hasGum  = (state.gum ?? 0) >= AUCTION_LISTING_FEE;

  // Trade サブカード
  let tradeBody;
  if (state.activeSales && state.activeSales.length > 0) {
    const s = state.activeSales[0];
    const w = state.warehouse[s.warehouseIdx];
    const ext = w ? EXTENSION_BY_ID[String(w.extId)] : null;
    const extName = ext ? (lang === "en" ? (ext.nameEn || ext.nameJa) : ext.nameJa) : `ext ${w?.extId ?? "?"}`;
    const iconUrl = ext ? extIconUrl(ext.extId) : "";
    const elapsed = state.tickCount - s.listedAtTick;
    const totalTicks = s.weeks * SECONDS_PER_WEEK;
    const pct = Math.min(100, Math.floor(elapsed / totalTicks * 100));
    const speedDef = SALE_SPEED_BY_ID?.[s.speedId];
    const speedLbl = speedDef ? (lang === "en" ? speedDef.nameEn : speedDef.nameJa) : (s.speedId || "");
    const askGum = typeof s.expectedPrice === "number" ? s.expectedPrice : 0;
    tradeBody = `
      <div class="market-sub__row">
        <img class="market-sub__icon" src="${iconUrl}" alt="" onerror="this.style.opacity='0.2'" />
        <div class="market-sub__main">
          <span class="market-sub__name">${escapeHtml(extName)}</span>
          <div class="market-sub__meta">
            <span>${escapeHtml(speedLbl)}</span>
            <span class="market-sub__meta--gum">G ${askGum}</span>
          </div>
        </div>
      </div>
      <div class="market-sub__bar">
        <div class="market-sub__bar-fill" style="width:${pct}%"></div>
        <span class="market-sub__bar-pct">${pct}%</span>
      </div>
    `;
  } else {
    // 出品なし → 遷移ボタン (disable 優先度: ext > hero) ※ trade は GUM 不要
    let disableReason = null;
    if (!hasExt)       disableReason = "noExt";
    else if (!hasHero) disableReason = "noHero";
    const disabled = disableReason !== null;
    const note = disabled ? `<p class="progress-card__action-note">${escapeHtml(ti18n("progress.market." + disableReason))}</p>` : "";
    tradeBody = `
      <div class="market-sub__empty">${escapeHtml(ti18n("progress.market.tradeEmpty"))}</div>
      <div class="progress-card__action-row">
        <button type="button" class="progress-card__action-btn" data-market-go="trade" ${disabled ? "disabled" : ""}>
          ${escapeHtml(ti18n("progress.market.actionTrade"))}
        </button>
        ${note}
      </div>
    `;
  }

  // Auction サブカード (placeholder: いつでも開催待ち = 出品ボタンを表示)
  const remainW = computeAuctionWeeksRemaining();
  const auctionLbl = ti18n("progress.market.auctionWait").replace("{n}", remainW);
  // disable 優先度: ext > GUM > hero
  let auctionDisableReason = null;
  if (!hasExt)            auctionDisableReason = "noExt";
  else if (!hasGum)       auctionDisableReason = "noGum";
  else if (!hasHero)      auctionDisableReason = "noHero";
  const auctionDisabled = auctionDisableReason !== null;
  const auctionNote = auctionDisabled
    ? `<p class="progress-card__action-note">${escapeHtml(ti18n("progress.market." + auctionDisableReason))}</p>`
    : "";
  const auctionBody = `
    <div class="market-sub__row">
      <div class="market-sub__icon"></div>
      <div class="market-sub__main">
        <span class="market-sub__name">${escapeHtml(auctionLbl)}</span>
        <div class="market-sub__meta">
          <span>${escapeHtml(ti18n("progress.market.auctionAttention"))}: —</span>
          <span>${escapeHtml(ti18n("progress.market.auctionPopularity"))}: —</span>
        </div>
      </div>
    </div>
    <div class="progress-card__action-row">
      <button type="button" class="progress-card__action-btn" data-market-go="auction" ${auctionDisabled ? "disabled" : ""}>
        ${escapeHtml(ti18n("progress.market.actionAuction"))}
      </button>
      ${auctionNote}
    </div>
  `;

  host.innerHTML = `
    <div class="market-card">
      <div class="market-sub">
        <span class="market-sub__title">${escapeHtml(ti18n("progress.market.trade"))}</span>
        ${tradeBody}
      </div>
      <div class="market-sub">
        <span class="market-sub__title">${escapeHtml(ti18n("progress.market.auction"))}</span>
        ${auctionBody}
      </div>
    </div>
  `;
}

/** 月次 (4 game-week) サイクルで開催される auction 仮設の残週数を返す。
 *  実 auction 機能未実装の placeholder。 */
function computeAuctionWeeksRemaining() {
  const y = state.year ?? 2018;
  const m = state.month ?? 12;
  const w = state.week ?? 1;
  // (year * 12 + month) * 4 + week → 通算ゲーム週
  const totalW = (y * 12 + (m - 1)) * 4 + (w - 1);
  const cycle = 4;
  const r = cycle - (totalW % cycle);
  return r === 0 ? cycle : r;
}

/** Progress Card 全体の再描画 (Craft + Quest + Market) */
function renderProgressCards() {
  renderOrderPanel();
  renderQuestCard();
  renderMarketCard();
  updateProgressCarouselIndicators();
}

/** ─── Phase 1D-13: Progress carousel navigation (mobile) ──────── */
let _progressCardIdx = 0;
const PROGRESS_CARD_COUNT = 3;

function _isProgressCarouselMode() {
  return window.matchMedia("(max-width: 879px)").matches;
}

function navigateProgressCard(delta) {
  if (!_isProgressCarouselMode()) return;
  const next = Math.max(0, Math.min(PROGRESS_CARD_COUNT - 1, _progressCardIdx + delta));
  if (next === _progressCardIdx) return;
  _progressCardIdx = next;
  scrollProgressToCurrent();
  updateProgressCarouselIndicators();
}

function scrollProgressToCurrent() {
  const sc = $("progressScroller");
  if (!sc) return;
  const cards = sc.querySelectorAll(".progress-card");
  const target = cards[_progressCardIdx];
  if (target) {
    sc.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
  }
}

function updateProgressCarouselIndicators() {
  const dots = $("progressDots");
  if (dots) {
    dots.innerHTML = "";
    for (let i = 0; i < PROGRESS_CARD_COUNT; i++) {
      const d = document.createElement("span");
      d.className = "progress-area__dot" + (i === _progressCardIdx ? " progress-area__dot--active" : "");
      dots.appendChild(d);
    }
  }
  const prevBtn = document.querySelector('[data-progress-nav="prev"]');
  const nextBtn = document.querySelector('[data-progress-nav="next"]');
  if (prevBtn) prevBtn.disabled = (_progressCardIdx === 0);
  if (nextBtn) nextBtn.disabled = (_progressCardIdx === PROGRESS_CARD_COUNT - 1);
}

/** scroller を監視してユーザーが直接スワイプした際に _progressCardIdx を更新 */
function _initProgressCarousel() {
  const sc = $("progressScroller");
  if (!sc || sc.dataset.progressInit === "1") return;
  sc.dataset.progressInit = "1";
  let scrollTimer;
  sc.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!_isProgressCarouselMode()) return;
      const cards = sc.querySelectorAll(".progress-card");
      let nearestIdx = 0;
      let nearestDist = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.offsetLeft - sc.scrollLeft);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      });
      if (nearestIdx !== _progressCardIdx) {
        _progressCardIdx = nearestIdx;
        updateProgressCarouselIndicators();
      }
    }, 80);
  });
  // 矢印ボタン
  document.querySelectorAll('[data-progress-nav]').forEach(btn => {
    btn.addEventListener("click", () => {
      const dir = btn.getAttribute("data-progress-nav");
      navigateProgressCard(dir === "prev" ? -1 : 1);
    });
  });
  // 初期 dots
  updateProgressCarouselIndicators();
  // ビューポート切替時に PC モードならスクロール位置をリセット
  window.addEventListener("resize", () => {
    if (!_isProgressCarouselMode()) {
      sc.scrollTo({ left: 0 });
    } else {
      scrollProgressToCurrent();
    }
  });
  // ── Phase 1D-13: アクションボタン (Craft/Quest/Market) のクリック委任 ──
  // カードは renderXxxCard() で innerHTML 再生成されるので、毎回 listener を
  // attach するのは無駄。scroller 上で 1 度だけ delegate する。
  sc.addEventListener("click", (ev) => {
    const target = ev.target.closest("[data-craft-go],[data-quest-go],[data-market-go]");
    if (!target || target.disabled) return;
    // Phase 1D-22: メニューが開いたまま遷移する不具合修正
    //   ホームの進捗カードボタンを押した瞬間にメニューを必ず閉じる。
    const menuOpen = !$("menuOverlay")?.classList.contains("hidden");
    if (menuOpen) closeMenu();
    if (target.hasAttribute("data-craft-go")) {
      // Craft → 新規開発
      if (state.activeCraft) { maiSays("mai.craftBusy"); return; }
      openCraftView();
      return;
    }
    if (target.hasAttribute("data-quest-go")) {
      const filter = target.getAttribute("data-quest-go");
      if (state.activeQuest) { maiSays("mai.questBusy"); return; }
      state.questNodeType = (filter === "land") ? "land" : "normal";
      openQuestView();
      return;
    }
    if (target.hasAttribute("data-market-go")) {
      const kind = target.getAttribute("data-market-go");
      if (kind === "trade") {
        state.marketTab = "sell";
        openMarketView();
        if (typeof setMarketTab === "function") setMarketTab("sell");
      } else if (kind === "auction") {
        // オークション機能は未実装 (placeholder) → Mai 通知
        maiSays("menu.auction.todo");
      }
    }
  });
}

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
  // パッシブ + Phase 1D-14 → Phase 1D-25: 複数行 + 色付き要素名
  const pBlock = $("heroDetailPassive");
  const linesHtml = passiveDescriptionsHtml(hero, getLang() === "en" ? "en" : "ja");
  if (hero.passiveName || linesHtml) {
    const nameLine = hero.passiveName
      ? `<span class="hero-detail__passive-label">${escapeHtml(ti18n("hero.passive"))}:</span>
         <strong>${escapeHtml(hero.passiveName)}</strong>`
      : "";
    pBlock.innerHTML = nameLine + linesHtml;
    pBlock.classList.remove("hidden");
  } else {
    pBlock.classList.add("hidden");
  }
  // Phase 1D-29 → 1D-31: クイックアクションボタンの enable/disable
  //   「Idle 以外」 = 実際にクラフト/クエスト/休憩 中、または activeSale の seller /
  //   activeHire の recruiter として実働中のヒーロー。
  //   craftTeam / questTeam に編成されているだけ (= 配属一覧に載っている) では
  //   disable しない (= 1D-29 で先送りした 1 回目のタップで pre-add したヒーローを、
  //   2 回目以降のタップで再度操作できなくなるバグの修正)。
  const isIdle = hero.state === HERO_STATE.IDLE
    && !isHeroLocked(hero.heroId, { ignoreCraftTeam: true, ignoreQuestTeam: true });
  const actionsHost = $("heroDetailActions");
  if (actionsHost) {
    actionsHost.querySelectorAll(".hero-detail__action").forEach(btn => {
      btn.disabled = !isIdle;
    });
  }
}
function closeHeroDetailPopup() {
  $("heroDetailPopup")?.classList.add("hidden");
  state.popupHeroId = null;
  resumeTime();
}

/** Phase 1D-29: ヒーロー詳細ポップアップから直接対象画面へ遷移する。
 *  必要に応じて編成 (craftTeam / questTeam) に hero を pre-add してから遷移。
 *
 *  action: "craft" | "quest" | "hire" | "rest" | "trade"
 */
function handleHeroQuickAction(hero, action) {
  if (!hero || !action) return;
  const hid = hero.heroId;
  switch (action) {
    case "craft": {
      // 既に craftTeam に居なければ空きスロットへ pre-add
      if (Array.isArray(state.craftTeam) && !state.craftTeam.includes(hid)) {
        const empty = state.craftTeam.indexOf(null);
        if (empty >= 0) state.craftTeam[empty] = hid;
      }
      closeHeroDetailPopup();
      // activeCraft 中なら開けない (既存ガードと整合)
      if (state.activeCraft) { maiSays("mai.craftBusy"); return; }
      openCraftView();
      break;
    }
    case "quest": {
      if (state.activeQuest) { maiSays("mai.questBusy"); return; }
      // questTeam に pre-add (空きがあれば)
      if (Array.isArray(state.questTeam) && !state.questTeam.includes(hid)) {
        const empty = state.questTeam.indexOf(null);
        if (empty >= 0) state.questTeam[empty] = hid;
      }
      closeHeroDetailPopup();
      openQuestView();
      break;
    }
    case "hire": {
      // 雇用は plan → recruiter の 2 ステップなので画面遷移のみ
      closeHeroDetailPopup();
      state.marketTab = "hire";
      openMarketView();
      setMarketTab("hire");
      break;
    }
    case "rest": {
      // 即時休憩入り。ポップアップを閉じて workshop を再描画
      hero.state = HERO_STATE.RESTING;
      closeHeroDetailPopup();
      if (typeof renderWorkshop === "function") renderWorkshop();
      if (typeof renderHeroList === "function") renderHeroList();
      if (typeof renderHeroTeam === "function") renderHeroTeam();
      break;
    }
    case "trade": {
      // 出品 (extension 売却) は本来「extension を選んで → seller を選ぶ」フロー。
      // ここでは market の出品タブ (= "sell") を直接開いて、ユーザー操作に任せる。
      // (1D-29 で誤って "warehouse" に飛ばしていた → 倉庫タブで extension を
      //  「選べない」というユーザー報告に対応)
      closeHeroDetailPopup();
      state.marketTab = "sell";
      openMarketView();
      setMarketTab("sell");
      break;
    }
  }
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
  // Phase 1D-9: 全 submenu を閉じた状態でスタート
  document.querySelectorAll("#menuOverlay .menu-card").forEach(card => {
    if (card.id) card.classList.add("hidden");  // submenu (id 付き) のみ
  });
  document.querySelectorAll(".menu-item[data-menu]").forEach(b => b.classList.remove("menu-item--active"));
}
function closeMenu() {
  $("menuOverlay")?.classList.add("hidden");
  document.querySelectorAll("#menuOverlay .menu-card").forEach(card => {
    if (card.id) card.classList.add("hidden");
  });
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

/** Phase 1D-19: Mai セリフを「ゲーム用語に <span class="term"> を自動付与」して
 *  HTML として安全にセットする。チュートリアル文言は既に <span class="term">..</span>
 *  を含むのでそのまま innerHTML、それ以外 (短い mai.* キー) は escapeHtml + auto-enrich。 */
const MAI_TERMS_JA = [
  "クラフトレベル", "クラフトLv", "クラフトパワー", "クラフトチーム", "クエストチーム",
  "ガルーダ", "イフリート", "リヴァイアサン", "ティアマト",
  "エクステンション", "クエストレベル", "ランドセクタの通行証",
  "ランドセクター通行証", "ホームランド", "工房レベル", "高品質",
];
const MAI_TERMS_EN = [
  "Craft Level", "Craft Power", "Craft Team", "Quest Team",
  "Garuda", "Ifrit", "Leviathan", "Tiamat",
  "Extension", "Quest Level", "Land Sector Pass", "Home Land",
  "Workshop Level", "high-quality", "higher-quality",
];
function setMaiBody(text) {
  const body = $("maiModalBody");
  if (!body) return;
  // 入力が既に HTML タグを含むか? (チュートリアルのケース)
  const hasTag = /<\/?[a-z][\s\S]*?>/i.test(text);
  if (hasTag) {
    // 信頼ソース (factory-tutorial.js) なのでそのまま innerHTML
    body.innerHTML = text;
    return;
  }
  // それ以外: escape して、用語を auto-enrich
  let html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const terms = getLang() === "en" ? MAI_TERMS_EN : MAI_TERMS_JA;
  for (const t of terms) {
    const re = new RegExp(t.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"), "g");
    html = html.replace(re, `<span class="term">${t}</span>`);
  }
  body.innerHTML = html;
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
  setMaiBody(ti18n(messageKey));
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
      const btn  = $("maiModalClose");
      setMaiBody(_maiSeqQueue[_maiSeqIdx]);
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
    // Phase 1D-9 バグ修正: 必ず resumeTime して maiSaysSequence の pauseTime と
    //   ペアにする。次に呼ばれる callback (next) は独立した pause/resume
    //   ペアを管理する前提 (= 旧設計の「next 側で pauseTime を呼ぶから resume
    //   しない」 は openCompletionScreen が pauseTime を呼ぶケースで pauseFlags
    //   が累積するバグの原因だったので撤廃)
    resumeTime();
    if (seqCb) { seqCb(); return; }
    const next = _maiNextAction;
    _maiNextAction = null;
    if (next) next();
    return;
  }
  // ── 通常 (単行 maiSays) の閉じ処理 ──
  $("maiModal")?.classList.add("hidden");
  // Phase 1D-9 バグ修正: 同上 — 常に resume してから next() を呼ぶ
  resumeTime();
  const next = _maiNextAction;
  _maiNextAction = null;
  if (next) next();
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
  setMaiBody(_maiSeqQueue[_maiSeqIdx]);
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
  // Phase 1D-9 バグ修正: openCompletionScreen の pauseTime とペアになる
  // resumeTime をここで実行 (openAppraisalScreen が新たに pauseTime する)。
  resumeTime();
  openAppraisalScreen();
}

/** ─── Market view: tabs (倉庫 / 雇用 / 出品) ────────────────────── */

function openMarketView() {
  pauseTime();
  $("marketView")?.classList.remove("hidden");
  renderMarketView();
}
function closeMarketView() {
  // Phase 1D-24: 候補画面を閉じたら見送り扱い (= activeHire 破棄)
  if (state.activeHire?.candidates) {
    state.activeHire = null;
    state.lastHiredRarity = null;
    renderHireOverlay?.();
  }
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

/** Phase 1D-25: ヒーローが当該 ext の販売員になれるかと、不可なら理由を返す。
 *  craftTeam 編成だけ (= 実クラフト中ではない) は許容 (= eligible)、選択時に
 *  craftTeam から自動で外す (commitSellerSelection で処理)。 */
function sellerEligibility(hero, ext) {
  if (!hero) return { eligible: false, reason: "" };
  // 既に別 sale の seller になっている?
  if (state.activeSales?.some(s => s.sellerId === hero.heroId)) {
    return { eligible: false, reason: ti18n("sell.busy.otherSale", "他の出品を担当中") };
  }
  // 採用担当者として配属中?
  if (state.activeHire?.recruiterId === hero.heroId) {
    return { eligible: false, reason: ti18n("sell.busy.hireRecruiter", "雇用の採用担当中") };
  }
  // 実クラフト中? (activeCraft.team 内)
  const inCraftActive = state.activeCraft?.team?.includes(hero.heroId);
  if (inCraftActive || hero.state === HERO_STATE.CRAFTING) {
    return { eligible: false, reason: ti18n("sell.busy.crafting", "クラフト中") };
  }
  // 実クエスト中?
  const inQuestActive = state.activeQuest?.team?.includes(hero.heroId);
  if (inQuestActive || hero.state === HERO_STATE.QUESTING) {
    return { eligible: false, reason: ti18n("sell.busy.questing", "クエスト遠征中") };
  }
  // rarity / 属性要件
  if (!canSellExt(hero, ext)) {
    return { eligible: false, reason: ti18n("sell.busy.rarity", "レアリティ不足") };
  }
  return { eligible: true, reason: "" };
}

/** 出品 modal を開く */
function openSellModal(warehouseIdx) {
  state.sellPickedIdx = warehouseIdx;
  $("sellModal")?.classList.remove("hidden");
  pauseTime();
  // デフォルト 速度 = standard、seller = 未選択 (renderSellModal が default を解決)
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

  // Phase 1D-25: 全所有ヒーローを表示し、配属不可なものはグレーアウト + 理由付き。
  //   eligible = canSellExt + 実際にクラフトもクエストも進行中でない
  //   craftTeam に編成されているだけ (= 実 activeCraft 中ではない) は eligible とし、
  //   選択されたら自動で craftTeam から外す方針。
  //   前回の sellerId (state.lastSaleSellerId) があれば初回 default として選択。
  if (_sellPickedSellerId == null && state.lastSaleSellerId != null) {
    const last = findHero(state.lastSaleSellerId);
    if (last && state.activeSales?.every(s => s.sellerId !== last.heroId)
        && last.state !== HERO_STATE.CRAFTING
        && last.state !== HERO_STATE.QUESTING
        && canSellExt(last, ext)) {
      _sellPickedSellerId = state.lastSaleSellerId;
    }
  }
  const allHeroes = (state.ownedHeroes || []).slice();
  // 並び替え: eligible 優先 → 商属性持ち → rarity 高い順
  allHeroes.sort((a, b) => {
    const ea = sellerEligibility(a, ext);
    const eb = sellerEligibility(b, ext);
    if (ea.eligible !== eb.eligible) return ea.eligible ? -1 : 1;
    const sa = (a.attributes || []).includes("sho") ? 0 : 1;
    const sb = (b.attributes || []).includes("sho") ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
    return (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0);
  });
  $("sellSellerList").innerHTML = allHeroes.length === 0
    ? `<p class="sell-seller__empty">${escapeHtml(ti18n("sell.noSellerOwned"))}</p>`
    : allHeroes.map(h => {
        const elig = sellerEligibility(h, ext);
        const sel = (h.heroId === _sellPickedSellerId && elig.eligible) ? " sell-seller--sel" : "";
        const dis = elig.eligible ? "" : " sell-seller--disabled";
        const sho = Array.isArray(h.attributes) && h.attributes.includes("sho");
        const reasonHtml = elig.eligible
          ? ""
          : `<span class="sell-seller__reason">${escapeHtml(elig.reason)}</span>`;
        return `<button type="button" class="sell-seller${sel}${dis}" data-seller="${h.heroId}" ${elig.eligible ? "" : "disabled"}>
          <img src="${h.img()}" alt="" onerror="this.style.opacity='0.2'" />
          <span class="sell-seller__name">${escapeHtml(tHero(h.heroId, h.nameJa))}</span>
          <span class="sell-seller__rarity" data-rarity="${h.rarity}">${escapeHtml(ti18n("rarity." + h.rarity))}</span>
          ${sho ? `<span class="attr-badge attr-badge--sho" title="商">商</span>` : ""}
          ${reasonHtml}
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
  // Phase 1D-25: seller が craftTeam に編成中なら自動で外す
  //   (実クラフト中は sellerEligibility で弾いているのでここは確実に「編成のみ」)
  const ctIdx = state.craftTeam.indexOf(seller.heroId);
  if (ctIdx >= 0) state.craftTeam[ctIdx] = null;
  // Phase 1D-25: 前回の seller を記録 → 次回 modal 起動時に default 選択
  state.lastSaleSellerId = seller.heroId;
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
  // Phase 1D-19: 出品担当ヒーローの「いってくる！」「稼ぐぞー」系セリフ
  setTimeout(() => pushHeroFlavor(seller.heroId, "saleStart"), 250);
  closeSellModal();
  // Phase 1D-10: 出品確定後はホームに戻る (時間進めるため、雇用フローと同じ)
  closeMarketView();
  renderSaleOverlay();
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
  // Phase 1D-32: 取引成立通知をモーダル → 速報タイル (state.notifications) に
  //   切替済みのため、pauseFlags > 0 で待機する必要は無くなった。
  //   (= 1D-29 で導入した「他モーダル open 中は settlement を遅延」ガードを撤去)
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
      // Phase 1D-23: 売却成立数を計上 (工房レベルアップ条件用)
      state.saleCompletedCount = (state.saleCompletedCount || 0) + 1;
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
    // Phase 1D-32: 取引成立は時間を止めずに、画面上部の速報タイルで通知する
    //   (= ヒーローのパッシブ発動と同じ仕組みの state.notifications)。
    //   形式: 「[ext名] が成約！ [GUM] GUM で売却しました」
    const lang = getLang() === "en" ? "en" : "ja";
    const totalNet = completed.reduce((a, b) => a + b.finalNet, 0);
    // Phase 1D-6: 取引成立 SE
    playSe("saleSettled");
    for (let k = 0; k < completed.length; k++) {
      const s = completed[k];
      const ext = EXTENSION_BY_ID[String(s.extId)];
      const extName = ext ? (lang === "en" ? ext.nameEn : ext.nameJa) : `ext ${s.extId}`;
      const text = ti18n("notif.saleSettled")
        .replace("{ext}", extName)
        .replace("{gum}", s.finalNet.toLocaleString());
      state.notifications.push({
        id: ++_notifId,
        text,
        element: "tiamat",  // GUM 系のテーマカラー (= 黄)
        value: 0,
        createdTick: state.tickCount,
      });
      // 売却 1 件あたり 6% で未取得シリーズレシピ獲得 (元仕様維持)
      if (Math.random() < 0.06) {
        setTimeout(() => acquireRandomSeriesRecipe("recipe.from.sale"), 600 + k * 240);
      }
    }
    console.log(`[market] ${completed.length} ext sold for total ${totalNet} GUM`);
    renderHeader();
    renderNotifications();
    renderSaleOverlay();
  }
  // 出品中もしくは tick ごとに進捗バーが進む overlay を更新
  if (state.activeSales.length > 0) renderSaleOverlay();
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
  // Phase 1D-24: GUM 不足 / 採用担当者要件未達 / (※定員一杯は許可) — 不可理由を赤字で表示
  // Phase 1D-25: 工房レベルでもプランをゲート (rarity rank ≤ factoryLevel)
  // Phase 1D-27: 前回の hire 後、recruiterPicker が hirePlanList に hidden を付けていた
  //   ため 2 回目の plan 表示が出ない不具合 → ここで明示的に hidden を解除する。
  $("hirePlanList")?.classList.remove("hidden");
  const PLAN_REQUIRED_LV = { novice: 1, draeg: 2, babydra: 3, buldra: 4, reddra: 5 };
  $("hirePlanList").innerHTML = HIRE_PLANS.map(p => {
    const lang = getLang() === "en" ? "en" : "ja";
    // 採用担当者として就任可能なヒーローが居るか?
    const eligibleRecruiters = state.ownedHeroes.filter(h => {
      if (!canBeRecruiter(h, p)) return false;
      if (h.state === HERO_STATE.CRAFTING) return false;
      if (h.state === HERO_STATE.QUESTING) return false;
      if (isHeroLocked(h.heroId)) return false;
      return true;
    });
    let blockReason = null;
    const reqLv = PLAN_REQUIRED_LV[p.id] || 1;
    if ((state.factoryLevel || 1) < reqLv) {
      blockReason = ti18n("hire.block.factoryLv").replace("{n}", reqLv);
    } else if (state.gum < p.cost) {
      blockReason = ti18n("hire.block.gum")
        .replace("{cost}", p.cost.toLocaleString())
        .replace("{cur}", state.gum.toLocaleString());
    } else if (eligibleRecruiters.length === 0) {
      blockReason = ti18n("hire.block.recruiter")
        .replace("{rarity}", ti18n("rarity." + p.recruiterMinRarity));
    }
    const disabled = blockReason !== null;
    const reasonHtml = disabled
      ? `<p class="hire-plan__reason">${escapeHtml(blockReason)}</p>`
      : "";
    return `<div class="hire-plan ${disabled ? "hire-plan--disabled" : ""}" data-plan="${p.id}">
      <div class="hire-plan__head">
        <span class="hire-plan__name">${escapeHtml(lang === "en" ? p.nameEn : p.nameJa)}</span>
        <span class="hire-plan__cost">${p.cost.toLocaleString()} GUM</span>
      </div>
      <p class="hire-plan__desc">${escapeHtml(lang === "en" ? p.descEn : p.descJa)}</p>
      <div class="hire-plan__meta">
        <span>${escapeHtml(ti18n("hire.candidateCount").replace("{n}", p.candidateCount))}</span>
        <span>${escapeHtml(ti18n("hire.recruiterMin").replace("{rarity}", ti18n("rarity." + p.recruiterMinRarity)))}</span>
      </div>
      ${reasonHtml}
      <button type="button" class="hire-plan__btn" data-pick-plan="${p.id}" ${disabled ? "disabled" : ""}>
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
  // Phase 1D-24: トレード/クエスト/クラフト/別雇用 に既に割当済みのヒーローを除外
  const eligible = state.ownedHeroes.filter(h => {
    if (!canBeRecruiter(h, plan)) return false;
    if (h.state === HERO_STATE.CRAFTING) return false;
    if (h.state === HERO_STATE.QUESTING) return false;
    if (isHeroLocked(h.heroId)) return false;
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
  // Phase 1D-32: 雇用は赤字 (gum < 0) でも実行可能。前払い → state.gum がマイナスへ。
  state.gum -= plan.cost;
  state.activeHire = {
    planId,
    recruiterId,
    startedAtTick: state.tickCount,
    candidates: null,
  };
  renderHeader();
  // 赤字遷移チェック (初赤字でマイ助言 + 状態セット)
  checkDeficitTransition();
  // Phase 1D-7: 雇用開始 → そのままホームに戻して時間を進める
  closeMarketView();
  renderHireOverlay();
  renderSaleOverlay();
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
          // Phase 1D-24: 編成画面同等の表示 (パッシブ名 + description + craft Lv)
          const cl    = tmp ? craftLevel(tmp) : 0;
          const passiveName = tmp?.passiveName ? `<span class="hire-cand-card__passive-name">${escapeHtml(tmp.passiveName)}</span>` : "";
          const passiveLinesHtml = tmp ? passiveDescriptionsHtml(tmp, getLang() === "en" ? "en" : "ja") : "";
          const passiveLine = (passiveName || passiveLinesHtml)
            ? `<div class="hire-cand-card__passive">${passiveName}${passiveLinesHtml}</div>`
            : "";
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
            <div class="hire-cand-card__cl">${escapeHtml(ti18n("hero.craftLevel"))}: <strong>${cl.toLocaleString()}</strong></div>
            ${passiveLine}
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
  renderSaleOverlay();
    return;
  }
  // Phase 1D-29 fix: 他のモーダルが開いている間は候補通知を保留
  //   (= mai 同時呼び出しで pauseFlags 不整合 → フリーズ回避)
  if (state.pauseFlags > 0) return;
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
  renderSaleOverlay();
}

function pickHireCandidate(heroId) {
  const ah = state.activeHire;
  if (!ah || !ah.candidates) return;
  const candIdx = ah.candidates.findIndex(c => c.heroId === heroId);
  if (candIdx < 0) return;
  const cand = ah.candidates[candIdx];

  // Phase 1D-32: 雇用契約は赤字 (gum < 0) でも実行可能なため事前 GUM チェックを撤廃。
  //   契約後に gum がマイナスへ → checkDeficitTransition でマイの助言が出る。

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
  // Phase 1D-32: 赤字 (gum < 0) を許容。事前チェック撤廃 → 契約後に gum がマイナス
  //   になったら checkDeficitTransition がマイの助言 (one-shot) を出す。
  state.gum -= cost;
  const def = HERO_ROSTER.find(h => h.heroId === cand.heroId);
  if (!def) return;
  const newHero = makeFactoryHero(def);
  state.ownedHeroes.push(newHero);
  // Phase 1D-26: ランキング統計用に累計雇用数を計上
  state.heroHireCount = (state.heroHireCount || 0) + 1;
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
  renderSaleOverlay();
  renderMarketHire();
  // Phase 1D-24: 雇用成功 SE (mission.mp3) + enthusiasm メッセージ
  playSe("rankUpDone");  // = mission.mp3
  // Phase 1D-7: 雇用成功通知 (portrait 付き)
  showHireSuccessModal(newHero);
  // Phase 1D-32: 契約金で赤字に陥った場合のマイ助言 (one-shot) — hire-success
  //   モーダル close 後に出るよう、checkDeficitTransition は after-success で呼ぶ。
  //   ただし showHireSuccessModal がまだ前面なので、closeHireSuccessModal の中で
  //   呼ぶのが本来は綺麗。便宜上ここで先に state を更新だけしておく。
  checkDeficitTransition();
}

function skipAllHireCandidates() {
  state.activeHire = null;
  renderHireOverlay();
  renderSaleOverlay();
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
  // Phase 1D-24: ヒーローからの意気込みメッセージを併せて表示
  const enthusiasmPool = (getLang() === "en"
    ? ["Glad to be here!", "I'll do my best!", "Watch me work!", "Let's make great things!", "Honored to join."]
    : ["よろしく頼む！", "全力で励みます！", "腕によりをかけて！", "見せ場をつくるぜ", "頑張ります♪"]);
  const enth = enthusiasmPool[Math.floor(Math.random() * enthusiasmPool.length)];
  const heroName = tHero(hero.heroId, hero.nameJa);
  $("hireSuccessMsg").innerHTML =
    `${escapeHtml(ti18n("hire.mai.hired").replace("{name}", heroName))}<br><span class="hire-success__quote">${escapeHtml(heroName)}：「${escapeHtml(enth)}」</span>`;
  modal.classList.remove("hidden");
  pauseTime();
  // Phase 1D-22: hire success の rarity を保存 → close 時にレシピ抽選
  state.lastHiredRarity = hero.rarity || "common";
}
function closeHireSuccessModal() {
  $("hireSuccessModal")?.classList.add("hidden");
  resumeTime();
  // Phase 1D-22: 雇用後にレシピ獲得チャンス
  //   Common 8% / Uncommon 15% / Rare 25% / Epic 35% / Legendary 50%
  const r = state.lastHiredRarity;
  state.lastHiredRarity = null;
  if (r) {
    const pct = { common: 0.08, uncommon: 0.15, rare: 0.25, epic: 0.35, legendary: 0.50 }[r] || 0.08;
    if (Math.random() < pct) {
      setTimeout(() => acquireRandomSeriesRecipe("recipe.from.hire"), 350);
    }
  }
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
  const lang = getLang() === "en" ? "en" : "ja";
  $("fireList").innerHTML = list.map(({ hero, fireable }) => {
    const cl = craftLevel(hero);
    const cls = fireable ? "fire-cand" : "fire-cand fire-cand--disabled";
    // Phase 1D-24: 編成画面同等の情報 (4 元素 + 適性 + パッシブ)
    const elementsHtml = ELEMENTS.map(k => {
      const v = elementValueForCraft(hero, k);
      return `<span title="${escapeHtml(elementLabel(k))}: ${v}"><img src="${elementIconUrl(k)}" alt="" /><strong>${v}</strong></span>`;
    }).join("");
    const attrsHtml = renderHeroAttrBadges(hero);
    const passiveLinesHtml = passiveDescriptionsHtml(hero, lang);
    const passiveHtml = (hero.passiveName || passiveLinesHtml)
      ? `<div class="fire-cand__passive">
          ${hero.passiveName ? `<span class="fire-cand__passive-name">${escapeHtml(hero.passiveName)}</span>` : ""}
          ${passiveLinesHtml}
        </div>`
      : "";
    return `<button type="button" class="${cls}" data-fire="${hero.heroId}" ${fireable ? "" : "disabled"}>
      <img src="${hero.img()}" alt="" onerror="this.style.opacity='0.2'" />
      <span class="fire-cand__name">${escapeHtml(tHero(hero.heroId, hero.nameJa))} ${attrsHtml}</span>
      <span class="fire-cand__rarity" data-rarity="${hero.rarity}">${escapeHtml(ti18n("rarity." + hero.rarity))}</span>
      <div class="fire-cand__elements">${elementsHtml}</div>
      <span class="fire-cand__cl">${escapeHtml(ti18n("hero.craftLevel"))}: ${cl}</span>
      ${passiveHtml}
      ${!fireable ? `<span class="fire-cand__lock">${escapeHtml(ti18n("fire.locked"))}</span>` : ""}
    </button>`;
  }).join("");
}

/** Phase 1D-24: 解雇確認ポップアップ */
function openFireConfirm(heroId) {
  const hero = findHero(heroId);
  if (!hero) return;
  state.firePendingId = heroId;
  $("fireConfirmPortrait").src = hero.img();
  $("fireConfirmTitle").textContent = (ti18n("fire.confirmTitle", "{name} を解雇しますか？") || "{name} を解雇しますか？")
    .replace("{name}", tHero(hero.heroId, hero.nameJa));
  $("fireConfirmModal")?.classList.remove("hidden");
}
function closeFireConfirm() {
  state.firePendingId = null;
  $("fireConfirmModal")?.classList.add("hidden");
}
function executeFireConfirmed() {
  const id = state.firePendingId;
  state.firePendingId = null;
  $("fireConfirmModal")?.classList.add("hidden");
  if (id != null) fireHero(id);
}

/** 解雇実行: 選択ヒーローを ownedHeroes から除去 + pending hire があれば実行 */
function fireHero(heroId) {
  const idx = state.ownedHeroes.findIndex(h => h.heroId === heroId);
  if (idx < 0) return;
  const fired = state.ownedHeroes[idx];
  const firedName = tHero(fired.heroId, fired.nameJa);
  state.ownedHeroes.splice(idx, 1);
  // 解雇後の表示更新
  closeFireModal();
  renderHeader();
  renderHeroTeam();
  renderHeroList();
  // Phase 1D-24: シーケンスで「解雇しました」+ ヒーローの別れの言葉
  const partingPool = (getLang() === "en"
    ? ["Take care!", "Hope we meet again.", "It was an honor.", "Farewell, then.", "Good luck out there."]
    : ["お世話になりました", "またご縁があれば…", "短い間でしたがありがとう", "お達者で！", "ここでの日々は忘れません"]);
  const parting = partingPool[Math.floor(Math.random() * partingPool.length)];
  const firedMsg = (ti18n("fire.mai.firedNamed", "{name} を解雇しました。") || "{name} を解雇しました。")
    .replace("{name}", firedName);
  maiSaysSequence([firedMsg, `${firedName}：「${parting}」`], {
    onClose: () => {
      // pending hire があれば再試行
      if (state.pendingHireCandIdx != null) {
        const candIdx = state.pendingHireCandIdx;
        state.pendingHireCandIdx = null;
        const ah = state.activeHire;
        if (ah?.candidates?.[candIdx]) {
          finalizeHire(candIdx);
        }
      }
    },
  });
  console.log(`[fire] ${firedName} fired`);
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

/** Phase 1D-10: ホーム画面 上部 overlay に「出品中」インジケータを描画。
 *  各 active sale を 1 行ずつ列挙: ext / 担当 / 残り週数 / 進捗バー。 */
function renderSaleOverlay() {
  const host = $("saleOverlay");
  // Phase 1D-13: Market progress card は overlay とは別に常時更新
  if (typeof renderMarketCard === "function") renderMarketCard();
  if (!host) return;
  if (!state.activeSales || state.activeSales.length === 0) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  const lang = getLang() === "en" ? "en" : "ja";
  host.innerHTML = state.activeSales.map(s => {
    const w = state.warehouse[s.warehouseIdx];
    const ext = w ? EXTENSION_BY_ID[String(w.extId)] : null;
    const seller = findHero(s.sellerId);
    const sellerName = seller ? tHero(seller.heroId, seller.nameJa) : "—";
    const elapsed = state.tickCount - s.listedAtTick;
    const totalTicks = s.weeks * SECONDS_PER_WEEK;
    const pct = Math.min(100, Math.floor(elapsed / totalTicks * 100));
    const remainTicks = Math.max(0, totalTicks - elapsed);
    const remainWeeks = Math.ceil(remainTicks / SECONDS_PER_WEEK);
    const extName = ext ? (lang === "en" ? (ext.nameEn || ext.nameJa) : ext.nameJa) : `ext ${w?.extId ?? "?"}`;
    const iconUrl = ext ? extIconUrl(ext.extId) : "";
    return `<div class="sale-overlay__row">
      <img class="sale-overlay__icon" src="${iconUrl}" alt="" onerror="this.style.opacity='0.2'" />
      <div class="sale-overlay__main">
        <span class="sale-overlay__name">${escapeHtml(extName)}</span>
        <span class="sale-overlay__seller">${escapeHtml(ti18n("sell.seller"))}: ${escapeHtml(sellerName)}</span>
      </div>
      <span class="sale-overlay__bar"><span class="sale-overlay__bar-fill" style="width:${pct}%"></span></span>
      <span class="sale-overlay__remain">${escapeHtml(ti18n("sale.overlay.remain").replace("{n}", remainWeeks))}</span>
    </div>`;
  }).join("");
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
  // Phase 1D-9: 査定員は所有ヒーローではなく全ヒーロー (HERO_ROSTER) から選定
  // → 工房に在籍していなくても著名な美術ヒーロー (北斎・モーツァルトなど)
  //   が登場できる。 buildOwnedHeroes で factory hero 形にしてから渡す。
  const allHeroes = buildOwnedHeroes();
  const judges = pickAppraisalJudges(allHeroes, 5);
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
    // Phase 1D-13: 直前に reveal された判定員のスコアに応じて SE
    const just = pa.judges[pa.revealCount - 1];
    if (just) {
      const sc = just.score || 0;
      if      (sc >= 8) playSe("appraisalHigh");
      else if (sc >= 5) playSe("appraisalMid");
      else              playSe("appraisalLow");
    }
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
    // Phase 1D-9 修正: 査定員は所有していないヒーローも含む (HERO_ROSTER)。
    //   findHero は state.ownedHeroes 限定なので、未所有時は HERO_DEFS から
    //   img を引く。
    const hero = findHero(j.heroId) || HERO_DEFS[String(j.heroId)] || null;
    const portrait = hero && typeof hero.img === "function" ? hero.img() : "";
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
    // Phase 1D-23: クラフト完了統計 + 査定スコアの最大値を更新 (工房レベルアップ条件で参照)
    state.craftCompletedCount = (state.craftCompletedCount || 0) + 1;
    if (pa && pa.totalScore != null) {
      const ext = EXTENSION_BY_ID[String(pc.extId)];
      const r = ext?.rarity || "common";
      state.appraisalBest = state.appraisalBest || {};
      state.appraisalBest[r] = Math.max(state.appraisalBest[r] || 0, pa.totalScore);
    }
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
  // Phase 1D-25: 条件達成チェック → マイのレベルアップ案内
  setTimeout(maybeWorkshopLvPrompt, 600);
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
  renderProgressCards();   // Craft / Quest / Market 3 カード初期描画 (Phase 1D-13)
  renderHeroTeam();
  renderHeroList();
  renderWorkshop();
  renderNotifications();
  renderQuestOverlay();
  renderHireOverlay();
  renderSaleOverlay();
  // Phase 1D-13: 進捗カードカルーセルの矢印 / dots / scroll listener を一度だけ初期化
  _initProgressCarousel();

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

  // Phase 1D-23: 共通ボタンクリック SE (全 button 要素 + .menu-item)
  //   - title 画面のスタートタップは除外 (BGM/SE 開始の最初のユーザー操作)
  //   - disabled 要素は鳴らさない
  //   - スロットルは playSe 側で 100ms 設定済み
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button, .menu-item");
    if (!btn) return;
    if (btn.disabled) return;
    // タイトル画面 (= BGM 起動直前) は鳴らさない
    if (btn.closest("#titleView")) return;
    playSe("buttonClick");
  }, true);  // capture phase で確実にひろう

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
  // Phase 1D-9: メインメニュー (data-menu) のクリック → 全項目が submenu を開く
  // (項目が 1 つでも統一的にサブメニュー表示)
  const SUBMENU_ID_FOR = {
    craft:    "craftSubmenu",
    hero:     "heroSubmenu",
    quest:    "questSubmenu",
    market:   "marketSubmenu",
    settings: "settingsSubmenu",
  };
  function hideAllSubmenus() {
    Object.values(SUBMENU_ID_FOR).forEach(id => $(id)?.classList.add("hidden"));
  }
  document.querySelectorAll(".menu-item[data-menu]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-menu");
      // active クリア + 自身を active に
      document.querySelectorAll(".menu-item[data-menu]").forEach(b => b.classList.remove("menu-item--active"));
      btn.classList.add("menu-item--active");
      // 全 submenu を一度閉じて、対応するものだけ開く
      hideAllSubmenus();
      const subId = SUBMENU_ID_FOR[key];
      if (subId) $(subId)?.classList.remove("hidden");
      // 設定 submenu を開いたら現在の toggle 状態を反映
      if (key === "settings") refreshSettingsSubmenu();
    });
  });

  // クラフト submenu: 新規開発 / 受注クラフト / 工房レベルアップ
  document.querySelectorAll(".menu-item[data-craft-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-craft-action");
      hideAllSubmenus();
      closeMenu();
      if (action === "new-dev") {
        if (state.activeCraft) { maiSays("mai.craftBusy"); return; }
        openCraftView();
      } else if (action === "commission") {
        // Phase 1D-32: 受注クラフト
        if (state.activeCraft) { maiSays("commission.busy"); return; }
        openCommissionView();
      } else if (action === "factoryLvUp") {
        // Phase 1D-23: 工房レベルアップ画面 (Settings → Craft へ移設)
        openFactoryLvUpView();
      }
    });
  });

  // Phase 1D-32: 受注クラフトの click hooks
  $("commissionList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-commission-id]");
    if (!btn || btn.disabled) return;
    const id = parseInt(btn.getAttribute("data-commission-id"), 10);
    if (Number.isFinite(id)) pickCommission(id);
  });
  $("commissionViewClose")?.addEventListener("click", closeCommissionView);
  $("commissionView")?.addEventListener("click", (ev) => {
    if (ev.target.id === "commissionView") closeCommissionView();
  });

  // ヒーロー submenu: クラフトチーム / 雇用 / 強化 (Phase 1D-20)
  document.querySelectorAll(".menu-item[data-hero-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-hero-action");
      hideAllSubmenus();
      closeMenu();
      if (action === "craft-team" || action === "formation") openHeroView();
      else if (action === "enhance") openHeroEnhanceView();
      else if (action === "hire") {
        // 雇用は引き続き market view 内のタブで動かす (data モデル維持)
        state.marketTab = "hire";
        openMarketView();
        setMarketTab("hire");
      }
    });
  });

  // クエスト submenu: 通常 / ランド (Phase 1D-12: ランドノード実装)
  document.querySelectorAll(".menu-item[data-quest-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.getAttribute("data-quest-filter");
      hideAllSubmenus();
      closeMenu();
      if (state.activeQuest) { maiSays("mai.questBusy"); return; }
      state.questNodeType = filter;
      // ノードタイプに合わせて picked を初期化 (該当タイプ最初のノード)
      const list = filter === "land" ? LAND_NODES : NORMAL_NODES;
      if (list.length > 0 && (!state.questPickedNodeId || !list.some(n => n.id === state.questPickedNodeId))) {
        state.questPickedNodeId = list[0].id;
      }
      openQuestView();
      // Phase 1D-16: ランドタブを開いて、まだホームランド未取得 → マイの初回無料説明
      if (filter === "land" && state.homeLand == null) {
        setTimeout(() => runTutorialOnce("landFirstFree"), 280);
      }
    });
  });

  // マーケットサブメニュー (倉庫 / 雇用 / 出品) → 直接タブを開く
  document.querySelectorAll(".menu-item[data-market-tab-direct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-market-tab-direct");
      hideAllSubmenus();
      closeMenu();
      state.marketTab = tab;
      openMarketView();
      setMarketTab(tab);
    });
  });

  // 設定 submenu: 時間 2x speed トグル
  $("settingSpeed2x")?.addEventListener("click", () => {
    state.timeSpeed2x = !state.timeSpeed2x;
    refreshSettingsSubmenu();
    // tick interval を再起動
    restartTimeLoopWithSpeed();
  });
  // Phase 1D-21: 時間 20x speed トグル (テスト/バランス調整用)
  $("settingSpeed20x")?.addEventListener("click", () => {
    state.timeSpeed20x = !state.timeSpeed20x;
    refreshSettingsSubmenu();
    restartTimeLoopWithSpeed();
  });
  // Phase 1D-21: 工房レベルアップ
  document.querySelectorAll("[data-factory-lv-up]").forEach(btn => {
    btn.addEventListener("click", () => {
      hideAllSubmenus();
      closeMenu();
      tryFactoryLevelUp();
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
  // Phase 1D-29: クイックアクション (Idle ヒーローを直接 craft/quest/hire/rest/trade へ)
  $("heroDetailActions")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".hero-detail__action");
    if (!btn || btn.disabled) return;
    const hid = state.popupHeroId;
    if (hid == null) return;
    const hero = findHero(hid);
    if (!hero) return;
    const action = btn.getAttribute("data-quick");
    handleHeroQuickAction(hero, action);
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
  // Phase 1D-24: クリック時に確認ポップアップを挟む
  $("fireList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-fire]");
    if (!btn || btn.disabled) return;
    const id = parseInt(btn.getAttribute("data-fire"), 10);
    if (Number.isFinite(id)) openFireConfirm(id);
  });
  $("fireCancelBtn")?.addEventListener("click", cancelFire);
  $("fireModal")?.addEventListener("click", (e) => {
    if (e.target.id === "fireModal") cancelFire();
  });
  // Phase 1D-24: 解雇確認 modal
  $("fireConfirmBack")?.addEventListener("click", closeFireConfirm);
  $("fireConfirmDo")?.addEventListener("click", executeFireConfirmed);
  $("fireConfirmModal")?.addEventListener("click", (e) => {
    if (e.target.id === "fireConfirmModal") closeFireConfirm();
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
    if (!btn || btn.disabled) return;
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

  // ── Quest view (Phase 1C-1 / 1D-11) ──
  $("questViewBack")?.addEventListener("click", closeQuestView);
  // ノードカード「選択」ボタン (or カード自体)
  $("questNodeCards")?.addEventListener("click", (ev) => {
    // Phase 1D-12: ランド購入ボタン
    const buyBtn = ev.target.closest("[data-buy-land]");
    if (buyBtn) {
      const landId = buyBtn.getAttribute("data-buy-land");
      buyLandPass(landId);
      return;
    }
    const btn = ev.target.closest("[data-node]") || ev.target.closest("[data-node-card]");
    if (!btn) return;
    const nodeId = btn.getAttribute("data-node") || btn.getAttribute("data-node-card");
    if (!nodeId) return;
    state.questPickedNodeId = nodeId;
    renderQuestView();
  });
  // 難易度行「選択」ボタン
  $("questDiffRows")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-diff]");
    if (!btn) return;
    state.questPickedDifficulty = btn.getAttribute("data-diff");
    renderQuestView();
  });
  // ヒーローカードの ⓘ ボタン (event 委譲: questHeroPick の click hook で吸収)
  $("questHeroPick")?.addEventListener("click", (ev) => {
    const info = ev.target.closest("[data-ql-info]");
    if (info) {
      ev.stopPropagation();
      const hid = parseInt(info.getAttribute("data-ql-info"), 10);
      if (Number.isFinite(hid)) openQlInfoModal(hid);
    }
  }, true);  // capture phase でヒーロー toggle より先に拾う
  // QL info popup close
  $("qlInfoClose")?.addEventListener("click", closeQlInfoModal);
  $("qlInfoModal")?.addEventListener("click", (e) => {
    if (e.target.id === "qlInfoModal") closeQlInfoModal();
  });
  // Phase 1D-22: シリーズレシピ獲得ポップアップ close
  $("recipePopupClose")?.addEventListener("click", closeRecipePopup);
  $("recipePopup")?.addEventListener("click", (e) => {
    if (e.target.id === "recipePopup") closeRecipePopup();
  });
  // Phase 1D-26: ランキング登録 view + 活動レポート view
  $("rankingSubmitBtn")?.addEventListener("click", submitRankingNow);
  $("rankingScoreNext")?.addEventListener("click", proceedToActivityReport);
  $("activityReportClose")?.addEventListener("click", closeActivityReport);
  // Phase 1D-23: 工房レベルアップ view close + アクション delegation
  $("factoryLvUpClose")?.addEventListener("click", closeFactoryLvUpView);
  $("factoryLvUpView")?.addEventListener("click", (e) => {
    if (e.target.id === "factoryLvUpView") closeFactoryLvUpView();
  });
  $("factoryLvUpList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-flv-up]");
    if (!btn || btn.disabled) return;
    const t = parseInt(btn.getAttribute("data-flv-up"), 10);
    if (Number.isFinite(t)) tryFactoryLevelUp(t);
  });
  // Phase 1D-23: ホーム目標バナーのクリック → 工房レベルアップ画面へ
  $("homeGoalBannerBtn")?.addEventListener("click", () => {
    openFactoryLvUpView();
  });
  $("homeGoalBanner")?.addEventListener("click", (ev) => {
    // バナー本体クリックでも遷移 (ボタン以外)
    if (ev.target.id === "homeGoalBannerBtn") return;  // ボタンクリックは別ハンドラに任せる
    openFactoryLvUpView();
  });
  // 初期描画
  renderHomeGoalBanner();
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
      if (empty >= 0) {
        state.questTeam[empty] = hid;
        // Phase 1D-29: クラフト編成にも居る場合は自動でそちらから外す
        //   (= 同一ヒーローが両方の編成に乗っている曖昧な状態を避ける)
        if (Array.isArray(state.craftTeam)) {
          const ci = state.craftTeam.indexOf(hid);
          if (ci >= 0) state.craftTeam[ci] = null;
        }
      }
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
  // Phase 1D-20: 強化 view の back + ランクアップボタン delegation
  $("heroEnhanceBack")?.addEventListener("click", closeHeroEnhanceView);
  $("heroEnhanceList")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-enhance-hero]");
    if (!btn || btn.disabled) return;
    const hid = parseInt(btn.getAttribute("data-enhance-hero"), 10);
    if (Number.isFinite(hid)) rankUpHero(hid);
  });
  // Phase 1D-12: 編成 view の tab 切替
  document.querySelectorAll(".hero-team-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      setHeroTeamTab(btn.getAttribute("data-team-tab"));
    });
  });
  // クエストチームスロットタップで該当ヒーロー外す
  $("heroQuestTeamSlots")?.addEventListener("click", (ev) => {
    const slot = ev.target.closest("[data-quest-slot]");
    if (!slot) return;
    const idx = parseInt(slot.getAttribute("data-quest-slot"), 10);
    if (Number.isFinite(idx) && state.questTeam[idx] != null) {
      state.questTeam[idx] = null;
      renderQuestTeamPanel();
      renderHeroList();
    }
  });
  $("heroSortSel")?.addEventListener("change", (ev) => {
    state.heroSort = ev.target.value;
    renderHeroList();
  });
  // Phase 1D-27: レアリティフィルタ chips のクリック
  $("heroRarityFilter")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-rarity-filter]");
    if (!btn) return;
    state.heroFilterRarity = btn.getAttribute("data-rarity-filter") || "all";
    renderHeroList();
  });
  // Phase 1D-27: クラフト中介入イベント picker
  $("craftEventElements")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-event-element]");
    if (!btn) return;
    state.craftEventPickedElement = btn.getAttribute("data-event-element");
    renderCraftEventPicker();
  });
  $("craftEventHeroes")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-event-hero]");
    if (!btn) return;
    const id = parseInt(btn.getAttribute("data-event-hero"), 10);
    if (Number.isFinite(id)) {
      state.craftEventPickedHeroId = id;
      renderCraftEventPicker();
    }
  });
  $("craftEventStart")?.addEventListener("click", () => {
    if (!state.craftEventPickedElement || !state.craftEventPickedHeroId) return;
    runCraftEventAnimation();
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
  renderSaleOverlay();
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
    if (!$("qlInfoModal")?.classList.contains("hidden")) { closeQlInfoModal(); return; }
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
