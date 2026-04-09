import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

/** 승인된 선생님 또는 슈퍼관리자 */
export function TeacherRoute({ children }: { children: ReactNode }) {
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
    return <Navigate to="/login" replace />;
  }
  if (!canManageMaterials) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
