import { Link } from "react-router-dom";
import "@/pages/pages.css";

export function StudentDashboard() {
  return (
    <main className="dashboard">
      <div className="dashboard__title-wrap">
        <h1 className="dashboard__title">Learner dashboard</h1>
        <span className="ui-ko">학습자 대시보드</span>
      </div>
      <p className="dashboard__subtitle">
        <span className="ui-en">
          Your hub for schedules, assignments, and review — built around how you learn, not a
          single subject.
        </span>
        <span className="ui-ko">
          일정·과제·복습을 한곳에서 — 특정 과목이 아니라 학습(Learning) 전반을 지원합니다.
        </span>
      </p>
      <div className="dashboard-grid dashboard-grid--student">
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Today&apos;s learning</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                오늘의 학습
              </span>
            </div>
            <span className="panel__badge panel__badge--ok">Student</span>
          </div>
          <p className="materials-placeholder">
            <span className="ui-en">Upcoming sessions and tasks will appear here.</span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.5rem" }}>
              예정된 학습 세션·과제가 여기에 표시됩니다.
            </span>
          </p>
        </section>
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Progress</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                진행 현황
              </span>
            </div>
          </div>
          <div className="badge-row">
            <span className="stat-pill">
              <span className="ui-en">
                <strong>0</strong> modules done
              </span>
              <span className="ui-ko">완료 모듈 0</span>
            </span>
            <span className="stat-pill">
              <span className="ui-en">
                <strong>0</strong> submissions
              </span>
              <span className="ui-ko">제출 0</span>
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Smart library</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                스마트 라이브러리
              </span>
            </div>
          </div>
          <div className="badge-row" style={{ flexWrap: "wrap" }}>
            <Link to="/library" className="btn btn--primary btn--stack">
              <span className="ui-en">Open library</span>
              <span className="ui-ko">라이브러리</span>
            </Link>
            <Link to="/homework" className="btn btn--ghost btn--stack">
              <span className="ui-en">Homework code</span>
              <span className="ui-ko">과제 번호 검색</span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
