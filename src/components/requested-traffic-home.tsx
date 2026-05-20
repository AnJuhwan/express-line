import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, Clock3, Database, FileJson, Route, Timer, TrafficCone } from "lucide-react";

export interface RequestedTrafficReport {
  period: string;
  granularity: string;
  source: string;
  totalRoutes: number;
  totalFiveMinuteRows: number;
  totalLinks: number;
  notes: string[];
  thresholds: Record<string, string>;
  routes: RequestedRouteReport[];
}

interface RequestedRouteReport {
  id: string;
  requestLabel: string;
  matchedLabel: string;
  description: string;
  linkCount: number;
  observedLinkCount: number;
  missingLinkCount: number;
  fiveMinuteRows: number;
  avgSpeedKmh: number | null;
  minSpeedKmh: number | null;
  blockedHourCount: number;
  slowHourCount: number;
  congestedHourCount: number;
  peakBlockedHour: {
    date: string;
    hour: number;
    avgSpeedKmh: number | null;
    status: TrafficStatus;
    slowObservationCount: number;
    congestedObservationCount: number;
  } | null;
  topBlockedSections: RequestedBlockedSection[];
  days: RequestedRouteDay[];
}

interface RequestedRouteDay {
  date: string;
  hours: RequestedRouteHour[];
}

interface RequestedRouteHour {
  hour: number;
  label: string;
  avgSpeedKmh: number | null;
  minSpeedKmh: number | null;
  status: TrafficStatus;
  blocked: boolean;
  sampleCount: number;
  observedLinkCount: number;
  smoothObservationCount: number;
  slowObservationCount: number;
  congestedObservationCount: number;
  slowLinkCount: number;
  congestedLinkCount: number;
}

interface RequestedBlockedSection {
  linkId: string;
  roadName: string;
  sectionName: string;
  avgSpeedKmh: number | null;
  minSpeedKmh: number | null;
  slowObservationCount: number;
  congestedObservationCount: number;
  blockedObservationCount: number;
}

type TrafficStatus = "원활" | "서행" | "정체" | "정보없음" | "데이터없음";

export function RequestedTrafficHome({ report }: { report: RequestedTrafficReport }) {
  const mostBlockedRoutes = [...report.routes].sort((a, b) => b.blockedHourCount - a.blockedHourCount).slice(0, 3);

  return (
    <main className="dashboard-shell requested-home">
      <section className="hero-band requested-hero">
        <div>
          <p className="eyebrow">요청 구간 추출 리포트</p>
          <h1>요청 구간별 시간대 정체 데이터</h1>
          <p className="hero-copy">
            {report.period} ITS 5분 원천을 표준링크와 매칭해 계양IC, 장수IC, 신월 IC, 강변북로 방향별 요약으로 정리했습니다.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="icon-button" href="/five-minute" title="5분 전체 데이터 화면">
            <Timer size={18} />
            5분 전체
          </Link>
          <Link className="icon-button" href="/hourly" title="1시간 단위 데이터 화면">
            <Clock3 size={18} />
            1시간
          </Link>
          <span className="icon-button static-action" title="로컬 JSON 저장 위치">
            <FileJson size={18} />
            data/csv-20260513-20260515
          </span>
        </div>
      </section>

      <section className="summary-grid requested-summary">
        <Metric icon={<Route size={18} />} label="요청 구간" value={`${report.totalRoutes.toLocaleString("ko-KR")}개`} />
        <Metric icon={<Database size={18} />} label="5분 관측" value={`${report.totalFiveMinuteRows.toLocaleString("ko-KR")}건`} />
        <Metric icon={<TrafficCone size={18} />} label="구간 링크" value={`${report.totalLinks.toLocaleString("ko-KR")}개`} />
        <Metric icon={<Timer size={18} />} label="요약 단위" value={report.granularity} />
      </section>

      <section className="data-section">
        <div className="section-title">
          <h2>핵심 정체 구간</h2>
          <p>막힘 시간대가 많은 순</p>
        </div>
        <div className="route-highlight-grid">
          {mostBlockedRoutes.map((route) => (
            <article className="route-highlight" key={route.id}>
              <span>{route.requestLabel}</span>
              <strong>{route.blockedHourCount.toLocaleString("ko-KR")}시간대</strong>
              <small>{route.matchedLabel}</small>
              <em>{route.peakBlockedHour ? peakLabel(route.peakBlockedHour) : "피크 없음"}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="route-card-grid" aria-label="요청 구간 요약">
        {report.routes.map((route) => (
          <article className="requested-route-card" key={route.id}>
            <div>
              <span>{route.requestLabel}</span>
              <h2>{route.matchedLabel}</h2>
            </div>
            <dl>
              <div>
                <dt>평균</dt>
                <dd>{formatSpeed(route.avgSpeedKmh)}</dd>
              </div>
              <div>
                <dt>최저</dt>
                <dd>{formatSpeed(route.minSpeedKmh)}</dd>
              </div>
              <div>
                <dt>막힘</dt>
                <dd>{route.blockedHourCount.toLocaleString("ko-KR")}시간</dd>
              </div>
              <div>
                <dt>링크</dt>
                <dd>{route.observedLinkCount}/{route.linkCount}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="data-section">
        <div className="section-title">
          <h2>시간대별 정체표</h2>
          <p>{report.period}</p>
        </div>
        <div className="requested-route-stack">
          {report.routes.map((route) => (
            <RouteHourMatrix route={route} key={route.id} />
          ))}
        </div>
      </section>

      <section className="data-section">
        <div className="section-title">
          <h2>구간별 막힘 상위</h2>
          <p>5분 관측 기준</p>
        </div>
        <div className="blocked-section-grid">
          {report.routes.map((route) => (
            <article className="blocked-section-list" key={route.id}>
              <div className="blocked-section-title">
                <BarChart3 size={16} />
                <strong>{route.requestLabel}</strong>
              </div>
              <ol>
                {route.topBlockedSections.map((section) => (
                  <li key={`${route.id}-${section.linkId}`}>
                    <span>{section.sectionName}</span>
                    <small>
                      정체 {section.congestedObservationCount.toLocaleString("ko-KR")} · 서행{" "}
                      {section.slowObservationCount.toLocaleString("ko-KR")} · 최저 {formatSpeed(section.minSpeedKmh)}
                    </small>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="coverage-strip">
        <div className="coverage-card">
          <strong>원천</strong>
          <span>{report.source}</span>
          <small>{Object.values(report.thresholds).join(" / ")}</small>
        </div>
        {report.notes.map((note) => (
          <div className="coverage-card" key={note}>
            <strong>매칭 메모</strong>
            <span>{note}</span>
            <small>원문 요청명은 유지하고 실제 표준링크 매칭명을 별도로 표시했습니다.</small>
          </div>
        ))}
      </section>
    </main>
  );
}

function RouteHourMatrix({ route }: { route: RequestedRouteReport }) {
  const hourHeaders = route.days[0]?.hours ?? [];

  return (
    <div className="river-route-block requested-route-block">
      <div className="river-route-title">
        <div>
          <h3>{route.requestLabel}</h3>
          <p>{route.matchedLabel}</p>
        </div>
        <span>{route.fiveMinuteRows.toLocaleString("ko-KR")}건</span>
      </div>
      <div className="river-matrix-wrap">
        <table className="river-matrix requested-hour-matrix">
          <thead>
            <tr>
              <th>날짜</th>
              {hourHeaders.map((hour) => (
                <th key={hour.hour}>{String(hour.hour).padStart(2, "0")}시</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {route.days.map((day) => (
              <tr key={`${route.id}-${day.date}`}>
                <td className="mono">{day.date}</td>
                {day.hours.map((hour) => (
                  <td key={hour.hour} className={`river-cell ${statusClass(hour.status)} ${hour.blocked ? "has-blocked-link" : ""}`}>
                    <div title={hourTitle(hour)}>
                      <strong>{hour.status}</strong>
                      <span>{formatSpeed(hour.avgSpeedKmh)}</span>
                      <small>
                        정체 {hour.congestedLinkCount} · 서행 {hour.slowLinkCount}
                      </small>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric-card requested-metric">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function hourTitle(hour: RequestedRouteHour): string {
  return [
    `${hour.label}`,
    hour.status,
    formatSpeed(hour.avgSpeedKmh),
    `최저 ${formatSpeed(hour.minSpeedKmh)}`,
    `원활 ${hour.smoothObservationCount.toLocaleString("ko-KR")}건`,
    `정체 ${hour.congestedObservationCount.toLocaleString("ko-KR")}건`,
    `서행 ${hour.slowObservationCount.toLocaleString("ko-KR")}건`,
    `${hour.sampleCount.toLocaleString("ko-KR")}개 5분 관측`,
  ].join(" · ");
}

function peakLabel(peak: NonNullable<RequestedRouteReport["peakBlockedHour"]>) {
  return `${peak.date} ${String(peak.hour).padStart(2, "0")}시 · 정체 ${peak.congestedObservationCount.toLocaleString("ko-KR")}건`;
}

function formatSpeed(speedKmh: number | null): string {
  return speedKmh == null ? "-" : `${Number(speedKmh.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function statusClass(status: TrafficStatus): string {
  if (status === "정체") return "congested";
  if (status === "서행") return "slow";
  if (status === "원활") return "smooth";
  if (status === "정보없음") return "unknown";
  return "missing";
}
