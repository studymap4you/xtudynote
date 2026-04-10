/**
 * 랜딩 히어로 — 딥 네이비, 얇은 타이포 + Fade만 (이동·과장 애니메이션 없음)
 */
export function Intro() {
  return (
    <div className="intro">
      <h1 className="intro__logo intro__fade intro__fade--1">XtudyNote</h1>
      <p className="intro__tagline-ko intro__tagline-ko--cycle">
        모든 과제가 기록되고, 모든 성장이 눈에 보입니다
      </p>
    </div>
  );
}
