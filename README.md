# MyCryptoFactory

MCH 経済圏をモチーフにした、カイロソフト「ゲーム発展国++」風の工房経営シム。マイクリ工房（MyCryptoFactory）を **8 年以内に工房 Lv.5** に育てるのが目標です。GUM（ゲーム内通貨）を稼ぎ、ヒーローを雇い、クラフト・クエスト・出品で工房を大きくしていきます。

- **遊ぶ**：https://factory.bearko.games/
- 版：**v1.0.0**（[更新履歴](CHANGELOG.md)）
- bearko.games 共通基盤の総合スコア（[docs/platform-score.md](docs/platform-score.md)）と RTA（レギュレーション「Factory 工房 Lv.5」）に参加しています

## 遊び方

- **目標**：2018 年 12 月 1 週に始まり、**8 年のうちに工房 Lv.5** にするとクリアです。届かなくても 8 年で成績が出て、そのあとも遊べます
- 1 週は 7 秒で進みます（設定で 2 倍速）。メニューやお知らせを開いている間は時間が止まります
- 月の初めに、このブラウザへ自動で保存します。タイトルの「つづきから」で再開できます。タイトルの「⚙ 設定」で、始める前に音・言語を変えられます
- **クラフト**：ヒーローを配属してエクステンションを作ります。完成すると品評会で点が付き、倉庫に入ります
- **クエスト**：ヒーローを 3 体まで派遣して素材を集めます。ランドのクエストには通行証が要ります
- **マーケット**：倉庫のエクステンションを出品して GUM を得ます。ヒーローの雇用もここから
- **ショップ**：工房を助けるアイテムを GUM で買えます
- **工房レベルアップ**：条件と GUM がそろうと Lv が上がり、設備・並行で動かせる数・ヒーローの上限・作れるエクステンションが増えます
- 3 月に年俸を払い、12 月にはコンテストがあります。赤字が長く続くとヒーローが去っていき、0 名になるとゲームオーバーです
- **設定**（メニュー）：時間 2 倍速、BGM・効果音の ON/OFF と音量、演出を減らす、言語
- **RTA**：タイトルの「⏱ RTA で始める」で、bearko.games の RTA ランキングに挑めます（工房 Lv.2・3・4・5 で区切り）

## 開発

ビルドはありません。プレーン ES Modules + バニラ JS で、リポジトリのルートをそのまま配信します。

```
npx http-server -c-1 .       # ローカルで開く（何でもよい静的サーバー）
node --test tests/*.test.mjs # テスト（Node 22）
# 確かめるときは ?debug=1 を付けると window.mcfDebug（jumpWeeks / setLevel / addGum / fast）が使える
```

- 仕様：`docs/specs/`（SPEC-NNN）
- 開発の決まり：[CLAUDE.md](CLAUDE.md)
- デプロイ：`main` にマージすると、Cloudflare Workers Builds が factory.bearko.games に自動で公開します（`wrangler.jsonc`）
- CI：`.github/workflows/ci.yml`（構文・JSON・テスト）

## ライセンス

ソースコードと文書は [MIT](LICENSE) です。My Crypto Heroes のキャラクター・エクステンション・背景などの画像と、MCH の素材を含む画像（マイ・ロゴ・OGP 画像など）は対象外で、MCH Co., Ltd. に帰属します。`Audio/` の音声も対象外です。画像は [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) から参照しています。
