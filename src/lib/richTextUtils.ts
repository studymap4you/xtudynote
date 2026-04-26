/** Plain text for previews, search, and empty checks (client). */
export function plainTextFromHtml(html: string): string {
  const raw = html ?? "";
  if (typeof document === "undefined") {
    return raw
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const d = document.createElement("div");
  d.innerHTML = raw;
  const t = d.textContent ?? d.innerText ?? "";
  return t.replace(/\s+/g, " ").trim();
}

/** True when Quill/HTML has no meaningful text. */
export function isEmptyRichText(html: string): boolean {
  return plainTextFromHtml(html).length === 0;
}

export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `<img src>` 목록 (상세 설명 미리보기·슬라이드용). 순서 유지, 중복 제거. */
export function extractImageSrcsFromHtml(html: string): string[] {
  const raw = html?.trim() ?? "";
  if (!raw) return [];
  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const out: string[] = [];
    const seen = new Set<string>();
    doc.querySelectorAll("img[src]").forEach((el) => {
      const src = el.getAttribute("src")?.trim();
      if (!src || seen.has(src)) return;
      seen.add(src);
      out.push(src);
    });
    return out;
  } catch {
    return [];
  }
}
