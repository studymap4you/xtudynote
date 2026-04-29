import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export type TopNavMainLinksProps = {
  /** Homework secondary line (e.g. dashboard uses "과제함") */
  homeworkKo?: string;
  /** 랜딩 홈: 강의 신청 탭만 따뜻한 톤 강조 */
  warmCoursesHighlight?: boolean;
};

function pillClass(isActive: boolean): string {
  return `nav-pill${isActive ? " nav-pill--active" : ""}`;
}

function classCourses(isActive: boolean, warm: boolean): string {
  const p = pillClass(isActive);
  return warm ? `${p} nav-pill--landing-warm`.trim() : p;
}

export function TopNavMainLinks({
  homeworkKo = "과제함",
  warmCoursesHighlight = false,
}: TopNavMainLinksProps) {
  const { firebaseUser, isSuperAdmin, isTeacherApproved } = useAuth();
  const { pathname } = useLocation();

  const classroomActive =
    pathname.startsWith("/classroom") && !pathname.startsWith("/classrooms");

  return (
    <div className="top-nav__main-cluster">
      <NavLink to="/logic-dashboard" className={({ isActive }) => pillClass(isActive)} end>
        <span className="nav-pill__title nav-pill__title--with-icon">
          <LayoutDashboard size={15} strokeWidth={2} aria-hidden className="nav-pill__icon" />
          시그널 로직
        </span>
        <span className="nav-pill__sub">Signal Logic</span>
      </NavLink>

      <NavLink
        to="/classrooms"
        className={({ isActive }) => classCourses(isActive, warmCoursesHighlight)}
      >
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
