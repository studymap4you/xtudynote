import { useCallback, useEffect, useState } from "react";
import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Link } from "react-router-dom";
import { AdminTopNav } from "@/components/AdminTopNav";
import { db, storage } from "@/firebase/config";
import {
  LANDING_HERO_DEFAULT_MAX_H_PX,
  LANDING_HERO_DEFAULT_MAX_W_PX,
  SITE_CONFIG_COLLECTION,
  SITE_CONFIG_HOME_DOC,
} from "@/lib/siteConfig";
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
  const [uploading, setUploading] = useState(false);
  const [savingDims, setSavingDims] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
      (snap) => {
        const d = snap.data();
        const p = d?.landingHeroImagePath;
        setStoragePath(typeof p === "string" && p.length > 0 ? p : null);
        const w = d?.landingHeroImageMaxWidthPx;
        const h = d?.landingHeroImageMaxHeightPx;
        setMaxWPx(typeof w === "number" && clampPxInput(w) ? w : null);
        setMaxHPx(typeof h === "number" && clampPxInput(h) ? h : null);
        setLoading(false);
      },
      () => {
        setStoragePath(null);
        setMaxWPx(null);
        setMaxHPx(null);
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
        const homeRef = doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC);
        const before = await getDoc(homeRef);
        const bd = before.data();
        const payload: Record<string, unknown> = {
          landingHeroImagePath: objectPath,
          updatedAt: serverTimestamp(),
        };
        if (bd?.landingHeroImageMaxWidthPx == null) {
          payload.landingHeroImageMaxWidthPx = LANDING_HERO_DEFAULT_MAX_W_PX;
        }
        if (bd?.landingHeroImageMaxHeightPx == null) {
          payload.landingHeroImageMaxHeightPx = LANDING_HERO_DEFAULT_MAX_H_PX;
        }
        await setDoc(homeRef, payload, { merge: true });
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
    setUploading(true);
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
          홈 왼쪽에서 <strong>브랜드·슬로건·부제 문구가 있던 영역 전체</strong>를 이 이미지가 덮고, 그{" "}
          <strong>바로 아래</strong>부터 공유·링크 복사가 이어집니다. 오른쪽(로그인·검색·바로가기)과 그 아래
          강의실 블록은 동일합니다. 필요 시 최대 너비·높이(px)로 블록 크기를 제한할 수 있습니다. PNG·JPG·WebP
          등, 5MB 이하.
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
