# SPEC-003 — bearko.games 共通基盤の RTA（工房 Lv.5）

| 項目 | 内容 |
|---|---|
| 状態 | Approved（作者の決定 2026-10-17：RTA を今回の範囲に入れる） |
| 関連 | SPEC-001（期限・クリア・節目）、SPEC-002（セーブ）、bearko/MyCryptoPortfolio の SPEC-001 6.9（レギュレーション `factory-lv5`）・INTEGRATION.md 3.4 |

## 1. 背景

SPEC-001 でクリア（期限内に工房 Lv.5）と節目（Lv.2〜4・各年の終わり）を決め、節目は `reachMilestone(id)` の 1 か所から知らせるようにした。そこに共通基盤の RTA をつなぐ。

## 2. 目標 / 非目標

- **目標**：タイトルの「RTA で始める」から、2018 年 12 月 1 週の開始から期限内の工房 Lv.5 までの時間を計る。区切りは工房 Lv.2・3・4。結果は bearko.games の RTA ランキングに載る
- **非目標**：セーブから続けた計測（再読み込みすると計測は消える）、各年の終わりを区切りにすること（年の長さは遊び方で変わらないので、RTA の区切りにならない）、旧ランキング（GAS）の置き換え

## 3. 仕様

### 3.1 始め方

- タイトルに「⏱ RTA で始める」を置く。**共通基盤の SDK（`BearkoGames.rta`）があるときだけ**出す。`?debug=1` のときは出さない（日付送り・20 倍速があるため）
- 押すと「はじめから」と同じく新しいゲームを始める。セーブがあれば、はじめからと同じ確認（セーブを消す）を挟む
- 計測の開始はタイトルを閉じて時間が動き出すとき（`rta.start({ regulation: "factory-lv5", timerOffset })`）。経過時間の表示は SDK が画面の上に出すので、ヘッダーと目標バナーの下まで下げる

### 3.2 計測

| とき | 呼ぶもの | 場所 |
|---|---|---|
| 工房 Lv.2・3・4 になった | `rta.checkpoint("lv2" / "lv3" / "lv4", { igtMs })` | `reachMilestone`（SPEC-001 3.2） |
| 期限内に工房 Lv.5（クリア） | `rta.checkpoint("clear", { igtMs })` | `reachMilestone("clear")` |
| 期限（8 年）が来た・ヒーロー 0 名でゲームオーバー | `rta.abort()` | `checkWeekMilestones`・`triggerDeficitGameOver` |

- 区切りの対応は純関数 `rtaCheckpointFor(milestoneId)`（`js/platform.js`）。`year1`〜`year8` は `null`（送らない）
- `igtMs` はゲーム内の経過（`tickCount × 1000`。1 週 = 7 秒で数える。2 倍速でも同じ）
- 計測中かどうかは `js/platform.js` が持つ（state には入れない。セーブにも入らない）
- SDK が読めない・通信に失敗しても何もしない（`console.warn` だけ）。ゲームの進行・pauseTime には触らない

### 3.3 依存

- npm 依存・ビルドステップは増えない。localStorage の新しいキーはない

## 4. 受け入れ基準

- [ ] SDK があるときだけタイトルに「RTA で始める」が出る（`?debug=1` では出ない）
- [ ] 始めると画面の上に RTA の経過時間が出て、ヘッダーと重ならない
- [ ] 工房 Lv.2・3・4 で区間タイムの通知、期限内の Lv.5 で公式タイムの通知が出る
- [ ] 期限・ゲームオーバーで計測が終わる（abort）
- [ ] SDK が読めない状態では「RTA で始める」が出ず、ふつうに遊べる

## 5. テスト

- `node --test tests/platform.test.mjs`：節目 → 区切りの対応、計測中だけ区切り・中断を送ること、SDK がない・失敗するときに例外を出さないこと
- ブラウザ：SDK の代わりの偽物（`window.BearkoGames`）を置き、`?debug` なしで RTA で始める → Lv の区切りが順に送られること（偽物で `setLevel` 相当を呼ぶ）
