import { useEffect } from "react";
import "@/pages/pages.css";

export function ClassroomSectionModal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="classroom-section-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="classroom-section-modal-title"
    >
      <button
        type="button"
        className="classroom-section-modal__backdrop"
        aria-label="창 닫기 (배경)"
        onClick={onClose}
      />
      <div className="classroom-section-modal__panel">
        <header className="classroom-section-modal__head">
          <div className="classroom-section-modal__head-text">
            <h2 id="classroom-section-modal-title" className="classroom-section-modal__title">
              {title}
            </h2>
            {subtitle ? <p className="classroom-section-modal__sub">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="classroom-section-modal__close-x"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>
        <div className="classroom-section-modal__body">{children}</div>
        <footer className="classroom-section-modal__foot">
          <button type="button" className="btn btn--primary btn--stack" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
