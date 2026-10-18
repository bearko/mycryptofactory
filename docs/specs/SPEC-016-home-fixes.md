# SPEC-016 — 💬 の置き場所・GUM のアイコン・MENU を光らせる時機

| 項目 | 内容 |
|---|---|
| 状態 | Done |
| 関連 | SPEC-007（指差し）、SPEC-012（全体チャット）。作者の指摘 2026-10-18（スマホの画面） |

## 1. 背景

- 全体チャットの 💬（共通基盤の SDK が右下に出す）が、マイのセリフの「次へ／閉じる」ボタンに重なっていた
- ヘッダーとマーケットの GUM のアイコンが出ていなかった（`www.mycryptoheroes.net` の画像を直接読んでいた）
- マイが「まずは**光っている** MENU から」と言う行では MENU がまだ光っておらず、セリフを閉じてから光っていた

## 2. 仕様

### 2.1 💬 を MENU ボタンのすぐ上に

- SDK の `chat.setPosition({ position: "bottom-right", offset })`（1.7.0）で、💬 の右端を MENU の右端にそろえ、MENU の上 8px に置く
- 置き直すとき：タイトルを閉じたとき・SDK の準備ができたとき・画面の大きさが変わったとき・スクロールしたとき
- タイトルにいるとき・MENU が画面に見えていないときは、既定の右下（16px）に戻す。画面の上端からはみ出さないようにする
- offset の計算は純関数 `chatOffsetAbove(rect, vw, vh)`（`js/platform.js`）。PC の右側のドックには関係しない（SDK が 💬 を出さない）

### 2.2 GUM のアイコン

- `bearko/mycryptoheroes` の `Image/Icons/gum.png` を raw URL で読む（ほかの絵と同じ置き場所。CLAUDE.md の決まりどおり）

### 2.3 MENU を光らせる時機

- `maiSaysSequence` に `onLine(idx, 行数)` を足し、ホームのチュートリアルの最後の行（「まずは光っている MENU から」）を出した瞬間に MENU を光らせる
- 1 行目（あいさつ）では光らせない。セリフを閉じたあとも、クラフト画面に着くまで光り続ける（SPEC-007 のまま）

## 3. 受け入れ基準

- [ ] スマホで、💬 が MENU のすぐ上にあり、マイの「次へ／閉じる」に重ならない
- [ ] ヘッダーとマーケットに GUM のアイコンが出る
- [ ] マイが「光っている MENU から」と言うときに MENU が光っている

## 4. テスト

- `node --test tests/platform.test.mjs`：`chatOffsetAbove`（ふつう・見えていない・上端・下端）、`placeChat`（同じ場所なら呼ばない・SDK がなくても例外なし）
- Playwright（390×844・360×640、`setPosition` で 💬 を描く SDK の代わりを置く）：1 行目は光らない・2 行目で MENU が光る、💬 が MENU の上でマイのボタンに重ならない、スクロールしてもついてくる、GUM のアイコンの URL
- 本物の SDK の 💬 の位置は作者がスマホで確認する（`env(safe-area-inset-bottom)` の分だけ、iPhone では少し上に出る）
