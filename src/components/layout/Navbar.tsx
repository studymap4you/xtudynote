import { Link } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export type TopNavMainLinksProps = {
  /** Homework secondary line (e.g. dashboard uses "과제함") */
  homeworkKo?: string;
};

export function TopNavMainLinks({ homeworkKo = "과제함" }: TopNavMainLinksProps) {
  const { firebaseUser, isSuperAdmin, isTeacherApproved } = useAuth();

  return (
    <div className="top-nav__main-cluster">
      <Link to="/logic-dashboard" className="btn btn--ghost btn--stack top-nav__signal-link">
        <span className="ui-en top-nav__link-en-with-icon">
          <LayoutDashboard size={16} strokeWidth={2} aria-hidden />
          Signal Logic
        </span>
        <span className="ui-ko">시그널 로직</span>
      </Link>

      <Link to="/library" className="btn btn--ghost btn--stack top-nav__nav-warm">
        <span className="ui-en">Courses</span>
        <span className="ui-ko">강의 신청</span>
      </Link>

      <Link to="/classroom" className="btn btn--ghost btn--stack">
        <span className="ui-en">My classroom</span>
        <span className="ui-ko">내 강의실</span>
      </Link>

      <Link to="/homework" className="btn btn--ghost btn--stack">
        <span className="ui-en">Homework</span>
        <span className="ui-ko">{homeworkKo}</span>
      </Link>

      {firebaseUser && isTeacherApproved && (
        <Link to="/classroom/new" className="btn btn--ghost btn--stack">
          <span className="ui-en">Create</span>
          <span className="ui-ko">강의실 개설</span>
        </Link>
      )}

      {firebaseUser && isSuperAdmin && (
        <Link to="/admin" className="btn btn--ghost btn--stack">
          <span className="ui-en">Admin</span>
          <span className="ui-ko">어드민</span>
        </Link>
      )}
    </div>
  );
}
