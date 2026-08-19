import { NavLink, useLocation } from "react-router-dom";

function pillClass(isActive: boolean): string {
  return `nav-pill${isActive ? " nav-pill--active" : ""}`;
}

export function TopNavMainLinks() {
  const { pathname } = useLocation();
  const classroomActive =
    pathname.startsWith("/classroom") && !pathname.startsWith("/classrooms");
  const libraryActive = pathname.startsWith("/library") || pathname.startsWith("/content/");

  return (
    <div className="top-nav__main-cluster">
      <NavLink to="/classroom" className={() => pillClass(classroomActive)}>
        <span className="nav-pill__title">내 강의실</span>
        <span className="nav-pill__sub">My classroom</span>
      </NavLink>

      <NavLink to="/library" className={() => pillClass(libraryActive)}>
        <span className="nav-pill__title">라이브러리</span>
        <span className="nav-pill__sub">Library</span>
      </NavLink>
    </div>
  );
}
