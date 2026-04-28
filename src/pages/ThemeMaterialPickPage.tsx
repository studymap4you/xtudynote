import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { LEARNING_THEME_OPTIONS } from "@/types/learningTheme";
import "@/pages/pages.css";

export function ThemeMaterialPickPage() {
  return (
    <DashboardShell light>
      <main className="admin-layout admin-layout--light material-register material-register--premium theme-material-pick">
        <nav className="theme-material-pick__nav">
          <Link to="/material/register" className="theme-material-pick__back">
            ← 자료 등록
          </Link>
        </nav>

        <div className="admin-layout__title-row">
          <h1>테마별 자료 등록</h1>
          <span className="ui-ko material-register__subtitle-bi">
            <span className="reg-form__label-en" style={{ display: "block", fontWeight: 700 }}>
              Theme-first registration
            </span>
            <span className="reg-form__label-ko" style={{ display: "block", marginTop: "0.25rem" }}>
              라이브러리 테마를 먼저 고른 뒤 통합 신청 양식으로 이어집니다
            </span>
          </span>
        </div>

        <p className="material-register__notice">
          홈의「새자료 등록」과 동일한 통합 신청 경로입니다. 강의실 전용 업로드에는 테마가 없으며, 여기서 선택한 테마로
          마스터 검수 후 라이브러리에 반영됩니다.
        </p>

        <section className="theme-material-pick__section" aria-labelledby="theme-pick-h">
          <h2 id="theme-pick-h" className="theme-material-pick__section-title">
            <LayoutGrid size={20} strokeWidth={2} aria-hidden />
            테마 선택
          </h2>
          <ul className="theme-material-pick__grid">
            {LEARNING_THEME_OPTIONS.map((opt) => (
              <li key={opt.id}>
                <Link
                  to={`/material/register?theme=${opt.id}`}
                  className="theme-material-pick__card"
                >
                  <span className="theme-material-pick__card-en">{opt.titleEn}</span>
                  <span className="theme-material-pick__card-ko">{opt.titleKo}</span>
                  <span className="theme-material-pick__card-cta">이 테마로 등록하기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </DashboardShell>
  );
}
