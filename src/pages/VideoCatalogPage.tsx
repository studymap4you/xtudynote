import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { LectureYoutubePlaylist } from "@/components/media/LectureYoutubePlaylist";
import { subscribeVideoCatalog } from "@/lib/videoCatalog/videoCatalogApi";
import { extractYouTubeVideoId } from "@/lib/youtubeEmbed";
import type { VideoCatalogDoc } from "@/types/videoCatalog";
import styles from "@/pages/videoCatalog.module.css";
import "@/pages/pages.css";

function formatCreated(at: unknown): string {
  if (at && typeof at === "object" && at !== null && "toDate" in at) {
    const d = (at as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("ko-KR", { dateStyle: "medium" });
    }
  }
  return "";
}

export function VideoCatalogPage() {
  const [rows, setRows] = useState<{ id: string; data: VideoCatalogDoc }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeVideoCatalog(
      (list) => {
        setRows(list);
        setLoadErr(null);
      },
      (e) => setLoadErr(e.message),
    );
    return () => unsub();
  }, []);

  const selectedWatchUrl = useMemo(() => {
    if (!selectedCatalogId) return null;
    const row = rows.find((r) => r.id === selectedCatalogId);
    const u = row?.data.watchUrl?.trim();
    return u || null;
  }, [rows, selectedCatalogId]);

  return (
    <PublicShell light>
      <main className={styles.catalogMain}>
        <header className={styles.catalogTop}>
          <div className={styles.catalogTopText}>
            <h1 className={styles.catalogH1}>동영상 강의</h1>
            <p className={styles.lead}>
              YouTube 링크는 아래 카드를 누르면 이 페이지에서 임베드로 바로 재생됩니다. 그 외 링크는 새 창으로
              열립니다. 목록은 실시간으로 갱신됩니다.
            </p>
          </div>
        </header>

        {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

        {selectedWatchUrl ? (
          <div className={styles.embedPanel}>
            <div className={styles.embedPanelHead}>
              <p className={styles.embedPanelTitle}>선택한 영상</p>
              <button type="button" className={styles.embedClose} onClick={() => setSelectedCatalogId(null)}>
                닫기
              </button>
            </div>
            <LectureYoutubePlaylist
              urls={[selectedWatchUrl]}
              heading="재생"
              idPrefix={selectedCatalogId ? `vc-${selectedCatalogId}` : "vc"}
            />
          </div>
        ) : null}

        {rows.length === 0 && !loadErr ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyVisual} aria-hidden />
            <p className={styles.emptyText}>아직 등록된 동영상이 없습니다.</p>
          </div>
        ) : (
          <ul className={styles.cardGrid}>
            {rows.map(({ id, data }) => {
              const ytId = extractYouTubeVideoId(data.watchUrl);
              const isYoutube = !!ytId;
              const cardInner = (
                <>
                  <div className={styles.videoCardThumb}>
                    {data.thumbnailUrl ? (
                      <img
                        src={data.thumbnailUrl}
                        alt={data.title}
                        className={styles.videoCardImg}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className={styles.videoCardPlaceholder} aria-hidden>
                        <span className={styles.videoCardPlay} />
                      </div>
                    )}
                  </div>
                  <div className={styles.videoCardBody}>
                    <h2 className={styles.videoCardTitle}>{data.title}</h2>
                    <p className={styles.videoCardMeta}>{formatCreated(data.createdAt)}</p>
                    {data.description ? <p className={styles.videoCardDesc}>{data.description}</p> : null}
                    <span className={styles.videoCardCta}>
                      {isYoutube ? "이 페이지에서 재생" : "새 창에서 시청"}
                    </span>
                  </div>
                </>
              );
              return (
                <li key={id} className={styles.cardCell}>
                  {isYoutube ? (
                    <button
                      type="button"
                      className={`${styles.videoCard} ${styles.videoCardButton}`}
                      onClick={() => setSelectedCatalogId(id)}
                      aria-pressed={selectedCatalogId === id}
                    >
                      {cardInner}
                    </button>
                  ) : (
                    <a
                      className={styles.videoCard}
                      href={data.watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {cardInner}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.footerNote}>
          라이브러리 검수·유료 콘텐츠로의 정식 등록은{" "}
          <Link to="/video/register">동영상 학습자료 등록 신청</Link> 경로를 이용해 주세요.
        </p>
      </main>
    </PublicShell>
  );
}
