import { Link, NavLink, useLocation } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

function adminPillClass({ isActive }: { isActive: boolean }): string {
  return `nav-pill${isActive ? " nav-pill--active" : ""}`;
}

function useMaterialsNavActive(): boolean {
  const { pathname } = useLocation();
  return (
    pathname === "/admin/materials" ||
    pathname.startsWith("/admin/contents") ||
    pathname.startsWith("/admin/pending-materials") ||
    pathname.startsWith("/admin/landing-hero") ||
    pathname.startsWith("/admin/knowledge-curation")
  );
}

/**
 * 슈퍼 관리자 전용 상단 바: 회원 / 강의실 / 자료(허브 및 세부 경로) + 대시보드 복귀
 */
export function AdminTopNav() {
  const { firebaseUser, logOut } = useAuth();
  const materialsActive = useMaterialsNavActive();

  return (
    <header className="top-nav admin-top-nav">
      <div className="admin-top-nav__bar">
        <Link to="/dashboard" className="top-nav__brand">
          <BrandLockup />
        </Link>
        <nav className="admin-nav-tabs" aria-label="관리자 메뉴">
          <NavLink to="/admin" className={adminPillClass} end>
            <span className="nav-pill__title">전체 회원관리</span>
            <span className="nav-pill__sub">All members</span>
          </NavLink>
          <NavLink to="/admin/classrooms" className={adminPillClass}>
            <span className="nav-pill__title">전체 강의실관리</span>
            <span className="nav-pill__sub">All classrooms</span>
          </NavLink>
          <Link
            to="/admin/materials"
            className={adminPillClass({ isActive: materialsActive })}
          >
            <span className="nav-pill__title">전체 자료관리</span>
            <span className="nav-pill__sub">All materials</span>
          </Link>
        </nav>
        <div className="admin-top-nav__actions">
          <Link to="/dashboard" className="nav-pill nav-pill--tail">
            <span className="nav-pill__title">대시보드</span>
            <span className="nav-pill__sub">Dashboard</span>
          </Link>
          <span className="top-nav__email admin-top-nav__email" title={firebaseUser?.email ?? ""}>
            {firebaseUser?.email}
          </span>
          <button type="button" className="nav-pill nav-pill--tail nav-pill--button" onClick={() => void logOut()}>
            <span className="nav-pill__title">로그아웃</span>
            <span className="nav-pill__sub">Log out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
