import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BRAND_APP_NAME } from "@/lib/brand";
import { mapUnitsForStudentOutput } from "@/lib/textbookAuto/sectionInclusion";
import {
  LOCAL_DOC_FIELD_LABEL,
  problemModulePrintTitle,
} from "@/lib/localDocumentAuto/manuscriptModules";
import type {
  TextbookAnswerKeyItem,
  TextbookAnswerKeyLayout,
  TextbookContentStudyBlock,
  TextbookKeyConceptItem,
  TextbookPracticeItem,
  TextbookUnitContent,
  TextbookUnitTestItem,
} from "@/types/textbookAuto";
import { unitForStudentPrintBody } from "@/lib/textbookAuto/studentPrintBody";
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

function PracticeBlock({
  practice,
  layout,
}: {
  practice: TextbookPracticeItem[];
  layout: TextbookAnswerKeyLayout;
}) {
  if (!practice.length) return null;
  if (layout === "inline") {
    return (
      <section className={styles.section}>
        <h2 className={styles.h2}>확인학습</h2>
        <ol className={styles.ul}>
          {practice.map((p, i) => (
            <li key={i} className={styles.li}>
              <div className={styles.printBlock}>
                <p className={styles.q}>{p.question}</p>
                {p.answer?.trim() || p.explanationBullets?.some((s) => s.trim()) ? (
                  <div className={styles.inlineAnswer}>
                    {p.answer?.trim() ? (
                      <p className={styles.ans}>
                        <strong>정답:</strong> {p.answer.trim()}
                      </p>
                    ) : null}
                    {p.explanationBullets
                      ?.map((b) => b.trim())
                      .filter(Boolean)
                      .map((b, j) => (
                        <p key={j} className={styles.expBullet}>
                          • {b}
                        </p>
                      ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return (
    <ListBlock
      title="확인학습"
      items={practice.map((p) => p.question.trim()).filter(Boolean)}
    />
  );
}

function UnitTestBlock({
  items,
  layout,
}: {
  items: TextbookUnitTestItem[];
  layout: TextbookAnswerKeyLayout;
}) {
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
              {layout === "inline" && (it.answer?.trim() || it.explanationBullets?.some((s) => s.trim())) ? (
                <div className={styles.inlineAnswer}>
                  {it.answer?.trim() ? (
                    <p className={styles.ans}>
                      <strong>정답:</strong> {it.answer.trim()}
                    </p>
                  ) : null}
                  {it.explanationBullets
                    ?.map((b) => b.trim())
                    .filter(Boolean)
                    .map((b, j) => (
                      <p key={j} className={styles.expBullet}>
                        • {b}
                      </p>
                    ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AnswerKeyAppendixSection({
  orderedUnits,
  items,
}: {
  orderedUnits: { unitIndex: number; unit: TextbookUnitContent }[];
  items: TextbookAnswerKeyItem[];
}) {
  if (!items.length) return null;
  const byUnit = new Map<number, TextbookAnswerKeyItem[]>();
  for (const it of items) {
    const arr = byUnit.get(it.unitIndex) ?? [];
    arr.push(it);
    byUnit.set(it.unitIndex, arr);
  }
  const anyPrinted = orderedUnits.some(({ unitIndex }) => (byUnit.get(unitIndex)?.length ?? 0) > 0);
  if (!anyPrinted) return null;

  return (
    <div className={styles.appendixRoot}>
      <h2 className={`${styles.unitTitle} ${styles.printBlock}`}>부록 · 정답·해설</h2>
      {orderedUnits.map(({ unitIndex, unit }) => {
        const unitItems = (byUnit.get(unitIndex) ?? []).slice().sort((a, b) => {
          if (a.bucket !== b.bucket) return a.bucket === "practice" ? -1 : 1;
          return a.orderIndex - b.orderIndex;
        });
        if (!unitItems.length) return null;
        return (
          <article key={unitIndex} className={styles.unit}>
            <h3 className={`${styles.h2} ${styles.printBlock}`}>
              제 {unitIndex + 1}단원 · {unit.unitTitle}
            </h3>
            {(() => {
              const practice = unitItems.filter((x) => x.bucket === "practice");
              const test = unitItems.filter((x) => x.bucket === "unitTest");
              return (
                <>
                  {practice.length > 0 ? (
                    <section className={styles.section}>
                      <h4 className={styles.h3}>확인학습</h4>
                      <ol className={styles.ul}>
                        {practice.map((it) => (
                          <li key={it.id} className={styles.li}>
                            <div className={styles.printBlock}>
                              <p className={styles.q}>{it.question}</p>
                              <p className={styles.ans}>
                                <strong>정답:</strong> {it.answer}
                              </p>
                              {it.explanationBullets
                                .map((b) => b.trim())
                                .filter(Boolean)
                                .map((b, j) => (
                                  <p key={j} className={styles.expBullet}>
                                    • {b}
                                  </p>
                                ))}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}
                  {test.length > 0 ? (
                    <section className={styles.section}>
                      <h4 className={styles.h3}>단원평가</h4>
                      <ol className={styles.ul}>
                        {test.map((it) => (
                          <li key={it.id} className={styles.li}>
                            <div className={styles.printBlock}>
                              <p className={styles.q}>{it.question}</p>
                              <p className={styles.ans}>
                                <strong>정답:</strong> {it.answer}
                              </p>
                              {it.explanationBullets
                                .map((b) => b.trim())
                                .filter(Boolean)
                                .map((b, j) => (
                                  <p key={j} className={styles.expBullet}>
                                    • {b}
                                  </p>
                                ))}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}
                </>
              );
            })()}
          </article>
        );
      })}
    </div>
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
  answerKeyLayout = "appendix",
  answerKeyItems = [],
}: {
  units: { unitIndex: number; unit: TextbookUnitContent }[];
  unitCovers?: Record<number, File | null>;
  unitCoverUrls?: Record<number, string>;
  answerKeyLayout?: TextbookAnswerKeyLayout;
  answerKeyItems?: TextbookAnswerKeyItem[];
}) {
  const outUnits = mapUnitsForStudentOutput(units).map(({ unitIndex, unit }) => ({
    unitIndex,
    unit: unitForStudentPrintBody(unit, answerKeyLayout, { unitIndex, answerKeyItems }),
  }));
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
          <PracticeBlock practice={unit.practice} layout={answerKeyLayout} />
          <UnitTestBlock items={unit.unitTest} layout={answerKeyLayout} />
        </article>
      ))}
      {answerKeyLayout === "appendix" ? (
        <AnswerKeyAppendixSection orderedUnits={outUnits} items={answerKeyItems} />
      ) : null}
    </>
  );
}

export function TextbookAutoPrintView({
  bookTitle,
  units,
  answerKeyLayout = "appendix",
  answerKeyItems = [],
}: {
  bookTitle: string;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
  answerKeyLayout?: TextbookAnswerKeyLayout;
  answerKeyItems?: TextbookAnswerKeyItem[];
}) {
  return (
    <div className={`${styles.root} textbook-auto-print-root`}>
      <header className={styles.header}>
        <p className={styles.brand}>{BRAND_APP_NAME} · 교재 자동 생성 · 학생용</p>
        <h1 className={styles.h1}>{bookTitle || "제목 없음"}</h1>
        <p className={styles.meta}>인쇄 시 브라우저 여백은 「없음」을 권장합니다.</p>
      </header>
      <TextbookAutoStudentUnitsBody
        units={units}
        answerKeyLayout={answerKeyLayout}
        answerKeyItems={answerKeyItems}
      />
    </div>
  );
}
