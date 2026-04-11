import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

/** 승인된 선생님 또는 슈퍼관리자 */
export function TeacherRoute({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { loading, firebaseUser, profile, canManageMaterials } = useAuth();

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
  if (!canManageMaterials) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
