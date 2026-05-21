import { join } from "node:path";
import type { RequestedTrafficReport } from "@/components/requested-traffic-home";
import type { RequestedTrafficFiveMinuteRouteMeta } from "./requested-traffic-five-minute";
import defaultRequestedTrafficReport from "./requested-traffic-home-report.json";
import may20RequestedTrafficReport from "./requested-traffic-20260520-report.json";

export type RequestedTrafficDatasetId = "default" | "20260520";

export interface RequestedTrafficDataset {
  id: RequestedTrafficDatasetId;
  label: string;
  report: RequestedTrafficReport;
  dataDir: string;
  dataLabel: string;
  reportHref: string;
  fiveMinuteHref: string;
  hourlyHref: string;
  apiDatasetParam?: string;
}

export const REQUESTED_TRAFFIC_DATASETS: Record<RequestedTrafficDatasetId, RequestedTrafficDataset> = {
  default: {
    id: "default",
    label: "2026-05-13 ~ 2026-05-15",
    report: defaultRequestedTrafficReport as RequestedTrafficReport,
    dataDir: join(process.cwd(), "data", "csv-20260513-20260515"),
    dataLabel: "data/csv-20260513-20260515",
    reportHref: "/",
    fiveMinuteHref: "/five-minute",
    hourlyHref: "/hourly"
  },
  "20260520": {
    id: "20260520",
    label: "2026-05-20",
    report: may20RequestedTrafficReport as RequestedTrafficReport,
    dataDir: join(process.cwd(), "data", "csv-20260520"),
    dataLabel: "data/csv-20260520",
    reportHref: "/2026-05-20",
    fiveMinuteHref: "/2026-05-20/five-minute",
    hourlyHref: "/2026-05-20/hourly",
    apiDatasetParam: "20260520"
  }
};

export function getRequestedTrafficDataset(datasetId?: string | null): RequestedTrafficDataset {
  return datasetId === "20260520" ? REQUESTED_TRAFFIC_DATASETS["20260520"] : REQUESTED_TRAFFIC_DATASETS.default;
}

export function requestedTrafficRoutesForReport(report: Pick<RequestedTrafficReport, "routes">): RequestedTrafficFiveMinuteRouteMeta[] {
  return report.routes.map((route) => ({
    id: route.id,
    requestLabel: route.requestLabel,
    matchedLabel: route.matchedLabel,
    fiveMinuteRows: route.fiveMinuteRows
  }));
}
