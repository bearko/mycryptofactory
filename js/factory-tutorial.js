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

/** 全チュートリアルフロー */
export const TUTORIALS = {
  /** 初回ホーム (タイトルから入った直後) */
  home: {
    ja: [
      "はじめまして！本工房のアシスタントを務めますマイです。",
      "一緒にこの工房を発展させていきましょう！",
      "まずはメニューを開いて、クラフトをしていきましょう。",
    ],
    en: [
      "Hello! I'm Mai, your workshop assistant.",
      "Let's grow this workshop together!",
      "First, open the menu and start crafting.",
    ],
  },

  /** クラフト選択画面の初回 */
  craftSelect: {
    ja: [
      "ここではクラフトするエクステンションを選べます。",
      "今はまだ作れるエクステンションは少ないですが、工房が大きくなればつくれるエクステンションも増えていきます！",
      "まずは好きなエクステンションを選んでみてください。",
    ],
    en: [
      "Here you can pick an extension to craft.",
      "Available options are limited for now, but they'll grow as the workshop expands!",
      "Pick whichever extension catches your eye.",
    ],
  },

  /** クラフト確認画面 (ヒーロー未編成) の初回 */
  craftConfirmNoTeam: {
    ja: [
      "エクステンションは鉄や銅などの素材に、クラフトパワーを注ぐことで開発できます。",
      "クラフトパワーを注ぐには、ヒーローを配置しましょう。",
      "配属チームの「+」ボタンか「変更」ボタンを押してヒーローを編成しましょう。",
    ],
    en: [
      "Extensions are crafted by pouring craft power into materials like iron and copper.",
      "To pour craft power, we need to assign heroes.",
      "Tap the '+' slot or 'Change' button to assemble your team.",
    ],
  },

  /** クラフト確認画面 (ヒーロー編成済み) の初回 */
  craftConfirmWithTeam: {
    ja: [
      "エクステンションは鉄や銅などの素材に、クラフトパワーを注ぐことで開発できます。",
      "クラフトパワーを注ぐには、ヒーローを配置しましょう。",
      "早速クラフト開始しましょう！",
    ],
    en: [
      "Extensions are crafted by pouring craft power into materials like iron and copper.",
      "To pour craft power, we need to assign heroes.",
      "Let's start the craft right away!",
    ],
  },

  /** クラフトチーム編成画面 (= ヒーロー画面) の初回 */
  heroTeam: {
    ja: [
      "ここではエクステンションをクラフトするヒーローを編成できます。",
      "今は4体のみですが、最大5体のヒーローを配置できます。",
      "ヒーローを配属させたら、右上の戻るボタンで戻りましょう。",
    ],
    en: [
      "Here you can assemble the heroes who'll craft your extensions.",
      "You have 4 heroes for now — up to 5 can be assigned.",
      "Once heroes are placed, tap the back button at top right to return.",
    ],
  },

  /** クラフト中画面の初回 (= 戻ってきて activeCraft が走っているとき) */
  craftInProgress: {
    ja: [
      "クラフトは自動で進行します。",
      "ヒーローから出ているアイコンがクラフトパワーです。",
      "クラフトパワーはガルーダ、イフリート、リヴァイアサン、ティアマトの4種類があります。",
      "名前、かっこいいですよね♪",
      "クラフトパワーは4種類あって、エクステンションごとに色別のノルマが設定されています。",
      "クラフト完了までにノルマを達成できれば、高品質のエクステンションとなります。",
    ],
    en: [
      "Crafts progress automatically.",
      "The floating icons coming off your heroes are craft power.",
      "There are 4 craft powers: Garuda, Ifrit, Leviathan, and Tiamat.",
      "Cool names, right? ♪",
      "Each extension sets per-color norms for these powers.",
      "Hit all the norms before completion to produce a higher-quality piece.",
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
