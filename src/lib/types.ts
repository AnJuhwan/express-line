export type RegionFilter = "all" | "서울" | "인천";

export type RoadKind = "urban_expressway" | "general_road" | "expressway";

export type SourceGranularity = "5min" | "hour" | "day" | "realtime";

export type CongestionLevel = "smooth" | "slow" | "congested" | "unknown";

export type CongestionMethod = "topis-threshold" | "threshold-derived" | "source-provided";

export interface CongestionResult {
  level: CongestionLevel;
  label: "원활" | "서행" | "정체" | "정보없음";
  method: CongestionMethod;
}

export interface NormalizedTrafficObservation {
  region: "서울" | "인천";
  roadName: string;
  sectionName: string;
  linkId: string;
  roadKind: RoadKind;
  roadDivName?: string;
  observedAt: string;
  observedDate: string;
  observedHour: number;
  granularity: SourceGranularity;
  sourceName: string;
  speedKph: number | null;
  travelTimeSeconds: number | null;
  trafficVolume: number | null;
  occupancy: number | null;
  congestionLevel: CongestionLevel;
  congestionLabel: string;
  congestionMethod: CongestionMethod;
}

export interface TrafficObservationRow extends NormalizedTrafficObservation {
  id: number;
  roadId: number;
}

export interface TrafficQuery {
  startDate: string;
  endDate: string;
  region: RegionFilter;
  roadName: string;
  granularity: "all" | SourceGranularity;
  limit: number;
}

export interface DataCoverageRow {
  sourceName: string;
  minDate: string | null;
  maxDate: string | null;
  status: "available" | "missing_key" | "unavailable" | "empty";
  message: string;
}

export interface RoadOption {
  region: "서울" | "인천";
  roadName: string;
}
