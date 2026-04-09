import { Link } from "react-router-dom";
import { AddMaterialButton } from "@/components/AddMaterialButton";
import { StudentLearningVault } from "@/components/StudentLearningVault";
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
              <h2 className="panel__title">자료 등록 신청</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                마스터 검수 후 등록
              </span>
            </div>
            <span className="panel__badge panel__badge--ok">Student</span>
          </div>
          <div className="badge-row" style={{ flexWrap: "wrap" }}>
            <AddMaterialButton />
          </div>
        </section>

        <StudentLearningVault />

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
