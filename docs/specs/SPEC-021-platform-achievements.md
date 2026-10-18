# SPEC-021 — bearko.games のアチーブメント（ヒーロー名鑑とエクステンション）

| 項目 | 内容 |
|---|---|
| 状態 | Done |
| 関連 | SPEC-009（トロフィーの送り方。この SPEC で一覧を置き換える）、SPEC-001（工房 Lv・クリア・50 年）、SPEC-002（セーブ）、bearko/MyCryptoPortfolio の SPEC-008（アチーブメント図鑑。5.1「ゲーム側で送るもの」）と `docs/ACHIEVEMENT_CATALOG.md` |

## 1. 背景

共通基盤で「トロフィー」を「**アチーブメント**」に改め、**ヒーロー名鑑 100 枚**と**エクステンション 39 個**に組み直した（MyCryptoPortfolio の SPEC-008。作者の決定 2026-10-18）。Factory の分は名鑑 11 枚（No.012〜022）とエクステンション 4 個。いま送っている 4 つ（`lv2`・`legendary`・`clear`・`clear3y`）に、新しい 10 個を足す。名前と絵も共通基盤の定義（`platform/trophies.js`）のとおりに変わる。

API・ID は今までどおり `unlockTrophy` / `factory.*` のまま（共通基盤がそう決めた）。

## 2. 目標 / 非目標

- **目標**：下の一覧のうち `factory.visit` を除く 14 個を、条件を満たしたときに送る。すべてセーブに残る値から判定できるので、起動時（つづきから）と節目でまとめて送る（前から遊んでいる人にも付く）
- **非目標**：ゲーム内の報酬・遊び方・バランスを変えること、セーブの形を変えること（新しい保存項目は足さない）、ゲーム内に一覧を作ること

## 3. 仕様

### 3.1 アチーブメント（定義は共通基盤。名前・絵は ACHIEVEMENT_CATALOG.md の値）

**ヒーロー名鑑**

| No. | ID | 名前 | 絵 | 条件（state で見るもの） |
|---|---|---|---|---|
| 012 | `factory.lv2` | ボストン・ストロング・ボーイ | ジョン・L・サリバン | 工房 Lv.2（`factoryLevel >= 2`） |
| 013 | `factory.lv3` | 凧とライデン瓶の雷実験 | ベンジャミン・フランクリン | 工房 Lv.3（`factoryLevel >= 3`） |
| 014 | `factory.rank3` | けだものあつめて すもうのけいこ | 金太郎 | 雇っているヒーローのランクの最大が 3 以上（`ownedHeroes[].rank`） |
| 015 | `factory.passes` | サン・ガブリエル | ヴァスコ・ダ・ガマ | ランド通行証 9 つすべて（`landPasses` に `LAND_NODES` の 9 ランドがそろう。最初の無料のランドも数える） |
| 016 | `factory.lv4` | エレキテル | 平賀源内 | 工房 Lv.4（`factoryLevel >= 4`） |
| 017 | `factory.rank5` | 無敵の剣 | 斎藤一 | 雇っているヒーローのランクの最大が 5（`ownedHeroes[].rank`） |
| 018 | `factory.masterpiece` | 睡蓮 | モネ | 品評会で傑作（45 点以上。`appraisalBest` のどれかが 45 以上） |
| 019 | `factory.clear` | エジソン・エフェクト | トーマス・エジソン | 期限（8 年）内に工房 Lv.5（`clearedWeeks != null`） |
| 020 | `factory.legendary` | テスラコイル | ニコラ・テスラ | Legendary のクラフト（`craftedByRarity.legendary > 0`。打ち直しで Legendary にしたものも含む） |
| 021 | `factory.clear3y` | 来た、見た、勝った | カエサル | 3 年（144 週）以内に工房 Lv.5（`clearedWeeks <= 144`） |
| 022 | `factory.y50` | 聖神皇帝 | 武則天 | 工房を 50 年続ける（`endgameTriggered50y`。2069 年 1 月 1 週に達した） |

**エクステンション**

| ID | 名前 | 絵 | 条件 |
|---|---|---|---|
| `factory.visit` | 日月星辰 | 古代機工三球儀 | 遊ぶ。**SDK が自動で送るので、ゲームからは送らない** |
| `factory.firstcraft` | 蒸着 | フリューテッドアーマー | 初めてクラフトする（`craftCompletedCount >= 1`） |
| `factory.firstquest` | 一日千里 | 赤兎馬 | 初めてクエストに成功する（`questClearCount >= 1`） |
| `factory.crafts50` | 万能人の遺稿 | アトランティコ手稿 | クラフトを通算 50 回（`craftCompletedCount >= 50`） |

- ランクは雇用を解くと見えなくなるが、一度送ったものは共通基盤に残るので、それでよい
- 品評会の点は、クラフト（打ち直しを含む）が終わったときの査定（`js/factory-appraisal.js`。45〜50 点が「傑作」）

### 3.2 送り方（SPEC-009 3.2 のまま）

- どれを満たしているかは純関数 `trophiesFor(state)`（`js/platform.js`）。送るのは `syncTrophies(state)` 1 か所だけで、このページを開いてから送っていないものだけを**1 つずつ順に**送る
- `main.js` の `syncPlatformTrophies()` を呼ぶ場所（毎 tick では呼ばない）：
  - セーブを読み込んだとき（`applyLoadedSave`）
  - `reachMilestone`（工房 Lv.2〜5・クリア）
  - クラフトが終わったとき（`craftCompletedCount`・`craftedByRarity`・`appraisalBest` を数えた**あと**）
  - クエストに成功したとき（`questClearCount` を数えたあと）
  - ヒーローのランクが上がったとき（強化画面の `rankUpHero`、ショップの「妖精の粉」）
  - ランド通行証を手に入れたとき（`buyLandPass`）
  - 50 年に達したとき（`endgameTriggered50y` を立てたあと）
- `?debug=1` のときは送らない。SDK が読めない・通信に失敗しても何もしない

### 3.3 文言

- ゲームの画面に「トロフィー」という語は出ていない（一覧・名前はゲーム内に出さない）。これからは「アチーブメント」と呼ぶ

### 3.4 依存

- npm 依存・ビルドステップ・localStorage のキー・セーブの項目は増えない

## 4. 受け入れ基準

- [ ] 上の 14 個が、条件を満たしたときに送られる（共通基盤の公開前は 400 ではじかれるだけで、遊びには影響しない）
- [ ] 条件を満たしたセーブを「つづきから」で開くと、まだ送っていないものが順に送られる
- [ ] `?debug=1` では送られない

## 5. テスト

- `node --test tests/platform.test.mjs`：`trophiesFor` の各条件と境目（Lv 3・4、ランク 3・5、通行証 8 と 9、査定 44 と 45、クラフト 1 と 50、クエスト 1、50 年）、通行証の数が `LAND_NODES` と合っていること、`syncTrophies` が同じものを二度送らないこと
