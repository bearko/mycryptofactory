# SPEC-012 — 全体チャット（窓を開いているあいだは時間を止める）

| 項目 | 内容 |
|---|---|
| 状態 | Done（作者の依頼 2026-10-17「全タイトルに全体チャット」。共通基盤 SPEC-004 6 章の表のとおり） |
| 関連 | 共通基盤 SPEC-004（部屋・API・SDK 1.6.1 は MyCryptoPortfolio #49 / #50）・SPEC-003（共通基盤への窓口 `js/platform.js`）・SPEC-004（UI の土台。モーダルは時間を止める） |

## 1. 背景

bearko.games の全体チャット（SDK 1.6.0 の `BearkoGames.chat`）は、`init()` を呼ぶだけで右下に 💬 として出る。
窓そのものは SDK が描く。このゲームで決めるのは、**窓を開いているあいだ時間を止める** ことだけ
（モーダルを開いたら `pauseTime`、閉じたら `resumeTime` という作法。CLAUDE.md）。

## 2. 仕様

- 位置は右下（SDK の既定）。どの画面でも出す（経営の画面は待ち時間が多い）
- SDK 1.6.1 の `chat.onToggle(fn)` で、開いた（true）・閉じた（false）を受け取る（`js/platform.js` の `wireChat`。`init` のあとに登録）
  - `onChatToggle(fn)` で main.js が `pauseTime` / `resumeTime` を登録する（platform.js は時間に触らない。SPEC-003 の作法）
  - 同じ状態が 2 度来ても 1 回しか伝えない（pause と resume を必ず対にするため）
- `isChatOpen()`：pause の見張り（#117 `tickPauseWatchdog`）が「画面が開いていないのに止まっている」と誤って戻さないよう、`isAnyOverlayOpen` が true を返す。窓は SDK の shadow DOM にあり、既存の selector には掛からない
- SDK がない・古い（`onToggle` が無い。1.6.0 まで）なら何もしない。💬 は 1.6.0 でも出るが、時間は止まらない

## 3. 非ゴール

- 窓の見た目・発言の決まり（200 文字・連投・締め出し）は共通基盤 SPEC-004
- 窓を隠す画面は作らない（止める作法があるので、どの画面でも開いてよい）

## 4. テスト

- `node --test tests/platform.test.mjs`：SDK が古いときは何もしない。開いた・閉じたを 1 回ずつ伝え、`isChatOpen` が追う
- `node --check js/*.js`
- 手で：本番で 💬 を開くと週が進まず、閉じると進む。開いたまま 3 秒以上たっても見張りが戻さない
