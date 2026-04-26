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
import { SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC } from "@/lib/siteConfig";
import type { SiteConfigHomeDocument } from "@/lib/siteConfig";
import "@/pages/pages.css";

const MAX_PAGE_BG_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PAGE_BG_VIDEO_BYTES = 40 * 1024 * 1024;

function safeBaseName(name: string): string {
  const base = name.replace(/\.[^/.]+$/, "");
  const s = base.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_").slice(0, 80);
  return s || "file";
}

function inferImageMimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

function inferVideoMimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "m4v":
      return "video/x-m4v";
    default:
      return "video/mp4";
  }
}

async function tryDeleteStoragePath(path: string | null | undefined) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // stale or already removed
  }
}

/** `/admin/landing-hero` — 홈 전체 배경 이미지·동영상만 관리 */
export function LandingHeroAdminPage() {
  const [loading, setLoading] = useState(true);
  const [pageBgUploading, setPageBgUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pageBgPath, setPageBgPath] = useState<string | null>(null);
  const [pageBgMedia, setPageBgMedia] = useState<"image" | "video" | null>(null);
  const [pageBgUrl, setPageBgUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
      (snap) => {
        const d = snap.data() as SiteConfigHomeDocument | undefined;
        const bp = d?.landingPageBackgroundPath;
        setPageBgPath(typeof bp === "string" && bp.length > 0 ? bp : null);
        const m = d?.landingPageBackgroundMedia;
        setPageBgMedia(m === "image" || m === "video" ? m : null);
        setLoading(false);
      },
      () => {
        setPageBgPath(null);
        setPageBgMedia(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

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
      const rawType = file.type?.trim() ?? "";
      const contentType =
        rawType && (rawType.startsWith("image/") || rawType.startsWith("video/"))
          ? rawType
          : isVideo
            ? inferVideoMimeFromExt(ext)
            : inferImageMimeFromExt(ext);
      try {
        await uploadBytes(ref(storage, objectPath), file, { contentType });
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
          <h1>Home page background</h1>
          <span className="ui-ko">홈 화면 전체 배경</span>
        </div>
        <p style={{ color: "var(--light-text-muted)", maxWidth: "46rem" }}>
          홈 최상단부터 본문까지 뒤에 깔리는 배경입니다. 이미지 또는 짧은 동영상(mp4/webm 등)을 올릴 수 있으며,
          동영상은 자동 반복·음소거로 재생됩니다.
        </p>
        {error ? (
          <p role="alert" style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem", maxWidth: "46rem" }}>
            {error}
          </p>
        ) : null}

        <section className="panel panel--light" style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
          <div className="panel__head">
            <h2 className="panel__title">배경 미디어</h2>
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
