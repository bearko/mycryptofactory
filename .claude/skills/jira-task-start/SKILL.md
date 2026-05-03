---
name: jira-task-start
description: Use when starting work on a Jira ticket. Transitions ticket to In Progress, creates feature branch, and records start time. Args = SCRUM ticket key (e.g., SCRUM-12).
---

# jira-task-start

引数: Jiraチケットキー（例: `SCRUM-12`）

## 実行手順

1. `getJiraIssue(SCRUM-XXX)` でチケット内容を取得
2. `getTransitionsForJiraIssue(SCRUM-XXX)` でtransition ID一覧取得
3. "In Progress" 相当のtransitionを `transitionJiraIssue` で適用（人間承認を介する）
4. ブランチ作成: `git checkout develop && git pull && git checkout -b feature/SCRUM-XXX-<short-slug>`
   - slugはチケットsummaryから英数字＋ハイフンで生成、最大40文字
5. `addCommentToJiraIssue` で開始コメント: "Started at YYYY-MM-DDTHH:MM:SS+09:00 by <agent-name>"
6. `.claude/comms/status/<agent>.md` に "Working on SCRUM-XXX from <ts>" を追記

## 失敗時
- transitionが利用不可（既にIn Progress等）→ スキップして続行
- ブランチ既存 → checkoutするだけ
