import { buildItsTrafficInfoUrl, extractItsTrafficInfoXmlItems, extractPublicDataItems, normalizeItsTrafficInfoItems } from "../src/lib/collectors";
import { loadEnvFiles } from "../src/lib/env";
import { getTrafficRepository } from "../src/lib/repository";

loadEnvFiles();

const apiKey = process.env.ITS_API_KEY;
if (!apiKey) {
  console.error("ITS_API_KEY is required for ITS realtime collection.");
  process.exit(1);
}
const itsApiKey = apiKey;

const boxes = [
  {
    region: "서울" as const,
    minX: 126.76,
    maxX: 127.2,
    minY: 37.42,
    maxY: 37.7
  },
  {
    region: "인천" as const,
    minX: 126.35,
    maxX: 126.85,
    minY: 37.3,
    maxY: 37.65
  }
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const observations = [];

  for (const box of boxes) {
    const url = buildItsTrafficInfoUrl({ apiKey: itsApiKey, ...box });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ITS request failed for ${box.region}: ${response.status}`);
    const text = await response.text();
    const items = text.trim().startsWith("<") ? extractItsTrafficInfoXmlItems(text) : extractPublicDataItems(JSON.parse(text));
    console.log(`[ITS ${box.region}] raw items=${items.length}`, items[0] ?? null);
    observations.push(...normalizeItsTrafficInfoItems(items, box.region));
  }

  getTrafficRepository().upsertObservations(observations);
  console.log(`Collected ${observations.length} ITS realtime observations.`);
}
