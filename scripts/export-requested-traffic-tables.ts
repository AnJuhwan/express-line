import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import {
  RIVER_CORRIDOR_REPORT_END_DATE,
  RIVER_CORRIDOR_REPORT_START_DATE,
  RIVER_CORRIDOR_SOURCE_NAME,
  buildRiverCorridorReport,
  riverCorridorSectionPairs
} from "../src/lib/river-corridors";
import { getTrafficRepository } from "../src/lib/repository";
import type { RiverCorridorHourCell, RiverCorridorReportRow } from "../src/lib/river-corridors";

const outputDir = join(process.cwd(), "data", "exports");
const outputPath = join(
  outputDir,
  `requested-traffic-tables-${RIVER_CORRIDOR_REPORT_START_DATE}_to_${RIVER_CORRIDOR_REPORT_END_DATE}.xlsx`
);

const GEYANG_NODE = "1670002200";
const JANGSU_NODE = "1650003800";

interface LatestRouteRow {
  order: number;
  observedAt: string;
  requestLabel: string;
  roadName: string;
  sectionName: string;
  linkId: string;
  speedKph: number | null;
  congestionLabel: string;
  congestionLevel: string;
}

interface SinwolSummaryRow {
  roadName: string;
  sectionName: string;
  observedRows: number;
  congestedRows: number;
  slowRows: number;
  minSpeedKph: number | null;
  avgSpeedKph: number | null;
}

interface SinwolDetailRow {
  date: string;
  hour: number;
  roadName: string;
  sectionName: string;
  speedKph: number | null;
  congestionLabel: string;
}

async function main() {
  const repo = getTrafficRepository();
  const riverRows = repo.queryObservationsByRoadSections({
    startDate: RIVER_CORRIDOR_REPORT_START_DATE,
    endDate: RIVER_CORRIDOR_REPORT_END_DATE,
    sourceName: RIVER_CORRIDOR_SOURCE_NAME,
    sections: riverCorridorSectionPairs()
  });
  const riverReport = buildRiverCorridorReport(riverRows);

  const db = new DatabaseSync(join(process.cwd(), "data", "traffic.sqlite"));
  const latestItsAt = db
    .prepare("SELECT max(observed_at) AS latestItsAt FROM traffic_observations WHERE source_name = 'its-realtime'")
    .get() as { latestItsAt: string | null };
  const latestAt = latestItsAt.latestItsAt;
  if (!latestAt) throw new Error("No ITS realtime observations found.");

  const geyangToJangsu = latestRouteRows(db, latestAt, "계양IC→장수IC", GEYANG_NODE, JANGSU_NODE);
  const jangsuToGeyang = latestRouteRows(db, latestAt, "장수IC→계양IC", JANGSU_NODE, GEYANG_NODE);
  const sinwolSummary = sinwolSummaryRows(db);
  const sinwolDetail = sinwolDetailRows(db);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "서울·인천 주요도로 혼잡 데이터 대시보드";
  workbook.created = new Date();
  workbook.modified = new Date();

  addSummarySheet(workbook, riverReport.corridors, latestAt, geyangToJangsu, jangsuToGeyang, sinwolSummary);
  addRiverSectionSheet(workbook, riverReport.corridors);
  for (const corridor of riverReport.corridors) addRiverCorridorSheet(workbook, corridor);
  addLatestRouteSheet(workbook, "계양-장수 최신", geyangToJangsu);
  addLatestRouteSheet(workbook, "장수-계양 최신", jangsuToGeyang);
  addSinwolSummarySheet(workbook, sinwolSummary);
  addSinwolDetailSheet(workbook, sinwolDetail);

  await mkdir(outputDir, { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  console.log(outputPath);
}

function latestRouteRows(db: DatabaseSync, latestAt: string, requestLabel: string, startNode: string, endNode: string): LatestRouteRow[] {
  const graphRows = db
    .prepare(
      `
        SELECT
          r.road_name AS roadName,
          r.section_name AS sectionName,
          r.link_id AS linkId,
          o.observed_at AS observedAt,
          o.speed_kph AS speedKph,
          o.congestion_label AS congestionLabel,
          o.congestion_level AS congestionLevel
        FROM traffic_observations o
        JOIN roads r ON r.id = o.road_id
        WHERE o.source_name = 'its-realtime'
          AND o.observed_at = ?
          AND r.region = '인천'
          AND r.road_name = '서울외곽순환고속도로'
      `
    )
    .all(latestAt) as unknown as Array<Omit<LatestRouteRow, "order" | "requestLabel">>;

  const graph = new Map<string, Array<{ to: string; row: Omit<LatestRouteRow, "order" | "requestLabel"> }>>();
  for (const row of graphRows) {
    const [from, to] = row.sectionName.split("→");
    if (!from || !to) continue;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push({ to, row });
  }

  const queue = [startNode];
  const previous = new Map<string, string | null>([[startNode, null]]);
  const previousRow = new Map<string, Omit<LatestRouteRow, "order" | "requestLabel">>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === endNode) break;
    for (const edge of graph.get(current) ?? []) {
      if (previous.has(edge.to)) continue;
      previous.set(edge.to, current);
      previousRow.set(edge.to, edge.row);
      queue.push(edge.to);
    }
  }
  if (!previous.has(endNode)) throw new Error(`Could not build route path: ${startNode} -> ${endNode}`);

  const rows: Array<Omit<LatestRouteRow, "order" | "requestLabel">> = [];
  for (let current = endNode; previous.get(current); current = previous.get(current)!) {
    rows.push(previousRow.get(current)!);
  }
  return rows.reverse().map((row, index) => ({
    order: index + 1,
    requestLabel,
    ...row
  }));
}

function sinwolSummaryRows(db: DatabaseSync): SinwolSummaryRow[] {
  return db
    .prepare(
      `
        SELECT
          r.road_name AS roadName,
          r.section_name AS sectionName,
          count(*) AS observedRows,
          sum(o.congestion_level = 'congested') AS congestedRows,
          sum(o.congestion_level = 'slow') AS slowRows,
          min(o.speed_kph) AS minSpeedKph,
          round(avg(o.speed_kph), 1) AS avgSpeedKph
        FROM traffic_observations o
        JOIN roads r ON r.id = o.road_id
        WHERE o.source_name = 'tdata-hourly-section'
          AND o.observed_date BETWEEN ? AND ?
          AND (r.section_name LIKE '%신월IC%' OR r.road_name = '신월여의지하도로')
        GROUP BY r.road_name, r.section_name
        HAVING congestedRows > 0 OR slowRows > 0
        ORDER BY congestedRows DESC, slowRows DESC, r.road_name ASC, r.section_name ASC
      `
    )
    .all(RIVER_CORRIDOR_REPORT_START_DATE, RIVER_CORRIDOR_REPORT_END_DATE) as unknown as SinwolSummaryRow[];
}

function sinwolDetailRows(db: DatabaseSync): SinwolDetailRow[] {
  return db
    .prepare(
      `
        SELECT
          o.observed_date AS date,
          o.observed_hour AS hour,
          r.road_name AS roadName,
          r.section_name AS sectionName,
          o.speed_kph AS speedKph,
          o.congestion_label AS congestionLabel
        FROM traffic_observations o
        JOIN roads r ON r.id = o.road_id
        WHERE o.source_name = 'tdata-hourly-section'
          AND o.observed_date BETWEEN ? AND ?
          AND (r.section_name LIKE '%신월IC%' OR r.road_name = '신월여의지하도로')
          AND o.congestion_level IN ('slow', 'congested')
        ORDER BY o.observed_date ASC, o.observed_hour ASC, r.road_name ASC, r.section_name ASC
      `
    )
    .all(RIVER_CORRIDOR_REPORT_START_DATE, RIVER_CORRIDOR_REPORT_END_DATE) as unknown as SinwolDetailRow[];
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  corridors: RiverCorridorReportRow[],
  latestItsAt: string,
  geyangToJangsu: LatestRouteRow[],
  jangsuToGeyang: LatestRouteRow[],
  sinwolSummary: SinwolSummaryRow[]
) {
  const sheet = workbook.addWorksheet("요약", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "분류", key: "category", width: 18 },
    { header: "테이블", key: "table", width: 24 },
    { header: "기간/시각", key: "period", width: 30 },
    { header: "행/구간", key: "count", width: 14 },
    { header: "원천", key: "source", width: 26 },
    { header: "비고", key: "note", width: 72 }
  ];
  for (const corridor of corridors) {
    sheet.addRow({
      category: "한강 축",
      table: `${corridor.roadName} ${corridor.requestLabel}`,
      period: `${RIVER_CORRIDOR_REPORT_START_DATE}~${RIVER_CORRIDOR_REPORT_END_DATE}`,
      count: `${corridor.sections.length}구간`,
      source: "T-DATA 1시간 구간별",
      note: corridor.note
    });
  }
  sheet.addRow({
    category: "계양IC~장수IC",
    table: "계양-장수 최신",
    period: latestItsAt,
    count: `${geyangToJangsu.length}구간`,
    source: "ITS 실시간",
    note: `서울외곽순환고속도로 ITS 노드 경로 ${GEYANG_NODE}→${JANGSU_NODE} 기준`
  });
  sheet.addRow({
    category: "계양IC~장수IC",
    table: "장수-계양 최신",
    period: latestItsAt,
    count: `${jangsuToGeyang.length}구간`,
    source: "ITS 실시간",
    note: `서울외곽순환고속도로 ITS 노드 경로 ${JANGSU_NODE}→${GEYANG_NODE} 기준`
  });
  sheet.addRow({
    category: "신월IC 정체",
    table: "신월IC 정체요약/상세",
    period: `${RIVER_CORRIDOR_REPORT_START_DATE}~${RIVER_CORRIDOR_REPORT_END_DATE}`,
    count: `${sinwolSummary.length}구간`,
    source: "T-DATA 1시간 구간별",
    note: "신월IC 포함 구간과 신월여의지하도로 중 서행/정체가 발생한 구간"
  });
  styleHeader(sheet.getRow(1));
  sheet.getColumn("note").alignment = { wrapText: true, vertical: "top" };
}

function addRiverSectionSheet(workbook: ExcelJS.Workbook, corridors: RiverCorridorReportRow[]) {
  const sheet = workbook.addWorksheet("한강 구간목록", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "도로명", key: "roadName", width: 16 },
    { header: "요청 구간", key: "requestLabel", width: 22 },
    { header: "순번", key: "order", width: 8 },
    { header: "T-DATA 측정 구간", key: "section", width: 58 }
  ];
  for (const corridor of corridors) {
    corridor.sections.forEach((section, index) => {
      sheet.addRow({
        roadName: corridor.roadName,
        requestLabel: corridor.requestLabel,
        order: index + 1,
        section
      });
    });
  }
  styleHeader(sheet.getRow(1));
}

function addRiverCorridorSheet(workbook: ExcelJS.Workbook, corridor: RiverCorridorReportRow) {
  const sheet = workbook.addWorksheet(riverSheetName(corridor), { views: [{ state: "frozen", ySplit: 3, xSplit: 1 }] });
  const hourHeaders = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}시`);

  sheet.mergeCells(1, 1, 1, 25);
  sheet.getCell(1, 1).value = `${corridor.roadName} ${corridor.requestLabel}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF1F2937" } };

  sheet.mergeCells(2, 1, 2, 25);
  sheet.getCell(2, 1).value = `${corridor.matchedLabel} · ${corridor.sections.length}개 측정 구간 · ${corridor.note}`;
  sheet.getCell(2, 1).alignment = { wrapText: true, vertical: "middle" };

  const header = sheet.addRow(["날짜", ...hourHeaders]);
  styleHeader(header);

  for (const day of corridor.days) {
    const row = sheet.addRow([day.date, ...day.hours.map(formatRiverCell)]);
    row.height = 42;
    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: colNumber === 1 ? "left" : "center", vertical: "middle", wrapText: true };
      cell.border = gridBorder();
      if (colNumber > 1) applyStatusFill(cell, day.hours[colNumber - 2].status);
    });
  }

  sheet.getColumn(1).width = 13;
  for (let column = 2; column <= 25; column += 1) sheet.getColumn(column).width = 14;
}

function addLatestRouteSheet(workbook: ExcelJS.Workbook, sheetName: string, rows: LatestRouteRow[]) {
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "순번", key: "order", width: 8 },
    { header: "관측시각", key: "observedAt", width: 24 },
    { header: "요청방향", key: "requestLabel", width: 18 },
    { header: "도로명", key: "roadName", width: 22 },
    { header: "ITS 측정 구간", key: "sectionName", width: 28 },
    { header: "링크ID", key: "linkId", width: 16 },
    { header: "상태", key: "congestionLabel", width: 10 },
    { header: "속도(km/h)", key: "speedKph", width: 12 }
  ];
  for (const row of rows) sheet.addRow(row);
  styleHeader(sheet.getRow(1));
  styleDataRows(sheet, 2, rows.length + 1, "G");
}

function addSinwolSummarySheet(workbook: ExcelJS.Workbook, rows: SinwolSummaryRow[]) {
  const sheet = workbook.addWorksheet("신월IC 정체요약", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "도로명", key: "roadName", width: 20 },
    { header: "측정 구간", key: "sectionName", width: 36 },
    { header: "관측시간수", key: "observedRows", width: 12 },
    { header: "정체시간수", key: "congestedRows", width: 12 },
    { header: "서행시간수", key: "slowRows", width: 12 },
    { header: "최저속도(km/h)", key: "minSpeedKph", width: 16 },
    { header: "평균속도(km/h)", key: "avgSpeedKph", width: 16 }
  ];
  for (const row of rows) sheet.addRow(row);
  styleHeader(sheet.getRow(1));
  styleDataRows(sheet, 2, rows.length + 1);
}

function addSinwolDetailSheet(workbook: ExcelJS.Workbook, rows: SinwolDetailRow[]) {
  const sheet = workbook.addWorksheet("신월IC 정체상세", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "날짜", key: "date", width: 14 },
    { header: "시간", key: "hour", width: 8 },
    { header: "도로명", key: "roadName", width: 20 },
    { header: "측정 구간", key: "sectionName", width: 36 },
    { header: "상태", key: "congestionLabel", width: 10 },
    { header: "속도(km/h)", key: "speedKph", width: 12 }
  ];
  for (const row of rows) {
    sheet.addRow({
      ...row,
      hour: `${String(row.hour).padStart(2, "0")}시`
    });
  }
  styleHeader(sheet.getRow(1));
  styleDataRows(sheet, 2, rows.length + 1, "E");
}

function formatRiverCell(cell: RiverCorridorHourCell): string {
  const speed = cell.avgSpeedKph == null ? "-" : `${cell.avgSpeedKph.toLocaleString("ko-KR")} km/h`;
  return `${cell.status}\n${speed}\n${cell.observedSectionCount}/${cell.expectedSectionCount}`;
}

function riverSheetName(corridor: RiverCorridorReportRow): string {
  if (corridor.id === "olympic-banghwa-to-jamsil") return "올림픽 방화-잠실";
  if (corridor.id === "olympic-jamsil-to-banghwa") return "올림픽 잠실-방화";
  if (corridor.id === "gangbyeonbuk-banghwa-to-cheonho") return "강변북로 방화-천호";
  return "강변북로 천호-방화";
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { horizontal: "center", vertical: "middle" };
  row.eachCell((cell) => {
    cell.border = gridBorder();
  });
}

function styleDataRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, statusColumn?: string) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = gridBorder();
    });
    if (statusColumn) {
      const statusCell = sheet.getCell(`${statusColumn}${rowNumber}`);
      applyStatusFill(statusCell, String(statusCell.value ?? ""));
    }
  }
}

function applyStatusFill(cell: ExcelJS.Cell, status: string) {
  const color =
    status === "정체"
      ? "FFFEE2E2"
      : status === "서행"
        ? "FFFFF7ED"
        : status === "원활"
          ? "FFECFDF5"
          : status === "정보없음"
            ? "FFEFF6FF"
            : "FFF3F4F6";
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function gridBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } }
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
