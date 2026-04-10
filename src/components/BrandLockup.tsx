/**
 * 상단 네비게이션용 — XtudyNote · 엑스터디노트 (영·한 병기)
 */
export function BrandLockup() {
  return (
    <span className="brand-lockup">
      <span className="brand-lockup__en">XtudyNote</span>
      <span className="brand-lockup__sep" aria-hidden="true">
        ·
      </span>
      <span className="brand-lockup__ko" lang="ko">
        엑스터디노트
      </span>
    </span>
  );
}
