import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/** 데모용 정적 데이터 — 추후 Firestore·결제 연동 시 교체 */
const PREMIUM_ROWS = [
  {
    id: "1",
    title: "2026 수능 국어 · 메타 독해 고난도 분석서 (전범위)",
    seller: "검증 강사 · 서울 00학원",
    price: "₩34,000",
    tag: "베스트",
  },
  {
    id: "2",
    title: "토익 LC/RC 900+ 실전 모의고사 패키지 + 해설 영상",
    seller: "Global Prep Lab",
    price: "₩28,000",
    tag: "샘플 제공",
  },
  {
    id: "3",
    title: "전기기사 필기·실기 합격 노트 (개정 반영)",
    seller: "Pro License 아카데미",
    price: "₩19,000",
    tag: "전문가",
  },
  {
    id: "4",
    title: "경영학과 논문 리뷰 템플릿 & 참고문헌 DB",
    seller: "Academic Desk",
    price: "₩15,000",
    tag: "신규",
  },
] as const;

const RANKING = [
  { rank: 1, title: "고난도 수능 국어 비문학 분석서 (실시간 1위)", heat: "+124%" },
  { rank: 2, title: "토스·오픽 스피킹 스크립트 120선", heat: "+98%" },
  { rank: 3, title: "정보처리기사 기출·요약 노트 풀세트", heat: "+76%" },
  { rank: 4, title: "텝스 400+ 독해 패턴 북", heat: "+61%" },
  { rank: 5, title: "대학원 입학 논문 프로포절 가이드", heat: "+54%" },
] as const;

const CATEGORIES = [
  {
    id: "k-entrance",
    title: "K-Entrance",
    ko: "수능 · 내신 핵심 자료",
    to: "/library",
    icon: "k" as const,
  },
  {
    id: "global-prep",
    title: "Global Prep",
    ko: "토익 · 토플 · 텝스 등 어학",
    to: "/library",
    icon: "g" as const,
  },
  {
    id: "professional",
    title: "Professional",
    ko: "국가 자격증 · 취업",
    to: "/library",
    icon: "p" as const,
  },
  {
    id: "academic",
    title: "Academic",
    ko: "대학 전공 · 논문 참고",
    to: "/library",
    icon: "a" as const,
  },
] as const;

function IconCategory({ name }: { name: "k" | "g" | "p" | "a" }) {
  const common = { width: 40, height: 40, viewBox: "0 0 24 24" as const, fill: "none" as const };
  if (name === "k") {
    return (
      <svg {...common} aria-hidden>
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
        />
        <path d="M8 7h8M8 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "g") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (name === "p") {
    return (
      <svg {...common} aria-hidden>
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 15h6M9 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <path
        d="M12 14v7M8 21h8M6 10h12l-1 7H7l-1-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 10V8a6 6 0 0 1 12 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * XtudyNote 2.0 — 중앙 검색 · 프리미엄 볼트 · 카테고리 · 랭킹 · 크리에이터
 */
export function MarketplaceSearchStrip() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t) navigate(`/library?q=${encodeURIComponent(t)}`);
    else navigate("/library");
  }

  return (
    <section className="mp-search" aria-label="통합 자료 검색">
      <div className="mp-search__inner">
        <p className="mp-search__eyebrow">Knowledge search</p>
        <h2 className="mp-search__title">방대한 카테고리에서 원하는 자료를 바로 찾아보세요</h2>
        <form className="mp-search__form" onSubmit={onSubmit}>
          <input
            className="mp-search__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="수능·어학·자격증·전공 키워드로 검색"
            autoComplete="off"
            aria-label="자료 통합 검색"
          />
          <button type="submit" className="mp-search__btn">
            검색
          </button>
        </form>
        <p className="mp-search__hint">
          결제 전 <strong>고화질 샘플</strong>로 내용을 확인할 수 있습니다.
        </p>
      </div>
    </section>
  );
}

export function PremiumVaultSection() {
  return (
    <section id="marketplace-premium" className="mp-vault">
      <div className="mp-section-head">
        <span className="mp-badge mp-badge--royal">Premium Vault</span>
        <h2 className="mp-section-title">검증된 전문가의 고품격 유료 자료</h2>
        <p className="mp-section-lead">
          에듀넷과 차별화되는 큐레이션 — 샘플 미리보기로 구매 전환을 돕습니다.
        </p>
      </div>
      <ul className="mp-vault__list">
        {PREMIUM_ROWS.map((row) => (
          <li key={row.id} className="mp-vault__row">
            <div className="mp-vault__thumb" aria-hidden />
            <div className="mp-vault__body">
              <div className="mp-vault__meta">
                <span className="mp-vault__tag">{row.tag}</span>
                <span className="mp-vault__seller">{row.seller}</span>
              </div>
              <h3 className="mp-vault__title">{row.title}</h3>
              <div className="mp-vault__foot">
                <span className="mp-vault__price">{row.price}</span>
                <Link to="/library" className="mp-vault__sample">
                  샘플 미리보기
                </Link>
                <Link to="/library" className="mp-vault__buy">
                  상세 보기
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CategoryGridSection() {
  return (
    <section id="marketplace-categories" className="mp-categories">
      <div className="mp-section-head">
        <h2 className="mp-section-title">테마별 학습 자료</h2>
        <p className="mp-section-lead">카테고리를 선택해 라이브러리로 이동합니다.</p>
      </div>
      <div className="mp-categories__grid">
        {CATEGORIES.map((c) => (
          <Link key={c.id} to={c.to} className="mp-cat-card">
            <span className={`mp-cat-card__icon mp-cat-card__icon--${c.icon}`}>
              <IconCategory name={c.icon} />
            </span>
            <span className="mp-cat-card__title">{c.title}</span>
            <span className="mp-cat-card__ko">{c.ko}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function LiveRankingSection() {
  return (
    <section id="marketplace-ranking" className="mp-rank">
      <div className="mp-section-head">
        <span className="mp-badge mp-badge--emerald">Live</span>
        <h2 className="mp-section-title">실시간 인기 자료</h2>
        <p className="mp-section-lead">지금 가장 많이 찾는 고품질 콘텐츠입니다.</p>
      </div>
      <ol className="mp-rank__list">
        {RANKING.map((r) => (
          <li key={r.rank} className="mp-rank__row">
            <span className="mp-rank__num">{r.rank}</span>
            <span className="mp-rank__title">{r.title}</span>
            <span className="mp-rank__heat">{r.heat}</span>
          </li>
        ))}
      </ol>
      <Link to="/library" className="mp-rank__more">
        라이브러리에서 전체 보기
      </Link>
    </section>
  );
}

export function CreatorCenterSection() {
  return (
    <section id="marketplace-creator" className="mp-creator">
      <div className="mp-creator__glass">
        <div className="mp-section-head mp-section-head--tight">
          <h2 className="mp-section-title">크리에이터 센터 · Seller Center</h2>
          <p className="mp-section-lead">
            일반 회원도 노하우를 등록·판매할 수 있습니다. 판매 통계와 정산은 대시보드에서 관리합니다.
          </p>
        </div>
        <ul className="mp-creator__bullets">
          <li>자료 등록 · 가격 설정 · 샘플 구간 노출</li>
          <li>판매 실적 요약 · 정산 내역 (교육자 워크스페이스)</li>
          <li>검증 교사·기관은 Premium Vault 우선 노출 혜택</li>
        </ul>
        <div className="mp-creator__actions">
          <Link to="/register?role=teacher" className="mp-btn mp-btn--royal">
            판매자로 시작하기
          </Link>
          <Link to="/dashboard" className="mp-btn mp-btn--emerald-ghost">
            내 판매 · 통계 (로그인)
          </Link>
          <Link to="/material/register" className="mp-btn mp-btn--outline">
            새 학습 자료 등록
          </Link>
        </div>
      </div>
    </section>
  );
}
