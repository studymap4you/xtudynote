import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { Link, useNavigate } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/firebase/config";
import { normalizeHomeworkCode } from "@/lib/homeworkCode";
import {
  SITE_CONFIG_COLLECTION,
  SITE_CONFIG_HOME_DOC,
} from "@/lib/siteConfig";

const SHORTCUTS = [
  { to: "/library", label: "라이브러리", tone: "a" as const },
  { to: "/homework", label: "과제 검색", tone: "b" as const },
  { to: "/#marketplace-premium", label: "유료 자료관", tone: "c" as const },
  { to: "/#marketplace-categories", label: "테마별 자료", tone: "d" as const },
  { to: "/material/register", label: "새자료 등록", tone: "e" as const },
  { to: "/video/register", label: "동영상 강의", tone: "f" as const },
  { to: "/login", label: "로그인", tone: "g" as const },
  { to: "/#landing-features", label: "플랫폼 소개", tone: "h" as const },
] as const;

const SHARE_TITLE = "XtudyNote — 모두에 의한 모두의 학습";

const shareIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  "aria-hidden": true as const,
};

function IconShareLink() {
  return (
    <svg {...shareIconProps}>
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShareFacebook() {
  return (
    <svg {...shareIconProps}>
      <path
        d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconShareX() {
  return (
    <svg {...shareIconProps}>
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconShareLine() {
  return (
    <svg {...shareIconProps}>
      <path
        d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.345.282-.63.63-.63.027 0 .058.005.086.005.202.01.38.105.496.25l2.462 3.33V8.108c0-.345.282-.63.63-.63.346 0 .626.285.626.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"
        fill="currentColor"
      />
    </svg>
  );
}

function IconShareKakao() {
  return (
    <svg {...shareIconProps}>
      <path
        fill="currentColor"
        d="M12 4c4.97 0 9 3.58 9 8 0 2.6-1.4 4.9-3.6 6.3L21 21l-4.1-2.1c-1.2.3-2.5.5-3.9.5-4.97 0-9-3.58-9-8s4.03-8 9-8Z"
      />
    </svg>
  );
}

function IconShareNaver() {
  return (
    <svg {...shareIconProps}>
      <path
        d="M16.273 12.845 8.376 3H3v18h5.726V11.155L19.624 21H25V3h-5.727v9.845h-3z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconShareBand() {
  return (
    <svg {...shareIconProps}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 10h2.5v6H8v-6Zm3.75 0H15c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-1.25V10Zm2.5 4c0 .55-.45 1-1 1h-.75v-4h.75c.55 0 1 .45 1 1v2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconShareWhatsApp() {
  return (
    <svg {...shareIconProps}>
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconShareTelegram() {
  return (
    <svg {...shareIconProps}>
      <path
        d="M21.5 3.5 2.5 11l5.5 2 2 6.5 3.5-3.5 4.5 3.5 3-18.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m10 14 11-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IntroHeroShare() {
  const [pageUrl, setPageUrl] = useState("");
  const [copyHint, setCopyHint] = useState<"idle" | "link" | "kakao">("idle");

  useEffect(() => {
    setPageUrl(typeof window !== "undefined" ? window.location.href : "");
  }, []);

  const encoded = useMemo(() => {
    const u = pageUrl || (typeof window !== "undefined" ? window.location.href : "");
    const title = SHARE_TITLE;
    const eu = encodeURIComponent(u);
    const et = encodeURIComponent(title);
    const eb = encodeURIComponent(`${title}\n${u}`);
    return {
      u,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${eu}`,
      x: `https://twitter.com/intent/tweet?url=${eu}&text=${et}`,
      line: `https://social-plugins.line.me/lineit/share?url=${eu}`,
      naver: `https://share.naver.com/web/shareUrl?url=${eu}`,
      band: `https://band.us/plugin/share?body=${eb}&route=${eu}`,
      whatsapp: `https://api.whatsapp.com/send?text=${eb}`,
      telegram: `https://t.me/share/url?url=${eu}&text=${et}`,
    };
  }, [pageUrl]);

  const runCopy = useCallback(
    async (kind: "link" | "kakao") => {
      const text = encoded.u || (typeof window !== "undefined" ? window.location.href : "");
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopyHint(kind);
        window.setTimeout(() => setCopyHint("idle"), 2200);
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          setCopyHint(kind);
          window.setTimeout(() => setCopyHint("idle"), 2200);
        } catch {
          window.alert("링크를 복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.");
        }
      }
    },
    [encoded.u]
  );

  return (
    <div className="intro-hero__share">
      <p className="intro-hero__share-label">공유 · 링크 복사</p>
      <div className="intro-hero__share-row" role="group" aria-label="페이지 공유">
        <button
          type="button"
          className="intro-hero__share-btn intro-hero__share-btn--copy"
          onClick={() => void runCopy("link")}
          aria-label="현재 페이지 주소 복사"
          title="링크 복사"
        >
          <IconShareLink />
        </button>
        <a
          className="intro-hero__share-btn intro-hero__share-btn--facebook"
          href={encoded.facebook}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Facebook에 공유"
          title="Facebook"
        >
          <IconShareFacebook />
        </a>
        <a
          className="intro-hero__share-btn intro-hero__share-btn--x"
          href={encoded.x}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="X에 공유"
          title="X"
        >
          <IconShareX />
        </a>
        <a
          className="intro-hero__share-btn intro-hero__share-btn--line"
          href={encoded.line}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LINE으로 공유"
          title="LINE"
        >
          <IconShareLine />
        </a>
        <button
          type="button"
          className="intro-hero__share-btn intro-hero__share-btn--kakao"
          onClick={() => void runCopy("kakao")}
          aria-label="링크 복사 후 카카오톡에 붙여넣기"
          title="카카오톡 (링크 복사)"
        >
          <IconShareKakao />
        </button>
        <a
          className="intro-hero__share-btn intro-hero__share-btn--naver"
          href={encoded.naver}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="네이버로 공유"
          title="네이버"
        >
          <IconShareNaver />
        </a>
        <a
          className="intro-hero__share-btn intro-hero__share-btn--band"
          href={encoded.band}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="밴드로 공유"
          title="밴드"
        >
          <IconShareBand />
        </a>
        <a
          className="intro-hero__share-btn intro-hero__share-btn--whatsapp"
          href={encoded.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp으로 공유"
          title="WhatsApp"
        >
          <IconShareWhatsApp />
        </a>
        <a
          className="intro-hero__share-btn intro-hero__share-btn--telegram"
          href={encoded.telegram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Telegram으로 공유"
          title="Telegram"
        >
          <IconShareTelegram />
        </a>
      </div>
      {copyHint !== "idle" && (
        <p className="intro-hero__share-status" role="status" aria-live="polite">
          {copyHint === "link" && "주소가 복사되었습니다."}
          {copyHint === "kakao" && "복사되었습니다. 카카오톡 대화에 붙여넣어 주세요."}
        </p>
      )}
    </div>
  );
}

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

const shortcutIconProps = {
  className: "intro-shortcut__icon",
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  "aria-hidden": true as const,
};

/** 라이브러리 — 책 */
function IconShortcutLibrary() {
  return (
    <svg {...shortcutIconProps}>
      <path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 7h8M8 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 과제 검색 — 돋보기 */
function IconShortcutSearch() {
  return (
    <svg {...shortcutIconProps}>
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 유료 자료관 — 쇼핑백 */
function IconShortcutPaid() {
  return (
    <svg {...shortcutIconProps}>
      <path
        d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 테마별 — 격자 */
function IconShortcutGrid() {
  return (
    <svg {...shortcutIconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** 새자료 등록 — 문서+플러스 */
function IconShortcutNewDoc() {
  return (
    <svg {...shortcutIconProps}>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 18v-5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 동영상 — 재생 */
function IconShortcutVideo() {
  return (
    <svg {...shortcutIconProps}>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10 9 6 3-6 3V9Z" fill="currentColor" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

/** 로그인 — 사용자 */
function IconShortcutUser() {
  return (
    <svg {...shortcutIconProps}>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 20a7 7 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 플랫폼 소개 — 정보/레이어 */
function IconShortcutInfo() {
  return (
    <svg {...shortcutIconProps}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 16v-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function ShortcutOrbIcon({ tone }: { tone: (typeof SHORTCUTS)[number]["tone"] }) {
  switch (tone) {
    case "a":
      return <IconShortcutLibrary />;
    case "b":
      return <IconShortcutSearch />;
    case "c":
      return <IconShortcutPaid />;
    case "d":
      return <IconShortcutGrid />;
    case "e":
      return <IconShortcutNewDoc />;
    case "f":
      return <IconShortcutVideo />;
    case "g":
      return <IconShortcutUser />;
    case "h":
      return <IconShortcutInfo />;
    default:
      return null;
  }
}

function IntroLandingPanel({
  search,
  setSearch,
  onSearch,
}: {
  search: string;
  setSearch: (v: string) => void;
  onSearch: (e: React.FormEvent) => void;
}) {
  const { firebaseUser, logOut } = useAuth();

  const stack = (
    <>
      <div className="intro-login-card">
        <p className="intro-login-card__hint">서비스 이용 안내</p>
        <div className="intro-login-card__rows">
          <div className="intro-login-card__row">
            <span className="intro-login-card__icon intro-login-card__icon--student">
              <IconStudent />
            </span>
            <span className="intro-login-card__row-text">
              <span className="intro-login-card__row-title">학습자 · 일반 · 학부모</span>
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
          {firebaseUser ? (
            <>
              <Link to="/dashboard" className="intro-login-card__btn intro-login-card__btn--primary">
                대시보드
              </Link>
              <button
                type="button"
                className="intro-login-card__btn intro-login-card__btn--secondary"
                onClick={() => void logOut()}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="intro-login-card__btn intro-login-card__btn--primary">
                로그인
              </Link>
              <Link
                to="/register"
                className="intro-login-card__btn intro-login-card__btn--secondary"
              >
                회원가입
              </Link>
            </>
          )}
        </div>

        <div className="intro-login-card__links" aria-label="계정 관련 링크">
          {firebaseUser ? (
            <Link to="/dashboard" className="intro-login-card__mini">
              내 학습 홈 (대시보드)
            </Link>
          ) : (
            <Link to="/login" className="intro-login-card__mini">
              아이디 · 비밀번호 안내
            </Link>
          )}
        </div>
      </div>

      <form className="intro-search" onSubmit={onSearch} role="search">
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
          {SHORTCUTS.map((s) => {
            const isLogin = s.to === "/login";
            const to = firebaseUser && isLogin ? "/dashboard" : s.to;
            const label = firebaseUser && isLogin ? "대시보드" : s.label;
            return (
              <li key={s.to}>
                <Link to={to} className={`intro-shortcut intro-shortcut--${s.tone}`}>
                  <span className="intro-shortcut__orb" aria-hidden>
                    <ShortcutOrbIcon tone={s.tone} />
                  </span>
                  <span className="intro-shortcut__label">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );

  return (
    <div className="intro-hero__right">
      <div className="intro-hero__panel intro-hero__panel--fade">{stack}</div>
    </div>
  );
}

/**
 * 랜딩 히어로 — 비대칭 레이아웃(좌 카피 / 우 기능), XtudyNote 2.0 라이트 마켓 톤
 */
function clampLandingHeroPx(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const v = Math.round(n);
  if (v < 40 || v > 2000) return null;
  return v;
}

export function Intro() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [landingHeroPath, setLandingHeroPath] = useState<string | null>(null);
  const [landingHeroUrl, setLandingHeroUrl] = useState<string | null>(null);
  const [heroMaxW, setHeroMaxW] = useState<number | null>(null);
  const [heroMaxH, setHeroMaxH] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
      (snap) => {
        const d = snap.data();
        const p = d?.landingHeroImagePath;
        setLandingHeroPath(typeof p === "string" && p.length > 0 ? p : null);
        setHeroMaxW(clampLandingHeroPx(d?.landingHeroImageMaxWidthPx));
        setHeroMaxH(clampLandingHeroPx(d?.landingHeroImageMaxHeightPx));
      },
      () => {
        setLandingHeroPath(null);
        setHeroMaxW(null);
        setHeroMaxH(null);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!landingHeroPath) {
      setLandingHeroUrl(null);
      return;
    }
    let cancelled = false;
    getDownloadURL(ref(storage, landingHeroPath))
      .then((url) => {
        if (!cancelled) setLandingHeroUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLandingHeroUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [landingHeroPath]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeHomeworkCode(search);
    if (n) navigate(`/homework/${encodeURIComponent(n)}`);
    else navigate("/homework");
  }

  const hasSpotHero = Boolean(landingHeroUrl);

  const spotHeroBoxStyle: CSSProperties = { width: "100%" };
  if (heroMaxW != null) spotHeroBoxStyle.maxWidth = `${heroMaxW}px`;
  if (heroMaxH != null) spotHeroBoxStyle.maxHeight = `${heroMaxH}px`;

  return (
    <section className="intro-hero" aria-labelledby="intro-slogan">
      <div className={`intro-hero__grid${hasSpotHero ? " intro-hero__grid--balanced" : ""}`}>
        <div
          className={`intro-hero__copy intro-hero__copy--fade${hasSpotHero ? " intro-hero__copy--spot-hero" : ""}`}
        >
          {hasSpotHero && landingHeroUrl ? (
            <>
              <h1 id="intro-slogan" className="intro-hero__sr-only">
                XtudyNote — 모두에 의한 모두를 위한 모두의 학습. 모든 과제가 기록되고, 모든 성장이 눈에 보입니다.
              </h1>
              <div
                className={`intro-hero__spot-hero intro-hero__spot-hero--fade${heroMaxW != null ? " intro-hero__spot-hero--capped-w" : ""}`}
                style={Object.keys(spotHeroBoxStyle).length ? spotHeroBoxStyle : undefined}
              >
                <img
                  className="intro-hero__spot-hero-img"
                  src={landingHeroUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </>
          ) : (
            <>
              <p className="intro-hero__brand">
                <BrandLockup />
              </p>
              <h1 id="intro-slogan" className="intro-hero__slogan">
                <span className="intro-hero__slogan-line">모두에 의한</span>
                <span className="intro-hero__slogan-line">모두를 위한</span>
                <span className="intro-hero__slogan-line intro-hero__slogan-line--final">
                  <span className="intro-hero__slogan-accent">모두의 학습</span>
                </span>
              </h1>
              <p className="intro-hero__lede">
                모든 과제가 기록되고, 모든 성장이 눈에 보입니다.
              </p>
            </>
          )}
          <IntroHeroShare />
          <div className="intro-hero__classroom">
            <p className="intro-hero__share-label">강의실</p>
            <div className="intro-hero__classroom-row">
              <Link
                to="/classroom"
                className="intro-hero__classroom-btn intro-hero__classroom-btn--enter"
              >
                <span className="intro-hero__classroom-btn-en">Enter</span>
                <span className="intro-hero__classroom-btn-ko">강의실 입장</span>
              </Link>
              <Link
                to="/classroom/new"
                className="intro-hero__classroom-btn intro-hero__classroom-btn--create"
              >
                <span className="intro-hero__classroom-btn-en">Create</span>
                <span className="intro-hero__classroom-btn-ko">강의실 개설</span>
              </Link>
            </div>
            <p className="intro-hero__classroom-hint">
              입장은 로그인 후 목록에서 선택합니다. 개설은{" "}
              <strong>승인된 선생님</strong> 계정에서 가능합니다.
            </p>
          </div>
        </div>

        <IntroLandingPanel search={search} setSearch={setSearch} onSearch={handleSearch} />
      </div>
    </section>
  );
}
