import { Link } from "react-router-dom";
import { Intro } from "@/components/Intro";
import "@/pages/pages.css";

const FEATURES = [
  {
    title: "Verified Experts",
    ko: "검증된 전문가와 함께하는 학습 — 신뢰할 수 있는 지도 환경",
  },
  {
    title: "Smart Library",
    ko: "스마트 라이브러리 — 과목에 얽매이지 않는 지식·자료 허브",
  },
  {
    title: "Logic-Based Feedback",
    ko: "논리 기반 피드백 — 사고 과정을 드러내는 학습 피드백",
  },
  {
    title: "Personal Learning Logs",
    ko: "개인 학습 로그 — 나만의 학습 궤적을 한곳에 기록",
  },
] as const;

export function LandingPage() {
  return (
    <div className="app-shell app-shell--landing">
      <header className="top-nav top-nav--landing">
        <Link to="/" className="top-nav__brand top-nav__brand--landing">
          XtudyNote
        </Link>
        <div className="top-nav__actions top-nav__actions--landing-tier">
          <Link to="/library" className="btn btn--ghost btn--stack">
            <span className="ui-en">Library</span>
            <span className="ui-ko">라이브러리</span>
          </Link>
          <Link to="/homework" className="btn btn--ghost btn--stack">
            <span className="ui-en">Homework</span>
            <span className="ui-ko">과제 번호</span>
          </Link>
          <Link
            to="/register"
            className="top-nav__auth-link top-nav__auth-link--register"
          >
            회원가입
          </Link>
          <Link to="/login" className="top-nav__auth-link top-nav__auth-link--login">
            로그인
          </Link>
        </div>
      </header>
      <main className="landing">
        <Intro />
        <ul
          id="landing-features"
          className="landing__features"
          aria-label="Platform highlights"
        >
          {FEATURES.map((f) => (
            <li key={f.title} className="landing__feature">
              <h2 className="landing__feature-title">{f.title}</h2>
              <p className="landing__feature-ko">{f.ko}</p>
            </li>
          ))}
        </ul>
        <div id="landing-choices" className="landing__choices">
          <Link
            to="/register?role=teacher"
            className="landing__choice landing__choice--teacher"
          >
            Teacher
            <span className="landing__choice-sub">
              <span className="ui-en" style={{ fontWeight: 700 }}>
                Educator / expert workspace
              </span>
              <span className="ui-ko">
                교육자·전문가 — 콘텐츠·학습 그룹 관리 (승인 후 전체 기능)
              </span>
            </span>
          </Link>
          <Link
            to="/register?role=student"
            className="landing__choice landing__choice--student"
          >
            Student
            <span className="landing__choice-sub">
              <span className="ui-en" style={{ fontWeight: 700 }}>
                Learner dashboard
              </span>
              <span className="ui-ko">
                학습자 — 피드백·로그·자료 중심의 학습 홈
              </span>
            </span>
          </Link>
        </div>
        <p id="landing-footer" className="landing__footer">
          <Link to="/login">
            <span className="ui-en">Already have an account? Log in</span>
            <span className="ui-ko">이미 계정이 있으신가요? 로그인</span>
          </Link>
        </p>
      </main>
    </div>
  );
}
