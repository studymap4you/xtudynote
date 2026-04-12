/** Firestore 동영상 신청 문서에서 재생 URL 목록을 정규화합니다. */
export function collectVideoUrlsFromRequest(x: {
  videoUrls?: unknown;
  videoUrl?: unknown;
}): string[] {
  if (Array.isArray(x.videoUrls)) {
    const fromArr = x.videoUrls.map((u) => String(u).trim()).filter(Boolean);
    if (fromArr.length > 0) return fromArr;
  }
  const one = String(x.videoUrl ?? "").trim();
  return one ? [one] : [];
}
