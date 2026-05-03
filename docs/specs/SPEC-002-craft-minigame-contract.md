# SPEC-002: クラフトミニゲームの共通契約

| 項目 | 値 |
|------|-----|
| ID | SPEC-002 |
| 状態 | Accepted |
| 作成日 | 2026-05-03 |
| 最終更新 | 2026-05-03 |
| 作者 | bearko + main director (Claude) |
| 関連 Epic | [SCRUM-6](https://bearko.atlassian.net/browse/SCRUM-6)（Phase 1） |
| 関連 Stories | [SCRUM-13](https://bearko.atlassian.net/browse/SCRUM-13) Sword / [SCRUM-14](https://bearko.atlassian.net/browse/SCRUM-14) Helm / [SCRUM-15](https://bearko.atlassian.net/browse/SCRUM-15) Armor / [SCRUM-16](https://bearko.atlassian.net/browse/SCRUM-16) Acc |

## 1. 概要

4種のクラフトミニゲーム（Sword / Helm / Armor / Acc）が共通で守るべき入出力契約と挙動規約。Day 2 で4並列実装される際、各 `minigame-builder` エージェントが**この契約だけ守れば独立に開発できる**ことを保証する。

## 2. 背景と動機

- ミニゲームを並列開発するため、共通 API を固定化する必要がある
- カテゴリごとに「脳の使い方を変える」設計（反射神経／リズム感／度胸／思考）にしつつ、結果の評価軸は統一する
- Phase 2 以降の従業員 Lv 補正、Phase 3 の Tier 上限制御も同じ契約上に乗せる

## 3. 目標と非目標

### 目標
- 4種のミニゲームが同一の `MiniGameResult` を返す
- 1プレイ 3〜5 秒で完結する
- Tier に応じて難易度が線形に上がる
- ロジック層は seedRNG で再現可能

### 非目標
- ミニゲーム間の連携（コンボ等）— v2 以降
- 難易度カスタマイズ — v2 以降
- ジェスチャー入力（マルチタッチ等） — v2 以降

## 4. スコープ

### 含む
- 4種ミニゲーム コンポーネント（`src/minigames/<Category>.tsx`）
- 各ミニゲームの単体テスト（quality 計算ロジックの再現性）
- 共通型 `MiniGameResult`（`src/game/types.ts` に定義済み）

### 含まない
- ミニゲームから呼び出される納品ロジック（[SCRUM-17](https://bearko.atlassian.net/browse/SCRUM-17) 範囲）
- ミニゲーム結果を inventory に追加するフロー（[SCRUM-29](https://bearko.atlassian.net/browse/SCRUM-29) 範囲）

## 5. 契約と挙動

### 入力

```typescript
interface MiniGameProps {
  tier: number; // 1-5。難易度を制御
  employee: Employee; // craftLv, affinity, stamina を読む
  category: Category; // 担当カテゴリ確認用（agentが間違えないため）
  onComplete: (result: MiniGameResult) => void;
  onCancel?: () => void; // ESC 等のキャンセル動線、Day 7 で実装
}
```

### 出力

```typescript
interface MiniGameResult {
  quality: number; // 0-100 の整数
  success: boolean; // false = 大失敗（Armor の爆発等）
  durationMs: number; // プレイ時間（テストで 3000-5000ms 想定）
}
```

`onComplete` に上記を渡して終了する。コンポーネントは内部で setState のみ、ストアには触らない（純粋プレゼンテーション + コールバック）。

### Tier 別の挙動

| Tier | 難易度感 | 推奨パラメータの方向 |
|------|---------|---------------------|
| 1 | 緩い練習 | 振り子遅い・ゾーン広い・テンポ遅い |
| 2 | 標準 | 中央値 |
| 3 | やや緊張 | パラメータ +30% きつめ |
| 4 | チャレンジ | パラメータ +60% きつめ |
| 5 | 玄人向け | パラメータ +100% きつめ、quality 上限近くを取りに行く設計 |

各ミニゲームの内部実装は自由（仕様書 v3 §4 に概略あり）：

- **Sword**: 振り子停止のタイミング型
- **Helm**: 4拍リズム連打型
- **Armor**: ゲージ過熱回避型（失敗で素材ロスのリスク）
- **Acc**: 3×3 配置パズル型（時間制限なし）

### 従業員 Lv 補正（共通ヘルパで実装）

`src/game/craftJudge.ts` で実装予定（[SCRUM-20](https://bearko.atlassian.net/browse/SCRUM-20) で）：

```typescript
function applyEmployeeBonus(rawQuality: number, employee: Employee, category: Category): number {
  let q = rawQuality;
  q += (employee.craftLv - 1) * 5; // Lv up 1段階で +5
  if (employee.affinity === category) q += 10; // 得意カテゴリで +10
  return Math.min(100, Math.max(0, q));
}
```

ミニゲームは生 quality を返し、補正は受け取り側で行う。

### エラー条件
- `tier` が 1-5 の範囲外 → 1 にクランプして警告ログ
- `employee` が undefined → コンポーネントレベルでエラーメッセージ表示
- ESC 等の中断 → `onCancel` 呼び出し、quality 返さない

### 互換性
- 共通契約は SPEC-001 のフェーズ1で固定
- フェーズ6（大会用）でミニゲームに hypeBonus 出力を追加する場合は別 SPEC で議論

## 6. 非機能要件

- フレームレート: アニメーションは Framer Motion で 60fps 目標
- アクセシビリティ: キーボード操作必須（マウスのみ前提にしない）
- 色覚配慮: 緑ゾーン等は色だけでなく形状・テキストでも識別可能に

## 7. マージ前確認事項

各ミニゲーム PR で以下を確認:

- [ ] `MiniGameResult` の型を変更していない
- [ ] 自カテゴリ以外のミニゲームファイルに触っていない
- [ ] テスト: quality 計算が seedRNG で再現可能
- [ ] Tier 1 と Tier 5 でプレイ感が明確に違う
- [ ] Vercel Preview で実際に遊んで判定が妥当

## 8. 受け入れ基準

- [ ] 4種すべてが `MiniGameResult` を返す
- [ ] 1プレイ 3000-5000ms で完結
- [ ] Tier 1 で平均 quality ≥ 70、Tier 5 で平均 quality ≤ 60（バランス目安）
- [ ] Vitest 各カテゴリ最低3ケース（Critical / Standard / Fail）

## 9. テストと証跡

- **単体テスト**: quality 計算ロジックを純粋関数化して Vitest
- **手動確認**: Day 2 終了時に bearko が4種すべて遊んで触感を確認
- **balance-tester**: Day 7 で 4種それぞれを20回試行して quality 分布を統計化

## 10. 改訂履歴

| 日付 | 版 | 変更内容 |
|------|-----|----------|
| 2026-05-03 | 0.1 | 初版（Day 2 並列開発の契約として作成） |
