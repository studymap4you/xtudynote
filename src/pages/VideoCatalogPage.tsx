import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { subscribeVideoCatalog } from "@/lib/videoCatalog/videoCatalogApi";
import type { VideoCatalogDoc } from "@/types/videoCatalog";
import styles from "@/pages/videoCatalog.module.css";

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

  return (
    <PublicShell light>
      <main className={styles.catalogMain}>
        <header className={styles.catalogTop}>
          <div className={styles.catalogTopText}>
            <h1 className={styles.catalogH1}>동영상 강의</h1>
            <p className={styles.lead}>
              카드를 누르면 새 창에서 시청 페이지로 이동합니다. 목록은 실시간으로 갱신됩니다. 이 영상들은 강의실
              자료와 별도로 운영됩니다.
            </p>
          </div>
        </header>

        {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

        {rows.length === 0 && !loadErr ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyVisual} aria-hidden />
            <p className={styles.emptyText}>아직 등록된 동영상이 없습니다.</p>
          </div>
        ) : (
          <ul className={styles.cardGrid}>
            {rows.map(({ id, data }) => (
              <li key={id} className={styles.cardCell}>
                <a
                  className={styles.videoCard}
                  href={data.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
                    <span className={styles.videoCardCta}>새 창에서 시청</span>
                  </div>
                </a>
              </li>
            ))}
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
