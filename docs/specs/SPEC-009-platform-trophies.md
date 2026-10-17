# SPEC-009 — bearko.games 共通基盤のトロフィー

| 項目 | 内容 |
|---|---|
| 状態 | Accepted（作者の決定 2026-10-17：トロフィー 4 つと名前） |
| 関連 | SPEC-001（期限・クリア・節目）、SPEC-002（セーブ）、SPEC-003（RTA）、bearko/MyCryptoPortfolio の SPEC-001 9.4（定義）・INTEGRATION.md 3.2 |

## 1. 背景

共通基盤のトロフィー（bearko.games のマイページに並ぶ実績）に Factory はまだ参加していない。定義は共通基盤の `platform/trophies.js` に足した（MyCryptoPortfolio#37）。ゲームからは条件を満たしたときに `BearkoGames.unlockTrophy(id)` を送る。

## 2. 目標 / 非目標

- **目標**：下の 4 つを、条件を満たしたときに送る。セーブから続けたときも、すでに満たしている分を送る（トロフィーが入る前に遊んでいた人も取れる）
- **非目標**：ゲーム内の報酬・遊び方を変えること、ゲーム内にトロフィーの一覧を作ること（一覧は bearko.games のマイページ）、旧ランキング（GAS）

## 3. 仕様

### 3.1 トロフィー（作者の決定。名前はマイクリのパッシブスキル名）

| ID | 名前 | 由来 | 条件（state で見るもの） |
|---|---|---|---|
| `factory.lv2` | エレキテル | 平賀源内 | 工房 Lv.2 になった（`factoryLevel >= 2`） |
| `factory.legendary` | ダビデの覚醒 | ミケランジェロ | Legendary のエクステンションをクラフトした（`craftedByRarity.legendary > 0`。打ち直しで Legendary にしたものも含む） |
| `factory.clear` | エジソン・エフェクト | トーマス・エジソン | 期限（8 年）内に工房 Lv.5（`clearedWeeks != null`。SPEC-001 のクリア） |
| `factory.clear3y` | 来た、見た、勝った | カエサル | 3 年（144 週）以内に工房 Lv.5（`clearedWeeks <= 144`） |

- 3 年は 1 年 = 48 週（1 か月 = 4 週）で数える（`weeksSinceStart` と同じ）。`clearedWeeks` はクリアした週を含む数え方（SPEC-001）

### 3.2 送り方

- どれを満たしているかは純関数 `trophiesFor(state)`（`js/platform.js`）。送るのは `syncTrophies(state)` **1 か所だけ**
- `syncTrophies` は、このページを開いてからまだ送っていないものだけを `unlockTrophy` に渡す（同じものは 1 回だけ。サーバーも同じものは二度数えない）。通知は SDK が出す（はじめて取ったときだけ）
- 呼ぶ場所：
  - `reachMilestone`（工房 Lv・クリア。SPEC-001 3.2）
  - クラフトが終わったとき（`craftedByRarity` を数えた直後）
  - セーブを読み込んだとき（`applyLoadedSave`）
- **`?debug=1` のときは送らない**（`setLevel`・`jumpWeeks` で条件を作れるため。RTA と同じ。SPEC-003 3.1）
- SDK が読めない・通信に失敗しても何もしない（`console.warn` だけ）。ゲームの進行・pauseTime には触らない
- state に項目は足さない（送ったかどうかは `js/platform.js` が持つ。セーブにも入らない）

### 3.3 依存

- npm 依存・ビルドステップは増えない。localStorage の新しいキーはない

## 4. 受け入れ基準

- [ ] 工房 Lv.2 で「エレキテル」、Legendary のクラフトで「ダビデの覚醒」、期限内の Lv.5 で「エジソン・エフェクト」の通知が出る（3 年以内なら「来た、見た、勝った」も）
- [ ] すでに条件を満たしたセーブを「つづきから」で開くと、まだ持っていないトロフィーが送られる
- [ ] `?debug=1` では送られない
- [ ] SDK が読めない状態でもふつうに遊べる

## 5. テスト

- `node --test tests/platform.test.mjs`：`trophiesFor` の条件（Lv・Legendary・クリア・3 年の境目）、`syncTrophies` が同じものを二度送らないこと、SDK がない・失敗するときに例外を出さないこと
- ブラウザ（e2e）：共通基盤をローカルで動かし（MyCryptoPortfolio の `tools/e2e`）、条件を満たしたセーブを置いて「つづきから」→ トロフィーがサーバーに記録されること
