---
name: jira-task-finish
description: Use when finishing work on a Jira ticket. Pushes branch, opens PR to develop with Jira link, and transitions ticket to Done. Updates due date to actual close date when ticket reaches 完了. Args = SCRUM ticket key.
---

# jira-task-finish

引数: Jiraチケットキー（例: `SCRUM-12`）

## 実行手順

1. `git status` で未コミット変更がないこと確認
2. `git push -u origin feature/SCRUM-XXX-*`
3. `gh pr create --base develop --title "[SCRUM-XXX] <summary>" --body <下記テンプレ>` （permission allow 済）
4. `addWorklogToJiraIssue` で実作業時間を記録
5. `transitionJiraIssue` で "レビュー中"（id: 31）へ
6. `.claude/comms/status/<agent>.md` に "Done SCRUM-XXX at <ts>, PR #<n>" を追記
7. `.claude/comms/claims.md` から自分のclaim削除

## PR マージ後（チケット完了時）の追加手順

PR がマージされて Jira チケットを **完了**（id: 41）に遷移させるとき：

1. `transitionJiraIssue` で "完了"（id: 41）へ遷移
2. **`editJiraIssue` で `duedate` を本日の日付（YYYY-MM-DD, JST）に上書き** — 実完了日を記録
   ```json
   {"fields": {"duedate": "<today as YYYY-MM-DD>"}}
   ```
3. オプション: `addCommentToJiraIssue` で「Closed at <timestamp+09:00>」を残す

これにより Jira ガント上で「予定 vs 実績」が一目で分かる：
- `customfield_10015` (Start date) = 計画開始日（チケット起票時に設定）
- `duedate` (期限) = 計画終了日 → 完了時に **実完了日** で上書き

## PR Body テンプレ
```markdown
## 概要
<実装内容を3行で>

## 関連
- SPEC: [SPEC-XXX](../docs/specs/SPEC-XXX-...) <!-- 該当なしなら省略 -->
- Jira: [SCRUM-XXX](https://bearko.atlassian.net/browse/SCRUM-XXX)

## 受け入れ基準（SPEC との対応）
- [ ] …

## マージ前確認事項（HITL）
- [ ] 共有型 (`src/game/types.ts`) を変更している
- [ ] 経済バランス値 (`src/data/balance.ts`) を変更している
- [ ] セーブデータ互換を破壊している
- [ ] 依存関係を追加・削除・大幅更新している
- [ ] 著作権関連アセットを追加している

## テスト・確認の証跡
- 自動テスト: <CI link>
- 手動確認: <Vercel preview URL>

## スクリーンショット (UI変更時)
<画像>
```
