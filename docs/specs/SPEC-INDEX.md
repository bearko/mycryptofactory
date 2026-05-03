# SPEC インデックス

仕様書（SPEC）の一覧。仕様駆動開発のフローは [bearko/aidev_template](https://github.com/bearko/aidev_template) の `docs/process/SPEC_DRIVEN_DEVELOPMENT.md` を参照。

| ID | 題名 | 状態 | 関連 Epic | 最終更新 |
|----|------|------|----------|---------|
| [SPEC-000](./SPEC-000-template.md) | （テンプレート） | テンプレ | — | 2026-05-03 |
| [SPEC-001](./SPEC-001-game-foundation.md) | ゲーム基盤・コアループ・フェーズ進行 | Accepted | [SCRUM-5](https://bearko.atlassian.net/browse/SCRUM-5) (Day 0) | 2026-05-03 |
| [SPEC-002](./SPEC-002-craft-minigame-contract.md) | クラフトミニゲームの共通契約 | Accepted | [SCRUM-6](https://bearko.atlassian.net/browse/SCRUM-6) (Phase 1) | 2026-05-03 |

## 状態の意味

- **Draft**: 草案。レビュー前
- **Review**: レビュー中。PR でコメント募集中
- **Accepted**: 承認済み。実装の前提として固定
- **Deprecated**: 廃止。置き換え先 SPEC を本文に明記

## 番号採番ルール

- 3桁ゼロパディング（`SPEC-001`, `SPEC-042`）
- 番号は連番、欠番可（廃止後も再利用しない）
- ファイル名: `SPEC-NNN-<short-kebab-name>.md`

## SPEC と Jira の関係

- **SPEC が上位**: ゲームの仕様・契約・受け入れ基準を記述
- **Jira (Epic/Story)** は SPEC に対する実装単位
- 1 SPEC は 1 Epic に対応するのが基本（ない場合は SPEC のみで完結する設計判断）
- Story の説明には対応 SPEC ID を含める
