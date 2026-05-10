import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { LearningThemeMaterialsSection } from "@/components/landing/MarketplaceSections";
import "@/pages/pages.css";

export function LibraryThemesPage() {
  return (
    <PublicShell>
      <main className="admin-layout library-page admin-layout--light">
        <nav className="theme-material-pick__nav" aria-label="라이브러리">
          <Link to="/library" className="theme-material-pick__back">
            ← 라이브러리
          </Link>
        </nav>
        <div className="admin-layout__title-row">
          <h1>테마별 보기</h1>
          <span className="ui-ko">테마를 고르면 해당 분야 자료만 라이브러리에서 확인합니다</span>
        </div>
        <LearningThemeMaterialsSection id="library-theme-browse" />
      </main>
    </PublicShell>
  );
}
