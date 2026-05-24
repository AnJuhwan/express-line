/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Clock3, Timer, TrafficCone } from "lucide-react";
import {
  REQUESTED_TRAFFIC_MAP_VIEWPORTS,
  buildCenteredRouteViewport,
  buildOsmTiles,
  buildProjectedRoutePath,
  buildProjectedTrafficSegmentPaths,
  buildRouteDistanceSplitViewports
} from "@/lib/requested-traffic-map-geometry";
import type { RequestedTrafficRouteDistanceSplit } from "@/lib/requested-traffic-map-geometry";
import type {
  RequestedTrafficMapDirectionHour,
  RequestedTrafficMapGroup,
  RequestedTrafficMapHour,
  RequestedTrafficMapSegment,
  RequestedTrafficMapStatus
} from "@/lib/requested-traffic-maps";

interface RequestedTrafficMapsProps {
  groups: RequestedTrafficMapGroup[];
  reportHref: string;
  fiveMinuteHref: string;
  hourlyHref: string;
  periodLabel: string;
  dataLabel: string;
}

export function RequestedTrafficMaps({
  groups,
  reportHref,
  fiveMinuteHref,
  hourlyHref,
  periodLabel,
  dataLabel
}: RequestedTrafficMapsProps) {
  const hourSections = useMemo(() => buildHourSections(groups), [groups]);
  const hourCount = hourSections.length;
  const [activeHour, setActiveHour] = useState(() => hourSections[0]?.hour ?? 0);
  const activeHourSection = hourSections.find((hourSection) => hourSection.hour === activeHour) ?? hourSections[0];
  const directionCount = groups.reduce((sum, group) => sum + group.directions.length, 0);
  const mapCount = groups.reduce(
    (sum, group) =>
      sum +
      group.hours.reduce((hourSum, hour) => hourSum + hour.directions.length * ROUTE_DISTANCE_SPLIT_COUNT, 0),
    0
  );
  const congestedDirectionHours = groups.reduce(
    (sum, group) =>
      sum +
      group.hours.reduce(
        (hourSum, hour) => hourSum + hour.directions.filter((direction) => direction.status === "정체").length,
        0
      ),
    0
  );

  return (
    <main className="dashboard-shell requested-maps-page">
      <section className="hero-band requested-maps-hero">
        <div>
          <p className="eyebrow">Traffic congestion maps</p>
          <h1>2026년 5월 20일 시간대별 막히는 구간 지도</h1>
          <p className="hero-copy">
            {periodLabel}, 오전 6시부터 오후 6시까지 인천 한일시멘트 기준 요청 구간과 강변북로 구간을 대한민국 실제 지도 위에 양방향으로 정리했습니다.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="icon-button" href={reportHref} title="리포트로 돌아가기">
            <ArrowLeft size={18} />
            리포트
          </Link>
          <Link className="icon-button" href={fiveMinuteHref} title="5분 전체 데이터 화면">
            <Timer size={18} />
            5분
          </Link>
          <Link className="icon-button" href={hourlyHref} title="1시간 단위 데이터 화면">
            <Clock3 size={18} />
            1시간
          </Link>
        </div>
      </section>

      <section className="map-legend-strip" aria-label="혼잡 상태 범례">
        <span className="legend-chip smooth"><TrafficCone size={15} /> 원활</span>
        <span className="legend-chip slow"><TrafficCone size={15} /> 서행</span>
        <span className="legend-chip congested"><TrafficCone size={15} /> 정체</span>
        <span className="legend-chip unknown"><TrafficCone size={15} /> 정보없음</span>
      </section>

      <section className="summary-grid maps-summary">
        <Metric label="지도 묶음" value={`${groups.length.toLocaleString("ko-KR")}개`} />
        <Metric label="시간대" value={`${hourCount.toLocaleString("ko-KR")}개`} />
        <Metric label="양방향" value={`${directionCount.toLocaleString("ko-KR")}개`} />
        <Metric label="시간 지도" value={`${mapCount.toLocaleString("ko-KR")}장`} />
        <Metric label="정체 방향시간" value={`${congestedDirectionHours.toLocaleString("ko-KR")}건`} />
        <Metric label="데이터" value={dataLabel} />
      </section>

      <section className="map-hour-picker" aria-label="지도 시간대 선택">
        {hourSections.map((hourSection) => {
          const status = hourStatus(hourSection.groupHours.flatMap(({ hour }) => hour.directions));
          const blockedCount = hourSection.groupHours.reduce(
            (groupSum, { hour }) =>
              groupSum + hour.directions.reduce((directionSum, direction) => directionSum + direction.blockedSegmentCount, 0),
            0
          );

          return (
            <button
              className={`${hourSection.hour === activeHour ? "active " : ""}${statusClass(status)}`}
              key={hourSection.hour}
              onClick={() => setActiveHour(hourSection.hour)}
              type="button"
            >
              <span>{blockedCount.toLocaleString("ko-KR")}구간</span>
              <strong>{hourSection.label}</strong>
            </button>
          );
        })}
      </section>

      <section className="requested-map-stack" aria-label="시간대별 교통 지도">
        {activeHourSection ? (
          <section className="map-hour-section" key={activeHourSection.hour}>
            <div className="section-title map-hour-title">
              <div>
                <p>{periodLabel}</p>
                <h2>{activeHourSection.label} 전체 구간</h2>
              </div>
              <span>{activeHourSection.groupHours.length.toLocaleString("ko-KR")}개 묶음</span>
            </div>

            <div className="traffic-hour-group-grid">
              {activeHourSection.groupHours.map(({ group, hour }) => (
                <section className={`traffic-map-hour-card status-${statusClass(hourStatus(hour.directions))}`} key={`${group.id}-${hour.hour}`}>
                  <div className="traffic-map-hour-title">
                    <div>
                      <span>{group.actualLabel}</span>
                      <strong>{group.displayLabel}</strong>
                    </div>
                    <small>
                      막힘 {hour.directions.reduce((sum, direction) => sum + direction.blockedSegmentCount, 0).toLocaleString("ko-KR")}구간
                    </small>
                  </div>

                  <div className="traffic-direction-map-list">
                    {hour.directions.map((direction) => (
                      <article className={`traffic-direction-map status-${statusClass(direction.status)}`} key={`${group.id}-${hour.hour}-${direction.routeId}`}>
                        <div className="traffic-direction-heading">
                          <div>
                            <strong>{direction.requestLabel}</strong>
                            <span>{direction.matchedLabel}</span>
                          </div>
                          <span className={`pill ${statusClass(direction.status)}`}>{direction.status}</span>
                        </div>

                        <TrafficStatusOverview segments={direction.segments} />

                        <div className="traffic-map-board">
                          {buildDirectionSplitMaps(direction.routeId, group.id).map((splitMap) => (
                            <div className="traffic-map-display split" key={`${group.id}-${hour.hour}-${splitMap.key}`}>
                              <div className="traffic-map-caption">
                                <strong>{splitMap.caption} 지도</strong>
                                <span>빨강 정체 · 노랑 서행 · 초록 원활</span>
                              </div>
                              <KoreaTrafficMap direction={direction} splitMap={splitMap} />
                            </div>
                          ))}
                        </div>

                        <div className="map-detail-line">
                          <span>최저 {formatSpeed(direction.minSpeedKmh)}</span>
                          <span>{blockedPreview(direction) || "막힘 구간 없음"}</span>
                        </div>
                      </article>
                    ))}
                  </div>

                  <DirectionHourTable directions={hour.directions} />
                </section>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

const ROUTE_DISTANCE_SPLIT_COUNT = 1;

interface RequestedTrafficHourSection {
  hour: number;
  label: string;
  groupHours: Array<{
    group: RequestedTrafficMapGroup;
    hour: RequestedTrafficMapHour;
  }>;
}

function buildHourSections(groups: RequestedTrafficMapGroup[]): RequestedTrafficHourSection[] {
  const hours = [...new Set(groups.flatMap((group) => group.hours.map((hour) => hour.hour)))].sort((first, second) => first - second);

  return hours.map((hourValue) => {
    const groupHours = groups.flatMap((group) => {
      const hour = group.hours.find((item) => item.hour === hourValue);
      return hour ? [{ group, hour }] : [];
    });

    return {
      hour: hourValue,
      label: groupHours[0]?.hour.label ?? `${String(hourValue).padStart(2, "0")}:00`,
      groupHours
    };
  });
}

function buildDirectionSplitMaps(routeId: string, groupId: string): RequestedTrafficRouteDistanceSplit[] {
  const fallbackViewport = REQUESTED_TRAFFIC_MAP_VIEWPORTS[groupId];
  if (!fallbackViewport) return [];

  return buildRouteDistanceSplitViewports(
    routeId,
    buildCenteredRouteViewport(routeId, fallbackViewport),
    ROUTE_DISTANCE_SPLIT_COUNT
  );
}

function KoreaTrafficMap({
  direction,
  splitMap
}: {
  direction: RequestedTrafficMapDirectionHour;
  splitMap: RequestedTrafficRouteDistanceSplit;
}) {
  const viewport = splitMap.viewport;
  const tiles = buildOsmTiles(viewport);
  const basePath = buildProjectedRoutePath(direction.routeId, viewport, splitMap);
  const routeStart = basePath[0];
  const routeEnd = basePath.at(-1);
  const paths = buildProjectedTrafficSegmentPaths(direction.routeId, direction.segments, viewport, splitMap);
  const orderedPaths = [...paths].sort(
    (first, second) => statusLayer(first.segment.status) - statusLayer(second.segment.status)
  );

  return (
    <div className="korea-traffic-map" aria-label={`${direction.label} ${direction.requestLabel} ${splitMap.caption} 실제 지도`}>
      <div className="osm-tile-layer" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            alt=""
            className="osm-tile"
            key={tile.key}
            loading="lazy"
            src={tile.url}
            style={{
              height: percentStyle(tile.heightPercent),
              left: percentStyle(tile.leftPercent),
              top: percentStyle(tile.topPercent),
              width: percentStyle(tile.widthPercent)
            }}
          />
        ))}
      </div>

      <svg className="traffic-route-overlay" role="img" viewBox="0 0 100 100" preserveAspectRatio="none">
        <title>{`${direction.label} ${direction.requestLabel} 막히는 구간`}</title>
        <polyline className="traffic-route-shadow" points={pointsAttribute(basePath)} />
        <polyline className="traffic-route-casing" points={pointsAttribute(basePath)} />
        {orderedPaths.map((path) => (
          <polyline
            className={`traffic-route-line ${statusClass(path.segment.status)}`}
            key={`${direction.routeId}-${direction.hour}-${splitMap.key}-${path.segment.linkId}`}
            points={pointsAttribute(path.points)}
          >
            <title>{segmentTitle(path.segment)}</title>
          </polyline>
        ))}
      </svg>

      <div className="traffic-map-label-layer" aria-hidden="true">
        {routeStart ? (
          <span
            className="traffic-route-terminal start"
            style={{
              left: percentStyle(routeStart.xPercent),
              top: percentStyle(routeStart.yPercent)
            }}
          >
            {splitMap.startTerminalLabel}
          </span>
        ) : null}
        {routeEnd ? (
          <span
            className="traffic-route-terminal end"
            style={{
              left: percentStyle(routeEnd.xPercent),
              top: percentStyle(routeEnd.yPercent)
            }}
          >
            {splitMap.endTerminalLabel}
          </span>
        ) : null}
      </div>

      <div className="traffic-map-inline-legend" aria-label="지도 범례">
        <span><i className="congested" /> 정체</span>
        <span><i className="slow" /> 서행</span>
        <span><i className="smooth" /> 원활</span>
      </div>

      <span className="map-attribution">© OpenStreetMap</span>
    </div>
  );
}

function TrafficStatusOverview({ segments }: { segments: RequestedTrafficMapSegment[] }) {
  const counts = statusCounts(segments);

  return (
    <div className="traffic-status-overview" aria-label="구간별 교통 상태 요약">
      <StatusTile count={counts.congested} label="정체" status="정체" />
      <StatusTile count={counts.slow} label="서행" status="서행" />
      <StatusTile count={counts.smooth} label="원활" status="원활" />
    </div>
  );
}

function StatusTile({
  count,
  label,
  status
}: {
  count: number;
  label: string;
  status: RequestedTrafficMapStatus;
}) {
  return (
    <div className={`traffic-status-tile ${statusClass(status)} ${count > 0 ? "active" : "empty"}`}>
      <strong>{label}</strong>
      <span>{count.toLocaleString("ko-KR")}구간</span>
    </div>
  );
}

function DirectionHourTable({ directions }: { directions: RequestedTrafficMapDirectionHour[] }) {
  return (
    <div className="traffic-map-table-wrap">
      <table className="traffic-map-table">
        <thead>
          <tr>
            <th>시간</th>
            <th>방향</th>
            <th>최저속도</th>
            <th>서행구간</th>
            <th>정체구간</th>
            <th>막히는 구간</th>
          </tr>
        </thead>
        <tbody>
          {directions.map((direction) => (
            <tr key={`${direction.routeId}-${direction.hour}`}>
              <td className="mono">{direction.label}</td>
              <td className="strong" title={direction.matchedLabel}>{direction.requestLabel}</td>
              <td className="mono">{formatSpeed(direction.minSpeedKmh)}</td>
              <td className="mono">{direction.slowSegmentCount.toLocaleString("ko-KR")}</td>
              <td className="mono">{direction.congestedSegmentCount.toLocaleString("ko-KR")}</td>
              <td>{blockedSectionsLabel(direction)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function hourStatus(directions: RequestedTrafficMapDirectionHour[]): RequestedTrafficMapStatus {
  if (directions.some((direction) => direction.status === "정체")) return "정체";
  if (directions.some((direction) => direction.status === "서행")) return "서행";
  if (directions.some((direction) => direction.status === "원활")) return "원활";
  return "정보없음";
}

function blockedSectionsLabel(direction: RequestedTrafficMapDirectionHour): string {
  const sections = direction.blockedSections.slice(0, 5).map((section) => `${section.sectionName}(${section.status})`);
  const remainingCount = direction.blockedSections.length - sections.length;
  return `${sections.join(" · ") || "-"}${remainingCount > 0 ? ` 외 ${remainingCount.toLocaleString("ko-KR")}개` : ""}`;
}

function blockedPreview(direction: RequestedTrafficMapDirectionHour): string {
  return direction.blockedSections.slice(0, 3).map((section) => section.sectionName).join(" · ");
}

function segmentTitle(segment: RequestedTrafficMapSegment): string {
  return [
    segment.sectionName,
    segment.status,
    `최저 ${formatSpeedValue(segment.minSpeedKmh)}`,
    `서행 ${segment.slowObservationCount.toLocaleString("ko-KR")}`,
    `정체 ${segment.congestedObservationCount.toLocaleString("ko-KR")}`
  ].join(" · ");
}

function statusCounts(segments: RequestedTrafficMapSegment[]): { smooth: number; slow: number; congested: number } {
  return segments.reduce(
    (current, segment) => ({
      smooth: current.smooth + (segment.status === "원활" ? 1 : 0),
      slow: current.slow + (segment.status === "서행" ? 1 : 0),
      congested: current.congested + (segment.status === "정체" ? 1 : 0)
    }),
    { smooth: 0, slow: 0, congested: 0 }
  );
}

function cleanMapLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/^-$/, "");
}

function formatSpeed(speedKmh: number | null): string {
  return speedKmh == null ? "-" : `${Number(speedKmh.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function formatSpeedValue(speedKmh: number | null): string {
  return speedKmh == null ? "-" : Number(speedKmh.toFixed(1)).toLocaleString("ko-KR");
}

function pointsAttribute(points: Array<{ xPercent: number; yPercent: number }>): string {
  return points.map((point) => `${roundMapPoint(point.xPercent)},${roundMapPoint(point.yPercent)}`).join(" ");
}

function percentStyle(value: number): string {
  return `${roundMapPoint(value)}%`;
}

function roundMapPoint(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function statusClass(status: RequestedTrafficMapStatus): string {
  if (status === "정체") return "congested";
  if (status === "서행") return "slow";
  if (status === "원활") return "smooth";
  return "unknown";
}

function statusLayer(status: RequestedTrafficMapStatus): number {
  if (status === "정보없음") return 0;
  if (status === "원활") return 1;
  if (status === "서행") return 2;
  return 3;
}
