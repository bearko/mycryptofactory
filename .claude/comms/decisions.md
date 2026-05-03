# Architecture Decisions Log

追記専用。各エントリは時刻＋エージェント＋決定＋理由＋影響範囲。

---

## 2026-05-03 — Day 0 (main director)
**決定**: 単一Zustandストア `useGameStore` で全状態を管理する
**理由**: フェーズ1〜4の規模ではストア分割の利は薄く、persist設定の単純化を優先
**影響範囲**: src/store/gameStore.ts のみ。将来分割時は再検討

## 2026-05-03 — Day 0 (main director)
**決定**: ブランチ戦略は Git Flow Lite（main / develop / feature/SCRUM-*）
**理由**: 個人開発でも Vercel Preview を develop に紐付け、本番（main）と分離したい
**影響範囲**: 全PRワークフロー、CI設定、ブランチ保護ルール

## 2026-05-03 — Day 0 (main director)
**決定**: 共有型は `.claude/comms/interfaces.ts` ではなく `src/game/types.ts` に置き、`.claude/comms/interfaces.ts` はシンボリックリンクまたは「ここを見ろ」の指示書とする
**理由**: TypeScriptビルドに含めるには src/ 配下である必要がある
**影響範囲**: 全エージェントの共有型参照
