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
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title", "class"],
  ALLOW_DATA_ATTR: false,
};

let hooksReady = false;
function ensureHooks() {
  if (hooksReady || typeof document === "undefined") return;
  hooksReady = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/** 저장·표시 공통: 플레인 레거시는 단락으로 감싼 뒤 정제 */
export function sanitizeRichHtml(dirty: string): string {
  ensureHooks();
  return DOMPurify.sanitize(coerceStoredRichHtml(dirty ?? ""), CONFIG as Parameters<typeof DOMPurify.sanitize>[1]);
}
