import { buildIncheonSpeedUrl, extractPublicDataItems, normalizeIncheonSpeedItems } from "../src/lib/collectors";
import { loadEnvFiles } from "../src/lib/env";
import { getTrafficRepository } from "../src/lib/repository";
import { parseDateRange } from "../src/lib/traffic";

loadEnvFiles();

const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY;
if (!serviceKey) {
  console.error("PUBLIC_DATA_SERVICE_KEY is required for Incheon public data collection.");
  process.exit(1);
}
const publicDataServiceKey = serviceKey;

const startDate = getArg("--start") ?? "2026-05-01";
const endDate = getArg("--end") ?? startDate;
const roadName = getArg("--road") ?? undefined;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const observations = [];

  for (const date of parseDateRange(startDate, endDate)) {
    let pageNo = 1;
    while (true) {
      const url = buildIncheonSpeedUrl({ serviceKey: publicDataServiceKey, date, roadName, pageNo, numOfRows: 100 });
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Incheon request failed: ${response.status}`);
      const payload = await response.json();
      const items = extractPublicDataItems(payload);
      observations.push(...normalizeIncheonSpeedItems(items, date));
      if (items.length < 100) break;
      pageNo += 1;
    }
  }

  getTrafficRepository().upsertObservations(observations);
  console.log(`Collected ${observations.length} Incheon daily speed observations.`);
}

function getArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
