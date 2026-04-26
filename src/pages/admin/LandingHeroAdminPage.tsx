import { useCallback, useEffect, useState } from "react";
import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { AdminTopNav } from "@/components/AdminTopNav";
import { db, storage } from "@/firebase/config";
import {
  LANDING_HERO_DEFAULT_MAX_H_PX,
  LANDING_HERO_DEFAULT_MAX_W_PX,
  SITE_CONFIG_COLLECTION,
  SITE_CONFIG_HOME_DOC,
} from "@/lib/siteConfig";
import type { SiteConfigHomeDocument } from "@/lib/siteConfig";
import "@/pages/pages.css";

const MAX_HERO_BYTES = 5 * 1024 * 1024;
const MAX_PAGE_BG_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PAGE_BG_VIDEO_BYTES = 40 * 1024 * 1024;

function safeBaseName(name: string): string {
  const base = name.replace(/\.[^/.]+$/, "");
  const s = base.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_").slice(0, 80);
  return s || "file";
}

async function tryDeleteStoragePath(path: string | null | undefined) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // stale or already removed
  }
}

function clampPxInput(n: number): boolean {
  return Number.isFinite(n) && n >= 40 && n <= 2000;
}

export function LandingHeroAdminPage() {
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [maxWPx, setMaxWPx] = useState<number | null>(null);
  const [maxHPx, setMaxHPx] = useState<number | null>(null);
  const [wInput, setWInput] = useState("");
  const [hInput, setHInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [heroUploading, setHeroUploading] = useState(false);
  const [pageBgUploading, setPageBgUploading] = useState(false);
  const [savingDims, setSavingDims] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pageBgPath, setPageBgPath] = useState<string | null>(null);
  const [pageBgMedia, setPageBgMedia] = useState<"image" | "video" | null>(null);
  const [pageBgUrl, setPageBgUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
      (snap) => {
        const d = snap.data() as SiteConfigHomeDocument | undefined;
        const p = d?.landingHeroImagePath;
        setStoragePath(typeof p === "string" && p.length > 0 ? p : null);
        const w = d?.landingHeroImageMaxWidthPx;
        const h = d?.landingHeroImageMaxHeightPx;
        setMaxWPx(typeof w === "number" && clampPxInput(w) ? w : null);
        setMaxHPx(typeof h === "number" && clampPxInput(h) ? h : null);

        const bp = d?.landingPageBackgroundPath;
        setPageBgPath(typeof bp === "string" && bp.length > 0 ? bp : null);
        const m = d?.landingPageBackgroundMedia;
        setPageBgMedia(m === "image" || m === "video" ? m : null);

        setLoading(false);
      },
      () => {
        setStoragePath(null);
        setMaxWPx(null);
        setMaxHPx(null);
        setPageBgPath(null);
        setPageBgMedia(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    setWInput(maxWPx != null ? String(maxWPx) : "");
    setHInput(maxHPx != null ? String(maxHPx) : "");
  }, [maxWPx, maxHPx]);

  useEffect(() => {
    if (!storagePath) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    getDownloadURL(ref(storage, storagePath))
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  useEffect(() => {
    if (!pageBgPath) {
      setPageBgUrl(null);
      return;
    }
    let cancelled = false;
    getDownloadURL(ref(storage, pageBgPath))
      .then((url) => {
        if (!cancelled) setPageBgUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPageBgUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pageBgPath]);

  const onPickFile = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("히어로는 이미지 파일만 업로드할 수 있습니다.");
        return;
      }
      if (file.size > MAX_HERO_BYTES) {
        setError("히어로 이미지는 5MB 이하로 올려 주세요.");
        return;
      }
      setHeroUploading(true);
      const prev = storagePath;
      const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
      const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
      const objectPath = `site_assets/landing_hero/${Date.now()}_${safeBaseName(file.name)}.${ext}`;
      try {
        await uploadBytes(ref(storage, objectPath), file, { contentType: file.type });
        const homeRef = doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC);
        await setDoc(
          homeRef,
          {
            landingHeroImagePath: objectPath,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await tryDeleteStoragePath(prev);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
        try {
          await deleteObject(ref(storage, objectPath));
        } catch {
          /* noop */
        }
      } finally {
        setHeroUploading(false);
      }
    },
    [storagePath]
  );

  const onPickPageBackground = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      setError(null);
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        setError("홈 배경은 이미지 또는 동영상(mp4, webm 등)만 업로드할 수 있습니다.");
        return;
      }
      if (isImage && file.size > MAX_PAGE_BG_IMAGE_BYTES) {
        setError("배경 이미지는 10MB 이하로 올려 주세요.");
        return;
      }
      if (isVideo && file.size > MAX_PAGE_BG_VIDEO_BYTES) {
        setError("배경 동영상은 40MB 이하(짧은 클립)로 올려 주세요.");
        return;
      }
      setPageBgUploading(true);
      const prev = pageBgPath;
      const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
      const ext = extMatch ? extMatch[1].toLowerCase() : (isVideo ? "mp4" : "jpg");
      const objectPath = `site_assets/landing_page_bg/${Date.now()}_${safeBaseName(file.name)}.${ext}`;
      const media: "image" | "video" = isVideo ? "video" : "image";
      try {
        await uploadBytes(ref(storage, objectPath), file, { contentType: file.type || undefined });
        await setDoc(
          doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
          {
            landingPageBackgroundPath: objectPath,
            landingPageBackgroundMedia: media,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await tryDeleteStoragePath(prev);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "배경 업로드에 실패했습니다.");
        try {
          await deleteObject(ref(storage, objectPath));
        } catch {
          /* noop */
        }
      } finally {
        setPageBgUploading(false);
      }
    },
    [pageBgPath]
  );

  async function saveDims() {
    setError(null);
    const wt = wInput.trim();
    const ht = hInput.trim();
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (wt === "") {
      payload.landingHeroImageMaxWidthPx = deleteField();
    } else {
      const w = Number.parseInt(wt, 10);
      if (!clampPxInput(w)) {
        setError("너비는 40~2000 사이 정수로 입력해 주세요. 제한 없음은 빈 칸으로 두세요.");
        return;
      }
      payload.landingHeroImageMaxWidthPx = w;
    }
    if (ht === "") {
      payload.landingHeroImageMaxHeightPx = deleteField();
    } else {
      const h = Number.parseInt(ht, 10);
      if (!clampPxInput(h)) {
        setError("높이는 40~2000 사이 정수로 입력해 주세요. 제한 없음은 빈 칸으로 두세요.");
        return;
      }
      payload.landingHeroImageMaxHeightPx = h;
    }
    setSavingDims(true);
    try {
      await setDoc(doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC), payload, { merge: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSavingDims(false);
    }
  }

  async function clearHero() {
    setError(null);
    const prev = storagePath;
    setHeroUploading(true);
    try {
      await setDoc(
        doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
        {
          landingHeroImagePath: deleteField(),
          landingHeroImageMaxWidthPx: deleteField(),
          landingHeroImageMaxHeightPx: deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await tryDeleteStoragePath(prev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "제거에 실패했습니다.");
    } finally {
      setHeroUploading(false);
    }
  }

  async function clearPageBackground() {
    setError(null);
    const prev = pageBgPath;
    setPageBgUploading(true);
    try {
      await setDoc(
        doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
        {
          landingPageBackgroundPath: deleteField(),
          landingPageBackgroundMedia: deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await tryDeleteStoragePath(prev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "배경 제거에 실패했습니다.");
    } finally {
      setPageBgUploading(false);
    }
  }

  return (
    <div className="app-shell app-shell--admin">
      <AdminTopNav />
      <main className="admin-layout admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>Landing visuals</h1>
          <span className="ui-ko">랜딩 히어로 · 홈 전체 배경</span>
        </div>
        <p style={{ color: "var(--light-text-muted)", maxWidth: "46rem" }}>
          <strong>히어로</strong>는 홈 왼쪽 브랜드·슬로건 영역을 덮는 이미지이고,{" "}
          <strong>전체 배경</strong>은 문서처럼 홈 페이지 뒤에 깔리는 레이어입니다(헤더·본문은 그 위에 표시).
          배경은 이미지 또는 짧은 동영상(mp4/webm 등)을 올릴 수 있으며, 동영상은 자동 반복·음소거로 재생됩니다.
        </p>
        {error ? (
          <p role="alert" style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem", maxWidth: "46rem" }}>
            {error}
          </p>
        ) : null}

        <section className="panel panel--light" style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
          <div className="panel__head">
            <h2 className="panel__title">히어로 이미지 (왼쪽 열)</h2>
          </div>
          {loading ? (
            <p>불러오는 중…</p>
          ) : previewUrl ? (
            <div
              style={{
                borderRadius: "var(--radius-ui)",
                overflow: "hidden",
                border: "1px solid rgba(15,23,42,0.08)",
                background: "#f8fafc",
              }}
            >
              <img
                src={previewUrl}
                alt=""
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>등록된 이미지가 없습니다.</p>
          )}

          {storagePath ? (
            <div
              style={{
                marginTop: "1.25rem",
                paddingTop: "1rem",
                borderTop: "1px solid rgba(15,23,42,0.08)",
                display: "grid",
                gap: "0.75rem",
                maxWidth: "22rem",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>표시 크기 (px)</p>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
                예전에 자동으로 320×200이 들어갔다면 화면이 작은 사각형으로만 보일 수 있습니다.{" "}
                <strong>너비·높이를 비운 뒤 「크기 저장」</strong>하면 왼쪽 열 전체 너비·기본 높이로 다시
                맞춥니다.
              </p>
              <label className="auth-field" style={{ margin: 0 }}>
                <span className="ui-ko">최대 너비</span>
                <input
                  className="add-passage__control"
                  type="text"
                  inputMode="numeric"
                  value={wInput}
                  onChange={(e) => setWInput(e.target.value)}
                  placeholder={`예: ${LANDING_HERO_DEFAULT_MAX_W_PX} (빈 칸 = 제한 없음)`}
                  autoComplete="off"
                />
              </label>
              <label className="auth-field" style={{ margin: 0 }}>
                <span className="ui-ko">최대 높이</span>
                <input
                  className="add-passage__control"
                  type="text"
                  inputMode="numeric"
                  value={hInput}
                  onChange={(e) => setHInput(e.target.value)}
                  placeholder={`예: ${LANDING_HERO_DEFAULT_MAX_H_PX} (빈 칸 = 제한 없음)`}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className="btn btn--primary btn--stack"
                disabled={savingDims || loading}
                onClick={() => void saveDims()}
              >
                {savingDims ? "저장 중…" : "크기 저장"}
              </button>
            </div>
          ) : null}

          <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <label className="btn btn--primary btn--stack" style={{ cursor: heroUploading ? "wait" : "pointer" }}>
              <span className="ui-ko">{heroUploading ? "처리 중…" : "히어로 이미지 업로드 / 교체"}</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={heroUploading}
                onChange={(e) => void onPickFile(e.target.files)}
              />
            </label>
            {storagePath ? (
              <button
                type="button"
                className="btn btn--ghost btn--stack"
                disabled={heroUploading}
                onClick={() => void clearHero()}
              >
                <span className="ui-ko">히어로 제거</span>
              </button>
            ) : null}
          </div>
        </section>

        <section className="panel panel--light" style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
          <div className="panel__head">
            <h2 className="panel__title">홈 전체 배경</h2>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "var(--light-text-muted)", lineHeight: 1.5 }}>
            Storage 경로 <code>site_assets/landing_page_bg/</code> 에 저장됩니다. 이미지 10MB 이하, 동영상 40MB
            이하 권장. iOS 자동재생을 위해 동영상은 음성 트랙이 없거나 음소거로보낸 파일을 사용해 주세요.
          </p>
          {loading ? (
            <p>불러오는 중…</p>
          ) : pageBgUrl && pageBgMedia ? (
            <div
              style={{
                borderRadius: "var(--radius-ui)",
                overflow: "hidden",
                border: "1px solid rgba(15,23,42,0.08)",
                background: "#0f172a",
                maxHeight: "280px",
              }}
            >
              {pageBgMedia === "video" ? (
                <video
                  src={pageBgUrl}
                  controls
                  muted
                  loop
                  playsInline
                  style={{ width: "100%", maxHeight: "280px", display: "block", objectFit: "contain" }}
                />
              ) : (
                <img
                  src={pageBgUrl}
                  alt=""
                  style={{ width: "100%", height: "auto", maxHeight: "280px", objectFit: "contain", display: "block" }}
                />
              )}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>등록된 배경이 없습니다. 기본 그라데이션만 보입니다.</p>
          )}

          <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <label className="btn btn--primary btn--stack" style={{ cursor: pageBgUploading ? "wait" : "pointer" }}>
              <span className="ui-ko">{pageBgUploading ? "처리 중…" : "배경 이미지·동영상 업로드 / 교체"}</span>
              <input
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime,video/*"
                style={{ display: "none" }}
                disabled={pageBgUploading}
                onChange={(e) => void onPickPageBackground(e.target.files)}
              />
            </label>
            {pageBgPath ? (
              <button
                type="button"
                className="btn btn--ghost btn--stack"
                disabled={pageBgUploading}
                onClick={() => void clearPageBackground()}
              >
                <span className="ui-ko">배경 제거</span>
              </button>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
