import type { NewsletterAiResult, NewsletterSection } from "@/types/newsletter";
import styles from "./NewsletterPrintView.module.css";

function displayBody(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\*\*/g, "");
}

function SectionBody({ s }: { s: NewsletterSection }) {
  const layout =
    s.imageLayout === "left" || s.imageLayout === "right" ? s.imageLayout : "block";
  const pct = s.imageWidthPercent ?? (layout === "block" ? 100 : 40);

  if (s.imageDataUrl && (layout === "left" || layout === "right")) {
    const rowCls =
      layout === "left"
        ? `newsletter-print-flex-row ${styles.sideRow}`
        : `newsletter-print-flex-row newsletter-print-flex-row--rev ${styles.sideRow} ${styles.sideRowRev}`;
    return (
      <div className={rowCls}>
        <figure
          className={styles.sideFigure}
          style={{ width: `${Math.min(55, Math.max(22, pct))}%` }}
        >
          <img src={s.imageDataUrl} alt="" className={styles.sideImg} />
        </figure>
        <div className={`newsletter-print-body ${styles.sideText}`}>{displayBody(s.bodyKo)}</div>
      </div>
    );
  }

  return (
    <>
      {s.imageDataUrl ? (
        <div className={`newsletter-print-imgwrap ${styles.imgWrap}`}>
          <img
            src={s.imageDataUrl}
            alt=""
            className={styles.sectionImg}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <div className={`newsletter-print-body ${styles.body}`}>{displayBody(s.bodyKo)}</div>
    </>
  );
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
          <SectionBody s={s} />
        </section>
      ))}

      <p className={`printFoot ${styles.printFoot}`}>Xtudy-Universe · Learning Newsletter</p>
    </div>
  );
}
