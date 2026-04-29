import type { NewsletterAiResult } from "@/types/newsletter";
import styles from "./NewsletterPrintView.module.css";

function displayBody(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\*\*/g, "");
}

export type NewsletterPrintViewProps = {
  data: NewsletterAiResult;
  teacherName: string;
  issueLabel: string;
};

/** react-to-print용 — 화면에서는 부모가 시각적으로 숨깁니다 */
export function NewsletterPrintView({ data, teacherName, issueLabel }: NewsletterPrintViewProps) {
  return (
    <div className={`newsletter-print-root ${styles.root}`}>
      <header className={styles.headerBand}>
        <p className={styles.brand}>Xtudy-Universe · Learning Newsletter</p>
        <p className={styles.metaLine}>
          담당 {teacherName} <span className={styles.sep}>|</span> {issueLabel}
        </p>
      </header>

      <h1 className={styles.docTitle}>{data.titleKo}</h1>
      <div className={styles.rule} />

      {data.sections.map((s) => (
        <section key={s.id} className={styles.section}>
          <h2 className={styles.h2}>{s.headingKo}</h2>
          {s.imageDataUrl ? (
            <div className={styles.imgWrap}>
              <img
                src={s.imageDataUrl}
                alt=""
                className={styles.sectionImg}
                style={{ width: `${s.imageWidthPercent ?? 100}%` }}
              />
            </div>
          ) : null}
          <div className={styles.body}>{displayBody(s.bodyKo)}</div>
        </section>
      ))}

      <p className={styles.printFoot}>Xtudy-Universe · Learning Newsletter</p>
    </div>
  );
}
