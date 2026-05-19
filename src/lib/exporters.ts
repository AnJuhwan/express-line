import ExcelJS from "exceljs";
import { TRAFFIC_SECTION_LABEL, displayRoadDivName, displayRoadName, displaySectionName, sourceLabel } from "./display";
import type { TrafficObservationRow } from "./types";

const HEADERS = [
  "날짜",
  "시간",
  "지역",
  "도로명",
  "도로구분",
  TRAFFIC_SECTION_LABEL,
  "속도(km/h)",
  "교통량",
  "혼잡상태",
  "원천",
  "단위"
] as const;

export function observationsToCsv(rows: TrafficObservationRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.observedDate,
        String(row.observedHour).padStart(2, "0"),
        row.region,
        displayRoadName(row.roadName),
        displayRoadDivName(row),
        displaySectionName(row),
        row.speedKph ?? "",
        row.trafficVolume ?? "",
        row.congestionLabel,
        sourceLabel(row.sourceName),
        row.granularity
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

export async function observationsToWorkbookBuffer(rows: TrafficObservationRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex Traffic Dashboard";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("traffic");
  sheet.addRow([...HEADERS]);
  for (const row of rows) {
    sheet.addRow([
      row.observedDate,
      String(row.observedHour).padStart(2, "0"),
      row.region,
      displayRoadName(row.roadName),
      displayRoadDivName(row),
      displaySectionName(row),
      row.speedKph ?? "",
      row.trafficVolume ?? "",
      row.congestionLabel,
      sourceLabel(row.sourceName),
      row.granularity
    ]);
  }
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}
