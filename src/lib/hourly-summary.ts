import { displayRoadDivName, displayRoadName, displaySectionName } from "./display";
import { classifyCongestion } from "./traffic";
import type { CongestionLevel, RoadKind, TrafficObservationRow } from "./types";

export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export interface HourlyRoadSummaryCell {
  hour: number;
  speedKph: number | null;
  congestionLevel: CongestionLevel;
  congestionLabel: string;
  observationCount: number;
}

export interface HourlyRoadSummaryRow {
  id: string;
  observedDate: string;
  region: string;
  roadName: string;
  roadDivName: string;
  hours: Array<HourlyRoadSummaryCell | null>;
}

export interface CongestedDaysByHourCell {
  hour: number;
  observedDays: number;
  congestedDays: number;
  congestedRatio: number;
  avgSpeedKph: number | null;
  minSpeedKph: number | null;
  observationCount: number;
  congestionLevel: CongestionLevel;
}

export interface CongestedDaysByHourRow {
  id: string;
  region: string;
  roadName: string;
  roadDivName: string;
  sectionName: string;
  totalObservedDays: number;
  maxCongestedDays: number;
  hours: Array<CongestedDaysByHourCell | null>;
}

interface HourAccumulator {
  hour: number;
  speedTotal: number;
  speedCount: number;
  observationCount: number;
}

interface RowAccumulator {
  observedDate: string;
  region: string;
  roadName: string;
  roadDivName: string;
  roadKind: RoadKind;
  hours: Array<HourAccumulator | null>;
}

interface DateHourSectionAccumulator {
  observedDate: string;
  hour: number;
  region: string;
  roadName: string;
  roadDivName: string;
  sectionName: string;
  roadKind: RoadKind;
  speedTotal: number;
  speedCount: number;
  observationCount: number;
}

interface CongestedHourAccumulator {
  hour: number;
  observedDates: Set<string>;
  congestedDates: Set<string>;
  speedTotal: number;
  speedCount: number;
  minSpeedKph: number | null;
  observationCount: number;
}

interface CongestedRowAccumulator {
  region: string;
  roadName: string;
  roadDivName: string;
  sectionName: string;
  observedDates: Set<string>;
  hours: Array<CongestedHourAccumulator | null>;
}

export function buildHourlyRoadSummary(rows: TrafficObservationRow[]): HourlyRoadSummaryRow[] {
  const grouped = new Map<string, RowAccumulator>();

  for (const row of rows) {
    if (row.granularity === "day") continue;
    if (!Number.isInteger(row.observedHour) || row.observedHour < 0 || row.observedHour > 23) continue;

    const roadName = displayRoadName(row.roadName);
    if (roadName === "도로명 미제공") continue;
    const roadDivName = displayRoadDivName(row);

    const key = [row.observedDate, row.region, roadName, roadDivName].join("\u0000");
    let current = grouped.get(key);
    if (!current) {
      current = {
        observedDate: row.observedDate,
        region: row.region,
        roadName,
        roadDivName,
        roadKind: row.roadKind,
        hours: Array.from({ length: 24 }, () => null)
      };
      grouped.set(key, current);
    }

    let hour = current.hours[row.observedHour];
    if (!hour) {
      hour = {
        hour: row.observedHour,
        speedTotal: 0,
        speedCount: 0,
        observationCount: 0
      };
      current.hours[row.observedHour] = hour;
    }

    hour.observationCount += 1;
    if (row.speedKph != null) {
      hour.speedTotal += row.speedKph;
      hour.speedCount += 1;
    }
  }

  return Array.from(grouped.values())
    .map((row) => ({
      id: [row.observedDate, row.region, row.roadName, row.roadDivName].join("-"),
      observedDate: row.observedDate,
      region: row.region,
      roadName: row.roadName,
      roadDivName: row.roadDivName,
      hours: row.hours.map((hour) => {
        if (!hour) return null;
        const speedKph = hour.speedCount > 0 ? Number((hour.speedTotal / hour.speedCount).toFixed(1)) : null;
        const congestion = classifyCongestion(speedKph, row.roadKind, "derived");
        return {
          hour: hour.hour,
          speedKph,
          congestionLevel: congestion.level,
          congestionLabel: congestion.label,
          observationCount: hour.observationCount
        };
      })
    }))
    .sort((a, b) => {
      const byDate = a.observedDate.localeCompare(b.observedDate);
      if (byDate !== 0) return byDate;
      const byRegion = a.region.localeCompare(b.region);
      if (byRegion !== 0) return byRegion;
      return a.roadName.localeCompare(b.roadName);
    });
}

export function buildCongestedDaysByHourSummary(rows: TrafficObservationRow[]): CongestedDaysByHourRow[] {
  const hourlyBuckets = new Map<string, DateHourSectionAccumulator>();

  for (const row of rows) {
    if (row.granularity === "day") continue;
    if (!Number.isInteger(row.observedHour) || row.observedHour < 0 || row.observedHour > 23) continue;

    const roadName = displayRoadName(row.roadName);
    if (roadName === "도로명 미제공") continue;

    const roadDivName = displayRoadDivName(row);
    const sectionName = displaySectionName(row);
    const key = [row.observedDate, row.observedHour, row.region, roadName, roadDivName, sectionName].join("\u0000");
    let current = hourlyBuckets.get(key);
    if (!current) {
      current = {
        observedDate: row.observedDate,
        hour: row.observedHour,
        region: row.region,
        roadName,
        roadDivName,
        sectionName,
        roadKind: row.roadKind,
        speedTotal: 0,
        speedCount: 0,
        observationCount: 0
      };
      hourlyBuckets.set(key, current);
    }

    current.observationCount += 1;
    if (row.speedKph != null) {
      current.speedTotal += row.speedKph;
      current.speedCount += 1;
    }
  }

  const grouped = new Map<string, CongestedRowAccumulator>();
  for (const bucket of hourlyBuckets.values()) {
    const key = [bucket.region, bucket.roadName, bucket.roadDivName, bucket.sectionName].join("\u0000");
    let current = grouped.get(key);
    if (!current) {
      current = {
        region: bucket.region,
        roadName: bucket.roadName,
        roadDivName: bucket.roadDivName,
        sectionName: bucket.sectionName,
        observedDates: new Set<string>(),
        hours: Array.from({ length: 24 }, () => null)
      };
      grouped.set(key, current);
    }

    current.observedDates.add(bucket.observedDate);

    let hour = current.hours[bucket.hour];
    if (!hour) {
      hour = {
        hour: bucket.hour,
        observedDates: new Set<string>(),
        congestedDates: new Set<string>(),
        speedTotal: 0,
        speedCount: 0,
        minSpeedKph: null,
        observationCount: 0
      };
      current.hours[bucket.hour] = hour;
    }

    const speedKph = bucket.speedCount > 0 ? bucket.speedTotal / bucket.speedCount : null;
    const congestion = classifyCongestion(speedKph, bucket.roadKind, "derived");
    hour.observedDates.add(bucket.observedDate);
    if (congestion.level === "congested") {
      hour.congestedDates.add(bucket.observedDate);
    }
    if (speedKph != null) {
      hour.speedTotal += speedKph;
      hour.speedCount += 1;
      hour.minSpeedKph = hour.minSpeedKph == null ? speedKph : Math.min(hour.minSpeedKph, speedKph);
    }
    hour.observationCount += bucket.observationCount;
  }

  return Array.from(grouped.values())
    .map((row) => {
      const hours = row.hours.map((hour) => {
        if (!hour) return null;
        const observedDays = hour.observedDates.size;
        const congestedDays = hour.congestedDates.size;
        const congestionLevel: CongestionLevel = congestedDays > 0 ? "congested" : "smooth";
        return {
          hour: hour.hour,
          observedDays,
          congestedDays,
          congestedRatio: observedDays > 0 ? Number(((congestedDays / observedDays) * 100).toFixed(1)) : 0,
          avgSpeedKph: hour.speedCount > 0 ? Number((hour.speedTotal / hour.speedCount).toFixed(1)) : null,
          minSpeedKph: hour.minSpeedKph == null ? null : Number(hour.minSpeedKph.toFixed(1)),
          observationCount: hour.observationCount,
          congestionLevel
        };
      });
      const maxCongestedDays = Math.max(0, ...hours.map((hour) => hour?.congestedDays ?? 0));
      return {
        id: [row.region, row.roadName, row.roadDivName, row.sectionName].join("-"),
        region: row.region,
        roadName: row.roadName,
        roadDivName: row.roadDivName,
        sectionName: row.sectionName,
        totalObservedDays: row.observedDates.size,
        maxCongestedDays,
        hours
      };
    })
    .filter((row) => row.maxCongestedDays > 0)
    .sort((a, b) => {
      const byCongestedDays = b.maxCongestedDays - a.maxCongestedDays;
      if (byCongestedDays !== 0) return byCongestedDays;
      const byRoad = a.roadName.localeCompare(b.roadName);
      if (byRoad !== 0) return byRoad;
      return a.sectionName.localeCompare(b.sectionName);
    });
}
