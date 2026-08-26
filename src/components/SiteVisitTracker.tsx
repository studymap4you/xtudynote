import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const VISITOR_ID_KEY = "xtudy:visitor-id:v1";
const TRACK_COOLDOWN_MS = 30_000;

function visitorId() {
  try {
    const stored = window.localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;
    const created = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function SiteVisitTracker() {
  const { pathname } = useLocation();
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const cooldownKey = `xtudy:visit:${firebaseUser?.uid || "guest"}:${pathname}`;
    const now = Date.now();
    try {
      const lastTrackedAt = Number(window.sessionStorage.getItem(cooldownKey)) || 0;
      if (now - lastTrackedAt < TRACK_COOLDOWN_MS) return;
      window.sessionStorage.setItem(cooldownKey, String(now));
    } catch {
      // Session storage may be unavailable in strict privacy modes; tracking can still proceed.
    }

    let disposed = false;
    void (async () => {
      const token = firebaseUser ? await firebaseUser.getIdToken().catch(() => "") : "";
      if (disposed) return;
      await fetch("/api/billing?action=track-visit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ visitorId: visitorId(), path: pathname }),
        keepalive: true,
      }).catch(() => {});
    })();
    return () => { disposed = true; };
  }, [firebaseUser, pathname]);

  return null;
}
