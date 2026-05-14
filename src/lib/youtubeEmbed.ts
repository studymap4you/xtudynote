/** YouTube 동영상 ID (일반적으로 11자) */
const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * 일반 YouTube 시청 URL·shorts·embed·youtu.be 에서 video id 추출.
 * 실패 시 null.
 */
export function extractYouTubeVideoId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0]?.trim() ?? "";
    return YT_ID_RE.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const path = url.pathname;
    if (path.startsWith("/embed/")) {
      const id = path.slice("/embed/".length).split("/")[0]?.trim() ?? "";
      return YT_ID_RE.test(id) ? id : null;
    }
    if (path.startsWith("/shorts/")) {
      const id = path.slice("/shorts/".length).split("/")[0]?.trim() ?? "";
      return YT_ID_RE.test(id) ? id : null;
    }
    if (path.startsWith("/live/")) {
      const id = path.slice("/live/".length).split("/")[0]?.trim() ?? "";
      return YT_ID_RE.test(id) ? id : null;
    }
    const v = url.searchParams.get("v")?.trim() ?? "";
    if (YT_ID_RE.test(v)) return v;
  }

  return null;
}

/** iframe src — 요청 형식: https://www.youtube.com/embed/VIDEO_ID */
export function buildYouTubeEmbedSrc(videoId: string): string {
  const id = videoId.trim();
  if (!YT_ID_RE.test(id)) return "";
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
}

export type ParsedLectureUrl =
  | { kind: "youtube"; original: string; videoId: string; embedSrc: string }
  | { kind: "other"; original: string };

export function parseLectureUrls(urls: readonly string[]): ParsedLectureUrl[] {
  return urls.map((original) => {
    const trimmed = original.trim();
    if (!trimmed) return { kind: "other", original: "" };
    const videoId = extractYouTubeVideoId(trimmed);
    if (videoId) {
      const embedSrc = buildYouTubeEmbedSrc(videoId);
      return { kind: "youtube", original: trimmed, videoId, embedSrc };
    }
    return { kind: "other", original: trimmed };
  });
}
