"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, CalendarDays, Database, Filter, RefreshCcw, Search, TrafficCone } from "lucide-react";
import { queryFromAllDataSearchParams, trafficQueryToSearchParams } from "@/lib/dashboard";
import { coverageMessage, displayRoadName, sourceLabel } from "@/lib/display";
import type { DataCoverageRow, RoadOption, TrafficObservationRow, TrafficQuery } from "@/lib/types";
import { VirtualTrafficTable } from "@/components/virtual-traffic-table";
import type { VirtualWindow } from "@/lib/virtual-table";

interface AllDataPayload {
  rows: TrafficObservationRow[];
  coverage: DataCoverageRow[];
  roadOptions: RoadOption[];
  query: TrafficQuery;
  offset: number;
  windowSize: number;
  totalCount: number;
}

interface AllDataState {
  coverage: DataCoverageRow[];
  roadOptions: RoadOption[];
  query: TrafficQuery;
  totalCount: number;
}

interface Props {
  initialRows?: TrafficObservationRow[];
  initialCoverage?: DataCoverageRow[];
  initialRoadOptions?: RoadOption[];
  initialQuery?: TrafficQuery;
  initialTotalCount?: number;
  initialOffset?: number;
  initialWindowSize?: number;
}

const PAGE_SIZE = 500;
const emptyQuery = queryFromAllDataSearchParams(new URLSearchParams());

export function TrafficDataExplorer({
  initialRows = [],
  initialCoverage = [],
  initialRoadOptions = [],
  initialQuery = emptyQuery,
  initialTotalCount = initialRows.length,
  initialOffset = 0,
  initialWindowSize = PAGE_SIZE
}: Props) {
  const initialPageIndex = Math.floor(initialOffset / PAGE_SIZE);
  const initialQueryKey = trafficQueryToSearchParams(initialQuery).toString();
  const requestedPagesRef = useRef(new Set(initialRows.length ? [initialPageIndex] : []));
  const activeQueryKeyRef = useRef(initialQueryKey);
  const [payload, setPayload] = useState<AllDataState>({
    coverage: initialCoverage,
    roadOptions: initialRoadOptions,
    query: initialQuery,
    totalCount: initialTotalCount
  });
  const [pages, setPages] = useState<Record<number, TrafficObservationRow[]>>(() => ({
    ...(initialRows.length ? { [initialPageIndex]: initialRows } : {})
  }));
  const [visibleWindow, setVisibleWindow] = useState<VirtualWindow>({
    startIndex: 0,
    endIndex: Math.min(initialWindowSize, initialTotalCount),
    totalHeight: 0
  });
  const [query, setQuery] = useState<TrafficQuery>(initialQuery);
  const [appliedQueryKey, setAppliedQueryKey] = useState(initialQueryKey);
  const [isPending, startTransition] = useTransition();

  const visibleRoadOptions = useMemo(
    () => payload.roadOptions.filter((road) => displayRoadName(road.roadName) !== "도로명 미제공"),
    [payload.roadOptions]
  );

  const summary = useMemo(() => {
    const loadedRows = Object.values(pages).reduce((sum, rows) => sum + rows.length, 0);
    return {
      totalCount: payload.totalCount,
      loadedRows,
      sources: payload.coverage.length,
      pageSize: PAGE_SIZE
    };
  }, [pages, payload.coverage.length, payload.totalCount]);

  const fetchAllData = useCallback(async (nextQuery: TrafficQuery, offset: number) => {
    const params = trafficQueryToSearchParams(nextQuery);
    params.set("offset", String(offset));
    params.set("windowSize", String(PAGE_SIZE));
    const response = await fetch(`/api/traffic/all?${params.toString()}`, { cache: "no-store" });
    return (await response.json()) as AllDataPayload;
  }, []);

  function applyFilters(nextQuery = query) {
    startTransition(async () => {
      const nextPayload = await fetchAllData(nextQuery, 0);
      const nextQueryKey = trafficQueryToSearchParams(nextPayload.query).toString();
      activeQueryKeyRef.current = nextQueryKey;
      setAppliedQueryKey(nextQueryKey);
      requestedPagesRef.current = new Set(nextPayload.rows.length ? [0] : []);
      setPayload({
        coverage: nextPayload.coverage,
        roadOptions: nextPayload.roadOptions,
        query: nextPayload.query,
        totalCount: nextPayload.totalCount
      });
      setPages(nextPayload.rows.length ? { 0: nextPayload.rows } : {});
      setVisibleWindow({
        startIndex: 0,
        endIndex: Math.min(PAGE_SIZE, nextPayload.totalCount),
        totalHeight: 0
      });
      setQuery(nextPayload.query);
    });
  }

  const fetchPage = useCallback(
    async (pageIndex: number, pageQuery: TrafficQuery, queryKey: string) => {
      if (requestedPagesRef.current.has(pageIndex)) return;
      requestedPagesRef.current.add(pageIndex);
      const nextPayload = await fetchAllData(pageQuery, pageIndex * PAGE_SIZE);
      if (activeQueryKeyRef.current !== queryKey) return;

      setPages((current) => ({
        ...current,
        [pageIndex]: nextPayload.rows
      }));
      setPayload((current) => ({
        ...current,
        coverage: nextPayload.coverage,
        roadOptions: nextPayload.roadOptions,
        totalCount: nextPayload.totalCount
      }));
    },
    [fetchAllData]
  );

  useEffect(() => {
    if (!payload.totalCount || visibleWindow.endIndex <= visibleWindow.startIndex) return;
    const queryKey = trafficQueryToSearchParams(payload.query).toString();
    const startPage = Math.floor(visibleWindow.startIndex / PAGE_SIZE);
    const endPage = Math.floor((visibleWindow.endIndex - 1) / PAGE_SIZE);
    for (let pageIndex = startPage; pageIndex <= endPage; pageIndex += 1) {
      void fetchPage(pageIndex, payload.query, queryKey);
    }
  }, [fetchPage, payload.query, payload.totalCount, visibleWindow.endIndex, visibleWindow.startIndex]);

  const getRow = useCallback(
    (index: number) => {
      const pageIndex = Math.floor(index / PAGE_SIZE);
      return pages[pageIndex]?.[index - pageIndex * PAGE_SIZE];
    },
    [pages]
  );

  return (
    <main className="dashboard-shell">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Stored traffic records</p>
          <h1>전체 적재 데이터</h1>
          <p className="hero-copy">DB에 쌓인 관측 행을 날짜 범위로 확인하고, 큰 데이터셋은 가상 스크롤 테이블로 탐색합니다.</p>
        </div>
        <div className="hero-actions">
          <Link className="icon-button" href="/" title="대시보드로 돌아가기">
            <ArrowLeft size={18} />
            대시보드
          </Link>
        </div>
      </section>

      <section className="filter-panel" aria-label="전체 데이터 필터">
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
            list="all-road-options"
            value={query.roadName}
            placeholder="남부순환로, 신월IC, 경인로"
            onChange={(event) => setQuery({ ...query, roadName: event.target.value })}
          />
          <datalist id="all-road-options">
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

      <section className="summary-grid all-data-summary">
        <Metric label="전체 행" value={summary.totalCount.toLocaleString("ko-KR")} />
        <Metric label="불러온 행" value={summary.loadedRows.toLocaleString("ko-KR")} />
        <Metric label="원천 수" value={summary.sources.toLocaleString("ko-KR")} />
        <Metric label="조회 기간" value={`${query.startDate} ~ ${query.endDate}`} />
        <Metric label="페이지 크기" value={`${summary.pageSize.toLocaleString("ko-KR")}행`} />
        <Metric label="렌더링" value="서버 페이징" />
      </section>

      <section className="data-section">
        <div className="section-title">
          <div>
            <h2>전체 관측 테이블</h2>
            <p>{query.startDate} ~ {query.endDate}</p>
          </div>
          <span className="table-badge">
            <Database size={16} />
            {summary.totalCount.toLocaleString("ko-KR")}행
          </span>
        </div>
        <VirtualTrafficTable
          rowCount={payload.totalCount}
          getRow={getRow}
          onWindowChange={setVisibleWindow}
          resetKey={appliedQueryKey}
        />
      </section>

      <section className="coverage-strip">
        {payload.coverage.length ? (
          payload.coverage.map((source) => (
            <div key={source.sourceName} className="coverage-card">
              <strong>{sourceLabel(source.sourceName)}</strong>
              <span>{source.minDate ?? "-"} ~ {source.maxDate ?? "-"}</span>
              <small>{coverageMessage(source.message)}</small>
            </div>
          ))
        ) : (
          <div className="coverage-card">
            <strong>데이터 커버리지 없음</strong>
            <span>수집 CLI 또는 공개 파일 import를 실행하면 범위가 표시됩니다.</span>
            <small>API 키가 없으면 샘플 seed로 먼저 확인할 수 있습니다.</small>
          </div>
        )}
      </section>
    </main>
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
