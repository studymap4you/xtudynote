import { useId } from "react";
import { Link } from "react-router-dom";
import { StudentAssignmentsPanel } from "@/components/assignments/StudentAssignmentsPanel";
import { AddMaterialButton } from "@/components/AddMaterialButton";
import { StudentLearningVault } from "@/components/StudentLearningVault";
import { StudentSalesSection } from "@/components/StudentSalesSection";
import { StudentSettlementForm } from "@/components/StudentSettlementForm";
import "@/pages/pages.css";

function LearnerHeroGlyph() {
  const gradId = `learner-hero-grad-${useId().replace(/:/g, "")}`;
  return (
    <svg className="learner-hero__glyph" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="8" y1="10" x2="38" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14b8a6" />
          <stop offset="0.45" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="40" height="40" rx="14" fill={`url(#${gradId})`} fillOpacity="0.16" />
      <path
        fill={`url(#${gradId})`}
        d="M17 15c0-1.1.9-2 2-2h10a2 2 0 012 2v18a2 2 0 01-2 2H19a2 2 0 01-2-2V15zm4 5h8v2.25h-8V20zm0 4.5h8V27h-8v-2.5z"
      />
      <circle cx="35" cy="13" r="3.25" fill="#f472b6" fillOpacity="0.92" />
    </svg>
  );
}

export function StudentDashboard() {
  return (
    <main className="dashboard dashboard--learner">
      <header className="learner-hero">
        <div className="learner-hero__bg" aria-hidden />
        <div className="learner-hero__row">
          <div className="learner-hero__icon-wrap">
            <LearnerHeroGlyph />
          </div>
          <div className="learner-hero__intro">
            <p className="learner-hero__eyebrow ui-en">Learning hub</p>
            <div className="learner-hero__titles">
              <h1 className="dashboard__title learner-hero__title">
                Learner dashboard
              </h1>
              <span className="ui-ko learner-hero__title-ko">학습자 대시보드</span>
            </div>
          </div>
        </div>
        <div className="learner-hero__lead-block">
          <p className="dashboard__subtitle learner-hero__subtitle">
            <span className="ui-en">
              Your hub for schedules, assignments, and review — built around how you learn, not a
              single subject.
            </span>
            <span className="ui-ko">
              일정·과제·복습을 한곳에서 — 특정 과목이 아니라 학습(Learning) 전반을 지원합니다.
            </span>
          </p>
          <ul className="learner-hero__chips" aria-label="대시보드 영역">
            <li className="learner-hero__chip">학습 · 과제</li>
            <li className="learner-hero__chip">라이브러리 · 강의실</li>
            <li className="learner-hero__chip">자료 · 정산 · 판매</li>
          </ul>
        </div>
      </header>

      <section className="learner-dash-section" aria-labelledby="learner-sec-learning">
        <h2 id="learner-sec-learning" className="learner-dash-section__title">
          <span className="learner-dash-section__title-en">Learning</span>
          <span className="learner-dash-section__title-ko">학습 · 과제 · 보관함</span>
        </h2>
        <div className="dashboard-grid dashboard-grid--student dashboard-grid--learner learner-dash-section__grid">
          <StudentAssignmentsPanel />

          <StudentLearningVault />

          <section className="panel">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">Progress</h2>
                <span className="ui-ko panel__tagline">
                  진행 현황
                </span>
              </div>
            </div>
            <div className="badge-row learner-stat-row">
              <span className="stat-pill stat-pill--learner">
                <span className="ui-en">
                  <strong>0</strong> modules done
                </span>
                <span className="ui-ko">완료 모듈 0</span>
              </span>
              <span className="stat-pill stat-pill--learner">
                <span className="ui-en">
                  <strong>0</strong> submissions
                </span>
                <span className="ui-ko">제출 0</span>
              </span>
            </div>
          </section>
        </div>
      </section>

      <section className="learner-dash-section" aria-labelledby="learner-sec-links">
        <h2 id="learner-sec-links" className="learner-dash-section__title">
          <span className="learner-dash-section__title-en">Explore</span>
          <span className="learner-dash-section__title-ko">라이브러리 · 강의실 · 과제 검색</span>
        </h2>
        <div className="dashboard-grid dashboard-grid--student dashboard-grid--learner learner-dash-section__grid">
          <section className="panel learner-panel--library">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">Smart library & classrooms</h2>
                <span className="ui-ko panel__tagline">
                  자료 탐색 · 내 강의실 · 강의 신청
                </span>
              </div>
            </div>
            <div className="badge-row learner-panel__actions">
              <Link to="/library" className="btn btn--primary btn--stack">
                <span className="ui-en">Open library</span>
                <span className="ui-ko">라이브러리</span>
              </Link>
              <Link to="/classroom" className="btn btn--ghost btn--stack">
                <span className="ui-en">My classroom</span>
                <span className="ui-ko">내 강의실</span>
              </Link>
              <Link to="/classrooms" className="btn btn--ghost btn--stack">
                <span className="ui-en">Browse courses</span>
                <span className="ui-ko">강의 신청 · 전체 강의실</span>
              </Link>
              <Link to="/homework" className="btn btn--ghost btn--stack">
                <span className="ui-en">Homework hub</span>
                <span className="ui-ko">과제함 · 번호 검색</span>
              </Link>
            </div>
          </section>
        </div>
      </section>

      <section className="learner-dash-section" aria-labelledby="learner-sec-ops">
        <h2 id="learner-sec-ops" className="learner-dash-section__title">
          <span className="learner-dash-section__title-en">Materials &amp; settlement</span>
          <span className="learner-dash-section__title-ko">자료 등록 · 정산 · 판매</span>
        </h2>
        <div className="dashboard-grid dashboard-grid--student dashboard-grid--learner learner-dash-section__grid">
          <section className="panel learner-panel--accent">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">자료 등록 신청</h2>
                <span className="ui-ko panel__tagline">
                  마스터 검수 후 등록
                </span>
              </div>
              <span className="panel__badge panel__badge--ok">Student</span>
            </div>
            <div className="badge-row learner-panel__actions">
              <AddMaterialButton />
            </div>
          </section>

          <StudentSettlementForm />

          <StudentSalesSection />
        </div>
      </section>
    </main>
  );
}
