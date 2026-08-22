import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { LearningThemeMaterialsSection } from "@/components/landing/MarketplaceSections";
import "@/pages/pages.css";

export function LibraryThemesPage() {
  return (
    <PublicShell>
      <main className="admin-layout library-page admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>테마별 보기</h1>
          <span className="ui-ko">테마를 고르면 해당 분야 자료만 라이브러리에서 확인합니다</span>
        </div>
        <nav className="library-toolbar__views" aria-label="라이브러리 분류">
          <Link to="/library/themes" className="btn btn--stack btn--primary" aria-current="page">
            <span className="ui-en">By theme</span>
            <span className="ui-ko">테마별 보기</span>
          </Link>
          <Link to="/library?view=problem-bank" className="btn btn--stack btn--ghost">
            <span className="ui-en">Question bank</span>
            <span className="ui-ko">문제은행</span>
          </Link>
          <Link to="/library?view=source-material" className="btn btn--stack btn--ghost">
            <span className="ui-en">Source materials</span>
            <span className="ui-ko">원문소스</span>
          </Link>
        </nav>
        <LearningThemeMaterialsSection id="library-theme-browse" />
      </main>
    </PublicShell>
  );
}
