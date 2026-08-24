import { NavLink, useLocation } from "react-router-dom";

function pillClass(isActive: boolean): string {
  return `nav-pill${isActive ? " nav-pill--active" : ""}`;
}

export function TopNavMainLinks() {
  const { pathname } = useLocation();
  const highSchoolActive = pathname.startsWith("/high-school-exams");
  const supplementaryActive = pathname.startsWith("/supplementary-materials");
  const csatActive = pathname.startsWith("/csat");
  const textbookActive = pathname === "/" || pathname.startsWith("/tools/textbook-auto");
  const libraryActive = pathname.startsWith("/library") || pathname.startsWith("/content/");

  return (
    <div className="top-nav__main-cluster">
      <NavLink to="/high-school-exams" className={() => pillClass(highSchoolActive)}>
        <span className="nav-pill__title">고등내신</span>
        <span className="nav-pill__sub">High school</span>
      </NavLink>

      <NavLink to="/supplementary-materials" className={() => pillClass(supplementaryActive)}>
        <span className="nav-pill__title">내신부교재</span>
        <span className="nav-pill__sub">Supplementary</span>
      </NavLink>

      <NavLink to="/csat" className={() => pillClass(csatActive)}>
        <span className="nav-pill__title">수능</span>
        <span className="nav-pill__sub">CSAT</span>
      </NavLink>

      <NavLink to="/tools/textbook-auto" className={() => pillClass(textbookActive)}>
        <span className="nav-pill__title">교재제작</span>
        <span className="nav-pill__sub">Textbook</span>
      </NavLink>

      <NavLink to="/library" className={() => pillClass(libraryActive)}>
        <span className="nav-pill__title">라이브러리</span>
        <span className="nav-pill__sub">Library</span>
      </NavLink>
    </div>
  );
}
