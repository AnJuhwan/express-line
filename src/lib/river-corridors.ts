import { parseDateRange } from "./traffic";
import type { CongestionLevel, TrafficObservationRow } from "./types";

export const RIVER_CORRIDOR_REPORT_START_DATE = "2026-05-06";
export const RIVER_CORRIDOR_REPORT_END_DATE = "2026-05-08";
export const RIVER_CORRIDOR_ACTUAL_MAX_DATE = "2026-05-08";
export const RIVER_CORRIDOR_SOURCE_NAME = "tdata-hourly-section";

export const RIVER_CORRIDORS = [
  {
    id: "olympic-banghwa-to-jamsil",
    roadName: "올림픽대로",
    requestLabel: "방화대교→잠실대교",
    matchedLabel: "방화대교남단(88JC)→잠실대교남단",
    note: "T-DATA 구간명 기준으로 방화대교남단(88JC)부터 잠실대교남단까지 매칭",
    sections: [
      "방화대교남단(88JC)→가양IC",
      "가양IC→가양대교남단",
      "가양대교남단→염창IC",
      "염창IC→월드컵대교남단",
      "월드컵대교남단→성산대교남단",
      "성산대교남단→양화대교남단",
      "양화대교남단→여의하류IC",
      "여의하류IC→여의상류IC",
      "여의상류IC→동작대교JC",
      "동작대교JC→동작대교남단",
      "동작대교남단→반포주공아파트(올림픽대로)",
      "반포주공아파트(올림픽대로)→반포대교남단",
      "반포대교남단→한남대교남단",
      "한남대교남단→동호대교남단",
      "동호대교남단→성수대교남단",
      "성수대교남단→영동대교남단",
      "영동대교남단→올림픽대로동부간선JC",
      "올림픽대로동부간선JC→청담IC",
      "청담IC→종합운동장JC",
      "종합운동장JC→잠실대교남단"
    ]
  },
  {
    id: "olympic-jamsil-to-banghwa",
    roadName: "올림픽대로",
    requestLabel: "잠실대교→방화대교",
    matchedLabel: "잠실대교남단→방화대교남단(88JC)",
    note: "T-DATA 구간명 기준으로 잠실대교남단부터 방화대교남단(88JC)까지 매칭",
    sections: [
      "잠실대교남단→종합운동장JC",
      "종합운동장JC→청담IC",
      "청담IC→올림픽대로동부간선JC",
      "올림픽대로동부간선JC→영동대교남단",
      "영동대교남단→성수대교남단",
      "성수대교남단→동호대교남단",
      "동호대교남단→한남대교남단",
      "한남대교남단→반포대교남단",
      "반포대교남단→반포주공아파트(올림픽대로)",
      "반포주공아파트(올림픽대로)→동작대교남단",
      "동작대교남단→동작대교JC",
      "동작대교JC→여의상류IC",
      "여의상류IC→여의하류IC",
      "여의하류IC→양화대교남단",
      "양화대교남단→성산대교남단",
      "성산대교남단→월드컵대교남단",
      "월드컵대교남단→염창IC",
      "염창IC→가양대교남단",
      "가양대교남단→가양IC",
      "가양IC→방화대교남단(88JC)"
    ]
  },
  {
    id: "gangbyeonbuk-banghwa-to-cheonho",
    roadName: "강변북로",
    requestLabel: "방화대교→천호대교",
    matchedLabel: "가양대교북단→천호대교북단",
    note: "방화대교북단 연결 구간은 T-DATA 시간대별 원천에 없어 실제 관측 가능한 가양대교북단부터 매칭",
    sections: [
      "가양대교북단→노을공원",
      "노을공원→월드컵대교북단",
      "월드컵대교북단→성산대교북단",
      "성산대교북단→내부순환로연결램프(강변북로)",
      "내부순환로연결램프(강변북로)→망원동진출입(강변북로)",
      "망원동진출입(강변북로)→양화대교북단",
      "양화대교북단→상수진출입(강변북로)",
      "상수진출입(강변북로)→서강대교북단",
      "서강대교북단→강변북로마포-서강",
      "강변북로마포-서강→마포대교북단",
      "마포대교북단→원효로진출입(강변북로)",
      "원효로진출입(강변북로)→이촌대림아파트(강변북로)",
      "이촌대림아파트(강변북로)→한강대교북단",
      "한강대교북단→한강시민공원이촌지구",
      "한강시민공원이촌지구→동작대교북단",
      "동작대교북단→반포대교북단",
      "반포대교북단→한남대교북단",
      "한남대교북단→동호대교북단",
      "동호대교북단→동부간선도로강변북로분기점",
      "동부간선도로강변북로분기점→성수대교북단",
      "성수대교북단→성수대교북단램프(강변북로)",
      "성수대교북단램프(강변북로)→뚝섬정수장앞",
      "뚝섬정수장앞→영동대교북단",
      "영동대교북단→청담대교북단",
      "청담대교북단→잠실대교북단",
      "잠실대교북단→잠실철교북단",
      "잠실철교북단→올림픽대교북단",
      "올림픽대교북단→천호대교북단"
    ]
  },
  {
    id: "gangbyeonbuk-cheonho-to-banghwa",
    roadName: "강변북로",
    requestLabel: "천호대교→방화대교",
    matchedLabel: "천호대교북단→가양대교북단",
    note: "방화대교북단 연결 구간은 T-DATA 시간대별 원천에 없어 실제 관측 가능한 가양대교북단까지 매칭",
    sections: [
      "천호대교북단→올림픽대교북단",
      "올림픽대교북단→잠실철교북단",
      "잠실철교북단→잠실대교북단",
      "잠실대교북단→청담대교북단",
      "청담대교북단→영동대교북단",
      "영동대교북단→뚝섬정수장앞",
      "뚝섬정수장앞→성수대교북단램프(강변북로)",
      "성수대교북단램프(강변북로)→동부간선강변북로분기점",
      "동부간선강변북로분기점→동부간선도로강변북로분기점",
      "동부간선도로강변북로분기점→동호대교북단",
      "동호대교북단→반포대교북단",
      "반포대교북단→동작대교북단",
      "동작대교북단→한강시민공원이촌지구",
      "한강시민공원이촌지구→한강대교북단",
      "한강대교북단→이촌대림아파트(강변북로)",
      "이촌대림아파트(강변북로)→원효대교북단",
      "원효대교북단→원효로진출입(강변북로)",
      "원효로진출입(강변북로)→마포대교북단",
      "마포대교북단→강변북로마포-서강",
      "강변북로마포-서강→서강대교북단",
      "서강대교북단→상수진출입(강변북로)",
      "상수진출입(강변북로)→양화대교북단",
      "양화대교북단→망원동진출입(강변북로)",
      "망원동진출입(강변북로)→내부순환로연결램프(강변북로)",
      "내부순환로연결램프(강변북로)→성산대교북단",
      "성산대교북단→월드컵대교북단",
      "월드컵대교북단→노을공원",
      "노을공원→가양대교북단"
    ]
  }
] as const;

export type RiverCorridorStatus = "원활" | "서행" | "정체" | "데이터없음" | "정보없음";

export interface RiverCorridorHourCell {
  hour: number;
  status: RiverCorridorStatus;
  avgSpeedKph: number | null;
  observedSectionCount: number;
  expectedSectionCount: number;
  smoothSections: string[];
  slowSections: string[];
  congestedSections: string[];
  unknownSections: string[];
  missingSections: string[];
}

export interface RiverCorridorDayRow {
  date: string;
  hours: RiverCorridorHourCell[];
}

export interface RiverCorridorReportRow {
  id: string;
  roadName: string;
  requestLabel: string;
  matchedLabel: string;
  note: string;
  sections: string[];
  observedRows: number;
  days: RiverCorridorDayRow[];
}

export interface RiverCorridorReport {
  startDate: string;
  endDate: string;
  actualMaxDate: string;
  sourceName: string;
  corridors: RiverCorridorReportRow[];
}

interface BuildOptions {
  startDate?: string;
  endDate?: string;
  actualMaxDate?: string;
}

export function buildRiverCorridorReport(rows: TrafficObservationRow[], options: BuildOptions = {}): RiverCorridorReport {
  const startDate = options.startDate ?? RIVER_CORRIDOR_REPORT_START_DATE;
  const endDate = options.endDate ?? RIVER_CORRIDOR_REPORT_END_DATE;
  const actualMaxDate = options.actualMaxDate ?? RIVER_CORRIDOR_ACTUAL_MAX_DATE;
  const dates = parseDateRange(startDate, endDate);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const rowBuckets = bucketRows(rows);

  return {
    startDate,
    endDate,
    actualMaxDate,
    sourceName: RIVER_CORRIDOR_SOURCE_NAME,
    corridors: RIVER_CORRIDORS.map((corridor) => {
      const sections: string[] = [...corridor.sections];
      return {
        id: corridor.id,
        roadName: corridor.roadName,
        requestLabel: corridor.requestLabel,
        matchedLabel: corridor.matchedLabel,
        note: corridor.note,
        sections,
        observedRows: rows.filter((row) => row.roadName === corridor.roadName && sections.includes(row.sectionName)).length,
        days: dates.map((date) => ({
          date,
          hours: hours.map((hour) => summarizeHour(corridor.roadName, sections, date, hour, rowBuckets))
        }))
      };
    })
  };
}

export function riverCorridorSectionPairs(): Array<{ roadName: string; sectionName: string }> {
  return RIVER_CORRIDORS.flatMap((corridor) =>
    corridor.sections.map((sectionName) => ({
      roadName: corridor.roadName,
      sectionName
    }))
  );
}

function bucketRows(rows: TrafficObservationRow[]): Map<string, TrafficObservationRow[]> {
  const buckets = new Map<string, TrafficObservationRow[]>();
  for (const row of rows) {
    if (row.granularity === "day") continue;
    if (!Number.isInteger(row.observedHour) || row.observedHour < 0 || row.observedHour > 23) continue;
    const key = bucketKey(row.roadName, row.sectionName, row.observedDate, row.observedHour);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  return buckets;
}

function summarizeHour(
  roadName: string,
  sections: string[],
  date: string,
  hour: number,
  rowBuckets: Map<string, TrafficObservationRow[]>
): RiverCorridorHourCell {
  const observed = sections.flatMap((sectionName) => {
    const rows = rowBuckets.get(bucketKey(roadName, sectionName, date, hour)) ?? [];
    if (!rows.length) return [];
    const speedKph = average(rows.map((row) => row.speedKph));
    const level = worstLevel(rows.map((row) => row.congestionLevel));
    return [{ sectionName, speedKph, level }];
  });
  const observedSections = new Set(observed.map((row) => row.sectionName));
  const missingSections = sections.filter((sectionName) => !observedSections.has(sectionName));

  return {
    hour,
    status: statusForLevels(observed.map((row) => row.level)),
    avgSpeedKph: average(observed.map((row) => row.speedKph)),
    observedSectionCount: observed.length,
    expectedSectionCount: sections.length,
    smoothSections: observed.filter((row) => row.level === "smooth").map((row) => row.sectionName),
    slowSections: observed.filter((row) => row.level === "slow").map((row) => row.sectionName),
    congestedSections: observed.filter((row) => row.level === "congested").map((row) => row.sectionName),
    unknownSections: observed.filter((row) => row.level === "unknown").map((row) => row.sectionName),
    missingSections
  };
}

function statusForLevels(levels: CongestionLevel[]): RiverCorridorStatus {
  if (!levels.length) return "데이터없음";
  if (levels.includes("congested")) return "정체";
  if (levels.includes("slow")) return "서행";
  if (levels.every((level) => level === "smooth")) return "원활";
  return "정보없음";
}

function worstLevel(levels: CongestionLevel[]): CongestionLevel {
  if (levels.includes("congested")) return "congested";
  if (levels.includes("slow")) return "slow";
  if (levels.includes("smooth")) return "smooth";
  return "unknown";
}

function average(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value != null);
  if (!numbers.length) return null;
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(1));
}

function bucketKey(roadName: string, sectionName: string, date: string, hour: number): string {
  return [roadName, sectionName, date, hour].join("\u0000");
}
