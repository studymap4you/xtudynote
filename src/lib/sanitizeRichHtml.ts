import DOMPurify from "dompurify";

/** HTML이 아닌 기존 플레인 텍스트를 안전한 단락으로 감쌈 */
export function coerceStoredRichHtml(raw: string): string {
  const s = raw ?? "";
  if (!s.trim()) return "";
  if (/<[a-z\/!?]/i.test(s)) return s;
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${esc.replace(/\n/g, "<br/>")}</p>`;
}

const CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "img",
    "span",
    "div",
    "hr",
    "pre",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title", "class", "style"],
  ALLOW_DATA_ATTR: false,
};

function sanitizeInlineStyle(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const allowedProp = new Set(["color", "background-color", "font-size", "font-family", "text-align"]);
  const alignVal = new Set(["left", "center", "right", "justify"]);
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const p of parts) {
    const idx = p.indexOf(":");
    if (idx < 1) continue;
    const key = p.slice(0, idx).trim().toLowerCase();
    let val = p.slice(idx + 1).trim();
    if (!allowedProp.has(key)) continue;
    if (/url\s*\(/i.test(val) || /expression\s*\(/i.test(val) || /@import/i.test(val)) continue;
    if (val.length > 160) continue;
    if (key === "text-align" && !alignVal.has(val)) continue;
    kept.push(`${key}: ${val}`);
  }
  return kept.length ? kept.join("; ") : null;
}

let hooksReady = false;
function ensureHooks() {
  if (hooksReady || typeof document === "undefined") return;
  hooksReady = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeType !== 1) return;
    if (node.nodeName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
    const st = node.getAttribute("style");
    if (st != null) {
      const clean = sanitizeInlineStyle(st);
      if (clean) node.setAttribute("style", clean);
      else node.removeAttribute("style");
    }
  });
}

/** 저장·표시 공통: 플레인 레거시는 단락으로 감싼 뒤 정제 */
export function sanitizeRichHtml(dirty: string): string {
  ensureHooks();
  return DOMPurify.sanitize(coerceStoredRichHtml(dirty ?? ""), CONFIG as Parameters<typeof DOMPurify.sanitize>[1]);
}
