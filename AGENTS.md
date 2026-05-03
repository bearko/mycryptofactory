# AI エージェント向けガイド

MyCryptoFactory はマイクリの経済圏をモデルにしたクラフト経営シム。実装や変更を行う前に、次の順で読むこと。

## 読む順序

1. [README.md](./README.md) — プロジェクト概要、技術スタック、ローカル起動
2. [CLAUDE.md](./CLAUDE.md) — 開発フロー、ディレクトリ構造、サブエージェント運用ルール、技術制約
3. [docs/specs/SPEC-INDEX.md](./docs/specs/SPEC-INDEX.md) — 有効な仕様一覧。担当チケットに紐づく SPEC を開く
4. [docs/specs/SPEC-000-template.md](./docs/specs/SPEC-000-template.md) — 新規 SPEC を起こすときのひな形
5. [.claude/agents/](./.claude/agents/) — 自分の担当エージェントの責務範囲・触ってよいファイル
6. [.claude/comms/README.md](./.claude/comms/README.md) — エージェント間の排他・共有型管理プロトコル

## 作業時のルール（要約）

- **Jira 駆動**: 全作業は `SCRUM-XXX` チケットに紐付く。チケット未作成なら作業しない
- **SPEC が真実の源泉**: 曖昧なら SPEC を更新する PR を先に切る。勝手に仕様を広げない
- **小さな変更単位**: 1 PR = 1 チケット = 1 つの意図
- **証跡**: PR 本文に「対応 SPEC」「対応 Jira」「テスト追加の有無」を必ず明記
- **PR ベース**: 常に `develop`。`develop` → `main` はリリース PR として別途

## 自律的に進めてよい範囲

- SPEC と CLAUDE.md に沿った実装・リファクタ・テスト追加
- リント・型・フォーマットの自動修正
- ドキュメントの誤字・明らかな抜けの補足

## PR を作って人間レビューを待つ範囲

詳細は [docs/process/HUMAN_IN_THE_LOOP.md](./docs/process/HUMAN_IN_THE_LOOP.md)（外部参照: `bearko/aidev_template`）。MyCryptoFactory では以下を **PR 本文の「マージ前確認事項」セクションに明記して、PR レビューで承認** する：

- 共有型 (`src/game/types.ts`) への変更
- 経済バランス値 (`src/data/balance.ts`) の変更
- 依存関係の追加・削除・大幅更新
- セーブデータスキーマの変更（localStorage キー: `mcf-save-v1` 系）
- 著作権関連アセットの追加（`bearko/mycryptoheroes` 由来以外）

**作業を中途で止めない**。検出した時点で PR 本文に警告セクションを追加して PR を出すこと。
