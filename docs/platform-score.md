# bearko.games 共通基盤の総合スコア

bearko.games の総合スコア（[bearko/mycryptoportfolio の SPEC-002](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/specs/SPEC-002-total-score.md) 3.9）に参加する。作者の決定（2026-10-16）で、**Lv 5 到達までの所要時間・設備（工房 Lv と同じ扱い）・クエスト攻略数・エクステンションの製作数と内訳** で測る。

| 送る成績 | 中身 | どこで増える |
|---|---|---|
| `factoryLevel` | 工房 Lv（1〜5） | 工房レベルアップ |
| `weeksToLv5` | Lv 5 に着くまでの週数（ゲーム開始の 2018 年 12 月 1 週から） | Lv 5 になったとき 1 回だけ記録（`state.lv5Weeks`） |
| `questsCleared` | 攻略したクエストの数（新設 `state.questClearCount`） | クエスト成功 |
| `crafted` | 作ったエクステンションのレアリティごとの数（新設 `state.craftedByRarity`。打ち直しは昇格後の rarity） | クラフト完了 |

- 点の計算は共通基盤（計算式 `factory.v2`。MyCryptoPortfolio の SPEC-002 3.9）：工房 Lv の節目（Lv 2 ＝ 1,000 〜 Lv 5 ＝ 5,000）＋ 2,000 × 240 ÷ Lv 5 までの週数 ＋ クエスト × 12 ＋ クラフト × レアリティの重み（Common 4 ／ Uncommon 8 ／ Rare 15 ／ Epic 30 ／ Legendary 60）
- 係数は自動プレイで期限（8 年）まで 4 回遊んだ実測から決めた（2026-10-17、MyCryptoPortfolio#24）：Lv 5 まで中央値 248 週・クエスト約 88・クラフト 52〜59 本で、ふつうに遊んで約 10,000
- 工房 Lv が上がったときはすぐ送って自己ベストの通知を出す。クラフト・クエストは通知なしで 1 分に 1 回までにまとめる（`js/platform.js`）
- SDK（`https://bearko.games/sdk/v1.js`）が読めない・通信に失敗しても何もしない。ゲームの進行・pauseTime には触らない
- 期限（8 年。SPEC-001）で送るのを止める（`finalizeScore`。待っている分を 1 回送ってから）。Lv 5 までの週数は 384 以下になる
- セーブ（SPEC-002）から続けると、セーブの時点の成績から送り直す。共通基盤には自己ベストが残る
- テスト：`node --test tests/*.test.mjs`
- アチーブメント（共通基盤の旧トロフィー。ヒーロー名鑑 No.012〜022 とエクステンション 4 個）は別の仕組み：一覧と条件は [SPEC-021](specs/SPEC-021-platform-achievements.md)、送り方は [SPEC-009](specs/SPEC-009-platform-trophies.md) 3.2
