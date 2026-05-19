import type { RiverCorridorHourCell, RiverCorridorReport } from "@/lib/river-corridors";

export function RiverCorridorPanel({ report }: { report: RiverCorridorReport }) {
  return (
    <section className="data-section river-corridor-section">
      <div className="section-title">
        <h2>요청 구간 시간표</h2>
        <p>{report.startDate} ~ {report.endDate}</p>
      </div>
      <div className="river-corridor-body">
        <div className="river-corridor-meta">
          {report.corridors.map((corridor) => (
            <div className="river-corridor-card" key={corridor.id}>
              <span>{corridor.roadName}</span>
              <strong>{corridor.requestLabel}</strong>
              <small>{corridor.matchedLabel}</small>
              <em>{corridor.observedRows.toLocaleString("ko-KR")}건</em>
            </div>
          ))}
          <div className="river-corridor-card river-corridor-note">
            <span>데이터 원천</span>
            <strong>T-DATA 1시간 구간별</strong>
            <small>최신 응답 {report.actualMaxDate}</small>
            <em>이후 시간은 데이터없음</em>
          </div>
        </div>

        {report.corridors.map((corridor) => (
          <div className="river-route-block" key={corridor.id}>
            <div className="river-route-title">
              <div>
                <h3>{corridor.roadName}</h3>
                <p>{corridor.requestLabel} · {corridor.matchedLabel}</p>
              </div>
              <span>{corridor.sections.length.toLocaleString("ko-KR")}개 측정 구간</span>
            </div>
            <div className="river-matrix-wrap">
              <table className="river-matrix">
                <thead>
                  <tr>
                    <th>날짜</th>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <th key={hour}>{String(hour).padStart(2, "0")}시</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corridor.days.map((day) => (
                    <tr key={day.date}>
                      <td className="mono">{day.date}</td>
                      {day.hours.map((cell) => (
                        <td key={cell.hour} className={`river-cell ${statusClass(cell.status)}`}>
                          <div title={cellTitle(cell)}>
                            <strong>{cell.status}</strong>
                            <span>{formatSpeed(cell.avgSpeedKph)}</span>
                            <small>{cell.observedSectionCount}/{cell.expectedSectionCount}</small>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function cellTitle(cell: RiverCorridorHourCell): string {
  const pieces = [`${String(cell.hour).padStart(2, "0")}시`, cell.status, formatSpeed(cell.avgSpeedKph)];
  if (cell.congestedSections.length) pieces.push(`정체: ${cell.congestedSections.join(" | ")}`);
  if (cell.slowSections.length) pieces.push(`서행: ${cell.slowSections.join(" | ")}`);
  if (cell.smoothSections.length) pieces.push(`원활: ${cell.smoothSections.join(" | ")}`);
  if (cell.missingSections.length) pieces.push(`데이터없음: ${cell.missingSections.join(" | ")}`);
  return pieces.join(" · ");
}

function formatSpeed(speedKph: number | null): string {
  return speedKph == null ? "-" : `${Number(speedKph.toFixed(1)).toLocaleString("ko-KR")} km/h`;
}

function statusClass(status: RiverCorridorHourCell["status"]): string {
  if (status === "정체") return "congested";
  if (status === "서행") return "slow";
  if (status === "원활") return "smooth";
  if (status === "정보없음") return "unknown";
  return "missing";
}
