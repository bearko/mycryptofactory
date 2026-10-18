# SPEC-014 — 版権キャラクター（猿田彦）を表示しない

| 項目 | 内容 |
|---|---|
| 状態 | Done（作者の依頼 2026-10-18「猿田彦は版権キャラなので表示しないように。アセットは削除」） |
| 関連 | bearko/mycryptoheroes #16（素材 DB から削除済み）、MyCryptoWorkshop #15、mycryptotactics（同じ対応） |

## 1. 背景

猿田彦（ヒーロー 2035、レプリカ 12035）は第三者の版権キャラクター（コラボのヒーロー。MCH の属性は TEZUKA）なので、bearko.games のどのタイトルにも出さない。素材 DB（bearko/mycryptoheroes）からは画像と記録が消えているので、本作のデータに残っていると、名前だけ出て画像が空のヒーローになる。

## 2. 仕様

- `data/heroes.json`・`data/i18n/heroes-en.json`・`js/factory-attributes.js` から 2035（英名の表は 12035 も）を消す
- `js/heroes.js` の `EXCLUDED_HERO_IDS`：`data/heroes.json` に戻っても（GAS の同期など）読み込まない
- 前のセーブで雇っていた場合：「つづきから」で読むときに `dropExcludedHeroes`（`js/factory-save.js`）が、ヒーローの記録（`heroId` と `nameJa` を持つもの）を配列から取り除き、編成（`team`・`craftTeam`・`questTeam`）の ID を空ける。セーブの形は変えないので `SAVE_VERSION` は上げない

## 3. テスト

- `tests/excluded-heroes.test.mjs`：データと英名の表に入っていない（戻ったら CI が落ちる）、前のセーブから外れる・編成が空く
