import { Link, NavLink } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { TopNavMainLinks } from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

export function DashboardShell({
  children,
  light,
  adminChrome,
}: {
  children: React.ReactNode;
  /** 통계·자료 등록 등 라이트 본문 (대시보드 홈은 기본 다크 유지) */
  light?: boolean;
  /** 관리자 서브화면: 은은한 배경·본문 글래스 카드 */
  adminChrome?: boolean;
}) {
  const { firebaseUser, logOut } = useAuth();

  const shellClass = [light ? "app-shell app-shell--light" : "app-shell", adminChrome ? "app-shell--admin" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <header className="top-nav top-nav--split">
        <Link to="/" className="top-nav__brand">
          <BrandLockup />
        </Link>
        <nav className="top-nav__center" aria-label="주요 메뉴">
          <TopNavMainLinks />
        </nav>
        <div className="top-nav__tail">
          <NavLink to="/billing" className="nav-pill nav-pill--tail">
            <span className="nav-pill__title">구독</span>
            <span className="nav-pill__sub">Billing</span>
          </NavLink>
          <span className="top-nav__email" title={firebaseUser?.email ?? ""}>
            {firebaseUser?.email}
          </span>
          <button type="button" className="nav-pill nav-pill--tail nav-pill--button" onClick={() => void logOut()}>
            <span className="nav-pill__title">로그아웃</span>
            <span className="nav-pill__sub">Log out</span>
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
