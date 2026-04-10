/**
 * 랜딩 히어로 — 차분한 슬레이트 블루 톤, 순차 Fade-in
 */
export function Intro() {
  return (
    <div className="intro">
      <p className="intro__eyebrow intro__fade intro__fade--1">Premium learning platform</p>
      <h1 className="intro__logo intro__fade intro__fade--2">XtudyNote</h1>
      <p className="intro__slogan intro__fade intro__fade--3">
        The Ultimate Learning Ecosystem, All in One.
      </p>
      <p className="intro__slogan-ko intro__fade intro__fade--4">
        궁극의 학습 생태계를 하나의 플랫폼에
      </p>
      <div className="intro__tagline intro__fade intro__fade--5">
        <p className="intro__tagline-ko">선생님과 학생 모두의 학습공간 — XtudyNote</p>
        <p className="intro__tagline-en" lang="en">
          A Learning Space for Both Teachers and Students
        </p>
      </div>
    </div>
  );
}
