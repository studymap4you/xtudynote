import { useMemo, useState } from "react";
import { plainTextFromHtml } from "@/lib/richTextUtils";
import { sanitizeRichHtml } from "@/lib/sanitizeRichHtml";
import "@/components/rich-text/rich-text.css";

type Props = {
  html: string;
  /** When plain-text length exceeds this, show collapse control */
  collapsedMaxChars?: number;
  className?: string;
};

export function CollapsibleRichHtml({ html, collapsedMaxChars = 480, className }: Props) {
  const [open, setOpen] = useState(false);

  const { safe, needToggle } = useMemo(() => {
    const safeInner = sanitizeRichHtml(html);
    const plain = plainTextFromHtml(safeInner);
    return {
      safe: safeInner,
      needToggle: plain.length > collapsedMaxChars,
    };
  }, [html, collapsedMaxChars]);

  if (!safe.trim()) return null;

  const collapsed = needToggle && !open;

  return (
    <div
      className={`collapsible-rich${collapsed ? " collapsible-rich--collapsed" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className={collapsed ? "collapsible-rich__inner collapsible-rich__inner--collapsed" : "collapsible-rich__inner"}>
        <div className="rich-html" dangerouslySetInnerHTML={{ __html: safe }} />
      </div>
      {collapsed && <div className="collapsible-rich__fade" aria-hidden />}
      {needToggle && (
        <button type="button" className="collapsible-rich__more" onClick={() => setOpen((v) => !v)}>
          {open ? "접기" : "더보기"}
        </button>
      )}
    </div>
  );
}
