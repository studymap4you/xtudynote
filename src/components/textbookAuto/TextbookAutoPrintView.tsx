import { BRAND_APP_NAME } from "@/lib/brand";
import type {
  TextbookContentStudyBlock,
  TextbookKeyConceptItem,
  TextbookUnitContent,
  TextbookUnitTestItem,
} from "@/types/textbookAuto";
import styles from "@/components/textbookAuto/textbookAutoPrint.module.css";

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      <ul className={styles.ul}>
        {items.map((t, i) => (
          <li key={i} className={styles.li}>
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

function KeyConceptBlock({ items }: { items: TextbookKeyConceptItem[] }) {
  if (!items.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>핵심개념</h2>
      <ul className={styles.ul}>
        {items.map((k, i) => (
          <li key={i} className={styles.li}>
            <strong>{k.concept}</strong>
            {k.explanation ? <> — {k.explanation}</> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContentStudyPrint({ blocks }: { blocks: TextbookContentStudyBlock[] }) {
  if (!blocks.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>내용학습</h2>
      {blocks.map((b, i) => (
        <div key={i}>
          <h3 className={styles.h3}>{b.title}</h3>
          <ul className={styles.ul}>
            {b.bullets.map((line, j) => (
              <li key={j} className={styles.li}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function UnitTestBlock({ items }: { items: TextbookUnitTestItem[] }) {
  if (!items.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>단원평가</h2>
      <ol className={styles.ul}>
        {items.map((it, i) => (
          <li key={i} className={styles.li}>
            <p>{it.question}</p>
            {it.kind === "mcq" ? (
              <ol type="a" className={styles.ul}>
                {it.choices.map((c, j) => (
                  <li key={j} className={styles.li}>
                    {c}
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TextbookAutoPrintView({
  bookTitle,
  units,
}: {
  bookTitle: string;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
}) {
  return (
    <div className={`${styles.root} textbook-auto-print-root`}>
      <header className={styles.header}>
        <p className={styles.brand}>{BRAND_APP_NAME} · 교재 자동 생성 · 학생용</p>
        <h1 className={styles.h1}>{bookTitle || "제목 없음"}</h1>
        <p className={styles.meta}>인쇄 시 브라우저 여백은 「없음」을 권장합니다.</p>
      </header>
      {units.map(({ unitIndex, unit }) => (
        <article key={unitIndex} className={styles.unit}>
          <h2 className={styles.unitTitle}>
            제 {unitIndex + 1}단원 · {unit.unitTitle}
          </h2>
          <KeyConceptBlock items={unit.keyConcepts} />
          <ContentStudyPrint blocks={unit.contentStudy} />
          <ListBlock title="핵심요약" items={unit.coreSummary} />
          <ListBlock title="확인학습" items={unit.practice} />
          <UnitTestBlock items={unit.unitTest} />
        </article>
      ))}
    </div>
  );
}
