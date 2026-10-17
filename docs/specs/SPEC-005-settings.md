# SPEC-005 — 設定（音・演出を減らす・言語）

| 項目 | 内容 |
|---|---|
| 状態 | Done |
| 関連 | bearko/MyCryptoPortfolio の ROADMAP 3 章（音・演出）、SPEC-004（UI の土台）。先例：Survivor SPEC-044・Tactics SPEC-012 |

## 1. 背景

音を止める・小さくする手段がなかった（`factory-audio.js` に `setMuted` はあったが、画面から使えなかった）。演出を減らす設定もなく、言語の保存キーが Tactics 由来の `mct.lang` だった。

## 2. 仕様

### 2.1 設定の項目（メニュー →「設定」）

| 項目 | 値 | 既定 |
|---|---|---|
| 時間 2 倍速 | ON / OFF（いままでどおり。セーブに入る） | OFF |
| BGM | ON / OFF ＋ 音量（0〜100） | ON・100 |
| 効果音 | ON / OFF ＋ 音量（0〜100） | ON・100 |
| 演出を減らす | 端末に合わせる / ON | 端末に合わせる |
| 言語 | 日本語 / English | 日本語 |

- 音量は既定の音量（BGM 0.32・効果音 0.55）に掛ける。効果音の音量を動かし終えたら、確かめのためにボタンの音を 1 回鳴らす
- OFF にした項目の音量スライダーは押せなくする
- 音は最初のユーザー操作（タイトルを閉じる）のあとにだけ鳴らす（いままでどおり）。BGM を ON に戻しても、その前なら鳴らさない

### 2.2 保存

- `localStorage` の `mcf.settings`（`{ bgmOn, seOn, bgmVolume, seVolume, motion }`）。**セーブ（`mcf.save`）とは別**で、「はじめから」でも消えない
- 言語は `mcf.lang`。旧キー `mct.lang` があれば読んで `mcf.lang` に移し、旧キーは消す
- 壊れた値・知らない値は既定に戻す。localStorage が使えなくても遊べる（保存されないだけ）

### 2.3 演出を減らす

- 「ON」か、端末の `prefers-reduced-motion: reduce` のどちらかで減らす（`<html class="reduce-motion">`）
- CSS：SPEC-004 の `@media` と同じく、アニメーションとトランジションをほぼ 0 に
- JS：紙吹雪を出さない。品評会の点数を 1 人ずつ出す間隔を 0.7 秒 → 0.2 秒
- 端末の設定が変わったら、すぐに反映する

### 2.4 純ロジック（`js/factory-settings.js`）

`normalizeSettings` / `readSettings(storage)` / `writeSettings(storage, settings)` / `isReducedMotion(settings, osPrefersReduced)`。`tests/settings.test.mjs` でテストする。

### 2.5 狭い画面

- 幅 480px 以下では、メニューとサブメニューを画面の幅に収める（サブメニューが右にはみ出していた）。サブメニューが長いときは中だけスクロール
- ヘッダーの工房 Lv の英語表記を「Workshop Lv: N」→「Lv N」（360px で ? ボタンが切れていた）

## 3. 受け入れ基準

- [ ] BGM・効果音を OFF にすると鳴らない。音量が反映される
- [ ] 再読み込みしても設定と言語が残る。「はじめから」でも消えない
- [ ] 演出を減らす ON で、タイトルの点滅・紙吹雪が止まり、品評会が早く進む
- [ ] 360×640 で設定が画面に収まる

## 4. テスト

- `node --test tests/settings.test.mjs`
- Playwright（360×640）：`mct.lang` の移行、設定の表示・切り替え・保存・再読み込み後の反映
- 音が鳴るかはサンドボックスでは確かめられない（作者の確認）
