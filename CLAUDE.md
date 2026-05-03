# MyCryptoFactory — Claude Code 開発ガイド

## プロジェクト概要
MCH 経済圏をモチーフにしたカイロソフト「ゲーム発展国++」風の工房経営シム。マイクリ工房を 8 年以内に世界一の工房に育てるサイクルを楽しむ。

> **Note (2026-05):** 旧版の React+TS+Zustand+Vite scaffold は撤去し、姉妹リポ bearko/mycryptotactics で開発した工房 shell スナップショット (Phase 0 + Phase 1A) で **wholesale replacement** された。旧 scaffold は git tag `legacy-react-ts-scaffold` で復元可能。

## 技術スタック
- **プレーン ES Modules + バニラ JS** (build / transpile なし)
- HTML 単一エントリ (`index.html`)
- Vercel root 配信 (build step 不要)
- ヒーロー / エクステ / アセットは [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) 由来

## ディレクトリ構造
```
index.html        エントリポイント (CSS 全部 inline、JS は ES module で import)
js/
  main.js          ブートストラップ + 状態 + 時間ループ + view ルーティング
  factory-hero.js  ヒーローアダプタ (HP/PHY/INT/AGI → 4 元素 + 体力)
  i18n.js          JP/EN 切替 + 名前置換 + フレーズ翻訳
  heroes.js        ヒーロー JSON ローダ
  constants.js     画像 URL ヘルパ + LEADER ref
  ranking-client.js GAS ランキング送信 (将来用)
  scoring.js       スコア式 (将来用)
  help.js          ヘルプオーバーレイ
data/
  heroes.json      MCH ヒーローマスタ
  i18n/
    ui.json        UI 文字列
    heroes-en.json / extensions-en.json  名前ルックアップ
Image/
  Factory/         工房背景・元素アイコン
```

## 開発フロー (現状)
- 通常の `feature/<short-desc>` ブランチ → `main` への PR
- Jira 駆動・develop ブランチ運用は **撤去** (旧 scaffold 時の運用)
- `.claude/comms/` のサブエージェント claim 制も Phase 1A 時点では使っていない (将来 Phase 1B 以降の並列作業時に再開検討)

## 制約
- ローカル動作完結 (バックエンドは GAS ランキング送信のみ、ウォレット不可)
- アセットは [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) リポジトリ由来のみ
- 効果音 / BGM は CC0 / CC-BY のみ

## Phase ロードマップ
- **Phase 0** (✅): タイトル / 工房 view / ヘッダー / 時間ループ / メニュー雛形
- **Phase 1A** (✅): ヒーローアダプタ / ヒーロー一覧 / 編成スロット
- **Phase 1B** (TODO): クラフト受注 + 自動進捗 + ヒーロー stamina tick
- **Phase 1C** (TODO): クエスト (素材調達)
- **Phase 1D** (TODO): ショップ / マーケット
- **Phase 1E** (TODO): ランド系クエスト + ランキング送信
