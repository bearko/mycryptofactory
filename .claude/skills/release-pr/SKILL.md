---
name: release-pr
description: Create a release PR from develop to main. Aggregates merged Jira tickets into the PR description. Use at the end of a phase.
---

# release-pr

## 実行手順

1. `git fetch && git checkout develop && git pull`
2. `git log main..develop --oneline` で差分コミット取得
3. コミットメッセージから `SCRUM-XXX` を抽出
4. 各チケットを `getJiraIssue` でsummary取得
5. `gh pr create --base main --head develop --title "Release YYYY-MM-DD" --body <下記>`（人間承認）

## PR Body テンプレ
```markdown
## このリリースに含まれるチケット
- [SCRUM-XX](url) — summary
- [SCRUM-YY](url) — summary

## デプロイ確認
- [ ] Vercel Preview (develop) で通しプレイ済
- [ ] 重大バグ報告なし
- [ ] CHANGELOG更新（v2移行時）

## ロールバック手順
`git revert <merge-commit-sha>` を main に push
```

マージ後、Vercel Production が自動デプロイされる。
