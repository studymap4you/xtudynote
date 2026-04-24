import { Link } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";

export type TopNavMainLinksProps = {
  /** Homework secondary line (e.g. dashboard uses "과제") */
  homeworkKo?: string;
};

export function TopNavMainLinks({ homeworkKo = "과제 번호" }: TopNavMainLinksProps) {
  return (
    <>
      <Link to="/library" className="btn btn--ghost btn--stack">
        <span className="ui-en">Library</span>
        <span className="ui-ko">라이브러리</span>
      </Link>
      <Link to="/homework" className="btn btn--ghost btn--stack">
        <span className="ui-en">Homework</span>
        <span className="ui-ko">{homeworkKo}</span>
      </Link>
      <Link to="/logic-dashboard" className="btn btn--ghost btn--stack">
        <span className="ui-en top-nav__link-en-with-icon">
          <LayoutDashboard size={16} strokeWidth={2} aria-hidden />
          Signal Logic
        </span>
        <span className="ui-ko">시그널 로직</span>
      </Link>
    </>
  );
}
