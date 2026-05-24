import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { getRequestedTrafficDataset, requestedTrafficRoutesForReport } from "../src/lib/requested-traffic-datasets";
import {
  REQUESTED_TRAFFIC_DAY_END_HOUR,
  REQUESTED_TRAFFIC_DAY_START_HOUR
} from "../src/lib/requested-traffic-five-minute-shared";
import { loadRequestedTrafficMapGroups } from "../src/lib/requested-traffic-maps";
import type { RequestedTrafficMapDirectionHour, RequestedTrafficMapSegment } from "../src/lib/requested-traffic-maps";
import {
  REQUESTED_TRAFFIC_MAP_VIEWPORTS,
  buildCenteredRouteViewport,
  buildOsmTiles,
  buildProjectedRoutePath,
  buildProjectedTrafficSegmentPaths,
  buildRouteDistanceSplitViewports
} from "../src/lib/requested-traffic-map-geometry";
import type { ProjectedPoint, ProjectedTrafficSegmentPath } from "../src/lib/requested-traffic-map-geometry";

const cwd = process.cwd();
const outputDir = resolve(cwd, "requested-traffic-hourly-pdfs");
const zipPath = resolve(cwd, "requested-traffic-hourly-pdfs.zip");
const workDir = "/tmp/requested-traffic-line-pdf";
const tileDir = "/tmp/requested-traffic-hourly-pdf-tiles";
const imageDir = join(workDir, "maps");
const htmlDir = join(workDir, "html");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const mapWidth = 1320;
const mapHeight = 742;
const maxNumberedSegments = 4;

type TrafficStatus = RequestedTrafficMapSegment["status"];

interface MarkerRow {
  number: number;
  segment: RequestedTrafficMapSegment;
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
}

rmSync(outputDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
rmSync(workDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
mkdirSync(imageDir, { recursive: true });
mkdirSync(htmlDir, { recursive: true });
mkdirSync(tileDir, { recursive: true });

const dataset = getRequestedTrafficDataset("20260520");
const routes = requestedTrafficRoutesForReport(dataset.report);
const groups = loadRequestedTrafficMapGroups(routes, {
  startHour: REQUESTED_TRAFFIC_DAY_START_HOUR,
  endHour: REQUESTED_TRAFFIC_DAY_END_HOUR
});
const hours = Array.from(
  { length: REQUESTED_TRAFFIC_DAY_END_HOUR - REQUESTED_TRAFFIC_DAY_START_HOUR + 1 },
  (_, index) => REQUESTED_TRAFFIC_DAY_START_HOUR + index
);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  for (const hour of hours) {
    const htmlPath = join(htmlDir, `requested-traffic-2026-05-20-${padHour(hour)}.html`);
    writeFileSync(htmlPath, await htmlForHour(hour), "utf8");
    console.log(`${padHour(hour)}시 HTML/지도 준비 완료`);
  }

  for (const hour of hours) {
    const htmlPath = join(htmlDir, `requested-traffic-2026-05-20-${padHour(hour)}.html`);
    const pdfPath = join(outputDir, `requested-traffic-2026-05-20-${padHour(hour)}.pdf`);
    const size = await printPdf(hour, htmlPath, pdfPath);
    console.log(`${padHour(hour)}시 PDF 생성: ${(size / 1024 / 1024).toFixed(1)}MB`);
  }
}

function tileFileName(url: string): string {
  return `${createHash("sha1").update(url).digest("hex")}.png`;
}

async function ensureTile(url: string): Promise<string> {
  const filePath = join(tileDir, tileFileName(url));
  if (existsSync(filePath)) return filePath;

  const response = await fetch(url, { headers: { "User-Agent": "Codex traffic PDF generator" } });
  if (!response.ok) throw new Error(`Tile ${response.status}: ${url}`);
  writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

function splitMapFor(groupId: string, routeId: string) {
  const fallbackViewport = REQUESTED_TRAFFIC_MAP_VIEWPORTS[groupId];
  if (!fallbackViewport) return null;
  return buildRouteDistanceSplitViewports(routeId, buildCenteredRouteViewport(routeId, fallbackViewport), 1)[0] ?? null;
}

async function mapImage(groupId: string, routeId: string, direction: RequestedTrafficMapDirectionHour): Promise<string> {
  const splitMap = splitMapFor(groupId, routeId);
  if (!splitMap) return "";
  const imageName = `${padHour(direction.hour)}-${groupId}-${direction.routeId}.jpg`;
  const imagePath = join(imageDir, imageName);
  if (existsSync(imagePath)) return imagePath;

  const viewport = splitMap.viewport;
  const tileImages = [];
  for (const tile of buildOsmTiles(viewport)) {
    const filePath = await ensureTile(tile.url);
    const encoded = readFileSync(filePath).toString("base64");
    tileImages.push(
      `<image href="data:image/png;base64,${encoded}" x="${pct(tile.leftPercent)}" y="${pct(tile.topPercent)}" width="${pct(tile.widthPercent)}" height="${pct(tile.heightPercent)}" preserveAspectRatio="none" opacity="0.88"/>`
    );
  }

  const basePath = buildProjectedRoutePath(direction.routeId, viewport, splitMap);
  const paths = buildProjectedTrafficSegmentPaths(direction.routeId, direction.segments, viewport, splitMap);
  const pathByLinkId = new Map(paths.map((path) => [path.segment.linkId, path]));
  const orderedPaths = [...paths].sort((first, second) => statusRank(first.segment.status) - statusRank(second.segment.status));
  const markerRows = buildMarkerLayout(direction, pathByLinkId);
  const selectedPaths = markerRows
    .map((marker) => pathByLinkId.get(marker.segment.linkId))
    .filter((path): path is ProjectedTrafficSegmentPath => Boolean(path));
  const routeStart = basePath[0];
  const routeEnd = basePath.at(-1);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${mapWidth}" height="${mapHeight}" viewBox="0 0 100 100" preserveAspectRatio="none">
    <rect width="100" height="100" fill="#d9e6ed"/>
    ${tileImages.join("\n")}
    <rect width="100" height="100" fill="#ffffff" opacity="0.2"/>
    <polyline points="${escapeHtml(points(basePath))}" fill="none" stroke="rgba(15,23,42,0.36)" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${escapeHtml(points(basePath))}" fill="none" stroke="rgba(255,255,255,0.98)" stroke-width="1.78" stroke-linecap="round" stroke-linejoin="round"/>
    ${orderedPaths
      .map(
        (path) =>
          `<polyline points="${escapeHtml(points(path.points))}" fill="none" stroke="${statusColor(path.segment.status)}" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("\n")}
    ${selectedPaths
      .map(
        (path) =>
          `<polyline points="${escapeHtml(points(path.points))}" fill="none" stroke="rgba(255,255,255,0.98)" stroke-width="2.82" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("\n")}
    ${selectedPaths
      .map(
        (path) =>
          `<polyline points="${escapeHtml(points(path.points))}" fill="none" stroke="${statusColor(path.segment.status)}" stroke-width="1.82" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("\n")}
    ${markerRows.map((marker) => leader(marker)).join("\n")}
    ${routeStart ? terminal(routeStart, "출발", "#111827") : ""}
    ${routeEnd ? terminal(routeEnd, "도착", "#2563eb") : ""}
    ${markerRows.map((marker) => markerSvg(marker)).join("\n")}
    <g transform="translate(2 92)">
      <rect x="0" y="0" width="25" height="5.4" rx="1.2" fill="rgba(255,255,255,0.94)"/>
      <circle cx="2.9" cy="2.7" r="0.75" fill="#ef3131"/><text x="4.3" y="3.5" font-family="Apple SD Gothic Neo, AppleGothic, sans-serif" font-size="2.1" font-weight="800" fill="#334155">정체</text>
      <circle cx="10.5" cy="2.7" r="0.75" fill="#f2a900"/><text x="11.9" y="3.5" font-family="Apple SD Gothic Neo, AppleGothic, sans-serif" font-size="2.1" font-weight="800" fill="#334155">서행</text>
      <circle cx="18.2" cy="2.7" r="0.75" fill="#18a84a"/><text x="19.6" y="3.5" font-family="Apple SD Gothic Neo, AppleGothic, sans-serif" font-size="2.1" font-weight="800" fill="#334155">원활</text>
    </g>
    <text x="97.5" y="95" text-anchor="end" font-family="Arial, sans-serif" font-size="1.9" font-weight="700" fill="#475569">© OpenStreetMap</text>
  </svg>`;

  await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toFile(imagePath);
  return imagePath;
}

function buildMarkerLayout(
  direction: RequestedTrafficMapDirectionHour,
  pathByLinkId: Map<string, ProjectedTrafficSegmentPath>
): MarkerRow[] {
  const offsets = [
    { x: 0, y: -7.5 },
    { x: -5.2, y: 5.6 },
    { x: 5.2, y: -5.8 },
    { x: 0.4, y: 7.6 }
  ];
  const markers = numberedSegments(direction)
    .map((segment, index) => {
      const path = pathByLinkId.get(segment.linkId);
      const anchor = path?.points[Math.floor((path?.points.length ?? 1) / 2)] ?? path?.points[0];
      if (!anchor) return null;
      const offset = offsets[index % offsets.length];
      return {
        number: index + 1,
        segment,
        anchorX: anchor.xPercent,
        anchorY: anchor.yPercent,
        labelX: clamp(anchor.xPercent + offset.x, 4.8, 95.2),
        labelY: clamp(anchor.yPercent + offset.y, 7, 90.5)
      };
    })
    .filter((marker): marker is MarkerRow => Boolean(marker));

  for (let pass = 0; pass < 6; pass += 1) {
    for (let i = 0; i < markers.length; i += 1) {
      for (let j = i + 1; j < markers.length; j += 1) {
        const first = markers[i];
        const second = markers[j];
        const dx = second.labelX - first.labelX;
        const dy = second.labelY - first.labelY;
        if (Math.abs(dx) < 5.4 && Math.abs(dy) < 5.4) {
          second.labelY = clamp(second.labelY + (dy >= 0 ? 4.3 : -4.3), 7, 90.5);
          second.labelX = clamp(second.labelX + (dx >= 0 ? 2.8 : -2.8), 4.8, 95.2);
        }
      }
    }
  }

  return markers;
}

function numberedSegments(direction: RequestedTrafficMapDirectionHour): RequestedTrafficMapSegment[] {
  return direction.segments.filter((segment) => segment.status === "서행" || segment.status === "정체").slice(0, maxNumberedSegments);
}

function leader(marker: MarkerRow): string {
  return `<g>
    <line x1="${round(marker.anchorX)}" y1="${round(marker.anchorY)}" x2="${round(marker.labelX)}" y2="${round(marker.labelY)}" stroke="rgba(15,23,42,0.65)" stroke-width="0.22" stroke-linecap="round"/>
    <circle cx="${round(marker.anchorX)}" cy="${round(marker.anchorY)}" r="1.25" fill="${statusColor(marker.segment.status)}" stroke="#ffffff" stroke-width="0.38"/>
  </g>`;
}

function markerSvg(marker: MarkerRow): string {
  const fill = statusColor(marker.segment.status);
  const color = statusTextColor(marker.segment.status);
  return `<g transform="translate(${round(marker.labelX)} ${round(marker.labelY)})">
    <circle r="2.95" fill="rgba(255,255,255,0.98)" stroke="rgba(15,23,42,0.22)" stroke-width="0.35"/>
    <circle r="2.38" fill="${fill}" stroke="#ffffff" stroke-width="0.42"/>
    <text x="0" y="0.78" text-anchor="middle" font-family="Arial, sans-serif" font-size="2.55" font-weight="900" fill="${color}">${marker.number}</text>
  </g>`;
}

function terminal(point: ProjectedPoint, label: string, fill: string): string {
  return `<g transform="translate(${round(point.xPercent)} ${round(point.yPercent)})">
    <rect x="-3.8" y="-1.65" width="7.6" height="3.3" rx="1.3" fill="${fill}" opacity="0.92" stroke="#ffffff" stroke-width="0.28"/>
    <text x="0" y="0.72" text-anchor="middle" font-family="Apple SD Gothic Neo, AppleGothic, sans-serif" font-size="1.9" font-weight="900" fill="#ffffff">${label}</text>
  </g>`;
}

async function mapCards(groupId: string, directions: RequestedTrafficMapDirectionHour[]): Promise<string> {
  const cards = [];
  for (const direction of directions) {
    const imagePath = await mapImage(groupId, direction.routeId, direction);
    cards.push(`
      <article class="map-card status-${statusClass(direction.status)}">
        <div class="map-card-title">
          <div><strong>${escapeHtml(direction.requestLabel)}</strong><span>${escapeHtml(direction.matchedLabel)}</span></div>
        </div>
        <img class="line-map" src="${pathToFileURL(imagePath).href}" alt="${escapeHtml(direction.requestLabel)} 교통선 지도" />
      </article>
    `);
  }
  return cards.join("");
}

function detailRows(directions: RequestedTrafficMapDirectionHour[]): string {
  const rows = [];
  for (const direction of directions) {
    const sections = numberedSegments(direction);
    if (!sections.length) {
      rows.push(`<tr><td>${escapeHtml(direction.requestLabel)}</td><td>-</td><td><span class="status-pill smooth">원활</span></td><td>막히는 구간 없음</td><td>-</td></tr>`);
      continue;
    }
    sections.forEach((section, index) => {
      rows.push(`
        <tr>
          <td>${escapeHtml(direction.requestLabel)}</td>
          <td class="num"><span class="table-number ${statusClass(section.status)}">${index + 1}</span></td>
          <td><span class="status-pill ${statusClass(section.status)}">${escapeHtml(section.status)}</span></td>
          <td>${escapeHtml(sectionLabel(section))}<br><small>${escapeHtml(section.roadName)}</small></td>
          <td>${escapeHtml(speed(section.minSpeedKmh))}</td>
        </tr>
      `);
    });
    const remaining = direction.segments.filter((segment) => segment.status === "서행" || segment.status === "정체").length - sections.length;
    if (remaining > 0) {
      rows.push(`<tr class="remaining"><td>${escapeHtml(direction.requestLabel)}</td><td colspan="4">지도에는 전체 교통선 표시 · 번호표는 주요 ${sections.length}개, 외 ${remaining.toLocaleString("ko-KR")}개</td></tr>`);
    }
  }
  return rows.join("");
}

async function groupPage(group: (typeof groups)[number], hourEntry: (typeof groups)[number]["hours"][number]): Promise<string> {
  const directions = hourEntry.directions;
  return `
    <section class="pdf-page status-${statusClass(hourStatus(directions))}">
      <header class="page-header">
        <div>
          <p>2026년 5월 20일 · ${escapeHtml(hourEntry.label)} 기준</p>
          <h1>${escapeHtml(group.displayLabel)}</h1>
          <span>${escapeHtml(group.actualLabel)}</span>
        </div>
      </header>
      <div class="map-grid">${await mapCards(group.id, directions)}</div>
      <section class="table-grid">
        <div class="table-panel detail-panel">
          <h2>지도 번호별 주요 막힘 구간표</h2>
          <table><thead><tr><th>방향</th><th>번호</th><th>상태</th><th>구간</th><th>최저</th></tr></thead><tbody>${detailRows(directions)}</tbody></table>
        </div>
      </section>
      <footer>번호 배지는 해당 구간의 색 점과 연결선으로 이어집니다. 짧은 서행/정체 구간도 굵은 색 선으로 한 번 더 강조했습니다.</footer>
    </section>
  `;
}

const css = `
@page { size: A4 landscape; margin: 8mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #ffffff; color: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'AppleGothic', 'Malgun Gothic', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pdf-page { width: 281mm; min-height: 194mm; display: flex; flex-direction: column; gap: 3mm; break-after: page; page-break-after: always; background: #f5f8fc; }
.pdf-page:last-child { break-after: auto; page-break-after: auto; }
.page-header { display: flex; gap: 8mm; align-items: flex-start; padding: 0 0 2.2mm; border-bottom: 0.35mm solid #d7e2ee; }
.page-header p { margin: 0 0 1.1mm; color: #5e718f; font-size: 8.2pt; font-weight: 850; }
.page-header h1 { margin: 0; color: #111827; font-size: 19pt; line-height: 1.05; letter-spacing: 0; }
.page-header span { display: block; margin-top: 1.2mm; color: #64748b; font-size: 8.6pt; font-weight: 700; }
.status-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 15mm; height: 6mm; padding: 0 2.5mm; border-radius: 999px; font-size: 8.1pt; font-weight: 950; line-height: 1; white-space: nowrap; border: 0.35mm solid #94a3b8; color: #475569; background: #eef2f7; font-style: normal; }
.status-pill.congested { color: #c52222; background: #fff1f1; border-color: #ff4444; }
.status-pill.slow { color: #9a6200; background: #fff7df; border-color: #f6ae1a; }
.status-pill.smooth { color: #10743a; background: #eaf9ef; border-color: #23c55e; }
.status-pill.unknown { color: #58657a; background: #f1f5f9; border-color: #94a3b8; }
.map-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.map-card { min-width: 0; display: flex; flex-direction: column; gap: 1.8mm; }
.map-card-title { display: block; min-height: 10.6mm; }
.map-card-title div { min-width: 0; }
.map-card-title strong { display: block; color: #111827; font-size: 10.4pt; line-height: 1.15; font-weight: 950; }
.map-card-title span { display: block; margin-top: 0.7mm; color: #64748b; font-size: 7.7pt; line-height: 1.15; font-weight: 750; }
.line-map { display: block; width: 100%; height: 56mm; object-fit: cover; border: 0.35mm solid #b8c7d4; border-radius: 2mm; background: #d9e6ed; }
.table-grid { display: block; min-height: 0; }
.table-panel { min-width: 0; overflow: hidden; border: 0.35mm solid #d3deeb; border-radius: 2mm; background: rgba(255,255,255,0.94); }
.table-panel h2 { margin: 0; padding: 1.8mm 2.2mm; background: #edf4fb; color: #223047; border-bottom: 0.35mm solid #d3deeb; font-size: 9.2pt; line-height: 1.1; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border-bottom: 0.25mm solid #dce5ef; border-right: 0.25mm solid #e4ebf3; padding: 1.12mm 1.2mm; vertical-align: middle; text-align: left; overflow-wrap: anywhere; word-break: keep-all; color: #1f2937; font-size: 7.0pt; line-height: 1.2; }
th:last-child, td:last-child { border-right: 0; }
th { background: #f7fafc; color: #63718a; font-weight: 950; }
td small { color: #66758c; font-size: 6.2pt; line-height: 1.1; }
.detail-panel th:nth-child(1), .detail-panel td:nth-child(1) { width: 26%; }
.detail-panel th:nth-child(2), .detail-panel td:nth-child(2) { width: 8%; text-align: center; }
.detail-panel th:nth-child(3), .detail-panel td:nth-child(3) { width: 13%; text-align: center; }
.detail-panel th:nth-child(4), .detail-panel td:nth-child(4) { width: 41%; }
.detail-panel th:nth-child(5), .detail-panel td:nth-child(5) { width: 12%; }
td .status-pill { height: 5.1mm; min-width: 12.2mm; font-size: 7.0pt; padding: 0 1.5mm; }
.table-number { display: inline-flex; align-items: center; justify-content: center; width: 5.2mm; height: 5.2mm; border-radius: 999px; border: 0.35mm solid #fff; color: #fff; font-size: 7.4pt; font-weight: 950; line-height: 1; }
.table-number.congested { background: #ef3131; }
.table-number.slow { background: #f2a900; color: #2d1d00; }
.table-number.smooth { background: #18a84a; }
.num { color: #111827; font-weight: 950; }
.remaining td { color: #64748b; background: #f8fafc; font-weight: 850; }
footer { margin-top: auto; padding-top: 1.2mm; color: #73839b; font-size: 7.0pt; border-top: 0.25mm solid #dbe5f0; }
`;

async function htmlForHour(hour: number): Promise<string> {
  const pages = [];
  for (const group of groups) {
    const hourEntry = group.hours.find((item) => item.hour === hour);
    if (hourEntry) pages.push(await groupPage(group, hourEntry));
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${padHour(hour)} traffic PDF</title><style>${css}</style></head><body>${pages.join("\n")}</body></html>`;
}

async function printPdf(hour: number, htmlPath: string, pdfPath: string): Promise<number> {
  const profile = `/tmp/chrome-traffic-line-pdf-${padHour(hour)}`;
  rmSync(profile, { recursive: true, force: true });
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--allow-file-access-from-files",
      "--no-pdf-header-footer",
      `--user-data-dir=${profile}`,
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href
    ],
    { stdio: "ignore" }
  );

  let lastSize = -1;
  let stableCount = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(500);
    if (existsSync(pdfPath)) {
      const size = statSync(pdfPath).size;
      if (size > 100_000 && size === lastSize) stableCount += 1;
      else stableCount = 0;
      lastSize = size;
      if (stableCount >= 2) {
        child.kill("SIGTERM");
        await sleep(250);
        return size;
      }
    }
    if (child.exitCode != null && existsSync(pdfPath) && statSync(pdfPath).size > 100_000) return statSync(pdfPath).size;
  }
  child.kill("SIGKILL");
  throw new Error(`PDF generation timed out for ${padHour(hour)}:00`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hourStatus(directions: RequestedTrafficMapDirectionHour[]): TrafficStatus {
  if (directions.some((direction) => direction.status === "정체")) return "정체";
  if (directions.some((direction) => direction.status === "서행")) return "서행";
  if (directions.some((direction) => direction.status === "원활")) return "원활";
  return "정보없음";
}

function statusRank(status: TrafficStatus): number {
  if (status === "정체") return 3;
  if (status === "서행") return 2;
  if (status === "원활") return 1;
  return 0;
}

function statusClass(status: TrafficStatus): string {
  if (status === "정체") return "congested";
  if (status === "서행") return "slow";
  if (status === "원활") return "smooth";
  return "unknown";
}

function statusColor(status: TrafficStatus): string {
  if (status === "정체") return "#ef3131";
  if (status === "서행") return "#f2a900";
  if (status === "원활") return "#18a84a";
  return "#94a3b8";
}

function statusTextColor(status: TrafficStatus): string {
  return status === "서행" ? "#2d1d00" : "#ffffff";
}

function sectionLabel(segment: RequestedTrafficMapSegment): string {
  const from = clean(segment.fromName);
  const to = clean(segment.toName);
  if (from && to && from !== to) return `${from} → ${to}`;
  return clean(segment.sectionName) || clean(segment.roadName) || "-";
}

function speed(value: number | null): string {
  return value == null ? "-" : `${Number(value.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function clean(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().replace(/^-$/, "");
}

function points(items: ProjectedPoint[]): string {
  return items.map((point) => `${round(point.xPercent)},${round(point.yPercent)}`).join(" ");
}

function pct(value: number): string {
  return `${round(value)}%`;
}

function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
