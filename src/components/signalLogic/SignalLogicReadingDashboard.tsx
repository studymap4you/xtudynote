import styles from "@/pages/logicDashboard.module.css";

const RECENT_PASSAGES = [
  {
    id: "1",
    title: "인공지능 규제와 창의적 파괴의 경계",
    analyzedAt: "2026.04.22",
    snippet: "핵심 논지는 정책 간 충돌을 전제로 한 반례 구조를 어떻게 수렴시키는지에 있습니다.",
  },
  {
    id: "2",
    title: "기후 적응 전략: 비용·공정성 프레임",
    analyzedAt: "2026.04.18",
    snippet: "‘분배 정의’와 ‘효율’이 대립할 때 출제자가 요구하는 논증 단계를 정리했습니다.",
  },
  {
    id: "3",
    title: "디지털 주권과 데이터 거버넌스",
    analyzedAt: "2026.04.10",
    snippet: "법조문형 지문에서 조건절·예외 조항이 논리 골격에 미치는 영향을 시각화했습니다.",
  },
] as const;

export function SignalLogicReadingDashboard() {
  return (
    <main className={styles.main}>
      <header className={styles.titleBlock}>
        <h1>Signal Logic Reading</h1>
        <span className={styles.leadEn}>Unified logic-reading dashboard</span>
        <span className={styles.leadKo}>
          논리 독해 통합 대시보드 — 지문 분석 기록과 새 분석을 한곳에서 관리합니다.
        </span>
      </header>

      <section className={styles.recentSection} aria-labelledby="logic-recent-heading">
        <h2 id="logic-recent-heading" className={styles.sectionHeading}>
          최근 분석한 지문
          <span className={styles.sectionHeadingKo}>Recently analyzed passages</span>
        </h2>
        <div className={styles.cardGrid}>
          {RECENT_PASSAGES.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.cardLabel}>Passage</div>
              <h3 className={styles.cardTitle}>{item.title}</h3>
              <p className={styles.cardMeta}>분석일 {item.analyzedAt}</p>
              <p className={styles.cardSnippet}>{item.snippet}</p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.ctaWrap}>
        <button type="button" className={styles.ctaLarge}>
          <span className={styles.ctaPrimary}>새 지문 분석 시작</span>
          <span className={styles.ctaSecondary}>Start new passage analysis</span>
        </button>
      </div>
    </main>
  );
}
