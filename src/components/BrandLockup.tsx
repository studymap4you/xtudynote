/**
 * 상단·히어로 브랜드 — X 강조(적·보라 그라데이션 + 광택) + 엑스터디노트
 */
export function BrandLockup() {
  return (
    <span className="brand-lockup">
      <span className="brand-lockup__en" lang="en">
        <span className="brand-lockup__x" aria-hidden="true">
          X
        </span>
        <span className="brand-lockup__rest">tudyNote</span>
      </span>
      <span className="brand-lockup__sep" aria-hidden="true">
        ·
      </span>
      <span className="brand-lockup__ko" lang="ko">
        엑스터디노트
      </span>
    </span>
  );
}
