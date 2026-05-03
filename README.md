# MyCryptoFactory

マイクリ（[MyCryptoHeroes](https://www.mycryptoheroes.net/)）の経済圏をモデルにした、初心者→トッププレイヤー体験を圧縮したクラフト経営シム。

## 開発状況
🚧 Day 0: 開発環境セットアップ完了 / Day 1 着手前

## 技術スタック
- TypeScript + React 18 + Vite + Zustand + Framer Motion
- 状態保存: localStorage (zustand persist)
- テスト: Vitest
- デプロイ: Vercel

## ローカル起動
```bash
npm install
npm run dev    # http://localhost:5173
npm run test
npm run build
```

## ブランチ戦略
```
main      ← Vercel Production
  ↑
develop   ← Vercel Preview
  ↑
feature/SCRUM-XXX-*   ← 各タスク
```

## 開発進行
- タスク管理: [Jira SCRUM](https://bearko.atlassian.net/jira/software/projects/SCRUM/boards/1)
- 詳細仕様 / 開発ガイド: [CLAUDE.md](./CLAUDE.md)
- サブエージェント体制: [.claude/agents/](./.claude/agents/)
- エージェント間通信プロトコル: [.claude/comms/README.md](./.claude/comms/README.md)
