# Requested Traffic Hourly View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new requested traffic dataset from only the 2026-05-13, 2026-05-14, and 2026-05-15 ITS 5-minute CSVs, then show/export both 5-minute and hourly data for 06:00 through the 18:00 hour.

**Architecture:** Keep the existing `data/csv/*.json` files untouched. Add a reproducible streaming data build script that scans the three uploaded raw CSVs once, writes a separate `data/csv-20260513-20260515/*.json` route bundle, updates the app to read that active bundle, and adds server-side loaders/API routes for 5-minute and hourly views. The UI will default to the 06:00-18:59 day window, with a separate `/hourly` page and hourly CSV download.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node.js streaming file reads, Node test runner, existing CSS system, lucide-react icons.

---

## Decisions To Confirm

- Treat "오전 6시 ~ 오후 6시까지" as hour buckets `06`, `07`, ..., `18`, so 5-minute rows include `06:00` through `18:55`.
- Use the existing seven requested routes already represented in `data/csv/*.json`:
  - `계양IC → 장수IC`
  - `장수IC → 계양IC`
  - `서울시내 신월IC 막히는 구간`
  - `강변북로 방화대교 → 천호대교`
  - `강변북로 천호대교 → 방화대교`
  - `강변북로 잠실대교 → 방화대교`
  - `강변북로 방화대교 → 잠실대교`
- Do not delete or overwrite the existing `data/csv/*.json` files.
- Reuse each current route JSON's `구간목록` only as the route/link definition source. This avoids reparsing the CP949 link-info CSV during execution and preserves the existing matched section names, but the generated observations must come only from `/Users/anjuhwan/Downloads/20260513_5Min.csv`, `/Users/anjuhwan/Downloads/20260514_5Min.csv`, and `/Users/anjuhwan/Downloads/20260515_5Min.csv`.

## File Structure

- Modify `package.json`
  - Add `build:traffic-data` script for regenerating route JSON/report data.
- Create `scripts/build-requested-traffic-data.mjs`
  - Stream the three raw 6.5 GB CSVs.
  - Filter rows by target link IDs.
  - Write `data/csv-20260513-20260515/*.json`, `data/csv-20260513-20260515/manifest.json`, and `src/lib/requested-traffic-home-report.json`.
- Create `src/lib/requested-traffic-data-config.ts`
  - Define the active generated data directory as `data/csv-20260513-20260515`.
- Modify `src/lib/requested-traffic-five-minute-shared.ts`
  - Add shared day-window constants and hourly row/page types.
- Modify `src/lib/requested-traffic-five-minute.ts`
  - Read from the active generated data directory and add time-window filtering to page loads and CSV export.
- Create `src/lib/requested-traffic-hourly.ts`
  - Load flattened hourly rows from route JSON `시간별요약`.
  - Export hourly CSV.
- Modify `src/lib/requested-traffic-five-minute.test.ts`
  - Cover 06:00-18:00 hour filtering.
- Create `src/lib/requested-traffic-hourly.test.ts`
  - Cover hourly flattening, route filtering, time-window filtering, and CSV output.
- Modify `src/app/api/requested-traffic/five-minute/route.ts`
  - Accept `startHour=6&endHour=18` and apply it to JSON/CSV responses.
- Create `src/app/api/requested-traffic/hourly/route.ts`
  - Return hourly JSON and hourly CSV.
- Modify `src/components/requested-five-minute-explorer.tsx`
  - Show day-window controls/labels and include the window in API/CSV requests.
- Create `src/components/requested-hourly-explorer.tsx`
  - Dedicated hourly table page with route filter and CSV download.
- Create `src/app/hourly/page.tsx`
  - Server entry for the hourly page.
- Modify `src/components/requested-traffic-home.tsx`
  - Link to `/hourly` from the home page.
- Modify `src/app/globals.css`
  - Style the hourly page/table and expanded filter controls.
- Modify `README.md`
  - Document `/hourly`, the 06:00-18:00 default, and the data rebuild command.

---

### Task 1: Add Shared Day-Window And Hourly Types

**Files:**
- Create: `src/lib/requested-traffic-data-config.ts`
- Modify: `src/lib/requested-traffic-five-minute-shared.ts`
- Test later in: `src/lib/requested-traffic-five-minute.test.ts`, `src/lib/requested-traffic-hourly.test.ts`

- [ ] **Step 1: Add active data directory config**

Create `src/lib/requested-traffic-data-config.ts`:

```ts
import { join } from "node:path";

export const REQUESTED_TRAFFIC_TEMPLATE_DATA_DIR = join(process.cwd(), "data", "csv");
export const REQUESTED_TRAFFIC_ACTIVE_DATA_DIR = join(process.cwd(), "data", "csv-20260513-20260515");
```

- [ ] **Step 2: Add constants and interfaces**

Add these exports near the existing page-size constant:

```ts
export const REQUESTED_TRAFFIC_DAY_START_HOUR = 6;
export const REQUESTED_TRAFFIC_DAY_END_HOUR = 18;

export interface RequestedTrafficTimeWindow {
  startHour: number;
  endHour: number;
}

export interface RequestedTrafficHourlyRow {
  routeId: string;
  requestLabel: string;
  matchedLabel: string;
  date: string;
  hour: number;
  label: string;
  avgSpeedKmh: number | null;
  minSpeedKmh: number | null;
  status: string;
  blocked: boolean;
  sampleCount: number;
  observedLinkCount: number;
  slowObservationCount: number;
  congestedObservationCount: number;
  slowLinkCount: number;
  congestedLinkCount: number;
}

export interface RequestedTrafficHourlyPage {
  routeId: string;
  rows: RequestedTrafficHourlyRow[];
  totalCount: number;
  dataAvailable: boolean;
  timeWindow: RequestedTrafficTimeWindow;
}
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npm test
```

Expected: existing tests still pass.

---

### Task 2: Add Time-Window Filtering To The 5-Minute Loader

**Files:**
- Modify: `src/lib/requested-traffic-five-minute.ts`
- Modify: `src/lib/requested-traffic-five-minute.test.ts`

- [ ] **Step 1: Write failing tests for 06:00-18:00 filtering**

Add a test using the existing `writeSourceFile` helper:

```ts
it("filters 5-minute rows to the requested hour window before paging and CSV export", () => {
  const dir = mkdtempSync(join(tmpdir(), "requested-5min-window-"));
  try {
    writeSourceFile(dir, "geyang_ic_to_jangsu_ic", [
      { ...sourceRows[0], 날짜: "2026-05-13", 시간: "05:55", 일시: "2026-05-13T05:55:00+09:00" },
      { ...sourceRows[0], 날짜: "2026-05-13", 시간: "06:00", 일시: "2026-05-13T06:00:00+09:00" },
      { ...sourceRows[1], 날짜: "2026-05-13", 시간: "18:55", 일시: "2026-05-13T18:55:00+09:00" },
      { ...sourceRows[1], 날짜: "2026-05-13", 시간: "19:00", 일시: "2026-05-13T19:00:00+09:00" }
    ]);

    const page = loadRequestedFiveMinutePage([{ ...route, fiveMinuteRows: 4 }], {
      baseDir: dir,
      startHour: 6,
      endHour: 18,
      offset: 0,
      windowSize: 10
    });

    assert.equal(page.totalCount, 2);
    assert.deepEqual(page.rows.map((row) => row.time), ["06:00", "18:55"]);

    const rows = loadRequestedFiveMinuteRows([{ ...route, fiveMinuteRows: 4 }], {
      baseDir: dir,
      startHour: 6,
      endHour: 18
    });
    assert.equal(requestedFiveMinuteRowsToCsv(rows).split("\n").length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test
```

Expected: TypeScript/test failure because `startHour` and `endHour` options do not exist yet.

- [ ] **Step 3: Implement time-window options**

Update the options for `loadRequestedFiveMinutePage` and `loadRequestedFiveMinuteRows`:

```ts
type FiveMinuteLoadOptions = {
  routeId?: string;
  offset?: number;
  windowSize?: number;
  baseDir?: string;
  startHour?: number;
  endHour?: number;
};
```

Add helpers in `src/lib/requested-traffic-five-minute.ts`:

```ts
function normalizeHour(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.min(23, Math.max(0, Math.floor(value))) : fallback;
}

function rowHour(row: RequestedFiveMinuteRawRow): number | null {
  const explicit = Number((row as { 시?: unknown }).시);
  if (Number.isInteger(explicit)) return explicit;
  const match = /^(\d{1,2}):/.exec(text(row.시간));
  return match ? Number(match[1]) : null;
}

function filterSourceRowsByHour(
  rows: RequestedFiveMinuteRawRow[],
  startHour = REQUESTED_TRAFFIC_DAY_START_HOUR,
  endHour = REQUESTED_TRAFFIC_DAY_END_HOUR
): RequestedFiveMinuteRawRow[] {
  const start = normalizeHour(startHour, REQUESTED_TRAFFIC_DAY_START_HOUR);
  const end = normalizeHour(endHour, REQUESTED_TRAFFIC_DAY_END_HOUR);
  return rows.filter((row) => {
    const hour = rowHour(row);
    return hour != null && hour >= start && hour <= end;
  });
}
```

Use the filtered rows for both `totalCount` and the paged `slice`. Also replace the current data-dir constant with the active directory:

```ts
import { REQUESTED_TRAFFIC_ACTIVE_DATA_DIR } from "./requested-traffic-data-config";

export const REQUESTED_TRAFFIC_DATA_DIR = REQUESTED_TRAFFIC_ACTIVE_DATA_DIR;
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

---

### Task 3: Add Hourly Loader And CSV Export

**Files:**
- Create: `src/lib/requested-traffic-hourly.ts`
- Create: `src/lib/requested-traffic-hourly.test.ts`

- [ ] **Step 1: Write tests for hourly rows**

Create `src/lib/requested-traffic-hourly.test.ts` with temp route JSON containing `시간별요약` for hours 5, 6, 18, and 19. Assertions:

```ts
assert.deepEqual(rows.map((row) => row.label), ["06:00", "18:00"]);
assert.equal(rows[0].requestLabel, "계양IC → 장수IC");
assert.match(csv, /^요청구간,실제매칭구간,날짜,시간대/);
assert.match(csv, /2026-05-13,06:00,62.5/);
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test
```

Expected: fails because `src/lib/requested-traffic-hourly.ts` does not exist.

- [ ] **Step 3: Implement hourly loader**

Create `src/lib/requested-traffic-hourly.ts` with these exports:

```ts
export function loadRequestedHourlyRows(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: { routeId?: string; baseDir?: string; startHour?: number; endHour?: number } = {}
): RequestedTrafficHourlyRow[];

export function loadRequestedHourlyPage(
  routes: RequestedTrafficFiveMinuteRouteMeta[],
  options: { routeId?: string; baseDir?: string; startHour?: number; endHour?: number } = {}
): RequestedTrafficHourlyPage;

export function requestedHourlyRowsToCsv(rows: RequestedTrafficHourlyRow[]): string;
```

CSV header:

```ts
[
  "요청구간",
  "실제매칭구간",
  "날짜",
  "시간대",
  "평균속도(km/h)",
  "최저속도(km/h)",
  "혼잡상태",
  "막힘여부",
  "자료수",
  "관측링크수",
  "서행관측수",
  "정체관측수",
  "서행구간수",
  "정체구간수"
]
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

---

### Task 4: Add Hourly API And Extend 5-Minute API

**Files:**
- Modify: `src/app/api/requested-traffic/five-minute/route.ts`
- Create: `src/app/api/requested-traffic/hourly/route.ts`

- [ ] **Step 1: Parse hour params in the 5-minute API**

Read `startHour` and `endHour` from query params with defaults `6` and `18`.

Expected API examples:

```text
/api/requested-traffic/five-minute?route=all&startHour=6&endHour=18
/api/requested-traffic/five-minute?route=geyang_ic_to_jangsu_ic&startHour=6&endHour=18&format=csv
```

- [ ] **Step 2: Create hourly API route**

Implement:

```text
/api/requested-traffic/hourly?route=all&startHour=6&endHour=18
/api/requested-traffic/hourly?route=all&startHour=6&endHour=18&format=csv
```

CSV filename format:

```ts
requested-traffic-hourly-${safeRouteId}-06-18.csv
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: Next.js build succeeds.

---

### Task 5: Add The `/hourly` Page

**Files:**
- Create: `src/components/requested-hourly-explorer.tsx`
- Create: `src/app/hourly/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Build the server page**

`src/app/hourly/page.tsx` should load route metadata from `src/lib/requested-traffic-home-report.json`, call `loadRequestedHourlyPage(routes, { routeId: "all", startHour: 6, endHour: 18 })`, and pass the initial rows to `RequestedHourlyExplorer`.

- [ ] **Step 2: Build the client explorer**

Controls:

```text
요청 구간 select
조회 button
CSV download link
```

Metrics:

```text
선택 범위
시간 행
시간 범위
요청 구간
```

Table columns:

```text
요청구간, 날짜, 시간대, 평균속도, 최저속도, 혼잡, 막힘, 자료수, 관측링크, 서행관측, 정체관측
```

- [ ] **Step 3: Add CSS**

Add classes for:

```css
.requested-hourly-page
.hourly-filter-panel
.hourly-table-wrap
.hourly-table
```

Use the existing panel, metric, pill, and table visual language.

- [ ] **Step 4: Verify page build**

Run:

```bash
npm run build
```

Expected: build succeeds and `/hourly` is included.

---

### Task 6: Update Existing 5-Minute UI For 06:00-18:00

**Files:**
- Modify: `src/components/requested-five-minute-explorer.tsx`
- Modify: `src/app/five-minute/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add initial time-window props**

Pass `initialStartHour={6}` and `initialEndHour={18}` from `src/app/five-minute/page.tsx`.

- [ ] **Step 2: Include time-window params in fetch and CSV URLs**

Expected CSV URL shape:

```ts
`/api/requested-traffic/five-minute?route=${routeId}&startHour=${startHour}&endHour=${endHour}&format=csv`
```

- [ ] **Step 3: Update summary metrics**

Change metric copy from `전체 5분 행` to `06~18시 5분 행`.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both pass.

---

### Task 7: Link Home, 5-Minute, And Hourly Pages

**Files:**
- Modify: `src/components/requested-traffic-home.tsx`
- Modify: `src/components/requested-five-minute-explorer.tsx`
- Modify: `README.md`

- [ ] **Step 1: Add home action link**

Add a `/hourly` link next to `/five-minute`:

```tsx
<Link className="icon-button" href="/hourly" title="1시간 단위 데이터 화면">
  <Clock3 size={18} />
  1시간
</Link>
```

- [ ] **Step 2: Add 5-minute page link to hourly**

Add an action button in the 5-minute hero:

```tsx
<Link className="icon-button" href="/hourly" title="1시간 단위 데이터 화면">
  <Clock3 size={18} />
  1시간
</Link>
```

- [ ] **Step 3: Update README**

Document:

```md
- `/five-minute`: `data/csv-20260513-20260515/*.json` 기반 5분 단위 전체 데이터 탐색
- `/hourly`: `data/csv-20260513-20260515/*.json`의 `시간별요약` 기반 1시간 단위 데이터 탐색 및 CSV 다운로드
```

And:

```bash
npm run build:traffic-data -- \
  /Users/anjuhwan/Downloads/20260513_5Min.csv \
  /Users/anjuhwan/Downloads/20260514_5Min.csv \
  /Users/anjuhwan/Downloads/20260515_5Min.csv
```

---

### Task 8: Add Reproducible Data Rebuild Script Without Deleting Existing JSON

**Files:**
- Modify: `package.json`
- Create: `scripts/build-requested-traffic-data.mjs`
- Read-only template source: `data/csv/*.json`
- Create/update active output: `data/csv-20260513-20260515/*.json`

- [ ] **Step 1: Add package script**

Add:

```json
"build:traffic-data": "node scripts/build-requested-traffic-data.mjs"
```

- [ ] **Step 2: Implement script inputs**

The script accepts raw CSV paths as positional args and defaults to only the uploaded 2026-05-13 through 2026-05-15 files:

```js
[
  "/Users/anjuhwan/Downloads/20260513_5Min.csv",
  "/Users/anjuhwan/Downloads/20260514_5Min.csv",
  "/Users/anjuhwan/Downloads/20260515_5Min.csv"
]
```

- [ ] **Step 3: Implement route template loading**

Read every existing `data/csv/*.json` except `manifest.json` as route templates only, and build:

```js
const routeTemplates = [{
  id,
  meta: source["메타"],
  links: source["구간목록"]
}];
const linkToRouteIds = new Map();
```

- [ ] **Step 4: Implement raw CSV streaming**

Use `readline.createInterface({ input: createReadStream(csvPath) })`.

For every line after the header:

```js
const [creatde, creathm, linkId, roadInsttCd, speedText, travelTimeText] = line.replace(/^\uFEFF/, "").split(",");
```

If `linkId` is in `linkToRouteIds`, create one row per matched route using existing link metadata.

- [ ] **Step 5: Implement status calculation**

Rules:

```js
if (rank includes "고속도로" or "도시고속도로"):
  speed >= 50 => "원활"
  speed >= 30 => "서행"
  otherwise => "정체"
else:
  speed >= 25 => "원활"
  speed >= 15 => "서행"
  otherwise => "정체"
```

`막힘여부` is `true` for `서행` or `정체`.

- [ ] **Step 6: Implement route JSON output**

Write route JSON files under:

```text
data/csv-20260513-20260515
```

Do not remove or rewrite files under:

```text
data/csv
```

Each route file keeps these keys:

```text
메타
관측요약
구간목록
미관측구간목록
시간별요약
구간별요약
오분단위자료
```

Sort `오분단위자료` by `날짜`, `시간`, and route link order.

- [ ] **Step 7: Implement home report output**

Write `src/lib/requested-traffic-home-report.json` with exactly this date range:

```text
period: "2026-05-13 ~ 2026-05-15"
granularity: "5분 원천 / 06~18시 시간별 요약"
routes[].days[].hours: only hours 6 through 18
```

- [ ] **Step 8: Run the data rebuild**

Run:

```bash
npm run build:traffic-data -- \
  /Users/anjuhwan/Downloads/20260513_5Min.csv \
  /Users/anjuhwan/Downloads/20260514_5Min.csv \
  /Users/anjuhwan/Downloads/20260515_5Min.csv
```

Expected:

```text
Scanned /Users/anjuhwan/Downloads/20260513_5Min.csv
Scanned /Users/anjuhwan/Downloads/20260514_5Min.csv
Scanned /Users/anjuhwan/Downloads/20260515_5Min.csv
Wrote data/csv-20260513-20260515/manifest.json
Wrote src/lib/requested-traffic-home-report.json
```

- [ ] **Step 9: Confirm old JSON files remain**

Run:

```bash
ls data/csv/*.json
ls data/csv-20260513-20260515/*.json
```

Expected: both directories contain JSON files; `data/csv/*.json` still exists.

---

### Task 9: Full Verification

**Files:**
- All changed files

- [ ] **Step 1: Run automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 2: Start the app**

Run:

```bash
npm run dev
```

Expected: local app starts at `http://localhost:3000`.

- [ ] **Step 3: Browser-check pages**

Open:

```text
http://localhost:3000/
http://localhost:3000/five-minute
http://localhost:3000/hourly
```

Verify:

- Home shows period `2026-05-13 ~ 2026-05-15`.
- Active data comes from `data/csv-20260513-20260515`, while old `data/csv` files remain on disk.
- `/five-minute` shows only 06시 through 18시 rows.
- `/five-minute` CSV downloads with the same window.
- `/hourly` has its own page, route filter, and CSV button.
- `/hourly` CSV contains `시간대` values from `06:00` through `18:00`.

---

## Self-Review

- Spec coverage:
  - New input CSVs: Task 8.
  - Existing data JSON preservation: Task 8 writes to `data/csv-20260513-20260515` and checks old `data/csv` remains.
  - Previously requested routes: Task 8 uses current seven route templates.
  - 06:00-18:00 5-minute viewing: Tasks 2, 4, 6.
  - Hourly viewing: Tasks 3, 4, 5.
  - Hourly CSV export: Tasks 3, 4, 5.
  - Separate hourly page: Task 5.
- Placeholder scan:
  - No implementation step relies on TBD values; exact paths, commands, API URLs, and output contracts are listed.
- Type consistency:
  - Shared hourly type is defined in `requested-traffic-five-minute-shared.ts` and consumed by `requested-traffic-hourly.ts`, API route, and component.
