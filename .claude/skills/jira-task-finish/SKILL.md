---
name: jira-task-finish
description: Use when finishing work on a Jira ticket. Pushes branch, opens PR to develop with Jira link, and transitions ticket to Done. Args = SCRUM ticket key.
---

# jira-task-finish

引数: Jiraチケットキー（例: `SCRUM-12`）

## 実行手順

1. `git status` で未コミット変更がないこと確認
2. `git push -u origin feature/SCRUM-XXX-*`
3. `gh pr create --base develop --title "[SCRUM-XXX] <summary>" --body <下記テンプレ>` （人間承認）
4. `addWorklogToJiraIssue` で実作業時間を記録
5. `transitionJiraIssue` で "In Review" へ（人間承認）
6. `.claude/comms/status/<agent>.md` に "Done SCRUM-XXX at <ts>, PR #<n>" を追記
7. `.claude/comms/claims.md` から自分のclaim削除

## PR Body テンプレ
```markdown
## 概要
<実装内容を3行で>

## 関連
- Jira: [SCRUM-XXX](https://bearko.atlassian.net/browse/SCRUM-XXX)

## 確認事項
- [ ] CI green
- [ ] Vercel Preview で動作確認済
- [ ] 共有型変更: あり/なし
- [ ] テスト追加: 行/省略（理由）

## スクリーンショット (UI変更時)
<画像>
```
