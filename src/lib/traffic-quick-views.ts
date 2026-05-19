import type { TrafficQuery } from "./types";

export interface TrafficQuickView {
  label: string;
  description: string;
  query: Pick<TrafficQuery, "region" | "roadName" | "granularity">;
}

export const TRAFFIC_QUICK_VIEWS: TrafficQuickView[] = [
  {
    label: "올림픽 방화→잠실",
    description: "올림픽대로 동행",
    query: { region: "서울", roadName: "올림픽대로", granularity: "realtime" }
  },
  {
    label: "올림픽 잠실→방화",
    description: "올림픽대로 서행",
    query: { region: "서울", roadName: "올림픽대로", granularity: "realtime" }
  },
  {
    label: "강변북로 방화→천호",
    description: "강변북로 동행",
    query: { region: "서울", roadName: "강변북로", granularity: "realtime" }
  },
  {
    label: "강변북로 천호→방화",
    description: "강변북로 서행",
    query: { region: "서울", roadName: "강변북로", granularity: "realtime" }
  },
  {
    label: "계양IC→장수IC",
    description: "수도권제1순환",
    query: { region: "인천", roadName: "수도권제1순환고속도로", granularity: "realtime" }
  },
  {
    label: "장수IC→계양IC",
    description: "수도권제1순환",
    query: { region: "인천", roadName: "수도권제1순환고속도로", granularity: "realtime" }
  },
  {
    label: "신월IC 정체",
    description: "남부순환로 인접",
    query: { region: "서울", roadName: "신월IC", granularity: "all" }
  }
];
