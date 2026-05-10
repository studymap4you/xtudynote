import { Link, NavLink, useLocation } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { useAuth } from "@/contexts/AuthContext";
import { Intro } from "@/components/Intro";
import { LandingPageBackground } from "@/components/landing/LandingPageBackground";
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
    title: "Learning logs",
    ko: "학습자 피드백·로그로 성장 궤적을 기록",
  },
] as const;

export function LandingPage() {
  const { firebaseUser, logOut } = useAuth();
  const { pathname } = useLocation();
  const classroomActive =
    pathname.startsWith("/classroom") && !pathname.startsWith("/classrooms");

  return (
    <div className="app-shell app-shell--landing">
      <LandingPageBackground />
      <header className="top-nav top-nav--landing top-nav--landing-compact">
        <Link
          to="/"
          className="top-nav__brand top-nav__brand--landing"
          aria-label="Xtudy-Universe 엑스터디 유니버스 홈"
        >
          <BrandLockup />
        </Link>
        <div className="top-nav__tail" role="navigation" aria-label="주요 메뉴">
          <NavLink to="/classroom" className={() => `nav-pill${classroomActive ? " nav-pill--active" : ""}`}>
            <span className="nav-pill__title">내 강의실</span>
            <span className="nav-pill__sub">My classroom</span>
          </NavLink>
          {firebaseUser ? (
            <>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `nav-pill nav-pill--cta${isActive ? " nav-pill--active" : ""}`}
                end
              >
                <span className="nav-pill__title">대시보드</span>
                <span className="nav-pill__sub">Dashboard</span>
              </NavLink>
              <button
                type="button"
                className="nav-pill nav-pill--tail nav-pill--button"
                onClick={() => void logOut()}
              >
                <span className="nav-pill__title">로그아웃</span>
                <span className="nav-pill__sub">Log out</span>
              </button>
            </>
          ) : (
            <NavLink to="/login" className="nav-pill nav-pill--cta">
              <span className="nav-pill__title">로그인</span>
              <span className="nav-pill__sub">Log in</span>
            </NavLink>
          )}
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
      </main>
    </div>
  );
}
