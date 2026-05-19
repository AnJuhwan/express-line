import type { RoadKind, TrafficObservationRow } from "./types";

export const TRAFFIC_SECTION_LABEL = "측정 구간(시작→끝)";

const ROAD_KIND_LABELS: Record<RoadKind, string> = {
  urban_expressway: "도시고속도로",
  general_road: "일반도로",
  expressway: "고속도로"
};

const SOURCE_LABELS: Record<string, string> = {
  "its-realtime": "ITS 국가교통정보센터 실시간",
  "seoul-urban-file": "서울 열린데이터광장 도시고속도로",
  "incheon-speed-api": "인천 공공데이터포털 통행속도",
  "seoul-topis-realtime": "서울 TOPIS 실시간",
  "tdata-hourly-section": "서울교통빅데이터 T-DATA 1시간 구간별",
  sample: "샘플 데이터"
};

export function sourceLabel(sourceName: string): string {
  return SOURCE_LABELS[sourceName] ?? sourceName;
}

export function coverageMessage(message: string): string {
  const loadedMatch = message.match(/^(\d+) observations loaded$/);
  if (loadedMatch) return `${Number(loadedMatch[1]).toLocaleString("ko-KR")}건 적재됨`;
  return message;
}

export function displayRoadName(roadName: string): string {
  const trimmed = roadName.trim();
  return !trimmed || trimmed === "-" ? "도로명 미제공" : trimmed;
}

export function displayRoadDivName(row: Pick<TrafficObservationRow, "roadDivName" | "roadKind">): string {
  const explicit = row.roadDivName?.trim();
  return explicit || ROAD_KIND_LABELS[row.roadKind] || row.roadKind;
}

export function displaySectionName(row: TrafficObservationRow): string {
  if (row.sourceName === "its-realtime" && looksLikeNodePair(row.sectionName)) {
    return `위치명 미제공 · ITS 구간 ID ${row.linkId}`;
  }
  return row.sectionName.trim() || `링크 ${row.linkId}`;
}

function looksLikeNodePair(value: string): boolean {
  return /^\d+→\d+$/.test(value.trim());
}
