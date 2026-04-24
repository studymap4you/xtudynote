import { PublicShell } from "@/components/PublicShell";
import "@/pages/pages.css";

export function LogicDashboardPage() {
  return (
    <PublicShell>
      <main className="admin-layout admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>Signal Logic</h1>
          <span className="ui-ko">논리 기반 분석</span>
        </div>
        <p style={{ color: "var(--text-muted)", maxWidth: "36rem" }}>
          <span className="ui-en">This dashboard is under construction.</span>{" "}
          <span className="ui-ko">대시보드 화면을 준비 중입니다.</span>
        </p>
      </main>
    </PublicShell>
  );
}
