import { SIGNAL_LOGIC_SAMPLE_ANALYSES } from "@/data/signalLogicReadingSamples";
import type { SignalLogicPassageAnalysis } from "@/types/signalLogicReading";
import styles from "@/pages/logicDashboard.module.css";

function clipText(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars).trim()}…`;
}

function PassageCard({ analysis }: { analysis: SignalLogicPassageAnalysis }) {
  const { vocabulary, binaryLogic, signals, correctAnswer, originalText, analyzedAt, title } =
    analysis;
  const preview = clipText(originalText, 118);
  const binaryPreview = binaryLogic.slice(0, 4);
  const signalPreview = signals.slice(0, 2);

  return (
    <article className={styles.card} title={`해석 미리보기: ${clipText(analysis.translation, 160)}`}>
      <div className={styles.cardLabel}>Recent passage</div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardMeta}>분석일 {analyzedAt}</p>
      <p className={styles.cardPreview}>{preview}</p>
      <div className={styles.cardFooter}>
        <span className={`${styles.chip} ${styles.chipBinary}`}>정답 {correctAnswer.option}번</span>
        <span className={`${styles.chip} ${styles.chipMuted}`}>어휘 {vocabulary.length}</span>
        {binaryPreview.map((b, i) => (
          <span key={`${analysis.id}-b-${i}`} className={styles.chip}>
            [{b.bucket}] {b.keyword}
          </span>
        ))}
        {signalPreview.map((s, i) => (
          <span key={`${analysis.id}-s-${i}`} className={`${styles.chip} ${styles.chipMuted}`}>
            {s.word}·{s.logicRole}
          </span>
        ))}
      </div>
    </article>
  );
}

export function SignalLogicReadingDashboard() {
  return (
    <main className={styles.main}>
      <header className={styles.titleBlock}>
        <h1>
          Signal Logic <span className={styles.titleAccent}>Reading</span>
        </h1>
        <span className={styles.leadEn}>Unified logic-reading dashboard</span>
        <span className={styles.leadKo}>
          논리 독해 통합 대시보드 — 원문·해석·어휘·이분 논리·시그널·정답 데이터를 한 구조로 묶어
          관리합니다.
        </span>
      </header>

      <section className={styles.recentSection} aria-labelledby="logic-recent-heading">
        <h2 id="logic-recent-heading" className={styles.sectionHeading}>
          최근 분석 지문
          <span className={styles.sectionHeadingKo}>Recently analyzed passages</span>
        </h2>
        <div className={styles.cardGrid}>
          {SIGNAL_LOGIC_SAMPLE_ANALYSES.map((item) => (
            <PassageCard key={item.id} analysis={item} />
          ))}
        </div>
      </section>

      <div className={styles.ctaRegion}>
        <button type="button" className={styles.ctaLarge}>
          <span className={styles.ctaPrimary}>새 분석 시작</span>
          <span className={styles.ctaSecondary}>새 지문 분석 시작 · Start passage analysis</span>
        </button>
      </div>
    </main>
  );
}
