import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import type { CongestionLevel, TrafficObservationRow } from "../src/lib/types";

const outputDir = join(process.cwd(), "data", "exports");
const outputBaseName = `han-river-corridors-${RIVER_CORRIDOR_REPORT_START_DATE}_to_${RIVER_CORRIDOR_REPORT_END_DATE}`;
const outputPath = join(outputDir, `${outputBaseName}.xlsx`);
const summaryCsvPath = join(outputDir, `${outputBaseName}-summary.csv`);
const detailCsvPath = join(outputDir, `${outputBaseName}-detail.csv`);

async function main() {
  const repo = getTrafficRepository();
  const rows = repo.queryObservationsByRoadSections({
    startDate: RIVER_CORRIDOR_REPORT_START_DATE,
    endDate: RIVER_CORRIDOR_REPORT_END_DATE,
    sourceName: RIVER_CORRIDOR_SOURCE_NAME,
    sections: riverCorridorSectionPairs()
  });
  const report = buildRiverCorridorReport(rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "서울·인천 주요도로 혼잡 데이터 대시보드";
  workbook.created = new Date();
  workbook.modified = new Date();

  addSummarySheet(workbook, report.corridors);
  addSectionSheet(workbook, report.corridors);
  for (const corridor of report.corridors) addCorridorSheet(workbook, corridor);

  await mkdir(outputDir, { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  await writeFile(summaryCsvPath, buildSummaryCsv(report.corridors), "utf8");
  await writeFile(detailCsvPath, buildDetailCsv(report.corridors, rows), "utf8");
  console.log(outputPath);
  console.log(summaryCsvPath);
  console.log(detailCsvPath);
}

function addSummarySheet(workbook: ExcelJS.Workbook, corridors: RiverCorridorReportRow[]) {
  const sheet = workbook.addWorksheet("요약", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  sheet.columns = [
    { header: "도로명", key: "roadName", width: 16 },
    { header: "요청 구간", key: "requestLabel", width: 22 },
    { header: "매칭 구간", key: "matchedLabel", width: 34 },
    { header: "측정 구간수", key: "sectionCount", width: 12 },
    { header: "관측 행수", key: "observedRows", width: 12 },
    { header: "비고", key: "note", width: 60 }
  ];
  for (const corridor of corridors) {
    sheet.addRow({
      roadName: corridor.roadName,
      requestLabel: corridor.requestLabel,
      matchedLabel: corridor.matchedLabel,
      sectionCount: corridor.sections.length,
      observedRows: corridor.observedRows,
      note: corridor.note
    });
  }
  styleHeader(sheet.getRow(1));
  sheet.getColumn("note").alignment = { wrapText: true, vertical: "top" };
}

function addSectionSheet(workbook: ExcelJS.Workbook, corridors: RiverCorridorReportRow[]) {
  const sheet = workbook.addWorksheet("구간목록", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
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

function addCorridorSheet(workbook: ExcelJS.Workbook, corridor: RiverCorridorReportRow) {
  const sheet = workbook.addWorksheet(sheetName(corridor), {
    views: [{ state: "frozen", ySplit: 3, xSplit: 1 }]
  });
  const hourHeaders = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}시`);

  sheet.mergeCells(1, 1, 1, 25);
  sheet.getCell(1, 1).value = `${corridor.roadName} ${corridor.requestLabel}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF1F2937" } };
  sheet.getCell(1, 1).alignment = { vertical: "middle" };

  sheet.mergeCells(2, 1, 2, 25);
  sheet.getCell(2, 1).value = `${corridor.matchedLabel} · ${corridor.sections.length}개 측정 구간 · ${corridor.note}`;
  sheet.getCell(2, 1).alignment = { wrapText: true, vertical: "middle" };

  const header = sheet.addRow(["날짜", ...hourHeaders]);
  styleHeader(header);

  for (const day of corridor.days) {
    const row = sheet.addRow([day.date, ...day.hours.map(formatCell)]);
    row.height = 42;
    row.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: colNumber === 1 ? "left" : "center", vertical: "middle", wrapText: true };
      cell.border = gridBorder();
      if (colNumber > 1) applyStatusFill(cell, day.hours[colNumber - 2]);
    });
  }

  sheet.getColumn(1).width = 13;
  for (let column = 2; column <= 25; column += 1) sheet.getColumn(column).width = 14;
}

function formatCell(cell: RiverCorridorHourCell): string {
  const speed = cell.avgSpeedKph == null ? "-" : `${cell.avgSpeedKph.toLocaleString("ko-KR")} km/h`;
  return `${cell.status}\n${speed}\n${cell.observedSectionCount}/${cell.expectedSectionCount}`;
}

function buildSummaryCsv(corridors: RiverCorridorReportRow[]): string {
  const header = [
    "날짜",
    "시간",
    "도로명",
    "요청구간",
    "데이터매칭구간",
    "전체상태",
    "평균속도(km/h)",
    "관측구간수",
    "전체구간수",
    "원활구간",
    "서행구간",
    "정체구간",
    "정보없음구간",
    "데이터없음구간"
  ];
  const rows = corridors.flatMap((corridor) =>
    corridor.days.flatMap((day) =>
      day.hours.map((hour) => [
        day.date,
        String(hour.hour).padStart(2, "0"),
        corridor.roadName,
        corridor.requestLabel,
        corridor.matchedLabel,
        hour.status,
        formatCsvNumber(hour.avgSpeedKph),
        String(hour.observedSectionCount),
        String(hour.expectedSectionCount),
        hour.smoothSections.join(" | "),
        hour.slowSections.join(" | "),
        hour.congestedSections.join(" | "),
        hour.unknownSections.join(" | "),
        hour.missingSections.join(" | ")
      ])
    )
  );
  return toCsv([header, ...rows]);
}

function buildDetailCsv(corridors: RiverCorridorReportRow[], rows: TrafficObservationRow[]): string {
  const header = ["날짜", "시간", "도로명", "요청구간", "데이터매칭구간", "구간순서", "측정구간", "상태", "속도(km/h)", "원천"];
  const buckets = new Map<string, TrafficObservationRow[]>();
  for (const row of rows) {
    if (!Number.isInteger(row.observedHour)) continue;
    const key = detailBucketKey(row.roadName, row.sectionName, row.observedDate, row.observedHour);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  const outputRows: string[][] = [];
  for (const corridor of corridors) {
    for (const day of corridor.days) {
      for (const hour of day.hours) {
        corridor.sections.forEach((section, index) => {
          const observed = buckets.get(detailBucketKey(corridor.roadName, section, day.date, hour.hour)) ?? [];
          outputRows.push([
            day.date,
            String(hour.hour).padStart(2, "0"),
            corridor.roadName,
            corridor.requestLabel,
            corridor.matchedLabel,
            String(index + 1),
            section,
            detailStatus(observed.map((row) => row.congestionLevel)),
            formatCsvNumber(average(observed.map((row) => row.speedKph))),
            [...new Set(observed.map((row) => row.sourceName))].join(" | ")
          ]);
        });
      }
    }
  }
  return toCsv([header, ...outputRows]);
}

function detailStatus(levels: CongestionLevel[]): string {
  if (!levels.length) return "데이터없음";
  if (levels.includes("congested")) return "정체";
  if (levels.includes("slow")) return "서행";
  if (levels.every((level) => level === "smooth")) return "원활";
  return "정보없음";
}

function average(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value != null);
  if (!numbers.length) return null;
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(1));
}

function formatCsvNumber(value: number | null): string {
  return value == null ? "" : String(value);
}

function detailBucketKey(roadName: string, sectionName: string, date: string, hour: number): string {
  return [roadName, sectionName, date, hour].join("\u0000");
}

function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function sheetName(corridor: RiverCorridorReportRow): string {
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

function applyStatusFill(cell: ExcelJS.Cell, value: RiverCorridorHourCell) {
  const color =
    value.status === "정체"
      ? "FFFEE2E2"
      : value.status === "서행"
        ? "FFFFF7ED"
        : value.status === "원활"
          ? "FFECFDF5"
          : value.status === "정보없음"
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
