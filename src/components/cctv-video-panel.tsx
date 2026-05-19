import { CctvVideoPlayer } from "@/components/cctv-video-player";
import type { CctvVideoItem, CctvVideoReport } from "@/lib/cctv";

export function CctvVideoPanel({ report }: { report: CctvVideoReport }) {
  const olympicVideos = report.videos.filter((video) => video.corridorId === "olympic");
  const gangbyeonVideos = report.videos.filter((video) => video.corridorId === "gangbyeonbuk");

  return (
    <section className="data-section cctv-section">
      <div className="section-title">
        <div>
          <h2>CCTV 영상 API</h2>
          <p>{report.request.startDate} ~ {report.request.endDate}</p>
        </div>
        <a className="api-link" href="/api/cctv" target="_blank" rel="noreferrer">
          /api/cctv
        </a>
      </div>

      <div className="cctv-body">
        <div className="cctv-warning">
          <strong>과거 풀영상 공개 URL 없음</strong>
          <span>{report.historicalAccess.message}</span>
          <small>{report.request.note}</small>
        </div>

        <div className="cctv-source-grid">
          <SourceCard title="ITS CCTV API" report={report.its} />
          <SourceCard title="TOPIS 실시간 CCTV" report={report.topis} />
          <div className="cctv-source-card">
            <span>생성 시각</span>
            <strong>{formatGeneratedAt(report.generatedAt)}</strong>
            <small>API 키는 서버에서만 사용하고 화면에는 노출하지 않음</small>
          </div>
        </div>

        <VideoGroup title="올림픽대로 · 방화대교→잠실대교" videos={olympicVideos} />
        <VideoGroup title="강변북로 · 방화대교→천호대교" videos={gangbyeonVideos} />
      </div>
    </section>
  );
}

function formatGeneratedAt(value: string): string {
  return value.replace("T", " ").replace("+09:00", " KST");
}

function SourceCard({ title, report }: { title: string; report: CctvVideoReport["its"] }) {
  return (
    <div className={`cctv-source-card ${report.status}`}>
      <span>{title}</span>
      <strong>{report.matchedCount.toLocaleString("ko-KR")}개</strong>
      <small>{report.message}</small>
    </div>
  );
}

function VideoGroup({ title, videos }: { title: string; videos: CctvVideoItem[] }) {
  return (
    <div className="cctv-route-block">
      <div className="river-route-title">
        <div>
          <h3>{title}</h3>
          <p>현재 공개 영상 URL · 날짜 지정 불가</p>
        </div>
        <span>{videos.length.toLocaleString("ko-KR")}개 영상</span>
      </div>

      {videos.length ? (
        <div className="cctv-video-grid">
          {videos.map((video) => (
            <article className="cctv-card" key={`${video.sourceName}-${video.id}-${video.url}`}>
              <CctvVideoPlayer src={video.url} title={video.name} mediaKind={video.mediaKind} />
              <div className="cctv-card-meta">
                <strong>{video.name}</strong>
                <span>{video.roadName} · {video.sourceName} · {video.format}</span>
                <small>{video.provider}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="cctv-empty">가져온 영상 URL이 없습니다.</div>
      )}
    </div>
  );
}
