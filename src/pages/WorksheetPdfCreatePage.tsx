import { Link } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { TopNavMainLinks } from "@/components/layout/Navbar";
import { WorksheetPdfForm } from "@/components/landing/WorksheetPdfForm";
import { LandingPageBackground } from "@/components/landing/LandingPageBackground";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

export function WorksheetPdfCreatePage() {
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
              <Link to="/register" className="top-nav__auth-link top-nav__auth-link--register">
                회원가입
              </Link>
              <Link to="/login" className="top-nav__auth-link top-nav__auth-link--login">
                로그인
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="landing worksheet-create-page">
        <div className="worksheet-create-page__wrap">
          <nav className="worksheet-create-page__breadcrumb" aria-label="이동 경로">
            <Link to="/">← 홈으로</Link>
          </nav>
          <WorksheetPdfForm />
        </div>
      </main>
    </div>
  );
}
