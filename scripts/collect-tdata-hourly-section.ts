import { buildTDataHourlySectionUrl, extractTDataItems, normalizeTDataHourlySectionItems } from "../src/lib/collectors";
import { loadEnvFiles } from "../src/lib/env";
import { getTrafficRepository } from "../src/lib/repository";
import { parseDateRange } from "../src/lib/traffic";

loadEnvFiles();

const apiKey = process.env.TDATA_API_KEY;
if (!apiKey) {
  console.error("TDATA_API_KEY is required for T-DATA hourly section collection.");
  process.exit(1);
}
const tdataApiKey = apiKey;

const startDate = getArg("--start") ?? "2026-01-01";
const endDate = getArg("--end") ?? startDate;
const roadName = getArg("--road") ?? undefined;
const roadDivName = getArg("--road-div") ?? process.env.TDATA_ROAD_DIV_NAME ?? undefined;
const pageSize = Number(getArg("--page-size") ?? 1000);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const observations = [];

  for (const date of parseDateRange(startDate, endDate)) {
    let startRow = 1;
    let dateCount = 0;

    while (true) {
      const url = buildTDataHourlySectionUrl({ apiKey: tdataApiKey, date, startRow, rowCnt: pageSize });
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`T-DATA request failed for ${date}: ${response.status}`);
      const items = extractTDataItems(await response.json());
      const rows = normalizeTDataHourlySectionItems(items).filter(
        (row) => (!roadName || row.roadName.includes(roadName)) && (!roadDivName || row.roadDivName?.includes(roadDivName))
      );

      observations.push(...rows);
      dateCount += rows.length;
      console.log(`[T-DATA ${date}] raw=${items.length} matched=${rows.length} startRow=${startRow}`);

      if (items.length < pageSize) break;
      startRow += pageSize;
    }

    if (dateCount === 0) console.log(`[T-DATA ${date}] no matching observations`);
  }

  getTrafficRepository().upsertObservations(observations);
  console.log(`Collected ${observations.length} T-DATA hourly section observations.`);
}

function getArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
