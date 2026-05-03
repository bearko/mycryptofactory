# Inter-Agent Communication Protocol

このディレクトリはサブエージェント間の調整に使う。**全エージェント必読**。

## ファイル一覧

| ファイル | 用途 | 更新頻度 |
|---|---|---|
| `claims.md` | 現在「作業中」のファイル一覧（誰が・いつから） | 作業開始/終了時 |
| `interfaces.ts` | 共有TypeScript型定義の単一情報源 | 共有型を変更したとき |
| `decisions.md` | 設計上の確定事項ログ（追記専用） | 重要決定時 |
| `conflicts.md` | 解決必要な競合キュー | 競合発見時 |
| `status/<agent>.md` | 各エージェントの最新ステータス | 各ターン終わり |

## 必須プロトコル

### 作業開始時
1. `claims.md` を読む。担当ファイルが他エージェントに claim されていないか確認
2. claim されていれば、`conflicts.md` に報告して停止 → 人間判断待ち
3. 自分の claim を `claims.md` に追記（ISO8601 タイムスタンプ付き）
4. `interfaces.ts` を読み、共有型の最新状態を把握

### 作業中
- 共有型を変更する必要が出たら、**先に** `interfaces.ts` を更新し、`decisions.md` に理由を記録
- それから自分の実装を進める

### 作業終了時
1. `claims.md` から自分の claim を削除
2. `status/<your-agent-name>.md` を更新（最終コミットSHA、完了範囲、引き継ぎ事項）

## claims.md のフォーマット例

```markdown
# Active Claims

| Agent | Path | Since | JIRA |
|---|---|---|---|
| minigame-builder#1 | src/minigames/Sword.tsx | 2026-05-03T14:30:00+09:00 | SCRUM-12 |
| economy-engineer | src/store/gameStore.ts | 2026-05-03T14:35:00+09:00 | SCRUM-15 |
```

## decisions.md のフォーマット例

```markdown
## 2026-05-03 14:32 — minigame-builder
**決定**: MiniGameResult.quality は 0-100 の整数で固定
**理由**: 全ミニゲームで一貫した品質スコアが必要。小数だと表示UIが煩雑
**影響範囲**: 全 src/minigames/*.tsx、src/store/gameStore.ts のクラフト判定
```
