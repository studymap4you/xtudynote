import { Link } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { TopNavMainLinks } from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

export function DashboardShell({
  children,
  light,
}: {
  children: React.ReactNode;
  /** 통계·자료 등록 등 라이트 본문 (대시보드 홈은 기본 다크 유지) */
  light?: boolean;
}) {
  const { firebaseUser, logOut, isSuperAdmin } = useAuth();

  return (
    <div className={light ? "app-shell app-shell--light" : "app-shell"}>
      <header className="top-nav">
        <Link to="/" className="top-nav__brand">
          <BrandLockup />
        </Link>
        <div className="top-nav__actions">
          <TopNavMainLinks homeworkKo="과제" />
          <span className="top-nav__email" title={firebaseUser?.email ?? ""}>
            {firebaseUser?.email}
          </span>
          {isSuperAdmin && (
            <Link to="/admin" className="btn btn--primary btn--stack">
              <span className="ui-en">Admin Panel</span>
              <span className="ui-ko">관리자</span>
            </Link>
          )}
          <button type="button" className="btn btn--ghost btn--stack" onClick={() => logOut()}>
            <span className="ui-en">Log out</span>
            <span className="ui-ko">로그아웃</span>
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
