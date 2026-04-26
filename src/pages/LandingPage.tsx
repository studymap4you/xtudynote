import { Link } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { TopNavMainLinks } from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { Intro } from "@/components/Intro";
import {
  CategoryGridSection,
  LiveRankingSection,
  CreatorCenterSection,
} from "@/components/landing/MarketplaceSections";
import "@/pages/pages.css";

const FEATURES = [
  {
    title: "Verified marketplace",
    ko: "검증된 판매자·샘플 미리보기로 신뢰할 수 있는 지식 거래",
  },
  {
    title: "Category-rich library",
    ko: "수능·어학·자격증·전공까지 테마별 큐레이션 라이브러리",
  },
  {
    title: "Creator economics",
    ko: "크리에이터 센터 — 등록·판매·정산을 한곳에서",
  },
  {
    title: "Learning logs",
    ko: "학습자 피드백·로그로 성장 궤적을 기록",
  },
] as const;

export function LandingPage() {
  const { firebaseUser, logOut } = useAuth();

  return (
    <div className="app-shell app-shell--landing">
      <header className="top-nav top-nav--landing">
        <Link
          to="/"
          className="top-nav__brand top-nav__brand--landing"
          aria-label="Xtudy-Universe 엑스터디 유니버스 홈"
        >
          <BrandLockup />
        </Link>
        <div className="top-nav__actions top-nav__actions--landing-tier">
          <TopNavMainLinks />
          {firebaseUser ? (
            <>
              <Link to="/dashboard" className="top-nav__auth-link top-nav__auth-link--dashboard">
                대시보드
              </Link>
              <button
                type="button"
                className="top-nav__auth-link top-nav__auth-link--logout"
                onClick={() => void logOut()}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link
                to="/register"
                className="top-nav__auth-link top-nav__auth-link--register"
              >
                회원가입
              </Link>
              <Link to="/login" className="top-nav__auth-link top-nav__auth-link--login">
                로그인
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="landing">
        <Intro />
        <CategoryGridSection />
        <LiveRankingSection />
        <CreatorCenterSection />
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
          <Link to={firebaseUser ? "/dashboard" : "/login"}>
            <span className="ui-en">
              {firebaseUser ? "Go to your dashboard" : "Already have an account? Log in"}
            </span>
            <span className="ui-ko">
              {firebaseUser ? "대시보드로 이동" : "이미 계정이 있으신가요? 로그인"}
            </span>
          </Link>
        </p>
      </main>
    </div>
  );
}
