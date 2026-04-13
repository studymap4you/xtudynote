import { useMemo, useState } from "react";

type Props = {
  text: string;
  /** 접힘 상태에서 보일 최대 글자 수 */
  collapsedMaxChars?: number;
  className?: string;
};

export function CollapsibleDescription({ text, collapsedMaxChars = 180, className }: Props) {
  const [open, setOpen] = useState(false);

  const { needToggle, shortText, fullText } = useMemo(() => {
    const t = text.trim();
    if (t.length <= collapsedMaxChars) {
      return { needToggle: false, shortText: t, fullText: t };
    }
    return {
      needToggle: true,
      shortText: t.slice(0, collapsedMaxChars).trimEnd() + "…",
      fullText: t,
    };
  }, [text, collapsedMaxChars]);

  if (!fullText) return null;

  return (
    <div className={className}>
      <p className="collapsible-desc__body">{open || !needToggle ? fullText : shortText}</p>
      {needToggle && (
        <button type="button" className="collapsible-desc__more" onClick={() => setOpen((v) => !v)}>
          {open ? "접기" : "더보기"}
        </button>
      )}
    </div>
  );
}
