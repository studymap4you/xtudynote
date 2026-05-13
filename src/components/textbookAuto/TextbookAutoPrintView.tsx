import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BRAND_APP_NAME } from "@/lib/brand";
import { mapUnitsForStudentOutput } from "@/lib/textbookAuto/sectionInclusion";
import {
  LOCAL_DOC_FIELD_LABEL,
  problemModulePrintTitle,
} from "@/lib/localDocumentAuto/manuscriptModules";
import type {
  TextbookContentStudyBlock,
  TextbookKeyConceptItem,
  TextbookUnitContent,
  TextbookUnitTestItem,
} from "@/types/textbookAuto";
import styles from "@/components/textbookAuto/textbookAutoPrint.module.css";

function UnitPageCoverImg({
  coverFile,
  coverUrl,
}: {
  coverFile: File | null;
  coverUrl?: string | null;
}) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!coverFile) {
      setBlobSrc(null);
      return;
    }
    const u = URL.createObjectURL(coverFile);
    setBlobSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [coverFile]);
  const src = blobSrc ?? coverUrl ?? null;
  if (!src) return null;
  return (
    <div className={`${styles.unitCoverWrap} ${styles.printBlock}`}>
      <img src={src} alt="" className={styles.unitCoverImg} />
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      <ul className={styles.ul}>
        {items.map((t, i) => (
          <li key={i} className={styles.li}>
            <span className={styles.printBlock}>{t}</span>
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
            <div className={styles.printBlock}>
              <strong>{k.concept}</strong>
              {k.explanation ? <> — {k.explanation}</> : null}
            </div>
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
        <div key={i} className={styles.printBlock}>
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
            <div className={styles.printBlock}>
              <p className={styles.q}>{it.question}</p>
              {it.kind === "mcq" ? (
                <ol type="a" className={styles.ul}>
                  {it.choices.map((c, j) => (
                    <li key={j} className={styles.li}>
                      {c}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ManuscriptModulesBlock({ modules }: { modules: TextbookUnitContent["manuscriptModules"] }) {
  if (!modules?.length) return null;
  let problemOrdinal = 0;
  const blocks: ReactNode[] = [];
  for (const m of modules) {
    if (m.field === "evaluation") continue;
    const body = (m.body ?? "").trim();
    if (!body) continue;
    let title: string;
    if (m.field === "problem") {
      problemOrdinal += 1;
      title = problemModulePrintTitle(m, problemOrdinal);
    } else {
      title = m.field === "preamble" ? "도입 (구획 전)" : LOCAL_DOC_FIELD_LABEL[m.field];
    }
    blocks.push(
      <div key={m.id} className={`${styles.moduleBox} ${styles.printBlock}`}>
        <h3 className={styles.h3}>{title}</h3>
        <pre className={styles.preBody}>{body}</pre>
      </div>,
    );
  }
  if (!blocks.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>원고 모듈</h2>
      {blocks}
    </section>
  );
}

export function TextbookAutoStudentUnitsBody({
  units,
  unitCovers,
  unitCoverUrls,
}: {
  units: { unitIndex: number; unit: TextbookUnitContent }[];
  unitCovers?: Record<number, File | null>;
  unitCoverUrls?: Record<number, string>;
}) {
  const outUnits = mapUnitsForStudentOutput(units);
  return (
    <>
      {outUnits.map(({ unitIndex, unit }) => (
        <article key={unitIndex} className={styles.unit}>
          <UnitPageCoverImg
            coverFile={unitCovers?.[unitIndex] ?? null}
            coverUrl={unitCoverUrls?.[unitIndex] ?? null}
          />
          <h2 className={`${styles.unitTitle} ${styles.printBlock}`}>
            제 {unitIndex + 1}단원 · {unit.unitTitle}
          </h2>
          <ManuscriptModulesBlock modules={unit.manuscriptModules} />
          <KeyConceptBlock items={unit.keyConcepts} />
          <ContentStudyPrint blocks={unit.contentStudy} />
          <ListBlock title="핵심요약" items={unit.coreSummary} />
          <ListBlock title="확인학습" items={unit.practice} />
          <UnitTestBlock items={unit.unitTest} />
        </article>
      ))}
    </>
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
      <TextbookAutoStudentUnitsBody units={units} />
    </div>
  );
}
