/** Word 내보내기 공통 — 본문에서 ** 마크다운 볼드 표기 제거 */
export function stripMarkdownBold(raw: string): string {
  return raw.replace(/\*\*/g, "");
}

export function safeDocxFilenamePart(raw: string, fallback: string): string {
  const t = raw.replace(/[/\\?%*:|"<>]/g, "_").trim().slice(0, 72);
  return t || fallback;
}

export function triggerDocxDownload(blob: Blob, filename: string): void {
  const name = filename.replace(/[/\\?%*:|"<>]/g, "_");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".docx") ? name : `${name}.docx`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
