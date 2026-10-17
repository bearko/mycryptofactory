# SPEC-004 — UI の土台（画面の器・トークン・部品・外向き）

| 項目 | 内容 |
|---|---|
| 状態 | Done |
| 関連 | bearko/MyCryptoPortfolio の ROADMAP 3 章（UI/UX の共通の基準）。先例：Survivor SPEC-043・Tactics SPEC-011 |

## 1. 背景

ROADMAP 3 章の基準に対して、Factory には次が足りなかった：`viewport-fit=cover`・safe-area・`100dvh`・`theme-color`・manifest とアイコン・見出しと数字のフォント・ボタンの押した感じ・`prefers-reduced-motion`。タイトル画面は 390×844 でランキングと言語の切替が重なり、ヘッダーは日付が 3 行に折り返していた。

CSS は約 6,000 行がインラインにある。**一度に全部は動かさず、この SPEC で触る部分だけをトークンにする**。

## 2. 仕様

### 2.1 画面の器

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `body` の高さは `100vh` を予備に `100dvh`。`overscroll-behavior: none`
- モーダルの `max-height: Nvh` は、その下に `Ndvh` を重ねる（`dvh` が使えないブラウザは `vh` のまま）
- 画面の端に貼り付くものを safe-area の内側に：ヘッダー（上・左右）、フッター（下）、全画面のモーダル（四方の余白を `max(1rem, env(safe-area-inset-*))`）、タイトル画面

### 2.2 トークン（`:root` に足す）

| トークン | 値 | 使うところ（この SPEC） |
|---|---|---|
| `--good` / `--bad` | 緑 / 赤 | 確認ダイアログの「消して始める」 |
| `--radius` / `--radius-lg` | 6px / 12px | ボタン・カード |
| `--shadow` | カードの影 | クリア画面・確認ダイアログ |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | ボタンの押した感じ |
| `--font-body` / `--font-display` / `--font-num` | 本文 / 見出し（Zen Maru Gothic）/ 数字（Chakra Petch） | 見出し・ヘッダーの日付と GUM・スコア |

- Google Fonts は `preconnect` ＋ `display=swap`。`media="print"` → `onload` で読み込みを待たない（サンドボックスで読み込みが止まるため）
- 既存の部品の色は、触った部分から順にトークンにする（今回はタイトル・ヘッダー・クリア画面・確認ダイアログ）

### 2.3 部品

- ボタン全体：`touch-action: manipulation`・タップのハイライトを消す・押すと少し縮む（`transform: scale(.97)`）・`:disabled` は薄くしてカーソルを `not-allowed`
- モーダル：クリア画面も Esc で閉じる（既存の Esc の仕組みに足す）。確認ダイアログは SPEC-002 で Esc 対応済み

### 2.4 タイトル画面

- ロゴ・β の注記・始めるボタン・RTA・ランキング・言語の切替・版表記を、**固定配置をやめて縦に流す**。背の低い画面（`max-height: 700px`）では間隔とロゴを詰める
- 画面からはみ出すときはタイトルの中だけスクロールする

### 2.5 ヘッダー

- 日付・工房 Lv・GUM は折り返さない（`white-space: nowrap`）。数字は `--font-num`
- 幅 420px 以下では β のバッジとヘッダーの言語ボタンを隠し（言語はタイトルと設定から変えられる）、ボタンを小さくする。ボタンは縮ませない。幅 380px 以下ではヘッダーのランキングボタンも隠す（タイトルから開ける）

### 2.6 演出を減らす

- `@media (prefers-reduced-motion: reduce)` で、アニメーションとトランジションをほぼ 0 にする（タイトルの点滅・紙吹雪など）。JS 側の待ち時間は SPEC-005（設定）で扱う

### 2.7 外向き

- `theme-color`（`#121018`）、`manifest.json`、`icons/`（192・512・maskable・apple-touch-icon 180・favicon 48）。アイコンはタイトルロゴの紋章から作る
- OGP 画像を 1200×630 にする（2752×1529・2.1MB だった）。`og:image:width` / `height` を付ける
- タイトルは「MyCryptoFactory — 工房経営シム」（β の表記は公開版の SPEC で外す）

## 3. 受け入れ基準

- [ ] 360×640・375×667・390×844・412×915・PC で、タイトルの要素が重ならない
- [ ] ヘッダーの日付が 1 行に収まる
- [ ] iPhone のノッチ・ホームバーにヘッダー・フッター・モーダルが隠れない
- [ ] OS の「視差効果を減らす」でタイトルの点滅が止まる
- [ ] manifest とアイコンが読める（DevTools の Application）

## 4. テスト

- Playwright で 5 つの画面サイズのタイトル・ホームを撮って重なりを見る（要素の矩形が重ならないことを数える）
- `node --check`・JSON の検査・`node --test`（CI）
