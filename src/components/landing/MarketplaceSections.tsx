import { Link } from "react-router-dom";
import { LEARNING_THEME_OPTIONS, type LearningThemeId } from "@/types/learningTheme";

const THEME_ROUTE: Record<LearningThemeId, string> = {
  k_entrance: "/library?theme=k_entrance",
  global_prep: "/library?theme=global_prep",
  professional: "/library?theme=professional",
  academic: "/library?theme=academic",
};

const CATEGORIES = LEARNING_THEME_OPTIONS.map((opt) => ({
  id: opt.id,
  title: opt.titleEn,
  ko: opt.titleKo,
  to: THEME_ROUTE[opt.id],
  icon:
    opt.id === "k_entrance"
      ? ("k" as const)
      : opt.id === "global_prep"
        ? ("g" as const)
        : opt.id === "professional"
          ? ("p" as const)
          : ("a" as const),
}));

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

/** 라이브러리 테마(K-Entrance 등) — 홈 랜딩 또는 /library/themes 에서 사용 */

export function LearningThemeMaterialsSection({
  id = "library-theme-categories",
  title = "테마별 학습 자료",
  lead = "카테고리를 선택해 라이브러리로 이동합니다.",
}: {
  id?: string;
  title?: string;
  lead?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="mp-categories" aria-labelledby={headingId}>
      <div className="mp-section-head">
        <h2 id={headingId} className="mp-section-title">
          {title}
        </h2>
        <p className="mp-section-lead">{lead}</p>
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
