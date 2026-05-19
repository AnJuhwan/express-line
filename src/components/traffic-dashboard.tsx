"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, Database, Download, FileSpreadsheet, Filter, RefreshCcw, Route, Search, TrafficCone } from "lucide-react";
import { defaultDateRange } from "@/lib/traffic";
import { DEFAULT_TRAFFIC_LIMIT, queryFromCoverage, trafficQueryToSearchParams } from "@/lib/dashboard";
import { TRAFFIC_SECTION_LABEL, coverageMessage, displayRoadName, sourceLabel } from "@/lib/display";
import { HOURS, buildCongestedDaysByHourSummary, buildHourlyRoadSummary } from "@/lib/hourly-summary";
import type { CongestedDaysByHourRow, HourlyRoadSummaryRow } from "@/lib/hourly-summary";
import { TRAFFIC_QUICK_VIEWS } from "@/lib/traffic-quick-views";
import type { TrafficQuickView } from "@/lib/traffic-quick-views";
import { VirtualTrafficTable } from "@/components/virtual-traffic-table";
import type { DataCoverageRow, RoadOption, TrafficObservationRow, TrafficQuery } from "@/lib/types";

const SpeedChart = dynamic(() => import("./speed-chart").then((module) => module.SpeedChart), {
  ssr: false,
  loading: () => (
    <div className="empty-state">
      <strong>차트를 준비하고 있습니다.</strong>
      <span>브라우저에서 컨테이너 크기를 계산한 뒤 표시됩니다.</span>
    </div>
  )
});

interface DashboardPayload {
  rows: TrafficObservationRow[];
  coverage: DataCoverageRow[];
  roadOptions: RoadOption[];
  query: TrafficQuery;
}

interface Props {
  initialRows?: TrafficObservationRow[];
  initialCoverage?: DataCoverageRow[];
  initialRoadOptions?: RoadOption[];
  initialQuery?: TrafficQuery;
  children?: ReactNode;
}

const emptyQuery: TrafficQuery = {
  ...defaultDateRange(),
  region: "all",
  roadName: "",
  granularity: "all",
  limit: DEFAULT_TRAFFIC_LIMIT
};

export function TrafficDashboard({
  initialRows = [],
  initialCoverage = [],
  initialRoadOptions = [],
  initialQuery = emptyQuery,
  children
}: Props) {
  const [payload, setPayload] = useState<DashboardPayload>({
    rows: initialRows,
    coverage: initialCoverage,
    roadOptions: initialRoadOptions,
    query: initialQuery
  });
  const [query, setQuery] = useState<TrafficQuery>(initialQuery);
  const [isPending, startTransition] = useTransition();

  const visibleRoadOptions = useMemo(
    () => payload.roadOptions.filter((road) => displayRoadName(road.roadName) !== "도로명 미제공"),
    [payload.roadOptions]
  );

  const chartData = useMemo(() => {
    const grouped = new Map<string, { label: string; total: number; count: number }>();
    for (const row of payload.rows) {
      const label = row.granularity === "day" ? row.observedDate : `${row.observedDate} ${String(row.observedHour).padStart(2, "0")}:00`;
      if (!grouped.has(label)) grouped.set(label, { label, total: 0, count: 0 });
      const current = grouped.get(label)!;
      if (row.speedKph != null) {
        current.total += row.speedKph;
        current.count += 1;
      }
    }
    return Array.from(grouped.values()).map((item) => ({
      label: item.label,
      speed: item.count > 0 ? Number((item.total / item.count).toFixed(1)) : null
    }));
  }, [payload.rows]);

  const summary = useMemo(() => {
    const speeds = payload.rows.map((row) => row.speedKph).filter((value): value is number => value != null);
    const congested = payload.rows.filter((row) => row.congestionLevel === "congested").length;
    return {
      count: payload.rows.length,
      avgSpeed: speeds.length ? (speeds.reduce((sum, value) => sum + value, 0) / speeds.length).toFixed(1) : "-",
      congested
    };
  }, [payload.rows]);

  const hourlyRoadSummary = useMemo(() => buildHourlyRoadSummary(payload.rows), [payload.rows]);
  const congestedDaysByHourSummary = useMemo(() => buildCongestedDaysByHourSummary(payload.rows), [payload.rows]);

  const fetchTraffic = useCallback(async (nextQuery?: TrafficQuery) => {
    const params = nextQuery ? `?${trafficQueryToSearchParams(nextQuery).toString()}` : "";
    const response = await fetch(`/api/traffic${params}`, { cache: "no-store" });
    const nextPayload = (await response.json()) as DashboardPayload;
    console.log("[traffic fetch]", {
      query: nextPayload.query,
      rows: nextPayload.rows.length,
      firstRow: nextPayload.rows[0] ?? null,
      coverage: nextPayload.coverage
    });
    setPayload(nextPayload);
    setQuery(nextPayload.query);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchTraffic();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchTraffic]);

  async function applyFilters(nextQuery = query) {
    startTransition(async () => {
      await fetchTraffic(nextQuery);
    });
  }

  function applyCoverageFilter(source: DataCoverageRow) {
    const nextQuery = queryFromCoverage(query, source);
    startTransition(async () => {
      await fetchTraffic(nextQuery);
    });
  }

  function applyQuickView(view: TrafficQuickView) {
    const nextQuery = {
      ...query,
      region: view.query.region,
      roadName: view.query.roadName,
      granularity: view.query.granularity
    };
    setQuery(nextQuery);
    startTransition(async () => {
      await fetchTraffic(nextQuery);
    });
  }

  const exportParams = trafficQueryToSearchParams(query);

  return (
    <main className="dashboard-shell">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Seoul · Incheon traffic intelligence</p>
          <h1>서울·인천 주요도로 혼잡 데이터</h1>
          <p className="hero-copy">날짜, 시간 단위, 도로명별 속도와 혼잡도를 한 화면에서 조회하고 CSV/XLSX로 내보냅니다.</p>
        </div>
        <div className="hero-actions">
          <Link className="icon-button" href="/data" title="전체 데이터 확인">
            <Database size={18} />
            전체 데이터
          </Link>
          <a className="icon-button" href={`/api/export?${exportParams.toString()}&format=csv`} title="CSV 다운로드">
            <Download size={18} />
            CSV
          </a>
          <a className="icon-button" href={`/api/export?${exportParams.toString()}&format=xlsx`} title="XLSX 다운로드">
            <FileSpreadsheet size={18} />
            XLSX
          </a>
        </div>
      </section>

      <section className="filter-panel" aria-label="필터">
        <label>
          <span><CalendarDays size={16} /> 시작일</span>
          <input type="date" value={query.startDate} onChange={(event) => setQuery({ ...query, startDate: event.target.value })} />
        </label>
        <label>
          <span><CalendarDays size={16} /> 종료일</span>
          <input type="date" value={query.endDate} onChange={(event) => setQuery({ ...query, endDate: event.target.value })} />
        </label>
        <label>
          <span><Filter size={16} /> 지역</span>
          <select value={query.region} onChange={(event) => setQuery({ ...query, region: event.target.value as TrafficQuery["region"] })}>
            <option value="all">전체</option>
            <option value="서울">서울</option>
            <option value="인천">인천</option>
          </select>
        </label>
        <label>
          <span><Search size={16} /> 도로·구간</span>
          <input
            list="road-options"
            value={query.roadName}
            placeholder="남부순환로, 신월IC, 경인로"
            onChange={(event) => setQuery({ ...query, roadName: event.target.value })}
          />
          <datalist id="road-options">
            {visibleRoadOptions.map((road) => (
              <option key={`${road.region}-${road.roadName}`} value={road.roadName}>
                {road.region}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          <span><TrafficCone size={16} /> 단위</span>
          <select
            value={query.granularity}
            onChange={(event) => setQuery({ ...query, granularity: event.target.value as TrafficQuery["granularity"] })}
          >
            <option value="all">전체</option>
            <option value="5min">5분</option>
            <option value="hour">시간</option>
            <option value="day">일</option>
            <option value="realtime">실시간</option>
          </select>
        </label>
        <button className="primary-button" onClick={() => applyFilters()} disabled={isPending}>
          <RefreshCcw size={18} />
          {isPending ? "조회 중" : "조회"}
        </button>
      </section>

      <section className="quick-view-strip" aria-label="관심 구간">
        {TRAFFIC_QUICK_VIEWS.map((view) => (
          <button key={view.label} type="button" className="quick-view-button" onClick={() => applyQuickView(view)} disabled={isPending}>
            <Route size={16} />
            <span>
              <strong>{view.label}</strong>
              <small>{view.description}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="summary-grid">
        <Metric label="조회 행" value={summary.count.toLocaleString("ko-KR")} />
        <Metric label="평균 속도" value={`${summary.avgSpeed} km/h`} />
        <Metric label="정체 행" value={summary.congested.toLocaleString("ko-KR")} />
      </section>

      {children}

      <section className="data-section">
        <div className="section-title">
          <h2>속도 추이</h2>
          <p>{query.startDate} ~ {query.endDate}</p>
        </div>
        <div className="chart-frame">
          {chartData.length ? (
            <SpeedChart data={chartData} />
          ) : (
            <EmptyState coverage={payload.coverage} />
          )}
        </div>
      </section>

      <section className="data-section">
        <div className="section-title">
          <h2>정체 일수 시간대</h2>
          <p>{congestedDaysByHourSummary.length.toLocaleString("ko-KR")}개 구간</p>
        </div>
        <CongestedDaysByHourTable rows={congestedDaysByHourSummary} coverage={payload.coverage} />
      </section>

      <section className="data-section">
        <div className="section-title">
          <h2>도로 시간대 통합</h2>
          <p>{hourlyRoadSummary.length.toLocaleString("ko-KR")}개 도로·일자</p>
        </div>
        <HourlyRoadSummaryTable rows={hourlyRoadSummary} coverage={payload.coverage} />
      </section>

      <section className="data-section">
        <div className="section-title">
          <h2>관측 데이터</h2>
          <p>조회 {summary.count.toLocaleString("ko-KR")}행 / 최대 {query.limit.toLocaleString("ko-KR")}행</p>
        </div>
        <VirtualTrafficTable rows={payload.rows} emptyState={<EmptyState coverage={payload.coverage} />} />
      </section>

      <section className="coverage-strip">
        {payload.coverage.length ? (
          payload.coverage.map((source) => (
            <button
              key={source.sourceName}
              type="button"
              className="coverage-card"
              onClick={() => applyCoverageFilter(source)}
              disabled={isPending || source.status !== "available" || !source.minDate || !source.maxDate}
              title={`${sourceLabel(source.sourceName)} 필터 적용`}
            >
              <strong>{sourceLabel(source.sourceName)}</strong>
              <span>{source.minDate ?? "-"} ~ {source.maxDate ?? "-"}</span>
              <small>{coverageMessage(source.message)}</small>
            </button>
          ))
        ) : (
          <div className="coverage-card">
            <strong>데이터 커버리지 없음</strong>
            <span>수집 CLI 또는 공개 파일 import를 실행하면 범위가 표시됩니다.</span>
            <small>API 키가 없으면 서울 공개 파일/샘플 데이터만 사용할 수 있습니다.</small>
          </div>
        )}
      </section>
    </main>
  );
}

function CongestedDaysByHourTable({ rows, coverage }: { rows: CongestedDaysByHourRow[]; coverage: DataCoverageRow[] }) {
  if (!rows.length) {
    return (
      <div className="hourly-table-wrap">
        <EmptyState coverage={coverage} />
      </div>
    );
  }

  return (
    <div className="hourly-table-wrap">
      <table className="hourly-matrix congested-days-matrix">
        <thead>
          <tr>
            <th>지역</th>
            <th>도로명</th>
            <th>{TRAFFIC_SECTION_LABEL}</th>
            <th>관측일</th>
            <th>최대정체</th>
            {HOURS.map((hour) => (
              <th key={hour}>{String(hour).padStart(2, "0")}시</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.region}</td>
              <td className="strong">{row.roadName}</td>
              <td title={row.sectionName}>{row.sectionName}</td>
              <td className="mono">{row.totalObservedDays.toLocaleString("ko-KR")}일</td>
              <td className="mono strong">{row.maxCongestedDays.toLocaleString("ko-KR")}일</td>
              {row.hours.map((cell, hour) => (
                <td key={hour} className={`congested-days-cell ${cell?.congestionLevel ?? "missing"}`}>
                  {cell ? (
                    <div
                      title={`${row.sectionName} ${String(hour).padStart(2, "0")}시 · 정체 ${cell.congestedDays.toLocaleString(
                        "ko-KR"
                      )}/${cell.observedDays.toLocaleString("ko-KR")}일 · 평균 ${formatSpeed(cell.avgSpeedKph)}`}
                    >
                      <strong>{cell.congestedDays.toLocaleString("ko-KR")}일</strong>
                      <span>{cell.observedDays.toLocaleString("ko-KR")}일 중</span>
                      <small>{formatPercent(cell.congestedRatio)}</small>
                    </div>
                  ) : (
                    <span className="hourly-empty">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HourlyRoadSummaryTable({ rows, coverage }: { rows: HourlyRoadSummaryRow[]; coverage: DataCoverageRow[] }) {
  if (!rows.length) {
    return (
      <div className="hourly-table-wrap">
        <EmptyState coverage={coverage} />
      </div>
    );
  }

  return (
    <div className="hourly-table-wrap">
      <table className="hourly-matrix">
        <thead>
          <tr>
            <th>날짜</th>
            <th>지역</th>
            <th>도로명</th>
            <th>도로구분</th>
            {HOURS.map((hour) => (
              <th key={hour}>{String(hour).padStart(2, "0")}시</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="mono">{row.observedDate}</td>
              <td>{row.region}</td>
              <td className="strong">{row.roadName}</td>
              <td>{row.roadDivName}</td>
              {row.hours.map((cell, hour) => (
                <td key={hour} className={`hourly-cell ${cell?.congestionLevel ?? "missing"}`}>
                  {cell ? (
                    <div title={`${row.roadName} ${String(hour).padStart(2, "0")}시 · ${formatSpeed(cell.speedKph)} · ${cell.congestionLabel}`}>
                      <strong>{formatSpeed(cell.speedKph)}</strong>
                      <span className={`pill ${cell.congestionLevel}`}>{cell.congestionLabel}</span>
                      <small>{cell.observationCount.toLocaleString("ko-KR")}건</small>
                    </div>
                  ) : (
                    <span className="hourly-empty">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSpeed(speedKph: number | null): string {
  return speedKph == null ? "-" : `${Number(speedKph.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(1)).toLocaleString("ko-KR")}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ coverage }: { coverage: DataCoverageRow[] }) {
  return (
    <div className="empty-state">
      <strong>선택한 조건의 데이터가 없습니다.</strong>
      <span>
        {coverage.length
          ? "수집된 기간 밖이거나 원천에서 과거 시간대별 이력을 제공하지 않는 구간입니다."
          : "아직 DB에 적재된 데이터가 없습니다. 샘플 seed 또는 수집 CLI를 실행하세요."}
      </span>
    </div>
  );
}
