import { Link, NavLink } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

function adminPillClass({ isActive }: { isActive: boolean }): string {
  return `nav-pill${isActive ? " nav-pill--active" : ""}`;
}

/**
 * 슈퍼 관리자 전용 상단 바: 대시보드 복귀 + 콘텐츠 DB / 회원 관리 전환
 */
export function AdminTopNav() {
  const { firebaseUser, logOut } = useAuth();
  return (
    <header className="top-nav admin-top-nav">
      <div className="admin-top-nav__bar">
        <Link to="/dashboard" className="top-nav__brand">
          <BrandLockup />
        </Link>
        <nav className="admin-nav-tabs" aria-label="관리자 메뉴">
          <NavLink to="/admin/pending-materials" className={adminPillClass}>
            <span className="nav-pill__title">자료 검수 대기</span>
            <span className="nav-pill__sub">Pending reviews</span>
          </NavLink>
          <NavLink to="/admin/contents" className={adminPillClass}>
            <span className="nav-pill__title">콘텐츠 DB 관리</span>
            <span className="nav-pill__sub">Content database</span>
          </NavLink>
          <NavLink to="/admin/landing-hero" className={adminPillClass}>
            <span className="nav-pill__title">홈 배경</span>
            <span className="nav-pill__sub">Home background</span>
          </NavLink>
          <NavLink to="/admin/knowledge-curation" className={adminPillClass}>
            <span className="nav-pill__title">지식 큐레이션</span>
            <span className="nav-pill__sub">Knowledge curation</span>
          </NavLink>
          <NavLink to="/admin" className={adminPillClass} end>
            <span className="nav-pill__title">회원 관리</span>
            <span className="nav-pill__sub">Members</span>
          </NavLink>
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
