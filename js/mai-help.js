/**
 * mai-help.js — マイによる文脈別ヘルプメッセージ集 (Phase 1D-2)
 *
 * 各画面やトピックに対応する「真面目で丁寧かつ簡潔な」解説テキストを保持する。
 * 工房の右上のマイアイコンから tap → 開いている画面の help を引く想定。
 *
 * 使い方 (main.js 側):
 *   const help = MAI_HELP[contextKey] || MAI_HELP.default;
 *   maiHelpOpen(help.titleJa, help.bodyJa);
 */

/** 全 help エントリ (title + body は ja/en 並列で持つ) */
export const MAI_HELP = {
  // ── ホーム画面 (デフォルト) ──
  home: {
    titleJa: "工房の遊び方",
    titleEn: "How to play",
    bodyJa: [
      "ようこそマイクリ工房 (MyCryptoFactory) へ！",
      "右下の MENU から各機能にアクセスできます。",
      "クラフト → 受注やマーケット販売用のエクステンションを作る",
      "クエスト → ヒーローを派遣して素材を集める",
      "マーケット → 完成エクステンションを売却 / ヒーローを雇用",
      "ホーム画面で待機している間のみ時間が進みます (1 週 = 7 秒)。",
      "メニューを開いている間は時間が止まります。",
    ].join("\n"),
    bodyEn: [
      "Welcome to MyCryptoFactory!",
      "Tap MENU at bottom right to open features.",
      "Craft → develop extensions for clients or the market",
      "Quest → dispatch heroes to gather materials",
      "Market → sell completed extensions / hire heroes",
      "Time advances only on the home screen (1 week = 7 sec).",
      "Time pauses while a menu or sub-screen is open.",
    ].join("\n"),
  },

  // ── ヒーロー画面 ──
  hero: {
    titleJa: "ヒーローについて",
    titleEn: "About heroes",
    bodyJa: [
      "ヒーローはクラフトやクエストの主役です。",
      "上部の「クラフトチーム」枠 (最大 5 体) に配属するとそのヒーローが",
      "クラフト中に活躍してくれます。",
      "・クラフトLV: 4 元素値 (ガルーダ/イフリート/リヴァイアサン/ティアマト) の合計",
      "・士農工商: 歴史的活躍に基づく属性。対応モードで 1.5 倍ブースト",
      "・体力 (HP): クラフトやクエストで消費。0 になると休憩状態に",
      "・「休憩」ボタン: 配属外で HP が減ったヒーローを能動的に休ませられます",
    ].join("\n"),
    bodyEn: [
      "Heroes drive crafts and quests.",
      "Assign up to 5 heroes to the craft team at the top.",
      "・Craft Lv: sum of the 4 element values",
      "・士農工商 (warrior/farm/craft/merchant): historical attribute that gives a 1.5x boost to the matching mode",
      "・HP: consumed during craft/quest — at 0 the hero rests automatically",
      "・Rest button: actively rest a hero whose HP is below max",
    ].join("\n"),
  },

  // ── クラフト：選択画面 ──
  craftSelect: {
    titleJa: "エクステンションを選ぼう",
    titleEn: "Pick an extension",
    bodyJa: [
      "147 種類の Common エクステンションから 1 つを選びます。",
      "・緑ラベル「クラフト可能」 = 素材も Lv も足りている",
      "・赤ラベル = 素材または Lv が不足 (それぞれ別文言)",
      "・並び順「クラフト可能順」では作れる ext が上位に来ます",
      "ext をタップすると確認画面に進みます。",
    ].join("\n"),
    bodyEn: [
      "Pick from 147 Common extensions.",
      "・Green label 'Craftable' = materials & level OK",
      "・Red label = materials or level short",
      "・'Craftable first' sort surfaces makeable ones",
      "Tap an extension to open the confirmation screen.",
    ].join("\n"),
  },

  // ── クラフト：確認画面 ──
  craftConfirm: {
    titleJa: "クラフト確認",
    titleEn: "Confirm craft",
    bodyJa: [
      "選択した ext の必要基準値 / 必要素材 / 配属チームを確認できます。",
      "・必要基準値 = 4 色を満たすまでクラフトを続けます",
      "・必要素材 = 開始時に消費されます",
      "・配属チーム = ヒーローのアイコンや「変更」ボタンから編成変更可能",
      "・合計クラフトLv: 工属性ヒーローは 1.5 倍補正されます",
      "条件を満たしていれば「クラフト開始」を押して工房を稼働！",
    ].join("\n"),
    bodyEn: [
      "Review base values, materials, and assigned team.",
      "・Base values: craft continues until all 4 colors are met",
      "・Materials: consumed at start",
      "・Team: tap an icon or the 'Change' button to edit",
      "・Total Craft Lv: 工 (artisan) heroes get a 1.5x bonus",
      "Hit 'Start Craft' once requirements are met.",
    ].join("\n"),
  },

  // ── クエスト画面 ──
  quest: {
    titleJa: "クエストの基本",
    titleEn: "About quests",
    bodyJa: [
      "ヒーロー 3 名を派遣して素材を集めます。",
      "・ノードによって入手しやすい素材が異なります",
      "・難易度 初級 (8 週) / 中級 (12 週) / 上級 (16 週)",
      "・成功率はチームのクエストLv ÷ 必要 Lv で決まります",
      "・農属性ヒーローは 1.5 倍補正、HP 減で貢献度が下がります",
      "・成功時のみ素材を入手、いずれにしてもヒーローは HP 0 で帰還します",
    ].join("\n"),
    bodyEn: [
      "Dispatch 3 heroes to gather materials.",
      "・Each node has biased material drops",
      "・Difficulty: easy (8wk) / normal (12wk) / hard (16wk)",
      "・Success rate = team quest Lv / required Lv",
      "・農 (farm) heroes get 1.5x; lower HP reduces contribution",
      "・Materials only on success; heroes always return at 0 HP",
    ].join("\n"),
  },

  // ── マーケット画面 ──
  market: {
    titleJa: "マーケットについて",
    titleEn: "About the market",
    bodyJa: [
      "・倉庫: 完成したエクステンションの一覧。打ち直しもここから",
      "・雇用: プランを選んで担当を決めると、1 か月後に候補が届きます",
      "・出品: 速さ (約 1・4・8 週) を選んで売ります。値段は相場の 85〜120%、手数料 10%",
      "・オークション: 毎月 4 週目の終わりに開催 (1 回 1 品・出品料 100 GUM)。注目度が高いほど高く売れますが、入札が 0 件だと売れずに倉庫へ戻ります",
      "注目度は 査定・レアリティ・担当が「商」・今月の人気シリーズ で上がります。",
      "出品もオークションも、担当は品と同じレアリティ以上のヒーローか「商」のヒーローです。",
      "査定の tier (凡作 → 傑作) が高いほど高く売れます。",
    ].join("\n"),
    bodyEn: [
      "・Warehouse: your finished extensions. Remake them from here",
      "・Hire: pick a plan and a recruiter; candidates arrive after a month",
      "・Sell: choose a pace (~1, 4 or 8 weeks). Price is 85–120% of market, 10% fee",
      "・Auction: held at the end of week 4 each month (one item, 100 GUM fee). Higher attention sells higher, but with no bids the item returns to the warehouse",
      "Attention rises with appraisal, rarity, a 商 (merchant) seller and this month's popular series.",
      "For both selling and auctions, the seller must be of equal or higher rarity than the item, or have 商.",
      "Higher appraisal tiers (Mediocre → Masterpiece) sell higher.",
    ].join("\n"),
  },

  // ── デフォルト fallback ──
  default: {
    titleJa: "ヘルプ",
    titleEn: "Help",
    bodyJa: "現在の画面についての説明はまだ用意されていません。",
    bodyEn: "Help for this screen isn't available yet.",
  },
};
