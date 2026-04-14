import { sanitizeRichHtml } from "@/lib/sanitizeRichHtml";
import "@/components/rich-text/rich-text.css";

type Props = {
  html: string;
  className?: string;
};

/** Renders sanitized rich HTML (introductions, Q&A). */
export function RichHtmlView({ html, className }: Props) {
  const safe = sanitizeRichHtml(html);
  if (!safe.trim()) return null;
  return (
    <div
      className={`rich-html${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
