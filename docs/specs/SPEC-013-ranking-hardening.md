# SPEC-013 — ランキングの表示を固くする（セキュリティの見直し）

| 項目 | 内容 |
|---|---|
| 状態 | Done（作者の依頼 2026-10-18「脆弱性・セキュリティのチェック」。low） |
| 関連 | 旧ランキング（GAS。`js/factory-ranking-client.js`・`docs/setup-google-apps-script.md`） |

## 1. 背景

ランキングの画面は、GAS から来た順位（`rank`）と点（`score`）をそのまま HTML に入れていた。いまの GAS は数に直して返すので悪用はできないが、GAS の実装が変わったり、送り先（`mcf.rankingApiUrl`）を別のサーバーに変えたりすると、そこから HTML が入る。

## 2. 仕様

- 順位と点は数に直してから HTML に入れる（数でなければ 0）。名前と meta はいままでどおりエスケープ
- GAS のサンプル：`= + - @` で始まる名前は先頭に `'` を付けて保存する（シートの数式として動かさない）。**デプロイ済みの GAS は作者が手で反映する**
- CI に `permissions: contents: read`（ジョブ名 `build-and-test` は変えない）
