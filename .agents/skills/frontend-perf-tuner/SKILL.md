---
name: frontend-perf-tuner
description: Webアプリ向けのフロントエンド性能チューニングを端から端まで実行するワークフロー（計測 → 診断 → 改善案 → 再計測 → 回帰防止）。LCP/CLS/INP/TTFB/ロングタスク/CPU/ネットワーク指標の改善、トレース取得、根拠に基づくパッチ計画や回帰防止策の作成を求められたときに使用する。
---

# Frontend Perf Tuner

## 概要

フロントエンド性能改善のループを一通り実行する。具体的には、計測し、トレースとネットワーク証拠で根本原因を診断し、コスト/リスク付きの改善案を提示し、再計測し、最後に回帰防止のガードレールを設定する。

## 入力（不足があれば確認する）

- `target`: URL またはローカル起動手順
- `steps`: 再現手順（クリック/入力/スクロール）
- `environment`: デバイス/ビューポート、ネットワーク/CPU スロットリング、キャッシュ状態
- `goals`: 目標しきい値（LCP/CLS/INP/TTFB/JS ロングタスク など）
- `constraints`: 変更範囲、依存関係ポリシー、期限
- `repo`（任意）: パス + 実行/ビルド/テストコマンド

## 必須ツール

- **CDP MCP**: Trace、Network、Coverage、Performance API
- **Playwright MCP**: スクリプト化された再現とインタラクション計時
- **Node/FS/Git MCP**: スクリプト実行、ファイル編集、パッチ差分作成

**任意:** Lighthouse CI MCP、WebPageTest MCP、バンドル解析ツール

## 出力形式（厳守）

次の見出し名で、番号付き 7 セクションを**必ず**返す。

1. Executive summary
2. Measurements
3. Evidence
4. Bottlenecks ranked
5. Patch plan
6. Re-measure plan
7. Regression prevention

### Measurements テーブル

Markdown テーブルの列は `Metric | Current | Goal | Delta` を使う。

行は次の順序で入れる。

`LCP`, `CLS`, `INP`, `TTFB`, `FCP`, `TBT`, `JS long task`, `Transfer size`.

## ワークフロー（A-F）

### A. 事前確認と再現性確保

1. `target`、`steps`、`environment`、`goals`、`constraints` を確認する。
2. `repo` がある場合は最小の起動コマンドを実行し、URL を確認する。
3. 毎回同一条件になるよう、Playwright MCP で手順をスクリプト化する。
4. コールド/ウォームの両プロファイルを取得する（cold = キャッシュなし、warm = キャッシュあり）。

### B. 計測

1. コールド/ウォーム両方で **CDP trace** を取得する。
2. Network waterfall、critical request chain、cache headers、圧縮状況を出力する。
3. 同じ手順で Coverage（未使用 JS/CSS）を取得する。
4. 必要なら Lighthouse CI を実行する（スコアではなく audit と生指標を重視）。

### C. 分析

1. LCP 要素と依存チェーンを特定する（resource timing + trace）。
2. メインスレッド flame chart で、INP/ロングタスクを event → task → function にひも付ける。
3. 時間を scripting、rendering、painting、layout に分解する。
4. バンドルサイズ、未使用 JS/CSS、ネットワークブロッキングとの相関を確認する。

### D. 改善提案

1. 証拠に基づいて修正を優先順位付けし、期待効果を定量化する。
2. まずは最小変更を優先し、依存関係やアーキテクチャ変更は後回しにする。
3. 効果、コスト、リスク、検証方法を必ず含める。

### E. 再計測

1. 同一環境設定で同じスクリプト手順を再実行する。
2. 差分と、目標達成可否を報告する。

### F. 回帰防止

1. パフォーマンス予算と CI ゲート条件を定義する。
2. RUM または synthetic monitoring のチェックを追加する。
3. 今後の PR 向けに短いチェックリストを提示する。

## コマンド例（必要に応じて調整）

- Install: `npm ci`
- Dev server: `npm run dev` or `npm start`
- Build: `npm run build`
- Playwright run: `npx playwright test` (or `node ./scripts/perf-run.mjs`)
- Lighthouse CI (optional): `lhci autorun`

## Playwright 計測スクリプトのテンプレート（Node/TS）

これを出発点として使い、提示されたシナリオで `steps()` を埋める。

```ts
import { chromium } from "playwright";

type Env = {
  url: string;
  viewport: { width: number; height: number };
  slowMo?: number;
};

const env: Env = {
  url: process.env.TARGET_URL ?? "http://localhost:3000",
  viewport: { width: 1365, height: 768 },
};

async function steps(page: any) {
  // TODO: ユーザー手順を再現（クリック/入力/スクロール）
  // await page.click('[data-testid="search"]');
  // await page.fill('input[name="q"]', 'example');
  // await page.keyboard.press('Enter');
  // await page.waitForLoadState('networkidle');
}

async function run(label: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: env.viewport,
  });
  const page = await context.newPage();
  await page.goto(env.url, { waitUntil: "domcontentloaded" });
  await steps(page);
  await page.waitForLoadState("networkidle");
  await context.close();
  await browser.close();
  console.log(`done: ${label}`);
}

run("warm");
```

## CDP trace の要点（MCP）

- トレース前に、要求された `environment`（viewport、network、CPU）をエミュレートする。
- `Network` と `Performance` を有効化し、スクリーンショットを無効化した状態で `Tracing` を開始する。
- `devtools.timeline`、`blink.user_timing`、`v8.execute`、`disabled-by-default-devtools.timeline`、`disabled-by-default-v8.cpu_profiler.hires` などのカテゴリを使う。
- トレースはナビゲーション**前**に開始し、最後の操作後に停止する。
- トレースファイル名には `cold`/`warm` の接尾辞を付け、タイムスタンプを記録する。

## 証拠ルール

- trace または network の証拠なしに根本原因を断定しない。
- 証拠は、ファイル名、trace タイムスタンプ、request URL、ログ断片のいずれかで参照する。

## ボトルネック順位付けの基準

各項目を 1〜5 で採点する（**高いほど良い**）。

- `Impact`: 1 low → 5 high
- `Cost`: 1 high effort → 5 low effort
- `Risk`: 1 high risk → 5 low risk

`Priority = Impact × Cost × Risk` を計算し、降順で並べる。

各ボトルネックには、**why / evidence / fix / side effects / verification** を必ず含める。

## パッチ計画の形式

変更セットを **Minimal**、**Medium**、**Large** に分ける。可能なら diff 断片を示す。

## 再計測計画

- URL、steps、environment、cache state を同一にする。
- 最低 3 回実行し、中央値を報告する。
- 合格条件は「全目標を満たすこと」。

## 回帰防止

- CI に性能予算しきい値を設定する（失敗条件を明記）。
- 主要指標に対して Lighthouse CI またはカスタムチェックを導入する。
- 回帰検知のために RUM アラート（95 パーセンタイル）を設定する。
- PR チェックリスト（バンドルサイズ、ロングタスク、サードパーティ予算）を用意する。

## 例（簡潔）

### 入力例 1 — React/Vite の INP 回帰

```bash
target: http://localhost:5173
steps: Open list page → type in filter → click item details
environment: desktop 1365x768, 4x CPU throttle, slow 4G, cold cache
goals: INP < 200ms, JS long task < 200ms
constraints: no new deps, 1 day
repo: ./web (npm run dev)
```

### 出力例 1（抜粋）

```bash
1) Executive summary
- INP spikes come from filter re-rendering all rows on input.
- Long tasks are dominated by synchronous JSON parse on every keystroke.
- Memoization and debounced filtering should cut INP by ~50%.

2) Measurements
| Metric | Current | Goal | Delta |
| LCP | 2.9s | 2.5s | +0.4s |
| CLS | 0.05 | 0.1 | -0.05 |
| INP | 420ms | 200ms | +220ms |
| TTFB | 250ms | 300ms | -50ms |
| FCP | 1.8s | 1.5s | +0.3s |
| TBT | 480ms | 200ms | +280ms |
| JS long task | 620ms | 200ms | +420ms |
| Transfer size | 1.4MB | 1.2MB | +0.2MB |
```

### 入力例 2 — Next.js の LCP（画像 + フォント）

```bash
target: https://example.com
steps: Open home → wait for hero to finish loading
environment: mobile 375x812, 4x CPU throttle, slow 4G, cold cache
goals: LCP < 2.5s, CLS < 0.1
constraints: allow config changes only
```

### 出力例 2（抜粋）

```bash
1) Executive summary
- LCP is gated by a 1.2MB hero image fetched late in the chain.
- Font CSS blocks render; preload + font-display swaps reduce blocking.
- Next/image priority and responsive sizes should hit LCP goal.
```
