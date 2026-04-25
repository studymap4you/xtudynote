import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { useAuth } from "@/contexts/AuthContext";
import { addVideoCatalogEntry, subscribeVideoCatalog } from "@/lib/videoCatalog/videoCatalogApi";
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

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function VideoCatalogPage() {
  const { firebaseUser, canManageMaterials } = useAuth();
  const [rows, setRows] = useState<{ id: string; data: VideoCatalogDoc }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [watchUrl, setWatchUrl] = useState("");
  const [description, setDescription] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

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

  const onAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!firebaseUser?.uid || !canManageMaterials) return;
      const t = title.trim();
      const u = watchUrl.trim();
      if (!t) {
        setFormMsg("제목을 입력해 주세요.");
        return;
      }
      if (!isHttpUrl(u)) {
        setFormMsg("시청 링크는 http(s):// 로 시작하는 전체 URL이어야 합니다.");
        return;
      }
      setFormBusy(true);
      setFormMsg(null);
      try {
        await addVideoCatalogEntry({
          title: t,
          watchUrl: u,
          description: description.trim() || undefined,
          createdBy: firebaseUser.uid,
        });
        setTitle("");
        setWatchUrl("");
        setDescription("");
        setFormMsg("등록되었습니다.");
      } catch (err) {
        setFormMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setFormBusy(false);
      }
    },
    [firebaseUser?.uid, canManageMaterials, title, watchUrl, description],
  );

  return (
    <PublicShell light>
      <main className={styles.wrap}>
        <div className={styles.head}>
          <div className={styles.titleBlock}>
            <h1>동영상 강의</h1>
            <p className={styles.lead}>
              등록된 강의 영상 링크를 눌러 새 창에서 시청합니다. 아래 목록은 실시간으로 갱신됩니다.
            </p>
          </div>
          {canManageMaterials && firebaseUser ? (
            <aside className={styles.registerCard} aria-label="새 동영상 등록">
              <h2>새 동영상 등록</h2>
              <form onSubmit={(ev) => void onAdd(ev)}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="vc-title">
                    제목
                  </label>
                  <input
                    id="vc-title"
                    className={styles.input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={240}
                    placeholder="예: 수능 영어 독해 전략 1강"
                    autoComplete="off"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="vc-url">
                    시청 링크 (URL)
                  </label>
                  <input
                    id="vc-url"
                    className={styles.input}
                    value={watchUrl}
                    onChange={(e) => setWatchUrl(e.target.value)}
                    maxLength={2048}
                    placeholder="https://…"
                    inputMode="url"
                    autoComplete="url"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="vc-desc">
                    설명 (선택)
                  </label>
                  <textarea
                    id="vc-desc"
                    className={styles.textarea}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    placeholder="한 줄 소개"
                  />
                </div>
                <button type="submit" className="btn btn--primary btn--stack" disabled={formBusy}>
                  {formBusy ? "등록 중…" : "등록"}
                </button>
                {formMsg ? (
                  <p className={formMsg.includes("등록되") ? styles.ok : styles.err}>{formMsg}</p>
                ) : null}
              </form>
            </aside>
          ) : (
            <p className={styles.lead} style={{ maxWidth: "14rem", fontSize: "0.82rem" }}>
              동영상을 추가하려면 <Link to="/login">로그인</Link> 후 교육자·마스터 계정이 필요합니다.
            </p>
          )}
        </div>

        {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

        {rows.length === 0 && !loadErr ? (
          <p style={{ color: "#64748b" }}>아직 등록된 동영상이 없습니다.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map(({ id, data }) => (
              <li key={id} className={styles.row}>
                <h2 className={styles.rowTitle}>
                  <a href={data.watchUrl} target="_blank" rel="noopener noreferrer">
                    {data.title}
                  </a>
                </h2>
                <p className={styles.rowMeta}>{formatCreated(data.createdAt)}</p>
                {data.description ? <p className={styles.rowDesc}>{data.description}</p> : null}
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
