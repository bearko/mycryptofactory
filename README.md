# MyCryptoFactory

MCH 経済圏をモチーフにした、カイロソフト「ゲーム発展国++」風の工房経営シム。マイクリ工房（MyCryptoFactory）を **8 年以内に工房 Lv.5** に育てるのが目標です。GUM（ゲーム内通貨）を稼ぎ、ヒーローを雇い、クラフト・クエスト・出品で工房を大きくしていきます。

- **遊ぶ**：https://factory.bearko.games/
- 版：β2（v1.0 に向けて仕上げ中。進み具合は [bearko/MyCryptoPortfolio の ROADMAP](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/ROADMAP.md)）
- bearko.games 共通基盤の総合スコアに参加しています（[docs/platform-score.md](docs/platform-score.md)）

## 遊び方

- 1 週は 7 秒で進みます（設定で 2 倍速）。2018 年 12 月 1 週に始まります。メニューやお知らせを開いている間は時間が止まります
- **クラフト**：ヒーローを配属してエクステンションを作ります。完成すると品評会で点が付き、倉庫に入ります
- **クエスト**：ヒーローを 3 体まで派遣して素材を集めます。ランドのクエストには通行証が要ります
- **マーケット**：倉庫のエクステンションを出品して GUM を得ます。ヒーローの雇用もここから
- **ショップ**：工房を助けるアイテムを GUM で買えます
- **工房レベルアップ**：条件と GUM がそろうと Lv が上がり、設備・並行で動かせる数・ヒーローの上限・作れるエクステンションが増えます
- 3 月に年俸を払い、12 月にはコンテストがあります。赤字が長く続くとヒーローが去っていき、0 名になるとゲームオーバーです

## 開発

ビルドはありません。プレーン ES Modules + バニラ JS で、リポジトリのルートをそのまま配信します。

```
npx http-server -c-1 .       # ローカルで開く（何でもよい静的サーバー）
node --test tests/*.test.mjs # テスト（Node 22）
```

- 仕様：`docs/specs/`（SPEC-NNN）
- 開発の決まり：[CLAUDE.md](CLAUDE.md)
- デプロイ：`main` にマージすると、Cloudflare Workers Builds が factory.bearko.games に自動で公開します（`wrangler.jsonc`）
- CI：`.github/workflows/ci.yml`（構文・JSON・テスト）

## ライセンス

ソースコードと文書は [MIT](LICENSE) です。My Crypto Heroes のキャラクター・エクステンション・背景などの画像と、MCH の素材を含む画像（マイ・ロゴ・OGP 画像など）は対象外で、MCH Co., Ltd. に帰属します。`Audio/` の音声も対象外です。画像は [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) から参照しています。
