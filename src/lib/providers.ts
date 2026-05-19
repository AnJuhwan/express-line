import type { NormalizedTrafficObservation } from "./types";

export interface TrafficProvider {
  name: string;
  collect(input: { startDate: string; endDate: string; roadName?: string }): Promise<NormalizedTrafficObservation[]>;
}

export function getExternalProvider(): TrafficProvider | null {
  const provider = process.env.EXTERNAL_TRAFFIC_PROVIDER?.trim();
  if (!provider) return null;

  return {
    name: provider,
    async collect() {
      throw new Error(`${provider} 연동은 v1에서 어댑터 자리만 준비되어 있습니다.`);
    }
  };
}
