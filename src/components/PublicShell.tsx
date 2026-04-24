import { Link } from "react-router-dom";
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
      <header className="top-nav">
        <Link to="/" className="top-nav__brand">
          <BrandLockup />
        </Link>
        <nav className="top-nav__actions" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <TopNavMainLinks />
          {firebaseUser ? (
            <Link to="/dashboard" className="btn btn--primary btn--stack">
              <span className="ui-en">Dashboard</span>
              <span className="ui-ko">대시보드</span>
            </Link>
          ) : (
            <Link to="/login" className="btn btn--primary btn--stack">
              <span className="ui-en">Log in</span>
              <span className="ui-ko">로그인</span>
            </Link>
          )}
        </nav>
      </header>
      {children}
    </div>
  );
}
