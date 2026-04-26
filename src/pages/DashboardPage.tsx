import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";
import { DashboardShell } from "@/components/DashboardShell";
import { StudentDashboard } from "@/pages/StudentDashboard";
import { ApprovedTeacherDashboard } from "@/pages/ApprovedTeacherDashboard";
import { PendingTeacherDashboard } from "@/pages/PendingTeacherDashboard";
import { SuperAdminDashboard } from "@/pages/SuperAdminDashboard";

export function DashboardPage() {
  const { isSuperAdmin, isPendingTeacher, isTeacherApproved, isStudent, profile } = useAuth();

  let body: ReactNode;
  if (isSuperAdmin) {
    body = <SuperAdminDashboard />;
  } else if (isPendingTeacher) {
    body = <PendingTeacherDashboard />;
  } else if (isTeacherApproved) {
    body = <ApprovedTeacherDashboard />;
  } else if (isStudent) {
    body = <StudentDashboard />;
  } else {
    body = (
      <main className="dashboard">
        <div className="dashboard__title-wrap">
          <h1 className="dashboard__title">Profile unavailable</h1>
          <span className="ui-ko">프로필을 불러올 수 없습니다</span>
        </div>
        <p className="dashboard__subtitle">
          <span className="ui-en">Role: {profile?.role ?? "—"}</span>
          <span className="ui-ko">역할 정보</span>
        </p>
      </main>
    );
  }

  return <DashboardShell light={!!isTeacherApproved}>{body}</DashboardShell>;
}
