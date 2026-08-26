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
  const { firebaseUser, logOut } = useAuth();

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
            <>
              <NavLink to="/billing" className="nav-pill nav-pill--tail">
                <span className="nav-pill__title">구독</span>
                <span className="nav-pill__sub">Billing</span>
              </NavLink>
              <span className="top-nav__email" title={firebaseUser.email ?? ""}>
                {firebaseUser.email}
              </span>
              <button
                type="button"
                className="nav-pill nav-pill--tail nav-pill--button"
                onClick={() => void logOut()}
              >
                <span className="nav-pill__title">로그아웃</span>
                <span className="nav-pill__sub">Log out</span>
              </button>
            </>
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
