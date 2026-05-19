import { mkdir } from "node:fs/promises";
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

const outputDir = join(process.cwd(), "data", "exports");
const outputPath = join(
  outputDir,
  `han-river-corridors-${RIVER_CORRIDOR_REPORT_START_DATE}_to_${RIVER_CORRIDOR_REPORT_END_DATE}.xlsx`
);

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
  console.log(outputPath);
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

function sheetName(corridor: RiverCorridorReportRow): string {
  if (corridor.roadName === "올림픽대로") return "올림픽 방화-잠실";
  return "강변북로 방화-천호";
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
