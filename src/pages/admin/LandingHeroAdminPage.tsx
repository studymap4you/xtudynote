import { useCallback, useEffect, useState } from "react";
import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Link } from "react-router-dom";
import { AdminTopNav } from "@/components/AdminTopNav";
import { db, storage } from "@/firebase/config";
import { SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC } from "@/lib/siteConfig";
import "@/pages/pages.css";

const MAX_BYTES = 5 * 1024 * 1024;

function safeBaseName(name: string): string {
  const base = name.replace(/\.[^/.]+$/, "");
  const s = base.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_").slice(0, 80);
  return s || "image";
}

async function tryDeleteStoragePath(path: string | null | undefined) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // stale or already removed
  }
}

export function LandingHeroAdminPage() {
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
      (snap) => {
        const p = snap.data()?.landingHeroImagePath;
        setStoragePath(typeof p === "string" && p.length > 0 ? p : null);
        setLoading(false);
      },
      () => {
        setStoragePath(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

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

  const onPickFile = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("이미지 파일만 업로드할 수 있습니다.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("5MB 이하 이미지로 올려 주세요.");
        return;
      }
      setUploading(true);
      const prev = storagePath;
      const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
      const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
      const objectPath = `site_assets/landing_hero/${Date.now()}_${safeBaseName(file.name)}.${ext}`;
      try {
        await uploadBytes(ref(storage, objectPath), file, { contentType: file.type });
        await setDoc(
          doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
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
        setUploading(false);
      }
    },
    [storagePath]
  );

  async function clearHero() {
    setError(null);
    const prev = storagePath;
    setUploading(true);
    try {
      await setDoc(
        doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
        {
          landingHeroImagePath: deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await tryDeleteStoragePath(prev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "제거에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app-shell">
      <AdminTopNav />
      <main className="admin-layout admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>Landing hero image</h1>
          <span className="ui-ko">홈 히어로 메인 비주얼</span>
        </div>
        <p style={{ color: "var(--text-muted)", maxWidth: "42rem" }}>
          이미지를 등록하면 홈 화면에서 <strong>왼쪽 슬로건·브랜드 영역은 숨겨지고</strong>, 그 자리를 이 이미지가
          채웁니다. 오른쪽(로그인 카드·검색·바로가기)은 그대로입니다. 이미지를 제거하면 예전 텍스트 히어로로
          돌아갑니다. PNG·JPG·WebP 등, 5MB 이하를 권장합니다.
        </p>

        <section className="panel panel--light" style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
          <div className="panel__head">
            <h2 className="panel__title">현재 이미지</h2>
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
            <p style={{ color: "var(--text-muted)" }}>등록된 이미지가 없습니다. 랜딩 오른쪽은 비어 있는 상태입니다.</p>
          )}

          <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <label className="btn btn--primary btn--stack" style={{ cursor: uploading ? "wait" : "pointer" }}>
              <span className="ui-ko">{uploading ? "처리 중…" : "이미지 업로드 / 교체"}</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => void onPickFile(e.target.files)}
              />
            </label>
            {storagePath ? (
              <button
                type="button"
                className="btn btn--ghost btn--stack"
                disabled={uploading}
                onClick={() => void clearHero()}
              >
                <span className="ui-ko">이미지 제거</span>
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem" }}>
              {error}
            </p>
          ) : null}
        </section>

        <p style={{ marginTop: "1.5rem" }}>
          <Link to="/admin/premium-vault" className="btn btn--ghost btn--stack">
            ← 프리미엄 볼트
          </Link>
        </p>
      </main>
    </div>
  );
}
