import { useCallback, useEffect, useMemo, useState } from "react";
import { parseLectureUrls, type ParsedLectureUrl } from "@/lib/youtubeEmbed";

function YoutubeIframe({ embedSrc, title }: { embedSrc: string; title: string }) {
  if (!embedSrc) return null;
  return (
    <div className="lecture-yt-player__frame-wrap">
      <iframe
        className="lecture-yt-player__iframe"
        src={embedSrc}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/**
 * 강의 영상 URL 목록 — YouTube는 목록 클릭 시 아래에서 임베드 재생, 그 외는 새 창 링크.
 */
export function LectureYoutubePlaylist({
  urls,
  heading = "강의 영상",
  idPrefix = "yt",
  variant = "default",
}: {
  urls: string[];
  heading?: string;
  /** 접근성용 id 접두사 */
  idPrefix?: string;
  variant?: "default" | "compact";
}) {
  const parsed = useMemo(() => {
    const list = parseLectureUrls(urls.filter(Boolean));
    return list.filter((p) => p.kind !== "other" || (p.kind === "other" && p.original));
  }, [urls]);

  const youtubeItems = useMemo(
    () =>
      parsed.filter(
        (p): p is ParsedLectureUrl & { kind: "youtube" } => p.kind === "youtube" && !!p.embedSrc,
      ),
    [parsed],
  );

  const otherItems = useMemo(
    () => parsed.filter((p): p is ParsedLectureUrl & { kind: "other" } => p.kind === "other" && !!p.original),
    [parsed],
  );

  const [activeYoutubeIndex, setActiveYoutubeIndex] = useState(0);

  useEffect(() => {
    setActiveYoutubeIndex(0);
  }, [urls]);

  const activeYoutube = youtubeItems[activeYoutubeIndex] ?? null;

  const onPickYoutube = useCallback((idx: number) => {
    setActiveYoutubeIndex(idx);
    requestAnimationFrame(() => {
      document.getElementById(`${idPrefix}-player-anchor`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [idPrefix]);

  if (parsed.length === 0) return null;

  return (
    <section
      className={`lecture-yt-player${variant === "compact" ? " lecture-yt-player--compact" : ""}`}
      aria-label={heading}
    >
      <h2 className={`lecture-yt-player__title${variant === "compact" ? " lecture-yt-player__title--sm" : ""}`}>
        {heading}
      </h2>

      {youtubeItems.length > 0 ? (
        <>
          <div id={`${idPrefix}-player-anchor`} className="lecture-yt-player__player-block">
            <YoutubeIframe
              embedSrc={activeYoutube?.embedSrc ?? ""}
              title={heading + (activeYoutube ? ` — ${activeYoutube.videoId}` : "")}
            />
          </div>
          <p className="lecture-yt-player__hint">아래 목록에서 영상을 고르면 위 플레이어에서 바로 재생됩니다.</p>
          <ul className="lecture-yt-player__list" role="list">
            {youtubeItems.map((item, idx) => (
              <li key={`${item.videoId}-${idx}`} className="lecture-yt-player__list-item">
                <button
                  type="button"
                  className={`lecture-yt-player__pick${idx === activeYoutubeIndex ? " lecture-yt-player__pick--active" : ""}`}
                  onClick={() => onPickYoutube(idx)}
                  aria-current={idx === activeYoutubeIndex ? "true" : undefined}
                >
                  <span className="lecture-yt-player__pick-label">YouTube 영상 {idx + 1}</span>
                  <span className="lecture-yt-player__pick-id">{item.videoId}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {otherItems.length > 0 ? (
        <div className="lecture-yt-player__others">
          <h3 className="lecture-yt-player__others-title">기타 링크</h3>
          <ul className="lecture-yt-player__other-list">
            {otherItems.map((item, i) => (
              <li key={`other-${i}-${item.original.slice(0, 32)}`}>
                <a href={item.original} target="_blank" rel="noopener noreferrer" className="lecture-yt-player__other-link">
                  {item.original}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
