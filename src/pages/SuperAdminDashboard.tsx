import { useId } from "react";
import { Link } from "react-router-dom";
import "@/pages/pages.css";

function AdminHeroGlyph() {
  const gradId = `super-admin-grad-${useId().replace(/:/g, "")}`;
  return (
    <svg className="super-admin-hero__glyph" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="6" y1="8" x2="40" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="0.5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="40" height="40" rx="14" fill={`url(#${gradId})`} fillOpacity="0.15" />
      <path
        fill={`url(#${gradId})`}
        d="M24 11l10 5v9c0 7-6.5 11.5-10 13-3.5-1.5-10-6-10-13v-9l10-5zm0 5.25L17 22v7.2c0 4.6 4.8 8 7 9.05 2.2-1.05 7-4.45 7-9.05V22l-7-5.75z"
      />
      <circle cx="36" cy="11" r="3.25" fill="#fbbf24" fillOpacity="0.95" />
    </svg>
  );
}

export function SuperAdminDashboard() {
  return (
    <main className="dashboard dashboard--super-admin">
      <header className="super-admin-hero">
        <div className="super-admin-hero__bg" aria-hidden />
        <div className="super-admin-hero__row">
          <div className="super-admin-hero__icon-wrap">
            <AdminHeroGlyph />
          </div>
          <div className="super-admin-hero__intro">
            <p className="super-admin-hero__eyebrow ui-en">Platform control</p>
            <div className="super-admin-hero__titles">
              <h1 className="dashboard__title super-admin-hero__title">Super Admin</h1>
              <span className="ui-ko super-admin-hero__title-ko">슈퍼 관리자</span>
            </div>
          </div>
        </div>
        <div className="super-admin-hero__lead-block">
          <p className="dashboard__subtitle super-admin-hero__subtitle">
            <span className="ui-en">
              Manage every account, review pending educators, and keep the learning ecosystem trusted.
            </span>
            <span className="ui-ko">
              회원·강의실·자료는 관리자 전용 상단 메뉴와 연결되어 있습니다. 세부 자료 도구는 아래에서 열 수 있습니다.
            </span>
          </p>
          <ul className="super-admin-hero__chips" aria-label="관리 영역">
            <li className="super-admin-hero__chip">전체 회원관리</li>
            <li className="super-admin-hero__chip">전체 강의실관리</li>
            <li className="super-admin-hero__chip">전체 자료관리</li>
          </ul>
        </div>
      </header>

      <div className="dashboard-grid dashboard-grid--student dashboard-grid--super-admin">
        <section className="panel super-admin-panel--ops">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Operations console</h2>
              <span className="ui-ko panel__tagline">운영 콘솔</span>
            </div>
            <span className="panel__badge panel__badge--ok">Super Admin</span>
          </div>
          <p className="super-admin-panel__lead">
            <span className="ui-en">
              Open member and classroom consoles from the admin bar, or jump into material workflows below.
            </span>
            <span className="ui-ko super-admin-panel__lead-ko">
              상단 관리자 메뉴에서 회원·강의실·자료 허브로 들어갈 수 있고, 아래에서 세부 자료 도구로 바로 이동할 수 있습니다.
            </span>
          </p>
          <div className="super-admin-actions">
            <p className="super-admin-actions__group-label ui-ko">전체 자료관리 · 세부 메뉴</p>
            <p className="super-admin-actions__group-hint ui-ko">
              자료 검수 대기, 콘텐츠 DB, 홈 배경, 지식 큐레이션 — 관리자 대시보드와「전체 자료관리」화면에서 동일하게 안내합니다.
            </p>
            <Link to="/admin/pending-materials" className="btn btn--primary btn--stack super-admin-actions__primary">
              <span className="ui-en">Review pending registrations</span>
              <span className="ui-ko">자료 검수 대기</span>
            </Link>
            <Link to="/admin/contents" className="btn btn--stack super-admin-actions__db">
              <span className="ui-en">Content database (approved items)</span>
              <span className="ui-ko">콘텐츠 DB 관리</span>
            </Link>
            <Link to="/admin/landing-hero" className="btn btn--stack super-admin-actions__landing">
              <span className="ui-en">Landing home background</span>
              <span className="ui-ko">홈 배경</span>
            </Link>
            <Link to="/admin/knowledge-curation" className="btn btn--stack super-admin-actions__knowledge">
              <span className="ui-en">Knowledge curation</span>
              <span className="ui-ko">지식 큐레이션</span>
            </Link>
            <p className="super-admin-actions__group-label ui-ko">스토어 · 기타</p>
            <Link to="/admin/materials" className="btn btn--ghost btn--stack super-admin-actions__materials-hub">
              <span className="ui-en">Materials hub (overview)</span>
              <span className="ui-ko">전체 자료관리 허브로 이동</span>
            </Link>
            <Link to="/admin/storefront" className="btn btn--stack super-admin-actions__storefront">
              <span className="ui-en">Storefront & home videos</span>
              <span className="ui-ko">디지털·엑스터디마켓 · 홈 동영상 등록·삭제</span>
            </Link>
            <Link to="/dashboard/newsletter-builder" className="btn btn--stack super-admin-actions__newsletter">
              <span className="ui-en">Newsletter builder (Vision)</span>
              <span className="ui-ko">뉴스레터 빌더 · 이미지→Binary Logic 섹션 PDF</span>
            </Link>
          </div>
        </section>

        <section className="panel super-admin-panel--security">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Security note</h2>
              <span className="ui-ko panel__tagline">보안 참고</span>
            </div>
            <span className="super-admin-security-badge" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l8 4v6c0 5.5-5 9.5-8 11-3-1.5-8-5.5-8-11V7l8-4z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <div className="super-admin-security-body">
            <p className="super-admin-security-text">
              <span className="ui-en">
                Firestore and Storage rules enforce roles and file access on the server. Deploy them with the Firebase
                CLI.
              </span>
              <span className="ui-ko super-admin-security-text-ko">
                Firestore·Storage 규칙으로 역할·서류 접근이 서버에서 제한됩니다. Firebase CLI로 배포하세요.
              </span>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
