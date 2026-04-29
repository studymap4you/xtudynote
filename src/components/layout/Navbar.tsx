import { Link, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export type TopNavMainLinksProps = {
  /** Homework secondary line (e.g. dashboard uses "과제함") */
  homeworkKo?: string;
  /** Landing(바탕화면): 기존 글래스 고스트 스택 유지 — pill 스타일 미적용 */
  variant?: "default" | "landing";
};

function pillClass(isActive: boolean): string {
  return `nav-pill${isActive ? " nav-pill--active" : ""}`;
}

export function TopNavMainLinks({
  homeworkKo = "과제함",
  variant = "default",
}: TopNavMainLinksProps) {
  const { firebaseUser, isSuperAdmin, isTeacherApproved } = useAuth();
  const { pathname } = useLocation();

  const classroomActive =
    pathname.startsWith("/classroom") && !pathname.startsWith("/classrooms");

  if (variant === "landing") {
    return (
      <div className="top-nav__main-cluster">
        <Link to="/logic-dashboard" className="btn btn--ghost btn--stack top-nav__signal-link">
          <span className="ui-en top-nav__link-en-with-icon">
            <LayoutDashboard size={16} strokeWidth={2} aria-hidden />
            Signal Logic
          </span>
          <span className="ui-ko">시그널 로직</span>
        </Link>

        <Link to="/classrooms" className="btn btn--ghost btn--stack top-nav__nav-warm">
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

  return (
    <div className="top-nav__main-cluster">
      <NavLink to="/logic-dashboard" className={({ isActive }) => pillClass(isActive)} end>
        <span className="nav-pill__title nav-pill__title--with-icon">
          <LayoutDashboard size={15} strokeWidth={2} aria-hidden className="nav-pill__icon" />
          시그널 로직
        </span>
        <span className="nav-pill__sub">Signal Logic</span>
      </NavLink>

      <NavLink to="/classrooms" className={({ isActive }) => pillClass(isActive)}>
        <span className="nav-pill__title">강의 신청</span>
        <span className="nav-pill__sub">Courses</span>
      </NavLink>

      <NavLink to="/classroom" className={() => pillClass(classroomActive)}>
        <span className="nav-pill__title">내 강의실</span>
        <span className="nav-pill__sub">My classroom</span>
      </NavLink>

      <NavLink to="/homework" className={({ isActive }) => pillClass(isActive)}>
        <span className="nav-pill__title">{homeworkKo}</span>
        <span className="nav-pill__sub">Homework</span>
      </NavLink>

      {firebaseUser && isTeacherApproved && (
        <NavLink to="/classroom/new" className={({ isActive }) => pillClass(isActive)}>
          <span className="nav-pill__title">강의실 개설</span>
          <span className="nav-pill__sub">Create</span>
        </NavLink>
      )}

      {firebaseUser && isSuperAdmin && (
        <NavLink to="/admin" className={({ isActive }) => pillClass(isActive)} end>
          <span className="nav-pill__title">어드민</span>
          <span className="nav-pill__sub">Admin</span>
        </NavLink>
      )}
    </div>
  );
}
