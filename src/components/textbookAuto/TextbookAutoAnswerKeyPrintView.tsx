import { BRAND_APP_NAME } from "@/lib/brand";
import type { TextbookAnswerKeyItem } from "@/types/textbookAuto";
import styles from "@/components/textbookAuto/textbookAutoPrint.module.css";

function unitTitleLookup(units: { unitIndex: number; unitTitle: string }[], unitIndex: number): string {
  return units.find((u) => u.unitIndex === unitIndex)?.unitTitle ?? "";
}

export function TextbookAutoAnswerKeyPrintView({
  bookTitle,
  unitTitles,
  items,
}: {
  bookTitle: string;
  unitTitles: { unitIndex: number; unitTitle: string }[];
  items: TextbookAnswerKeyItem[];
}) {
  const byUnit = new Map<number, TextbookAnswerKeyItem[]>();
  for (const it of items) {
    const arr = byUnit.get(it.unitIndex) ?? [];
    arr.push(it);
    byUnit.set(it.unitIndex, arr);
  }
  const unitIndexes = [...byUnit.keys()].sort((a, b) => a - b);

  return (
    <div className={`${styles.root} textbook-auto-answer-print-root`}>
      <header className={styles.header}>
        <p className={styles.brand}>{BRAND_APP_NAME} · 교재 자동 생성 · 교사용 정답·해설</p>
        <h1 className={styles.h1}>{bookTitle || "제목 없음"}</h1>
        <p className={styles.meta}>인쇄 시 브라우저 여백은 「없음」을 권장합니다.</p>
      </header>
      {unitIndexes.map((ui) => {
        const unitItems = (byUnit.get(ui) ?? []).slice();
        const practice = unitItems.filter((x) => x.bucket === "practice").sort((a, b) => a.orderIndex - b.orderIndex);
        const test = unitItems.filter((x) => x.bucket === "unitTest").sort((a, b) => a.orderIndex - b.orderIndex);
        const ut = unitTitleLookup(unitTitles, ui);
        return (
          <article key={ui} className={styles.unit}>
            <h2 className={styles.unitTitle}>
              제 {ui + 1}단원 · {ut || "(제목 없음)"}
            </h2>
            <section className={styles.section}>
              <h2 className={styles.h2}>확인학습 — 정답·해설</h2>
              {practice.length ? (
                <ol className={styles.ulOl}>
                  {practice.map((it) => (
                    <li key={it.id} className={`${styles.liBlock} ${styles.printBlock}`}>
                      <p className={styles.q}>{it.question}</p>
                      <p className={styles.ans}>
                        <strong>정답</strong> {it.answer}
                      </p>
                      <ul className={styles.ul}>
                        {it.explanationBullets.map((b, j) => (
                          <li key={j} className={styles.li}>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.muted}>문항 없음</p>
              )}
            </section>
            <section className={styles.section}>
              <h2 className={styles.h2}>단원평가 — 정답·해설</h2>
              {test.length ? (
                <ol className={styles.ulOl}>
                  {test.map((it) => (
                    <li key={it.id} className={`${styles.liBlock} ${styles.printBlock}`}>
                      <p className={styles.q}>{it.question}</p>
                      <p className={styles.ans}>
                        <strong>정답</strong> {it.answer}
                      </p>
                      <ul className={styles.ul}>
                        {it.explanationBullets.map((b, j) => (
                          <li key={j} className={styles.li}>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.muted}>문항 없음</p>
              )}
            </section>
          </article>
        );
      })}
    </div>
  );
}
