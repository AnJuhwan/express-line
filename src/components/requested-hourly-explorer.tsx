"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Database, Download, RefreshCcw, Route, Timer } from "lucide-react";
import type {
  RequestedTrafficFiveMinuteRouteMeta,
  RequestedTrafficHourlyPage,
  RequestedTrafficHourlyRow
} from "@/lib/requested-traffic-five-minute-shared";

interface HourlyPayload extends RequestedTrafficHourlyPage {
  routes: RequestedTrafficFiveMinuteRouteMeta[];
}

interface Props {
  routes: RequestedTrafficFiveMinuteRouteMeta[];
  initialRows: RequestedTrafficHourlyRow[];
  initialRouteId: string;
  initialTotalCount: number;
  initialDataAvailable: boolean;
  initialStartHour: number;
  initialEndHour: number;
  datasetId?: string;
  reportHref?: string;
  fiveMinuteHref?: string;
  periodLabel?: string;
}

export function RequestedHourlyExplorer({
  routes,
  initialRows,
  initialRouteId,
  initialTotalCount,
  initialDataAvailable,
  initialStartHour,
  initialEndHour,
  datasetId,
  reportHref = "/",
  fiveMinuteHref = "/five-minute",
  periodLabel = "선택 기간"
}: Props) {
  const [routeId, setRouteId] = useState(initialRouteId);
  const [appliedRouteId, setAppliedRouteId] = useState(initialRouteId);
  const [rows, setRows] = useState(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [dataAvailable, setDataAvailable] = useState(initialDataAvailable);
  const [timeWindow, setTimeWindow] = useState({ startHour: initialStartHour, endHour: initialEndHour });
  const [isPending, startTransition] = useTransition();

  const selectedRouteLabel = useMemo(() => {
    if (appliedRouteId === "all") return "전체 요청 구간";
    return routes.find((route) => route.id === appliedRouteId)?.requestLabel ?? "선택 구간";
  }, [appliedRouteId, routes]);
  const timeWindowLabel = `${padHour(timeWindow.startHour)}:00~${padHour(timeWindow.endHour)}:00`;
  const csvHref = requestedTrafficApiHref(
    "/api/requested-traffic/hourly",
    {
      route: appliedRouteId,
      startHour: String(timeWindow.startHour),
      endHour: String(timeWindow.endHour),
      format: "csv"
    },
    datasetId
  );

  function applyRoute(nextRouteId = routeId) {
    startTransition(async () => {
      const params = requestedTrafficSearchParams(
        {
          route: nextRouteId,
          startHour: String(timeWindow.startHour),
          endHour: String(timeWindow.endHour)
        },
        datasetId
      );
      const response = await fetch(`/api/requested-traffic/hourly?${params.toString()}`, { cache: "no-store" });
      const nextPayload = (await response.json()) as HourlyPayload;
      setAppliedRouteId(nextPayload.routeId);
      setRouteId(nextPayload.routeId);
      setRows(nextPayload.rows);
      setTotalCount(nextPayload.totalCount);
      setDataAvailable(nextPayload.dataAvailable);
      setTimeWindow(nextPayload.timeWindow);
    });
  }

  return (
    <main className="dashboard-shell requested-hourly-page">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Hourly traffic records</p>
          <h1>1시간 단위 데이터</h1>
          <p className="hero-copy">
            {periodLabel}, 오전 6시부터 오후 6시까지의 요청 구간별 시간 요약입니다.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="icon-button" href={reportHref} title="리포트로 돌아가기">
            <ArrowLeft size={18} />
            리포트
          </Link>
          <Link className="icon-button" href={fiveMinuteHref} title="5분 단위 데이터 화면">
            <Timer size={18} />
            5분
          </Link>
          <a className="icon-button" href={csvHref} title="현재 선택 범위 CSV 다운로드">
            <Download size={18} />
            CSV
          </a>
        </div>
      </section>

      <section className="filter-panel hourly-filter-panel" aria-label="1시간 데이터 필터">
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

      <section className="summary-grid hourly-summary">
        <Metric label="선택 범위" value={selectedRouteLabel} />
        <Metric label="시간 행" value={totalCount.toLocaleString("ko-KR")} />
        <Metric label="시간 범위" value={timeWindowLabel} />
        <Metric label="요청 구간" value={`${routes.length.toLocaleString("ko-KR")}개`} />
      </section>

      <section className="data-section">
        <div className="section-title">
          <div>
            <h2>1시간 요약 테이블</h2>
            <p>{selectedRouteLabel}</p>
          </div>
          <span className="table-badge">
            <Database size={16} />
            {totalCount.toLocaleString("ko-KR")}행
          </span>
        </div>
        <RequestedHourlyTable rows={rows} dataAvailable={dataAvailable} />
      </section>
    </main>
  );
}

function RequestedHourlyTable({ rows, dataAvailable }: { rows: RequestedTrafficHourlyRow[]; dataAvailable: boolean }) {
  if (!rows.length) {
    return (
      <div className="table-wrap">
        <div className="empty-state">
          <strong>표시할 1시간 데이터가 없습니다.</strong>
          <span>{dataAvailable ? "선택한 구간에 행이 없습니다." : "로컬 시간별 JSON 묶음을 찾지 못했습니다."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap hourly-table-wrap">
      <table className="hourly-table">
        <thead>
          <tr>
            <th>요청구간</th>
            <th>날짜</th>
            <th>시간대</th>
            <th>평균속도</th>
            <th>최저속도</th>
            <th>혼잡</th>
            <th>자료수</th>
            <th>관측링크</th>
            <th>원활관측</th>
            <th>서행관측</th>
            <th>정체관측</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.routeId}-${row.date}-${row.hour}`}>
              <td className="strong" title={row.requestLabel}>{row.requestLabel}</td>
              <td className="mono">{row.date}</td>
              <td className="mono">{row.label}</td>
              <td className="mono">{formatSpeed(row.avgSpeedKmh)}</td>
              <td className="mono">{formatSpeed(row.minSpeedKmh)}</td>
              <td>
                <span className={`pill ${statusClass(row.status)}`}>{row.status || "-"}</span>
              </td>
              <td className="mono">{row.sampleCount.toLocaleString("ko-KR")}</td>
              <td className="mono">{row.observedLinkCount.toLocaleString("ko-KR")}</td>
              <td className="mono">{row.smoothObservationCount.toLocaleString("ko-KR")}</td>
              <td className="mono">{row.slowObservationCount.toLocaleString("ko-KR")}</td>
              <td className="mono">{row.congestedObservationCount.toLocaleString("ko-KR")}</td>
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

function formatSpeed(speedKmh: number | null): string {
  return speedKmh == null ? "-" : `${Number(speedKmh.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function statusClass(label: string): string {
  if (label === "정체") return "congested";
  if (label === "서행") return "slow";
  if (label === "원활") return "smooth";
  return "unknown";
}

function padHour(hour: number): string {
  return String(hour).padStart(2, "0");
}

function requestedTrafficApiHref(endpoint: string, params: Record<string, string>, datasetId?: string): string {
  return `${endpoint}?${requestedTrafficSearchParams(params, datasetId).toString()}`;
}

function requestedTrafficSearchParams(params: Record<string, string>, datasetId?: string): URLSearchParams {
  const searchParams = new URLSearchParams(params);
  if (datasetId) searchParams.set("dataset", datasetId);
  return searchParams;
}
