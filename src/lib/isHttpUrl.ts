/** 붙여넣기 시 흔한 BOM·ZW 공백 제거 후 앞뒤 공백만 다룹니다. */
export function normalizeExternalUrl(raw: unknown): string {
  if (raw == null) return "";
  const s = typeof raw === "string" ? raw : String(raw);
  return s.trim().replace(/^[\uFEFF\u200B-\u200D\u2060]+/, "").replace(/[\uFEFF\u200B-\u200D\u2060]+$/, "");
}

/** `http:` 또는 `https:` 만 허용하는 단순 URL 검사 */
export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
