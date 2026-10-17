# MyCryptoFactory — Claude Code 開発ガイド

## プロジェクト概要

MCH 経済圏をモチーフにした、カイロソフト「ゲーム発展国++」風の工房経営シム。マイクリ工房（MyCryptoFactory）を **8 年以内に工房 Lv.5** に育てるのが目標。GUM を稼ぎ、ヒーローを雇い、クラフト・クエスト・出品で工房を大きくしていく。

- 本番：https://factory.bearko.games/ （`main` にマージすると Cloudflare Workers Builds が自動で公開する）
- bearko.games 共通基盤（総合スコア）に参加している：[docs/platform-score.md](docs/platform-score.md)
- 仕様は `docs/specs/`（SPEC-NNN）。**コードを変える前に SPEC を書く／直す**

## 技術スタック（変えない）

- **プレーン ES Modules + バニラ JS**。ビルド・トランスパイルなし。`package.json` を作らない（npm 依存を増やさない）
- HTML 単一エントリ（`index.html`。CSS はインライン）。リポジトリのルートをそのまま配信する（`wrangler.jsonc` の `assets.directory: "."`、除外は `.assetsignore`）
- データは `data/*.json` を実行時に fetch する
- ヒーロー・エクステンション・素材の画像は [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) の raw URL を参照する（`js/constants.js` の `ASSET_BASE`）

## ディレクトリ構造

```
index.html                 エントリ（全画面の HTML と CSS）
js/
  main.js                  状態（state）・時間ループ・全画面の描画とイベント（約 9,000 行）
  platform.js              bearko.games 共通基盤への窓口（総合スコア）。純関数はテストあり
  i18n.js                  JP/EN 切替・名前置換
  heroes.js / factory-hero.js  ヒーローマスタの読み込み / MCH の値 → 4 元素 + 体力
  factory-craft.js         エクステンション・レシピ・クラフトの純ロジック
  factory-quest.js         クエスト（通常 4 ノード × 3 難易度・ランド）
  factory-market.js        雇用プラン・出品
  factory-shop.js          ショップのアイテム
  factory-appraisal.js     品評会（5 名審査・50 点満点）
  factory-ext-skill.js     エクステンションのシリーズスキル（docs/ext-skill-design.md）
  factory-attributes.js    士農工商の属性
  factory-audio.js         BGM / SE
  factory-tutorial.js / mai-help.js / factory-hero-flavors.js  マイの案内・ヘルプ・ヒーローのセリフ
  factory-ranking-client.js  旧ランキング（GAS）。docs/setup-google-apps-script.md
  constants.js             画像 URL ヘルパ
data/                      heroes.json / extensions.json / shop-items.json / i18n/
Audio/ Image/              本作で使う音・画像（MCH 由来のものは LICENSE の対象外）
tests/                     node --test のテスト
tools/sim/                 バランスのシミュレーター（quest-balance.mjs / skill-balance.mjs）
docs/                      SPEC・設計メモ
```

## いまのゲーム（Phase 1D-47・β2-3・Phase 2B まで）

- 時間：1 週 = 7 秒（設定で 2 倍速）。2018 年 12 月 1 週に始まる。モーダルを開いている間は止まる
- クラフト（工房 Lv で 1〜3 並行）・品評会・打ち直し・受注クラフト
- クエスト（1〜3 並行）・ランド通行証・休憩後の再出発
- 雇用プラン・スポット雇用・解雇、出品（マーケット）、ショップ、行商人マルコ・ポーロ
- 月次イベント（3 月の年俸・4 月の採用）、12 月のコンテスト
- 工房 Lv 1〜5（条件 + GUM）。Lv で設備・並行数・ヒーロー上限・レシピが増える
- 赤字が 6 か月続くとヒーローが離職し、0 名でゲームオーバー
- 期限は 8 年（384 週・2026/12/1）で、期限内に工房 Lv.5 でクリア（SPEC-001。`js/factory-goal.js`）。節目は `reachMilestone(id)` の 1 か所から知らせる。50 年エンディング（`triggerEndgame50y`）も残している
- 確かめるときは `?debug=1` で `window.mcfDebug`（`jumpWeeks` / `setLevel` / `addGum`）
- セーブ：月の初め・工房レベルアップで localStorage の `mcf.save` に自動保存（SPEC-002。`js/factory-save.js`）。state に項目を足すときは、保存してよいか（一時的なものなら `TRANSIENT_KEYS`）を考える。保存の形を変えたら `SAVE_VERSION` を上げる（古いセーブは捨てられる）

## 作法（暗黙の了解）

### 関数の名前

| 接頭辞 | 用途 | 例 |
|---|---|---|
| `trigger*` | イベントを起動（中で pauseTime を含む） | `triggerCraftCompletion` |
| `open*` / `close*` | モーダルの表示 | `openFactoryLvUpView` / `closeFactoryLvUpView` |
| `render*` | DOM の描画（state を反映） | `renderHeader` |
| `pick*` | ユーザーの選択を state に記録 | `pickExtForConfirm` |
| `apply*` | state の変化を確定する | `applySalary` |
| `find*` / `get*` / `set*` / `tick*` / `is*` / `can*` | 検索 / 取得・設定 / 毎 tick / 真偽 | `canFactoryLvUp` |

### pauseTime / resumeTime は必ず対で

```js
function openMyModal() { pauseTime(); $("myModal").classList.remove("hidden"); }
function closeMyModal() { $("myModal").classList.add("hidden"); resumeTime(); }
```

`maiSays` / `maiSaysSequence` は、すでに止まっていれば自前の pause をしない。

### i18n

`data/i18n/ui.json` に `{"ja": "…", "en": "…"}` で置き、`ti18n(key, fallback)` で引く。HTML は `data-i18n` 属性。

## 開発の流れ

1. 仕様が変わるなら、先に `docs/specs/SPEC-NNN-<topic>.md` を書いて PR（一覧は `docs/specs/SPEC-INDEX.md`）
2. 実装の PR は 1 つの意図に絞る。PR 本文に実行したテストの結果を貼る
3. `main` への PR は squash でマージする

### CI とテスト

- `.github/workflows/ci.yml` のジョブ名 `build-and-test` は、`main` のブランチ保護が要求する名前。**変えない**
- 中身：`node --check js/*.js`・`data/**/*.json` の検査・`node --test tests/*.test.mjs`
- ロジックは純関数に切り出し、Node 標準の `node:test` でテストする（jest などを入れない）

## やってはいけないこと

- `package.json` を作る・npm 依存を足す
- MCH の画像をリポジトリに足す（raw URL を参照する）
- `.env`・認証情報のコミット、`main` への force push
- `.claude/settings.json` を勝手に書き換える
- localStorage のキーは `mcf.` で始める
