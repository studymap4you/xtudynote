import { Link, NavLink } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { TopNavMainLinks } from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

export function PublicShell({
  children,
  light = true,
}: {
  children: React.ReactNode;
  /** Library·상세·과제 검색 등 라이트 테마 (기본 true) */
  light?: boolean;
}) {
  const { firebaseUser } = useAuth();

  return (
    <div className={light ? "app-shell app-shell--light" : "app-shell"}>
      <header className="top-nav top-nav--split">
        <Link to="/" className="top-nav__brand">
          <BrandLockup />
        </Link>
        <nav className="top-nav__center" aria-label="주요 메뉴">
          <TopNavMainLinks />
        </nav>
        <div className="top-nav__tail">
          {firebaseUser ? (
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `nav-pill nav-pill--cta${isActive ? " nav-pill--active" : ""}`}
              end
            >
              <span className="nav-pill__title">대시보드</span>
              <span className="nav-pill__sub">Dashboard</span>
            </NavLink>
          ) : (
            <NavLink to="/login" className="nav-pill nav-pill--cta">
              <span className="nav-pill__title">로그인</span>
              <span className="nav-pill__sub">Log in</span>
            </NavLink>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
