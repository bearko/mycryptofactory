# MyCryptoFactory — Claude Code開発ガイド

## プロジェクト概要
マイクリ（MyCryptoHeroes）の経済圏をモデルにした個人開発のクラフト経営シム。
詳細仕様は会話履歴の「仕様書 v3」を参照。

## 開発フロー
1. **Jiraチケット駆動**: 全作業は `SCRUM-XXX` チケットに紐付く。チケット未作成の作業はしない
2. **ブランチ命名**: `feature/SCRUM-XXX-short-description`
3. **PR先**: 常に `develop`。`develop` → `main` はリリースPRとして別途
4. **コミット**: 末尾に `Refs SCRUM-XXX` を含める

## ディレクトリ構造
```
src/
  store/       Zustand状態管理（単一ストア: gameStore.ts）
  scenes/      画面コンポーネント（Workshop, Crafting, etc）
  components/  汎用UIコンポーネント
  game/        純粋ロジック（経済計算、判定、生成器）
  minigames/   クラフトミニゲーム（Sword/Helm/Armor/Acc）
  data/        定数・テーブル（価格、レシピ、オーダー雛形）
  assets/      画像（bearko/mycryptoheroes 由来）
.claude/
  agents/      サブエージェント定義
  skills/      反復ワークフローのskill化
  comms/       エージェント間通信
  hooks/       自動lint/format/test スクリプト
```

## サブエージェント運用ルール
- **必ず作業前に `.claude/comms/claims.md` を確認**してファイル競合がないことを確認
- 作業開始時に自分のclaim追記、終了時に解除
- 共有interface変更時は `.claude/comms/interfaces.ts` を更新＋ `decisions.md` に理由記録
- 各エージェントの担当範囲は `.claude/agents/<name>.md` で定義

## 技術スタック
- TypeScript + React 18 + Vite + Zustand + Framer Motion
- 状態保存: localStorage (zustand persist)
- テスト: Vitest（ロジック層のみ）
- デプロイ: Vercel（developはPreview、mainはProduction）

## 制約
- 物理エンジン使用禁止
- ローカル動作完結（バックエンド・ウォレット不可）
- アセットは `bearko/mycryptoheroes` リポジトリ由来のみ
- 効果音/BGMはCC0/CC-BYのみ
