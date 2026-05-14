import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { addVideoCatalogEntry, uploadVideoCatalogThumbnail } from "@/lib/videoCatalog/videoCatalogApi";
import styles from "@/pages/videoCatalog.module.css";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function VideoCatalogRegisterPage() {
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const uid = firebaseUser?.uid ?? "";

  const [title, setTitle] = useState("");
  const [watchUrl, setWatchUrl] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrlInput, setThumbnailUrlInput] = useState("");
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!uid) return;
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

      let thumbUrl: string | undefined;
      if (thumbFile) {
        try {
          thumbUrl = await uploadVideoCatalogThumbnail(uid, thumbFile);
        } catch (err) {
          setFormMsg(err instanceof Error ? err.message : String(err));
          return;
        }
      } else {
        const raw = thumbnailUrlInput.trim();
        if (raw) {
          if (!isHttpUrl(raw)) {
            setFormMsg("썸네일 URL은 http(s):// 로 시작하는 이미지 주소여야 합니다.");
            return;
          }
          thumbUrl = raw;
        }
      }

      setBusy(true);
      setFormMsg(null);
      try {
        await addVideoCatalogEntry({
          title: t,
          watchUrl: u,
          description: description.trim() || undefined,
          thumbnailUrl: thumbUrl,
          createdBy: uid,
          teacherId: uid,
        });
        showToast("ok", "동영상이 등록되었습니다.");
        navigate("/admin/storefront?tab=videos", { replace: true });
      } catch (err) {
        setFormMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [uid, title, watchUrl, description, thumbnailUrlInput, thumbFile, navigate, showToast],
  );

  return (
    <DashboardShell light>
      <main className={styles.wrap}>
        <nav className={styles.registerNav}>
          <Link to="/admin/storefront?tab=videos" className={styles.registerBack}>
            ← 스토어 관리
          </Link>
        </nav>

        <header className={styles.registerHeader}>
          <h1 className={styles.registerH1}>동영상 등록</h1>
          <p className={styles.lead}>
            홈의「동영상 강의」목록에 노출됩니다. 강의실에 올리는 자료와는 별도로 관리됩니다. (마스터 전용)
          </p>
        </header>

        <div className={styles.registerCardWide}>
          <form onSubmit={(ev) => void onSubmit(ev)}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="vcr-title">
                제목
              </label>
              <input
                id="vcr-title"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={240}
                placeholder="예: 수능 영어 독해 전략 1강"
                autoComplete="off"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="vcr-url">
                시청 링크 (URL)
              </label>
              <input
                id="vcr-url"
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
              <label className={styles.label} htmlFor="vcr-thumb-file">
                썸네일 이미지 (파일 업로드, 2MB 이하)
              </label>
              <input
                id="vcr-thumb-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className={styles.fileInput}
                onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
              />
              <p className={styles.fieldHint}>파일을 선택하면 아래 URL 입력보다 우선합니다.</p>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="vcr-thumb-url">
                또는 썸네일 이미지 URL (선택)
              </label>
              <input
                id="vcr-thumb-url"
                className={styles.input}
                value={thumbnailUrlInput}
                onChange={(e) => setThumbnailUrlInput(e.target.value)}
                maxLength={2048}
                placeholder="https://… (jpg, png 등 직접 링크)"
                inputMode="url"
                disabled={!!thumbFile}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="vcr-desc">
                설명 (선택)
              </label>
              <textarea
                id="vcr-desc"
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                placeholder="한 줄 소개"
              />
            </div>
            <div className={styles.registerActions}>
              <button type="submit" className="btn btn--primary btn--stack" disabled={busy}>
                {busy ? "등록 중…" : "등록하기"}
              </button>
              <Link to="/admin/storefront?tab=videos" className="btn btn--ghost btn--stack">
                취소
              </Link>
            </div>
            {formMsg ? <p className={styles.err}>{formMsg}</p> : null}
          </form>
        </div>
      </main>
    </DashboardShell>
  );
}
