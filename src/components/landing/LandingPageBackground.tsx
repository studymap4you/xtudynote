import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import { SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC } from "@/lib/siteConfig";
import type { SiteConfigHomeDocument } from "@/lib/siteConfig";

/**
 * 홈(`LandingPage`) 전역 배경 — `site_config/home`의 경로·미디어 타입을 구독합니다.
 * fixed 레이어 + 본문은 상대 z-index로 위에 올립니다.
 */
export function LandingPageBackground() {
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [media, setMedia] = useState<"image" | "video" | null>(null);
  const [url, setUrl] = useState<string | null>(null);

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
      setUrl(null);
      return;
    }
    let cancelled = false;
    getDownloadURL(ref(storage, storagePath))
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (!url || !media) return null;

  return (
    <div
      className={`landing-page-bg${media === "video" ? " landing-page-bg--video" : ""}`}
      aria-hidden
    >
      {media === "video" ? (
        <video
          className="landing-page-bg__media"
          src={url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <img className="landing-page-bg__media" src={url} alt="" decoding="async" />
      )}
    </div>
  );
}
