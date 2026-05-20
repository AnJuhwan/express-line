export const REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE = 500;
export const REQUESTED_TRAFFIC_DAY_START_HOUR = 6;
export const REQUESTED_TRAFFIC_DAY_END_HOUR = 18;

export interface RequestedTrafficTimeWindow {
  startHour: number;
  endHour: number;
}

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
  timeWindow: RequestedTrafficTimeWindow;
}

export interface RequestedTrafficHourlyRow {
  routeId: string;
  requestLabel: string;
  matchedLabel: string;
  date: string;
  hour: number;
  label: string;
  avgSpeedKmh: number | null;
  minSpeedKmh: number | null;
  status: string;
  blocked: boolean;
  sampleCount: number;
  observedLinkCount: number;
  smoothObservationCount: number;
  slowObservationCount: number;
  congestedObservationCount: number;
  slowLinkCount: number;
  congestedLinkCount: number;
}

export interface RequestedTrafficHourlyPage {
  routeId: string;
  rows: RequestedTrafficHourlyRow[];
  totalCount: number;
  dataAvailable: boolean;
  timeWindow: RequestedTrafficTimeWindow;
}
