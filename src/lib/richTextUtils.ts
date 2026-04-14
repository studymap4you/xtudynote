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
