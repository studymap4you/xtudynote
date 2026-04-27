import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import { SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC } from "@/lib/siteConfig";
import type { SiteConfigHomeDocument } from "@/lib/siteConfig";

/** Bright / tech / networking 톤 — Unsplash (고해상도, 공개 라이선스) */
export const LANDING_DEFAULT_BG_IMAGE =
  "https://images.unsplash.com/photo-1510218830377-1e9c21703b1d?auto=format&fit=crop&q=80&w=2000";

/**
 * 홈(`LandingPage` 등) 전역 배경 — `site_config/home` 경로가 있으면 해당 미디어를 쓰고,
 * 없으면 기본 Unsplash 이미지를 사용합니다. fixed 레이어 + 본문은 z-index로 위에 둡니다.
 */
export function LandingPageBackground() {
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [media, setMedia] = useState<"image" | "video" | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
      (snap) => {
        const d = snap.data() as SiteConfigHomeDocument | undefined;
        const p = d?.landingPageBackgroundPath;
        setStoragePath(typeof p === "string" && p.length > 0 ? p : null);
        const m = d?.landingPageBackgroundMedia;
        let resolved: "image" | "video" | null = m === "image" || m === "video" ? m : null;
        if (!resolved && typeof p === "string" && p.length > 0) {
          if (/\.(mp4|webm|mov|m4v)$/i.test(p)) resolved = "video";
          else resolved = "image";
        }
        setMedia(resolved);
      },
      () => {
        setStoragePath(null);
        setMedia(null);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!storagePath) {
      setAdminUrl(null);
      return;
    }
    let cancelled = false;
    getDownloadURL(ref(storage, storagePath))
      .then((u) => {
        if (!cancelled) setAdminUrl(u);
      })
      .catch(() => {
        if (!cancelled) setAdminUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  const useVideo = media === "video" && !!adminUrl;
  const imageSrc = adminUrl ?? LANDING_DEFAULT_BG_IMAGE;

  return (
    <div className={`landing-page-bg${useVideo ? " landing-page-bg--video" : ""}`} aria-hidden>
      <div className="landing-page-bg__scene">
        {useVideo ? (
          <video
            className="landing-page-bg__media landing-page-bg__media--video"
            src={adminUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <img className="landing-page-bg__media" src={imageSrc} alt="" decoding="async" />
        )}
      </div>
      <div className="landing-page-bg__veil" />
    </div>
  );
}
