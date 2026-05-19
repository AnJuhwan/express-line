export const REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE = 500;

export interface RequestedTrafficFiveMinuteRouteMeta {
  id: string;
  requestLabel: string;
  matchedLabel: string;
  fiveMinuteRows?: number;
}

export interface RequestedTrafficFiveMinuteRow {
  routeId: string;
  requestLabel: string;
  matchedLabel: string;
  date: string;
  time: string;
  timestamp: string;
  linkId: string;
  roadName: string;
  roadRank: string;
  roadArea: string;
  fromName: string;
  toName: string;
  sectionName: string;
  speedKmh: number | null;
  travelTimeSeconds: number | null;
  congestionLabel: string;
  blocked: boolean;
}

export interface RequestedTrafficFiveMinutePage {
  routeId: string;
  rows: RequestedTrafficFiveMinuteRow[];
  offset: number;
  windowSize: number;
  totalCount: number;
  dataAvailable: boolean;
}
