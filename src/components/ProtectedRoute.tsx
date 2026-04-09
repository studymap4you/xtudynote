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
