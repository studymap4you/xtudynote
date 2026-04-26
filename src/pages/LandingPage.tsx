import { Link } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { TopNavMainLinks } from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { Intro } from "@/components/Intro";
import { CategoryGridSection } from "@/components/landing/MarketplaceSections";
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

  return (
    <div className="app-shell app-shell--landing">
      <LandingPageBackground />
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
