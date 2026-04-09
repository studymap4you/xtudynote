import "@/pages/pages.css";

export function ApprovedTeacherDashboard() {
  return (
    <main className="dashboard">
      <div className="dashboard__title-wrap">
        <h1 className="dashboard__title">Educator workspace</h1>
        <span className="ui-ko">교육자 워크스페이스</span>
      </div>
      <p className="dashboard__subtitle">
        <span className="ui-en">
          Verified profile — organize cohorts, publish learning assets, and tie them to
          logic-based feedback.
        </span>
        <span className="ui-ko">
          검증된 계정입니다. 학습 그룹·자료·논리 기반 피드백을 연결하는 작업 공간입니다.
        </span>
      </p>
      <div className="dashboard-grid dashboard-grid--teacher">
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Learning materials</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                학습 자료 · 콘텐츠
              </span>
            </div>
            <span className="panel__badge panel__badge--ok">Teacher</span>
          </div>
          <p className="materials-placeholder">
            <span className="ui-en">Upload, edit, and distribute resources for any discipline.</span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.5rem" }}>
              분야를 가리지 않고 자료를 업로드·편집·배포하는 기능이 이 영역에 연결됩니다.
            </span>
          </p>
        </section>
        <aside className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Cohorts overview</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                학습 그룹 요약
              </span>
            </div>
          </div>
          <div className="badge-row">
            <span className="stat-pill">
              <span className="ui-en">
                <strong>0</strong> active cohorts
              </span>
              <span className="ui-ko">활성 그룹 0</span>
            </span>
            <span className="stat-pill">
              <span className="ui-en">
                <strong>0</strong> learners
              </span>
              <span className="ui-ko">학습자 0</span>
            </span>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "1rem" }}>
            <span className="ui-en">Schedules and alerts will land in this column.</span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
              일정·알림은 이 패널에 정리됩니다.
            </span>
          </p>
        </aside>
      </div>
    </main>
  );
}
