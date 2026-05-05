/**
 * factory-tutorial.js — チュートリアルフロー定義 (Phase 1D-5)
 *
 * 各画面の初回オープン時にマイが解説するセリフを保持する。
 * 一度表示したフローは state.tutorial.<key> = true で再表示しないようにする
 * (state は main.js 側で管理)。
 *
 * Mai モーダルを使ってシーケンス表示するため、各エントリは ja/en の
 * 文字列配列。
 */

/** 全チュートリアルフロー
 *  Phase 1D-19: 同一画面でのセリフを最大 2 行に圧縮 (3 回以上は冗長)。
 *  ゲーム専門用語は <span class="term">..</span> で強調する。 */
export const TUTORIALS = {
  /** 初回ホーム (タイトルから入った直後) */
  home: {
    ja: [
      "はじめまして！本工房のアシスタント、マイです。一緒に工房を発展させましょう♪",
      "まずはメニューから<span class=\"term\">クラフト</span>を始めてみてください。",
    ],
    en: [
      "Hi! I'm Mai, your workshop assistant. Let's grow this place together♪",
      "Open the menu and try a <span class=\"term\">Craft</span> first.",
    ],
  },

  /** クラフト選択画面の初回 */
  craftSelect: {
    ja: [
      "ここでは<span class=\"term\">エクステンション</span>を選んでクラフトできます。",
      "工房が成長すれば作れる種類も増えますよ。お好きなものをどうぞ！",
    ],
    en: [
      "Pick an <span class=\"term\">Extension</span> to craft here.",
      "More options unlock as the workshop grows. Choose your favorite!",
    ],
  },

  /** クラフト確認画面 (ヒーロー未編成) の初回 */
  craftConfirmNoTeam: {
    ja: [
      "エクステンションは素材に<span class=\"term\">クラフトパワー</span>を注いで作ります。",
      "「+」または「変更」ボタンからヒーローを配属しましょう。",
    ],
    en: [
      "Extensions are made by pouring <span class=\"term\">Craft Power</span> into materials.",
      "Tap the '+' slot or 'Change' to assign heroes.",
    ],
  },

  /** クラフト確認画面 (ヒーロー編成済み) の初回 */
  craftConfirmWithTeam: {
    ja: [
      "エクステンションは素材に<span class=\"term\">クラフトパワー</span>を注いで作ります。",
      "ヒーロー編成 OK ！早速クラフトを始めましょう！",
    ],
    en: [
      "Extensions are made by pouring <span class=\"term\">Craft Power</span> into materials.",
      "Team's ready — let's start the craft!",
    ],
  },

  /** クラフトチーム編成画面 (= ヒーロー画面) の初回 */
  heroTeam: {
    ja: [
      "ここで<span class=\"term\">クラフトチーム</span>を編成します (最大 5 体)。",
      "配属したら右上の「戻る」でクラフト画面へ戻りましょう。",
    ],
    en: [
      "Set your <span class=\"term\">Craft Team</span> here (up to 5).",
      "When done, tap 'Back' top-right to return.",
    ],
  },

  /** クラフト中画面の初回 (= 戻ってきて activeCraft が走っているとき) */
  craftInProgress: {
    ja: [
      "クラフトは自動進行！ヒーローから出るアイコンが<span class=\"term\">クラフトパワー</span>です (4 色あり)。",
      "完了までに色別ノルマを達成できれば、より<span class=\"term\">高品質</span>な仕上がりに♪",
    ],
    en: [
      "Crafts run automatically — the icons heroes emit are <span class=\"term\">Craft Power</span> (4 colors).",
      "Hit all color norms before time runs out for a <span class=\"term\">higher-quality</span> piece♪",
    ],
  },

  /** ランドタブ初回オープン時 (= state.homeLand がまだ無い状態) */
  landFirstFree: {
    ja: [
      "ランドノードには<span class=\"term\">ランドセクタの通行証</span>が必要です (通常 500 GUM)。",
      "最初の 1 つだけ<span class=\"term\">ホームランド</span>として無料で加入できます。後から変更不可なので慎重に♪",
    ],
    en: [
      "Land nodes need a <span class=\"term\">Land Sector Pass</span> (normally 500 GUM).",
      "Your first land is FREE as your <span class=\"term\">Home Land</span>. Choose carefully — you can't change it later♪",
    ],
  },
};

/** state.tutorial 初期値 (全フローを未表示にする) */
export function makeInitialTutorialState() {
  return {
    home: false,
    craftSelect: false,
    craftConfirm: false,
    heroTeam: false,
    craftInProgress: false,
    /** Phase 1D-16: ランドタブ初回オープンで「初回ランド無料」のマイ説明 */
    landFirstFree: false,
  };
}

/** ─── 初期解放データ (Phase 1D-5) ──────────────────────────────── */

/** 初期所持ヒーロー (3 名固定 / Common):
 *  シートン (1004) / 伊能忠敬 (1005) / ピタゴラス (1006)
 */
export const INITIAL_HERO_IDS = [1003, 1004, 1005, 1006];  // 張遼 / シートン / 伊能忠敬 / ピタゴラス

/** 初期解放エクステンション (4 件):
 *  ノービスブレード (1001) / ノービスマスケット (1002) /
 *  ノービスペン (1003) / ノービスアーマー (1004)
 *  以降のエクステンションはファクトリーレベル up や本編進行で解放予定。
 */
export const INITIAL_UNLOCKED_EXT_IDS = [1001, 1002, 1003, 1004];

/** Phase 1D-22: 初期解放シリーズ (= レシピ初期所持)。
 *  上記 4 件の ext がそれぞれ属するシリーズ。クラフト解放は
 *  unlockedSeries × factoryLevel から動的に決定される。 */
export const INITIAL_UNLOCKED_SERIES = ["ブレード", "マスケット", "ペン", "アーマー"];
