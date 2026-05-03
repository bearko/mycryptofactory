# 既知の問題 / Known Issues

Day 7 (SCRUM-37) の通しプレイ＆balance-tester レビューで検出された残課題と仕様外の挙動。
重大度順。次の v2 候補に積むかは別途トリアージ。

---

## バランス（自動シミュレータ通過済の前提で残った懸念）

### 🟡 [BAL] HIGH_TIER 解放が Day 14 と遅め
- **症状**: 30 日シミュレーション (greedy AI) で HIGH_TIER 解放が平均 Day 14。仕様書 §1 では Phase 3 = Day 5 開始想定
- **原因**: HIGH_TIER は workshop.level≥2 + employees≥3 の論理条件で、greedy AI がバランス上慎重に Lv up するため
- **対応案 (v2)**: HIGH_TIER 条件を employees≥2 に緩和、もしくは初期 employees に 2 人いる状態でスタート
- **現状の影響**: 初心者ペースだとちょうど良い可能性あり。bearko の通しプレイで体感を確認したい

### 🟡 [BAL] SELF_CRAFT 解放が Day 26 と遅い
- **症状**: greedy AI で SELF_CRAFT 解放が平均 Day 26、累計 10,000 GUM 達成と同じ
- **対応案 (v2)**: 閾値を 8,000 GUM に下げる、または Day 20 達成 + 中間条件（1回でも Tier3 受託成功）など複合条件化
- **現状の影響**: プレイ時間が伸びる（30分 → 50分）が、達成感は逆に増えるかも

### 🟢 [BAL] 評判が天井 (100) に張り付きやすい
- **症状**: greedy AI 30日で平均評判 100.0 に到達
- **原因**: 1 受託成功あたり repBonus +1〜+12、失敗の -5 が稀（Lv補正で quality 上がる）
- **対応案 (v2)**: 評判の意味付けを Phase 3 の入札優位度以外にも拡張する（例: 高評判ほど高Tier受注の出現率↑）

---

## 機能不足 / 仕様外

### 🟡 [BUG] BGM/SE ファイルが未配置
- **症状**: AudioManager は実装済みだが、`public/audio/se/*.mp3` と `public/audio/bgm/*.mp3` が空
- **対応**: ファイルが無い場合は graceful no-op + console.info（ログ汚染なし）
- **次に必要**: bearko が CC0/CC-BY 音源を選定して `public/audio/` 配下に配置し、README に帰属表示
- **必要な SE**: click / craftSuccess / craftCritical / craftFail / sale / dayAdvance / lvUp / unlock / fanfare
- **必要な BGM**: workshop / midgame / tournament / result

### 🟢 [UX] チュートリアル吹き出しは Day 1〜3 のみ
- **対応**: Phase 2/3/4 解放時の UnlockModal が代替チュートリアルとして機能する設計
- **改善余地**: 解放時に「次に何をすればいいか」を 1〜2 ステップの誘導で出すと親切（v2）

### 🟢 [UX] リセットボタンは window.confirm を使っている
- **対応**: ネイティブ confirm でも安全だが UX としてはモーダル化したい
- **改善余地**: BankruptModal と同型の確認モーダルに統一（v2）

---

## 技術的負債

### 🟢 [TECH] orderGenerator/hireGenerator の seed が day と reputation/state ハッシュ依存
- **症状**: リロードしても同じ日付・状態なら同じ候補が出る → 一見決定的だが、acceptOrder などで state が変わるとseed が変わるケースもある
- **対応案 (v2)**: seedrandom インスタンスを persist して完全に決定的に
- **現状の影響**: バグではないが、QA の再現性に難が出る可能性

### 🟢 [TECH] `.claude/worktrees/*` が複数残置
- **対応**: vitest 除外設定済 (`.claude/worktrees/**`)、`.gitignore` 済
- **改善余地**: 自動 cleanup スクリプト（`git worktree prune` を npm scripts に）

### 🟢 [TECH] mcf-save-v1 → v2 移行時、v1 のセーブデータは破棄される
- **対応**: 仕様（spec) どおり。プロトタイプのため許容
- **改善余地**: v1 の旧フィールドを v2 形式へ最小マッピング（hireMarket は破棄、その他は引き継ぎ）

---

## v2 で扱うべき項目（フェーズ5/6 持ち越し）

参考: 仕様書 v3 §1 より、以下は今回の 7 日プロトには**含まれていない**。

- フェーズ5: ヒーロー購入（レアリティ別、Uncommon〜Legendary）
- フェーズ6: 大会システム（Common〜Legendary 階級制）+ 自動戦闘 + hypeBonus
- リファラル / シーズン制 / MCH Verse Pass 等の経済図上の脇道
- マルチセーブスロット、難易度選択、実績システム

---

## バランスシミュレータの結果サマリ（参考）

`npm run simulate -- 30 30` 時点で:

```
30 runs × 30 days, greedy AI
- Bankrupt rate: 0%
- Avg total earned: 12,350 GUM
- Avg final reputation: 100.0
- HIRE unlock: Day 6.0
- WORKSHOP_UP unlock: Day 6.0
- HIGH_TIER unlock: Day 14.0
- SELF_CRAFT unlock: Day 26.0
- Day 3 ≥ 800 GUM: 100% reached
- Day 6 ≥ 1500 GUM: 100% reached
- Day 10 ≥ 4000 GUM: 100% reached
- Day 15 ≥ 10000 GUM: 100% reached ✅
```

仕様書 v3 §3 の想定累計 GUM 曲線をすべて達成。
