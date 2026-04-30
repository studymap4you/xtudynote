import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth();
  const loc = useLocation();

  if (loading || (firebaseUser && !profile)) {
    return (
      <div className="route-loading" aria-busy="true">
        <div className="route-loading__spinner" />
        <p>
          <span className="ui-en">Connecting…</span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
            연결 중…
          </span>
        </p>
      </div>
    );
  }
  if (!firebaseUser || !profile) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }
  if (profile.accountStatus === "banned") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/**
 * 콘텐츠 DB 목록(`/admin/contents`) — 마스터·선생님·학생(본인 등록분만 삭제 UI).
 * 승인된 일반 기능 계정만 허용합니다.
 */
export function ContentDbManageRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth();
  const loc = useLocation();

  if (loading || (firebaseUser && !profile)) {
    return (
      <div className="route-loading" aria-busy="true">
        <div className="route-loading__spinner" />
        <p>
          <span className="ui-en">Connecting…</span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
            연결 중…
          </span>
        </p>
      </div>
    );
  }
  if (!firebaseUser || !profile) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }
  if (profile.accountStatus === "banned") {
    return <Navigate to="/" replace />;
  }
  const ok =
    profile.role === "super_admin" || profile.role === "teacher" || profile.role === "student";
  if (!ok) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

/**
 * `/logic-dashboard` — 비회원 공개. 로그인 시 차단 계정만 홈으로 보냄 (시그널 로직은 홈 박스·직접 URL 등).
 */
export function LogicDashboardGate({ children }: { children: React.ReactNode }) {
  const { loading, firebaseUser, profile } = useAuth();

  if (loading || (firebaseUser && !profile)) {
    return (
      <div className="route-loading" aria-busy="true">
        <div className="route-loading__spinner" />
        <p>
          <span className="ui-en">Connecting…</span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
            연결 중…
          </span>
        </p>
      </div>
    );
  }
  if (firebaseUser && profile && profile.accountStatus === "banned") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading, firebaseUser, profile } = useAuth();

  if (loading || (firebaseUser && !profile)) {
    return (
      <div className="route-loading" aria-busy="true">
        <div className="route-loading__spinner" />
        <p>
          <span className="ui-en">Connecting…</span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
            연결 중…
          </span>
        </p>
      </div>
    );
  }
  if (!firebaseUser || !profile) {
    return <Navigate to="/login" replace />;
  }
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
