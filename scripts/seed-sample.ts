import { getTrafficRepository } from "../src/lib/repository";
import type { NormalizedTrafficObservation, RoadKind } from "../src/lib/types";
import { classifyCongestion, kstTimestamp } from "../src/lib/traffic";

const repo = getTrafficRepository();

const rows: NormalizedTrafficObservation[] = [];
const roads: Array<{ region: "서울" | "인천"; roadName: string; sectionName: string; linkId: string; roadKind: RoadKind; sourceName: string }> = [
  {
    region: "서울",
    roadName: "강변북로",
    sectionName: "가양대교북단-성산대교북단",
    linkId: "GBN-001",
    roadKind: "urban_expressway",
    sourceName: "sample"
  },
  {
    region: "서울",
    roadName: "올림픽대로",
    sectionName: "한남대교-반포대교",
    linkId: "OLY-001",
    roadKind: "urban_expressway",
    sourceName: "sample"
  },
  {
    region: "인천",
    roadName: "경인로",
    sectionName: "일별 평균",
    linkId: "INC-001",
    roadKind: "general_road",
    sourceName: "sample"
  }
];

for (let day = 1; day <= 19; day += 1) {
  const date = `2026-05-${String(day).padStart(2, "0")}`;
  for (const road of roads) {
    const hours = road.region === "인천" ? [0] : [7, 8, 9, 18, 19, 20];
    for (const hour of hours) {
      const commutePenalty = hour === 8 || hour === 18 ? 18 : hour === 9 || hour === 19 ? 11 : 0;
      const base = road.roadKind === "urban_expressway" ? 58 : 32;
      const cityPenalty = road.roadName === "올림픽대로" ? 6 : 0;
      const speed = Number(Math.max(8, base - commutePenalty - cityPenalty + ((day + hour) % 5)).toFixed(1));
      const congestion = classifyCongestion(speed, road.roadKind, road.region === "인천" ? "derived" : "topis");
      rows.push({
        ...road,
        observedAt: kstTimestamp(date, hour),
        observedDate: date,
        observedHour: hour,
        granularity: road.region === "인천" ? "day" : "hour",
        speedKph: speed,
        travelTimeSeconds: null,
        trafficVolume: road.region === "인천" ? 1200 + day * 18 : 80 + day * 3 + hour,
        occupancy: null,
        congestionLevel: congestion.level,
        congestionLabel: congestion.label,
        congestionMethod: congestion.method
      });
    }
  }
}

repo.upsertObservations(rows);
console.log(`Seeded ${rows.length} sample observations.`);
