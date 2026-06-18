import type { CSSProperties } from "react";
import { useMemo, useRef } from "react";
import { BRAND_APP_NAME, BRAND_APP_NAME_KO } from "@/lib/brand";
import type { XUniversePremiumTemplate } from "@/data/xuniversePremiumTemplates";
import { printPremiumTextbookElement } from "@/lib/premiumTextbookPrint";
import type { PremiumTextbook, PremiumUploadedFileMetadata } from "@/types/premiumTextbook";
import styles from "@/components/premium/premiumTextbookPreview.module.css";

type PremiumTextbookPreviewProps = {
  textbook: PremiumTextbook;
  template: XUniversePremiumTemplate;
  uploadedFiles?: PremiumUploadedFileMetadata[];
};

function difficultyLabel(difficulty?: string): string {
  if (difficulty === "hard") return "Hard";
  if (difficulty === "medium") return "Medium";
  return "Easy";
}

function questionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "multiple-choice": "객관식",
    "short-answer": "단답형",
    blank: "빈칸",
    essay: "서술형",
    matching: "매칭",
    ordering: "순서",
  };
  return labels[type] ?? type;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function PremiumTextbookPreview({ textbook, template, uploadedFiles = [] }: PremiumTextbookPreviewProps) {
  const printRef = useRef<HTMLElement | null>(null);
  const allQuestions = textbook.units.flatMap((unit) => unit.questions);
  const layoutClass = useMemo(
    () => (template.layoutStyle === "academy-pro" ? styles.academyLayout : styles.logicCodeLayout),
    [template.layoutStyle],
  );

  return (
    <section
      ref={printRef}
      className={`${styles.shell} ${layoutClass} print-area`}
      style={{ "--premium-accent": template.accent } as CSSProperties}
      aria-label="XUniverse 프리미엄 교재 미리보기"
    >
      <div className={`${styles.toolbar} no-print`}>
        <div>
          <strong>교재 내지 미리보기</strong>
          <span>{template.name} · 인쇄/PDF 저장 최적화</span>
        </div>
        <button
          type="button"
          className={styles.printButton}
          onClick={() => {
            if (printRef.current) {
              printPremiumTextbookElement(printRef.current, textbook.title);
            }
          }}
        >
          완성 교재 PDF 저장 / 인쇄
        </button>
      </div>

      <article className={`${styles.page} ${styles.cover} page-break`}>
        <span className={styles.coverLineVertical} aria-hidden="true" />
        <span className={styles.coverLineHorizontal} aria-hidden="true" />
        <span className={styles.coverOrbTop} aria-hidden="true" />
        <span className={styles.coverOrbBottom} aria-hidden="true" />
        <div className={styles.brandRow}>
          <span className={styles.logoMark}>X</span>
          <span>
            <strong>{BRAND_APP_NAME}</strong>
            <em>{BRAND_APP_NAME_KO} · AI Learning Platform</em>
          </span>
        </div>
        <div className={styles.coverBody}>
          <p className={styles.coverKicker}>{template.shortName}</p>
          <h2>{textbook.title}</h2>
          {textbook.subtitle ? <p className={styles.subtitle}>{textbook.subtitle}</p> : null}
          <p className={styles.overview}>{textbook.overview}</p>
        </div>
        <div className={styles.coverMeta}>
          <span>Template: {template.name}</span>
          {textbook.targetLearner ? <span>Target: {textbook.targetLearner}</span> : null}
          <span>XUniverse Premium Textbook</span>
        </div>
      </article>

      <article className={`${styles.page} page-break`}>
        <header className={styles.pageHeader}>
          <span>{BRAND_APP_NAME}</span>
          <strong>Premium Learning Map</strong>
        </header>
        <section className={styles.sectionBlock}>
          <p className={styles.kicker}>Template Structure</p>
          <h3>교재 구성</h3>
          <div className={styles.sectionPills}>
            {template.sections.map((section) => (
              <span key={section}>{section}</span>
            ))}
          </div>
        </section>
        <section className={styles.twoColumn}>
          <div className={styles.infoBox}>
            <p className={styles.kicker}>Design Tone</p>
            <p>{template.designTone}</p>
          </div>
          <div className={styles.infoBox}>
            <p className={styles.kicker}>Uploaded Sources</p>
            {uploadedFiles.length > 0 ? (
              <ul className={styles.fileList}>
                {uploadedFiles.map((file) => (
                  <li key={`${file.name}-${file.size}`}>
                    {file.name} <span>{file.type || "unknown"} · {formatBytes(file.size)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>붙여넣은 원문을 중심으로 구성되었습니다.</p>
            )}
          </div>
        </section>
        <footer className={styles.pageFooter}>XUniverse Premium Textbook</footer>
      </article>

      {textbook.units.map((unit, unitIndex) => (
        <article key={`${unit.unitTitle}-${unitIndex}`} className={`${styles.page} page-break`}>
          <header className={styles.pageHeader}>
            <span>{BRAND_APP_NAME}</span>
            <strong>Unit {unitIndex + 1}</strong>
          </header>
          <section className={styles.unitIntro}>
            <p className={styles.kicker}>Unit {unitIndex + 1}</p>
            <h3>{unit.unitTitle}</h3>
            {unit.unitSubtitle ? <p>{unit.unitSubtitle}</p> : null}
          </section>

          <section className={styles.goalBox}>
            <p className={styles.kicker}>Learning Goals</p>
            <ul>
              {unit.learningGoals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          </section>

          <section className={styles.conceptBox}>
            <p className={styles.kicker}>Core Concept</p>
            <p>{unit.conceptSummary}</p>
          </section>

          {(unit.keyVocabulary?.length || unit.grammarPoints?.length || unit.examples?.length) ? (
            <section className={styles.learningGrid}>
              {unit.keyVocabulary?.length ? (
                <div className={styles.tableBox}>
                  <p className={styles.kicker}>Vocabulary</p>
                  <table>
                    <tbody>
                      {unit.keyVocabulary.map((item) => (
                        <tr key={`${item.term}-${item.meaning}`}>
                          <th>{item.term}</th>
                          <td>
                            {item.meaning}
                            {item.example ? <small>{item.example}</small> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {unit.grammarPoints?.length ? (
                <div className={styles.listBox}>
                  <p className={styles.kicker}>Grammar / Key Points</p>
                  <ul>
                    {unit.grammarPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {unit.examples?.length ? (
                <div className={styles.listBox}>
                  <p className={styles.kicker}>Examples</p>
                  <ul>
                    {unit.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className={styles.questions}>
            <p className={styles.kicker}>Practice & Assessment</p>
            {unit.questions.map((question, questionIndex) => (
              <div key={`${question.question}-${questionIndex}`} className={styles.questionCard}>
                <div className={styles.questionMeta}>
                  <span>Q{questionIndex + 1}</span>
                  <em>{questionTypeLabel(question.type)}</em>
                  <strong>{difficultyLabel(question.difficulty)}</strong>
                </div>
                <p className={styles.questionText}>{question.question}</p>
                {question.choices?.length ? (
                  <ol className={styles.choices}>
                    {question.choices.map((choice) => (
                      <li key={choice}>{choice}</li>
                    ))}
                  </ol>
                ) : null}
                <div className={styles.answerBox}>
                  <strong>정답</strong> {question.answer}
                  <p>{question.explanation}</p>
                </div>
              </div>
            ))}
          </section>
          <footer className={styles.pageFooter}>XUniverse Premium Textbook · {unit.unitTitle}</footer>
        </article>
      ))}

      {textbook.answerKey?.length || allQuestions.length ? (
        <article className={styles.page}>
          <header className={styles.pageHeader}>
            <span>{BRAND_APP_NAME}</span>
            <strong>Answer Key</strong>
          </header>
          <section className={styles.sectionBlock}>
            <p className={styles.kicker}>Answers & Explanations</p>
            <h3>정답 및 해설</h3>
            <div className={styles.answerList}>
              {(textbook.answerKey?.length
                ? textbook.answerKey
                : allQuestions.map((question, index) => ({
                    questionNumber: index + 1,
                    answer: question.answer,
                    explanation: question.explanation,
                  }))
              ).map((item) => (
                <div key={item.questionNumber} className={styles.answerItem}>
                  <strong>{item.questionNumber}</strong>
                  <span>{item.answer}</span>
                  <p>{item.explanation}</p>
                </div>
              ))}
            </div>
          </section>
          <footer className={styles.pageFooter}>XUniverse Premium Textbook</footer>
        </article>
      ) : null}
    </section>
  );
}
