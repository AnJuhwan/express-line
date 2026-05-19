import { readFileSync } from "node:fs";
import { basename } from "node:path";
import ExcelJS from "exceljs";
import { normalizeSeoulUrbanSpeedRows } from "../src/lib/collectors";
import { decodeCsvBuffer, parseCsv } from "../src/lib/csv";
import { getTrafficRepository } from "../src/lib/repository";

const file = getArg("--file");
if (!file) {
  console.error("Usage: npm run traffic:import:seoul-file -- --file ./path/to/seoul-speed.csv");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const rows = await readRows(file!);
  const observations = normalizeSeoulUrbanSpeedRows(rows);
  getTrafficRepository().upsertObservations(observations);
  console.log(`Imported ${observations.length} observations from ${basename(file!)}.`);
}

function getArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function readRows(filePath: string): Promise<Record<string, unknown>[]> {
  if (filePath.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = (row.values as unknown[]).slice(1);
      rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
    });
    return rows;
  }

  const text = decodeCsvBuffer(readFileSync(filePath));
  return parseCsv(text);
}
