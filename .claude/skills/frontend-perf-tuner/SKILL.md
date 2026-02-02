---
name: frontend-perf-tuner
description: End-to-end frontend performance tuning workflow (measure → diagnose → propose fixes → re-measure → prevent regressions) for web apps. Use when asked to improve LCP/CLS/INP/TTFB/long tasks/CPU/network metrics, capture traces, or produce evidence-based patch plans and regression controls.
---

# Frontend Perf Tuner

## Overview

Execute a full frontend performance tuning loop: measure, diagnose root causes with traces and network evidence, propose fixes with cost/risk, re-measure, and set regression guardrails.

## Inputs (ask for anything missing)

- `target`: URL or local start steps
- `steps`: reproduction steps (click/input/scroll)
- `environment`: device/viewport, network/CPU throttling, cache state
- `goals`: target thresholds (LCP/CLS/INP/TTFB/JS long tasks/etc.)
- `constraints`: change limits, dependency policy, deadline
- `repo` (optional): path + run/build/test commands

## Required tools

- **CDP MCP**: trace, Network, Coverage, Performance APIs
- **Playwright MCP**: scripted repro and interaction timing
- **Node/FS/Git MCP**: run scripts, edit files, diff patches

**Optional:** Lighthouse CI MCP, WebPageTest MCP, bundle analyzer tooling

## Output format (strict)

Return exactly 7 numbered sections with these headings:

1. Executive summary
2. Measurements
3. Evidence
4. Bottlenecks ranked
5. Patch plan
6. Re-measure plan
7. Regression prevention

### Measurements table

Use a Markdown table with columns: `Metric | Current | Goal | Delta`.

Include rows in this order:

`LCP`, `CLS`, `INP`, `TTFB`, `FCP`, `TBT`, `JS long task`, `Transfer size`.

## Workflow (A-F)

### A. Preflight and reproducibility

1. Confirm `target`, `steps`, `environment`, `goals`, `constraints`.
2. If `repo` provided, run the minimum startup command and confirm the URL.
3. Script the steps with Playwright MCP so every run is identical.
4. Record cold and warm profiles (cold = no cache, warm = primed cache).

### B. Measurement

1. Capture **CDP trace** for both cold and warm runs.
2. Export Network waterfall, critical request chain, cache headers, compression.
3. Capture Coverage (unused JS/CSS) around the same steps.
4. Optionally run Lighthouse CI (focus on audits + raw metrics, not score).

### C. Analysis

1. Identify LCP element and its dependency chain (resource timing + trace).
2. Attribute INP / long tasks to event → task → function in main-thread flame chart.
3. Split time by scripting, rendering, painting, layout.
4. Correlate with bundle size, unused JS/CSS, and network blocking.

### D. Improvement proposals

1. Prioritize fixes with evidence and quantify expected impact.
2. Keep minimal changes first; defer dependency or architecture changes.
3. Always include effect, cost, risk, and verification method.

### E. Re-measure

1. Re-run the same scripted steps with identical environment settings.
2. Report deltas and whether goals are met.

### F. Regression prevention

1. Define perf budgets and CI gating rules.
2. Add RUM or synthetic monitoring checks.
3. Provide a short checklist for future PRs.

## Command examples (adapt as needed)

- Install: `npm ci`
- Dev server: `npm run dev` or `npm start`
- Build: `npm run build`
- Playwright run: `npx playwright test` (or `node ./scripts/perf-run.mjs`)
- Lighthouse CI (optional): `lhci autorun`

## Playwright measurement script template (Node/TS)

Use this as a starting point; fill `steps()` with the provided scenario.

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
  // TODO: replicate user steps (click/input/scroll)
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

## CDP trace essentials (MCP)

- Emulate the requested `environment` (viewport, network, CPU) before tracing.
- Enable `Network` + `Performance`, then start `Tracing` with screenshots off.
- Use categories like `devtools.timeline`, `blink.user_timing`, `v8.execute`, `disabled-by-default-devtools.timeline`, `disabled-by-default-v8.cpu_profiler.hires`.
- Start tracing **before** navigation and stop after the last interaction.
- Save trace file name with `cold`/`warm` suffix and record timestamps.

## Evidence rules

- Do not claim a root cause without trace or network evidence.
- Reference evidence by file name, trace timestamp, request URL, or log snippet.

## Bottleneck ranking rubric

Score each item (1–5) where **higher is better**:

- `Impact`: 1 low → 5 high
- `Cost`: 1 high effort → 5 low effort
- `Risk`: 1 high risk → 5 low risk

Compute `Priority = Impact × Cost × Risk` and sort descending.

Each bottleneck must include: **why / evidence / fix / side effects / verification**.

## Patch plan format

Split into **Minimal**, **Medium**, **Large** change sets. Provide diff snippets when possible.

## Re-measure plan

- Same URL, steps, environment, cache state.
- Run at least 3 times; report median.
- Pass criteria = all goals met.

## Regression prevention

- Perf budget thresholds in CI (fail conditions).
- Lighthouse CI or custom checks for core metrics.
- RUM alerts for regressions (95th percentile).
- PR checklist (bundle size, long tasks, 3rd-party budget).

## Examples (short)

### Example input 1 — React/Vite INP regression

```bash
target: http://localhost:5173
steps: Open list page → type in filter → click item details
environment: desktop 1365x768, 4x CPU throttle, slow 4G, cold cache
goals: INP < 200ms, JS long task < 200ms
constraints: no new deps, 1 day
repo: ./web (npm run dev)
```

### Example output 1 (excerpt)

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

### Example input 2 — Next.js LCP (image + font)

```bash
target: https://example.com
steps: Open home → wait for hero to finish loading
environment: mobile 375x812, 4x CPU throttle, slow 4G, cold cache
goals: LCP < 2.5s, CLS < 0.1
constraints: allow config changes only
```

### Example output 2 (excerpt)

```bash
1) Executive summary
- LCP is gated by a 1.2MB hero image fetched late in the chain.
- Font CSS blocks render; preload + font-display swaps reduce blocking.
- Next/image priority and responsive sizes should hit LCP goal.
```
