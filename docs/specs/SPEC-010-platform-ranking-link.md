# SPEC-010 — bearko.games の総合ランキングへの導線

| 項目 | 内容 |
|---|---|
| 状態 | Accepted |
| 関連 | bearko/MyCryptoPortfolio#29、共通基盤の SPEC-001 3 章（既存のランキングは当面残す）・SPEC-002（総合スコア） |

## 1. 背景

本作には前からのランキング（GAS。`js/factory-ranking-client.js`）があり、bearko.games 共通基盤にも総合スコアのランキングがある。遊ぶ人には 2 つあるように見える（MyCryptoPortfolio#29）。

## 2. 目標 / 非目標

- **目標**：ランキングの画面から、bearko.games の総合ランキング（本作のタブ）へ行けるようにし、2 つが別のものだと分かるようにする
- **非目標**：前からのランキング（GAS）をなくす・寄せること（ゆくゆくの課題）

## 3. 仕様

- ランキング閲覧のモーダル（`#rankingViewer`）の一覧の下に、リンク「bearko.games の総合ランキング ↗」と添え書き「このランキングとは別の、bearko.games のタイトル共通のランキングです」を置く
- 行き先は `https://bearko.games/score/?game=factory`（共通基盤のタイトル別ランキング。総合のタブにも切り替えられる）
- **新しいタブで開く**（`target="_blank" rel="noopener"`）。再読み込みすると RTA の計測が消えるため（SPEC-003）
- 文言は `data/i18n/ui.json`（`ranking.viewer.platform` / `ranking.viewer.platformNote`、ja / en）
- npm 依存・localStorage のキーは増えない

## 4. 受け入れ基準

- [ ] タイトル・ヘッダーの 🏆 から開いたランキングに、リンクと添え書きが出る
- [ ] リンクを押すと、新しいタブで bearko.games の Factory のランキングが開く
- [ ] 英語表示で英語の文言になる

## 5. テスト

- CI（`build-and-test`）
- ブラウザ：`#rankingViewer` を開き、リンク先・新しいタブ・文言（ja / en）を見る
