import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RichHtmlView } from "@/components/RichHtmlView";
import { useAuth } from "@/contexts/AuthContext";
import { setPendingEnrollClassroomId } from "@/lib/classroom/classroomPublicListing";
import extra from "@/pages/marketExtras.module.css";

export type ClassroomPromoDetailModel = {
  classroomId: string;
  title: string;
  html: string;
  priceLine: string | null;
};

type Props = {
  open: boolean;
  model: ClassroomPromoDetailModel | null;
  onClose: () => void;
};

export function ClassroomPromoDetailModal({ open, model, onClose }: Props) {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !model) return null;

  const active = model;

  function goEnroll() {
    setPendingEnrollClassroomId(active.classroomId);
    onClose();
    if (!firebaseUser) {
      void navigate("/login?audience=learner&next=/classrooms");
    } else {
      void navigate("/classrooms");
    }
  }

  return (
    <div
      className={extra.marketModalRoot}
      role="dialog"
      aria-modal="true"
      aria-labelledby="classroom-promo-modal-title"
    >
      <button type="button" className={extra.marketModalBackdrop} aria-label="닫기" onClick={onClose} />
      <div className={extra.marketModalPanel}>
        <h2 id="classroom-promo-modal-title" className={extra.marketModalTitle}>
          {active.title}
        </h2>
        {active.priceLine ? (
          <p className={extra.marketModalPrice} aria-label="가격">
            {active.priceLine}
          </p>
        ) : null}
        <div className={extra.marketModalScroll}>
          <RichHtmlView html={active.html} className={extra.marketModalRich} />
        </div>
        <div className={extra.marketModalFooter}>
          <button type="button" className="btn btn--ghost btn--stack" onClick={onClose}>
            <span className="ui-ko">닫기</span>
            <span className="ui-en">Close</span>
          </button>
          <button type="button" className="btn btn--primary btn--stack" onClick={goEnroll}>
            <span className="ui-ko">강의 신청</span>
            <span className="ui-en">Enroll</span>
          </button>
        </div>
      </div>
    </div>
  );
}
