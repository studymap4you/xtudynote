import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { firebaseUser, logOut, isSuperAdmin } = useAuth();

  return (
    <div className="app-shell">
      <header className="top-nav">
        <Link to="/dashboard" className="top-nav__brand">
          XtudyNote
        </Link>
        <div className="top-nav__actions">
          <Link to="/library" className="btn btn--ghost btn--stack">
            <span className="ui-en">Library</span>
            <span className="ui-ko">라이브러리</span>
          </Link>
          <Link to="/homework" className="btn btn--ghost btn--stack">
            <span className="ui-en">Homework</span>
            <span className="ui-ko">과제</span>
          </Link>
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
