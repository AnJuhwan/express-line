"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Clock3, Database, Download, RefreshCcw, Route } from "lucide-react";
import type {
  RequestedTrafficFiveMinutePage,
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficFiveMinuteRow
} from "@/lib/requested-traffic-five-minute-shared";
import { REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE } from "@/lib/requested-traffic-five-minute-shared";
import { getVirtualWindow, type VirtualWindow } from "@/lib/virtual-table";

interface FiveMinutePayload extends RequestedTrafficFiveMinutePage {
  routes: RequestedTrafficFiveMinuteRouteMeta[];
}

interface Props {
  routes: RequestedTrafficFiveMinuteRouteMeta[];
  initialRows: RequestedTrafficFiveMinuteRow[];
  initialRouteId: string;
  initialOffset: number;
  initialWindowSize: number;
  initialTotalCount: number;
  initialDataAvailable: boolean;
  initialStartHour: number;
  initialEndHour: number;
}

const VIRTUAL_ROW_HEIGHT = 56;
const VIRTUAL_VIEWPORT_HEIGHT = 680;
const VIRTUAL_OVERSCAN = 14;

export function RequestedFiveMinuteExplorer({
  routes,
  initialRows,
  initialRouteId,
  initialOffset,
  initialWindowSize,
  initialTotalCount,
  initialDataAvailable,
  initialStartHour,
  initialEndHour
}: Props) {
  const initialPageIndex = Math.floor(initialOffset / REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE);
  const requestedPagesRef = useRef(new Set(initialRows.length ? [initialPageIndex] : []));
  const activeRouteIdRef = useRef(initialRouteId);
  const [routeId, setRouteId] = useState(initialRouteId);
  const [appliedRouteId, setAppliedRouteId] = useState(initialRouteId);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [dataAvailable, setDataAvailable] = useState(initialDataAvailable);
  const [pages, setPages] = useState<Record<number, RequestedTrafficFiveMinuteRow[]>>(() => ({
    ...(initialRows.length ? { [initialPageIndex]: initialRows } : {})
  }));
  const [timeWindow, setTimeWindow] = useState({ startHour: initialStartHour, endHour: initialEndHour });
  const [visibleWindow, setVisibleWindow] = useState<VirtualWindow>({
    startIndex: 0,
    endIndex: Math.min(initialWindowSize, initialTotalCount),
    totalHeight: 0
  });
  const [isPending, startTransition] = useTransition();

  const loadedRows = useMemo(() => Object.values(pages).reduce((sum, rows) => sum + rows.length, 0), [pages]);
  const selectedRouteLabel = useMemo(() => {
    if (appliedRouteId === "all") return "전체 요청 구간";
    return routes.find((route) => route.id === appliedRouteId)?.requestLabel ?? "선택 구간";
  }, [appliedRouteId, routes]);
  const timeWindowLabel = `${padHour(timeWindow.startHour)}:00~${padHour(timeWindow.endHour)}:55`;
  const csvHref = `/api/requested-traffic/five-minute?route=${encodeURIComponent(appliedRouteId)}&startHour=${timeWindow.startHour}&endHour=${timeWindow.endHour}&format=csv`;

  const fetchFiveMinutePage = useCallback(async (nextRouteId: string, offset: number) => {
    const params = new URLSearchParams({
      route: nextRouteId,
      offset: String(offset),
      windowSize: String(REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE),
      startHour: String(timeWindow.startHour),
      endHour: String(timeWindow.endHour)
    });
    const response = await fetch(`/api/requested-traffic/five-minute?${params.toString()}`, { cache: "no-store" });
    return (await response.json()) as FiveMinutePayload;
  }, [timeWindow.endHour, timeWindow.startHour]);

  function applyRoute(nextRouteId = routeId) {
    startTransition(async () => {
      const nextPayload = await fetchFiveMinutePage(nextRouteId, 0);
      activeRouteIdRef.current = nextPayload.routeId;
      setTimeWindow(nextPayload.timeWindow);
      requestedPagesRef.current = new Set(nextPayload.rows.length ? [0] : []);
      setAppliedRouteId(nextPayload.routeId);
      setRouteId(nextPayload.routeId);
      setTotalCount(nextPayload.totalCount);
      setDataAvailable(nextPayload.dataAvailable);
      setPages(nextPayload.rows.length ? { 0: nextPayload.rows } : {});
      setVisibleWindow({
        startIndex: 0,
        endIndex: Math.min(REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE, nextPayload.totalCount),
        totalHeight: 0
      });
    });
  }

  const fetchPage = useCallback(
    async (pageIndex: number, pageRouteId: string) => {
      if (requestedPagesRef.current.has(pageIndex)) return;
      requestedPagesRef.current.add(pageIndex);
      const nextPayload = await fetchFiveMinutePage(pageRouteId, pageIndex * REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE);
      if (activeRouteIdRef.current !== pageRouteId) return;

      setPages((current) => ({
        ...current,
        [pageIndex]: nextPayload.rows
      }));
      setTotalCount(nextPayload.totalCount);
      setDataAvailable(nextPayload.dataAvailable);
    },
    [fetchFiveMinutePage]
  );

  useEffect(() => {
    if (!totalCount || visibleWindow.endIndex <= visibleWindow.startIndex) return;
    const startPage = Math.floor(visibleWindow.startIndex / REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE);
    const endPage = Math.floor((visibleWindow.endIndex - 1) / REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE);
    for (let pageIndex = startPage; pageIndex <= endPage; pageIndex += 1) {
      void fetchPage(pageIndex, appliedRouteId);
    }
  }, [appliedRouteId, fetchPage, totalCount, visibleWindow.endIndex, visibleWindow.startIndex]);

  const getRow = useCallback(
    (index: number) => {
      const pageIndex = Math.floor(index / REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE);
      return pages[pageIndex]?.[index - pageIndex * REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE];
    },
    [pages]
  );

  return (
    <main className="dashboard-shell requested-five-minute-page">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Five-minute traffic records</p>
          <h1>5분 단위 전체 데이터</h1>
          <p className="hero-copy">
            기존 리포트 구조는 유지하고, ITS 5분 원천 행 전체를 서버 페이징과 가상스크롤로 탐색합니다.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="icon-button" href="/" title="리포트로 돌아가기">
            <ArrowLeft size={18} />
            리포트
          </Link>
          <a className="icon-button" href={csvHref} title="현재 선택 범위 CSV 다운로드">
            <Download size={18} />
            CSV
          </a>
          <Link className="icon-button" href="/hourly" title="1시간 단위 데이터 화면">
            <Clock3 size={18} />
            1시간
          </Link>
        </div>
      </section>

      <section className="filter-panel five-minute-filter-panel" aria-label="5분 데이터 필터">
        <label>
          <span>
            <Route size={16} /> 요청 구간
          </span>
          <select value={routeId} onChange={(event) => setRouteId(event.target.value)}>
            <option value="all">전체 요청 구간</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.requestLabel}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" onClick={() => applyRoute()} disabled={isPending}>
          <RefreshCcw size={18} />
          {isPending ? "조회 중" : "조회"}
        </button>
      </section>

      <section className="summary-grid all-data-summary">
        <Metric label="선택 범위" value={selectedRouteLabel} />
        <Metric label="시간 범위" value={timeWindowLabel} />
        <Metric label="06~18시 5분 행" value={totalCount.toLocaleString("ko-KR")} />
        <Metric label="불러온 행" value={loadedRows.toLocaleString("ko-KR")} />
        <Metric label="요청 구간" value={`${routes.length.toLocaleString("ko-KR")}개`} />
        <Metric label="페이지 크기" value={`${REQUESTED_TRAFFIC_FIVE_MINUTE_PAGE_SIZE.toLocaleString("ko-KR")}행`} />
        <Metric label="렌더링" value="가상스크롤" />
      </section>

      <section className="data-section">
        <div className="section-title">
          <div>
            <h2>5분 원천 테이블</h2>
            <p>{selectedRouteLabel}</p>
          </div>
          <span className="table-badge">
            <Database size={16} />
            {totalCount.toLocaleString("ko-KR")}행
          </span>
        </div>
        <RequestedFiveMinuteVirtualTable
          rowCount={totalCount}
          getRow={getRow}
          onWindowChange={setVisibleWindow}
          resetKey={appliedRouteId}
          dataAvailable={dataAvailable}
        />
      </section>
    </main>
  );
}

function RequestedFiveMinuteVirtualTable({
  rowCount,
  getRow,
  onWindowChange,
  resetKey,
  dataAvailable
}: {
  rowCount: number;
  getRow: (index: number) => RequestedTrafficFiveMinuteRow | undefined;
  onWindowChange: (window: VirtualWindow) => void;
  resetKey: string;
  dataAvailable: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setScrollTop(0);
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resetKey]);

  const virtualRows = useMemo(() => {
    const window = getVirtualWindow({
      rowCount,
      scrollTop,
      rowHeight: VIRTUAL_ROW_HEIGHT,
      viewportHeight: VIRTUAL_VIEWPORT_HEIGHT,
      overscan: VIRTUAL_OVERSCAN
    });

    return {
      ...window,
      rowIndexes: Array.from({ length: window.endIndex - window.startIndex }, (_, offset) => window.startIndex + offset)
    };
  }, [rowCount, scrollTop]);

  useEffect(() => {
    onWindowChange({
      startIndex: virtualRows.startIndex,
      endIndex: virtualRows.endIndex,
      totalHeight: virtualRows.totalHeight
    });
  }, [onWindowChange, virtualRows.endIndex, virtualRows.startIndex, virtualRows.totalHeight]);

  if (!rowCount) {
    return (
      <div className="table-wrap">
        <div className="empty-state">
          <strong>표시할 5분 데이터가 없습니다.</strong>
          <span>{dataAvailable ? "선택한 구간에 행이 없습니다." : "로컬 data/csv JSON 묶음을 찾지 못했습니다."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap five-minute-table-wrap">
      <div className="virtual-table five-minute-virtual-table" role="table" aria-rowcount={rowCount + 1}>
        <div className="virtual-table-header" role="row">
          <div role="columnheader">요청구간</div>
          <div role="columnheader">날짜</div>
          <div role="columnheader">시간</div>
          <div role="columnheader">링크ID</div>
          <div role="columnheader">도로명</div>
          <div role="columnheader">구간명</div>
          <div role="columnheader">권역</div>
          <div role="columnheader">등급</div>
          <div role="columnheader">속도</div>
          <div role="columnheader">통행시간</div>
          <div role="columnheader">혼잡</div>
        </div>
        <div
          ref={viewportRef}
          className="virtual-table-body"
          role="rowgroup"
          tabIndex={0}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div className="virtual-table-spacer" style={{ height: virtualRows.totalHeight }}>
            {virtualRows.rowIndexes.map((rowIndex) => {
              const row = getRow(rowIndex);
              if (!row) {
                return (
                  <div
                    key={`loading-${rowIndex}`}
                    className="virtual-table-row loading"
                    role="row"
                    aria-rowindex={rowIndex + 2}
                    aria-busy="true"
                    style={{ height: VIRTUAL_ROW_HEIGHT, transform: `translateY(${rowIndex * VIRTUAL_ROW_HEIGHT}px)` }}
                  >
                    <div className="virtual-table-cell span-all" role="cell">불러오는 중</div>
                  </div>
                );
              }

              return (
                <div
                  key={`${row.routeId}-${row.timestamp}-${row.linkId}-${rowIndex}`}
                  className="virtual-table-row"
                  role="row"
                  aria-rowindex={rowIndex + 2}
                  style={{ height: VIRTUAL_ROW_HEIGHT, transform: `translateY(${rowIndex * VIRTUAL_ROW_HEIGHT}px)` }}
                >
                  <div className="virtual-table-cell strong" role="cell" title={row.requestLabel}>{row.requestLabel}</div>
                  <div className="virtual-table-cell mono" role="cell">{row.date}</div>
                  <div className="virtual-table-cell mono" role="cell" title={row.timestamp}>{row.time}</div>
                  <div className="virtual-table-cell mono" role="cell">{row.linkId}</div>
                  <div className="virtual-table-cell strong" role="cell" title={row.roadName}>{row.roadName}</div>
                  <div className="virtual-table-cell" role="cell" title={row.sectionName}>{row.sectionName}</div>
                  <div className="virtual-table-cell" role="cell" title={row.roadArea}>{row.roadArea}</div>
                  <div className="virtual-table-cell" role="cell">{row.roadRank}</div>
                  <div className="virtual-table-cell mono" role="cell">{formatSpeed(row.speedKmh)}</div>
                  <div className="virtual-table-cell mono" role="cell">{formatSeconds(row.travelTimeSeconds)}</div>
                  <div className="virtual-table-cell" role="cell">
                    <span className={`pill ${statusClass(row.congestionLabel)}`}>{row.congestionLabel || "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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

function formatSpeed(speedKmh: number | null): string {
  return speedKmh == null ? "-" : `${Number(speedKmh.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function formatSeconds(seconds: number | null): string {
  return seconds == null ? "-" : Number(seconds.toFixed(1)).toLocaleString("ko-KR");
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}

function statusClass(label: string): string {
  if (label === "정체") return "congested";
  if (label === "서행") return "slow";
  if (label === "원활") return "smooth";
  return "unknown";
}
