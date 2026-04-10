import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { normalizeHomeworkCode } from "@/lib/homeworkCode";

const SHORTCUTS = [
  { to: "/library", label: "라이브러리", tone: "a" as const },
  { to: "/homework", label: "과제 검색", tone: "b" as const },
  { to: "/#marketplace-premium", label: "유료 자료관", tone: "c" as const },
  { to: "/#marketplace-categories", label: "테마별 자료", tone: "d" as const },
  { to: "/#marketplace-ranking", label: "실시간 랭킹", tone: "e" as const },
  { to: "/#marketplace-creator", label: "크리에이터", tone: "f" as const },
  { to: "/login", label: "로그인", tone: "g" as const },
  { to: "/#landing-features", label: "플랫폼 소개", tone: "h" as const },
] as const;

function IconStudent() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTeacher() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 랜딩 히어로 — 비대칭 레이아웃(좌 카피 / 우 기능), XtudyNote 2.0 라이트 마켓 톤
 */
export function Intro() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeHomeworkCode(search);
    if (n) navigate(`/homework/${encodeURIComponent(n)}`);
    else navigate("/homework");
  }

  return (
    <section className="intro-hero" aria-labelledby="intro-slogan">
      <div className="intro-hero__grid">
        <div className="intro-hero__copy intro-hero__copy--fade">
          <p className="intro-hero__brand">
            <BrandLockup />
          </p>
          <h1 id="intro-slogan" className="intro-hero__slogan">
            모두를 위한
            <br />
            모두의 학습공간
          </h1>
          <p className="intro-hero__lede">
            모든 과제가 기록되고, 모든 성장이 눈에 보입니다.
          </p>
        </div>

        <div className="intro-hero__panel intro-hero__panel--fade">
          <div className="intro-login-card">
            <p className="intro-login-card__hint">서비스 이용 안내</p>
            <div className="intro-login-card__rows">
              <div className="intro-login-card__row">
                <span className="intro-login-card__icon intro-login-card__icon--student">
                  <IconStudent />
                </span>
                <span className="intro-login-card__row-text">
                  <span className="intro-login-card__row-title">학습자 · 학부모</span>
                  <span className="intro-login-card__row-sub">피드백·과제·학습 로그</span>
                </span>
              </div>
              <div className="intro-login-card__row">
                <span className="intro-login-card__icon intro-login-card__icon--teacher">
                  <IconTeacher />
                </span>
                <span className="intro-login-card__row-text">
                  <span className="intro-login-card__row-title">교육자 · 전문가</span>
                  <span className="intro-login-card__row-sub">자료·과제·CRM (승인 후)</span>
                </span>
              </div>
            </div>

            <div className="intro-login-card__actions">
              <Link to="/login" className="intro-login-card__btn intro-login-card__btn--primary">
                로그인
              </Link>
              <Link
                to="/register"
                className="intro-login-card__btn intro-login-card__btn--secondary"
              >
                회원가입
              </Link>
            </div>

            <div className="intro-login-card__links" aria-label="계정 관련 링크">
              <Link to="/login" className="intro-login-card__mini">
                아이디 · 비밀번호 안내
              </Link>
            </div>
          </div>

          <form className="intro-search" onSubmit={handleSearch} role="search">
            <label className="intro-search__label" htmlFor="intro-search-input">
              <span className="intro-search__label-text">통합 검색</span>
            </label>
            <div className="intro-search__shell">
              <input
                id="intro-search-input"
                className="intro-search__input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="과제 번호로 바로 이동 (예: HW-…)"
                autoComplete="off"
                enterKeyHint="search"
              />
              <button type="submit" className="intro-search__submit" aria-label="검색 실행">
                <IconSend />
              </button>
            </div>
          </form>

          <nav className="intro-shortcuts" aria-label="주요 메뉴 바로가기">
            <ul className="intro-shortcuts__list">
              {SHORTCUTS.map((s) => (
                <li key={s.label}>
                  <Link
                    to={s.to}
                    className={`intro-shortcut intro-shortcut--${s.tone}`}
                  >
                    <span className="intro-shortcut__orb" aria-hidden />
                    <span className="intro-shortcut__label">{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </section>
  );
}
