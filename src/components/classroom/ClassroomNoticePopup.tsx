import type { ClassroomNoticeDocument } from "@/types/classroom";
import "@/pages/pages.css";

type Row = { id: string; data: ClassroomNoticeDocument };

function tsLabel(t: unknown): string {
  if (t && typeof t === "object" && "toMillis" in t && typeof (t as { toMillis: () => number }).toMillis === "function") {
    try {
      return new Date((t as { toMillis: () => number }).toMillis()).toLocaleString();
    } catch {
      return "";
    }
  }
  return "";
}

export function ClassroomNoticePopup({
  open,
  classroomTitle,
  rows,
  onClose,
}: {
  open: boolean;
  classroomTitle: string;
  rows: Row[];
  onClose: () => void;
}) {
  if (!open || rows.length === 0) return null;

  return (
    <div className="classroom-notices-popup" role="dialog" aria-modal="true" aria-labelledby="classroom-notices-popup-title">
      <button
        type="button"
        className="classroom-notices-popup__backdrop"
        aria-label="공지 닫기 (배경)"
        onClick={onClose}
      />
      <div className="classroom-notices-popup__panel">
        <h2 id="classroom-notices-popup-title" className="classroom-notices-popup__title">
          공지사항
        </h2>
        <p className="classroom-notices-popup__room-name">{classroomTitle}</p>
        <ul className="classroom-notices-popup__list">
          {rows.map((r) => (
            <li key={r.id} className="classroom-notices-popup__item">
              <p className="classroom-notices-popup__body">{r.data.body}</p>
              <p className="classroom-notices-popup__meta">{tsLabel(r.data.createdAt)}</p>
            </li>
          ))}
        </ul>
        <div className="classroom-notices-popup__actions">
          <button type="button" className="btn btn--primary btn--stack" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
