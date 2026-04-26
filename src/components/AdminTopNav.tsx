import { Link, NavLink } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import "@/pages/pages.css";

function tabClassName({ isActive }: { isActive: boolean }): string {
  return `admin-nav-tabs__link${isActive ? " admin-nav-tabs__link--active" : ""}`;
}

/**
 * 슈퍼 관리자 전용 상단 바: 대시보드 복귀 + 콘텐츠 DB / 회원 관리 전환
 */
export function AdminTopNav() {
  return (
    <header className="top-nav admin-top-nav">
      <div className="admin-top-nav__bar">
        <Link to="/dashboard" className="top-nav__brand">
          <BrandLockup />
        </Link>
        <nav className="admin-nav-tabs" aria-label="관리자 메뉴">
          <NavLink to="/admin/pending-materials" className={tabClassName}>
            <span className="admin-nav-tabs__title">자료 검수 대기</span>
            <span className="admin-nav-tabs__en">Pending reviews</span>
          </NavLink>
          <NavLink to="/admin/contents" className={tabClassName}>
            <span className="admin-nav-tabs__title">콘텐츠 DB 관리</span>
            <span className="admin-nav-tabs__en">Content database</span>
          </NavLink>
          <NavLink to="/admin/landing-hero" className={tabClassName}>
            <span className="admin-nav-tabs__title">홈 배경</span>
            <span className="admin-nav-tabs__en">Home background</span>
          </NavLink>
          <NavLink to="/admin/knowledge-curation" className={tabClassName}>
            <span className="admin-nav-tabs__title">지식 큐레이션</span>
            <span className="admin-nav-tabs__en">Knowledge curation</span>
          </NavLink>
          <NavLink to="/admin" className={tabClassName} end>
            <span className="admin-nav-tabs__title">회원 관리</span>
            <span className="admin-nav-tabs__en">Members</span>
          </NavLink>
        </nav>
        <div className="admin-top-nav__actions">
          <Link to="/dashboard" className="btn btn--ghost btn--stack">
            <span className="ui-en">Dashboard</span>
            <span className="ui-ko">대시보드</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
