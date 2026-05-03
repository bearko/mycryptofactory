# MyCryptoFactory (Ver.2.0.0)

MCH 経済圏をモチーフにした、カイロソフト「ゲーム発展国++」風の工房経営シム。マイクリ工房 (MyCryptoFactory) を 8 年以内に世界一の大工房にすることを目指す。GUM (ゲーム内通貨) を稼ぎ、投資して工房をパワーアップさせるサイクルを楽しむ。

## デプロイ
- 単一ページのプレイ可能プロトタイプ。ブラウザで `index.html` を直接開けば動く。
- Vercel デプロイ: ビルドステップ不要、root をそのまま配信。
- ビルド/トランスパイルなし、プレーン ES Modules + バニラ JS。

## ディレクトリ構造
```
index.html              エントリポイント
js/
  main.js               ブートストラップ + 状態 + 時間進行
  factory-hero.js       ヒーローアダプタ (MCH stat → 4 元素 + 体力モデル)
  i18n.js               JP/EN 切替コア
  heroes.js             ヒーローデータローダ
  constants.js          画像 URL ヘルパ
  ranking-client.js     (将来用) GAS ランキング送信
  scoring.js            (将来用) スコア計算
  help.js               ヘルプオーバーレイ
data/
  heroes.json           MCH ヒーローマスタ
  i18n/
    ui.json             UI 文字列 (JA/EN ペア)
    heroes-en.json      ヒーロー JA→EN ルックアップ
    extensions-en.json  エクステンション JA→EN ルックアップ
Image/
  Factory/              工房・元素アイコン (bearko/mycryptoheroes 由来)
```

## ゲーム仕様 (実装フェーズ)

### Phase 0 (✅ Done)
- タイトル画面 + 言語トグル (JP/EN)
- 工房 view (背景画像 + ヘッダー + メニュー)
- ヘッダー: ゲーム内日付 / 円ゲージ (1 週 = 7 秒) / GUM 残高
- メニュー (クラフト / ヒーロー / クエスト / ショップ / マーケット / 設定)
- 時間進行ループ (メニュー開いている間は停止)

### Phase 1A (✅ Done)
- ヒーローデータアダプタ:
  ```
  MCH HP   → ガルーダ (緑)  ※ クラフト要素 + 体力 (stamina) を兼ねる
  MCH PHY  → イフリート (赤)
  MCH INT  → リヴァイアサン (青)
  MCH AGI  → ティアマト (黄)
  ```
- ヒーロー一覧画面 (5 体までの編成スロット + 並び順切替)
- ヒーロー状態: idle / crafting / questing / resting

### Phase 1B+ (TODO)
- クラフト: 受注リスト / レシピ / 配属 / 自動進捗 / 完成判定
- ヒーロー stamina の tick ダウン (クラフト中) + resting 自動復帰
- クエスト: ノード選択 / 3 体配属 / 素材報酬
- ショップ / マーケット
- ランド系クエスト + ランキング送信

## 旧 React+TS scaffold
旧 React+TS+Zustand+Vite scaffold は git tag `legacy-react-ts-scaffold` で保管。復元したい場合:
```
git checkout legacy-react-ts-scaffold
```

## アセット帰属
キャラクター画像 / アイコンは [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) リポジトリ由来。利用は同リポジトリの README に従う。
