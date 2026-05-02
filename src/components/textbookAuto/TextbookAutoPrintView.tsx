import { BRAND_APP_NAME } from "@/lib/brand";
import type { TextbookUnitContent } from "@/types/textbookAuto";
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
        <p className={styles.brand}>{BRAND_APP_NAME} · 교재 자동 생성(1단계)</p>
        <h1 className={styles.h1}>{bookTitle || "제목 없음"}</h1>
        <p className={styles.meta}>인쇄 시 브라우저 여백은 「없음」을 권장합니다.</p>
      </header>
      {units.map(({ unitIndex, unit }) => (
        <article key={unitIndex} className={styles.unit}>
          <h2 className={styles.unitTitle}>
            제 {unitIndex + 1}단원 · {unit.unitTitle}
          </h2>
          <ListBlock title="핵심개념" items={unit.keyConcepts} />
          <ListBlock title="내용학습" items={unit.contentStudy} />
          <ListBlock title="핵심요약" items={unit.coreSummary} />
          <ListBlock title="확인학습" items={unit.practice} />
          <ListBlock title="단원평가" items={unit.unitTest} />
        </article>
      ))}
    </div>
  );
}
