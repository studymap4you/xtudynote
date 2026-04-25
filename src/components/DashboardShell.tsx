import { Link } from "react-router-dom";
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
  const { firebaseUser, logOut, isSuperAdmin } = useAuth();

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
          <TopNavMainLinks homeworkKo="과제" />
        </nav>
        <div className="top-nav__tail">
          <span className="top-nav__email" title={firebaseUser?.email ?? ""}>
            {firebaseUser?.email}
          </span>
          {isSuperAdmin && (
            <Link to="/admin" className="btn btn--primary btn--stack top-nav__admin-btn">
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
