import { Link, NavLink, useLocation } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { useAuth } from "@/contexts/AuthContext";
import { Intro } from "@/components/Intro";
import { LandingPageBackground } from "@/components/landing/LandingPageBackground";
import "@/pages/pages.css";

export function LandingPage() {
  const { firebaseUser, logOut } = useAuth();
  const { pathname } = useLocation();
  const classroomNavActive = pathname.startsWith("/classroom") && !pathname.startsWith("/classrooms");
  const textbookNavActive = pathname.startsWith("/tools/textbook-auto");
  const loginActive = pathname.startsWith("/login");
  const registerActive = pathname.startsWith("/register");

  return (
    <div className="app-shell app-shell--landing">
      <LandingPageBackground />
      <header className="top-nav top-nav--landing top-nav--landing-compact">
        <div className="landing-shell-inner">
          <div className="landing-nav-head">
            <Link
              to="/"
              className="top-nav__brand top-nav__brand--landing"
              aria-label="Xtudy Universe 엑스터디 유니버스 홈"
            >
              <BrandLockup />
            </Link>
          </div>
          <nav className="landing-top-nav__actions" role="navigation" aria-label="주요 메뉴">
            <NavLink
              to="/classroom"
              className={() => `nav-pill${classroomNavActive ? " nav-pill--active" : ""}`}
            >
              <span className="nav-pill__title">내 강의실</span>
              <span className="nav-pill__sub">My classroom</span>
            </NavLink>
            <NavLink
              to={firebaseUser ? "/tools/textbook-auto" : "/login"}
              state={!firebaseUser ? { from: { pathname: "/tools/textbook-auto" } } : undefined}
              className={() => `nav-pill${textbookNavActive ? " nav-pill--active" : ""}`}
            >
              <span className="nav-pill__title">교재 자동제작</span>
              <span className="nav-pill__sub">AI textbook</span>
            </NavLink>
            {firebaseUser ? (
              <button
                type="button"
                className="nav-pill nav-pill--button nav-pill--tail"
                onClick={() => void logOut()}
              >
                <span className="nav-pill__title">로그아웃</span>
                <span className="nav-pill__sub">Log out</span>
              </button>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className={() => `nav-pill${loginActive ? " nav-pill--active" : ""}`}
                >
                  <span className="nav-pill__title">로그인</span>
                  <span className="nav-pill__sub">Log in</span>
                </NavLink>
                <NavLink
                  to="/register"
                  className={() => `nav-pill${registerActive ? " nav-pill--active" : ""}`}
                >
                  <span className="nav-pill__title">회원가입</span>
                  <span className="nav-pill__sub">Sign up</span>
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="landing">
        <Intro />
      </main>
    </div>
  );
}
