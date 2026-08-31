import type { CSATQuestionRenderUnit, ResolvedCSATRenderOptions } from "@/lib/renderEngine/types";
import styles from "@/components/renderEngine/csatRender.module.css";

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤"];
const IMPORTED_PAGE_LABEL = /\s*Xtudy Universe\s*\|\s*고[1-3]\s+\d{4}년\s+0?\d{1,2}월\s+11유형\s+변형문제(?:\s+\d+)?\s*$/iu;

function withoutImportedPageLabel(value: string): string {
  return value.replace(IMPORTED_PAGE_LABEL, "").trimEnd();
}

function questionTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    PURPOSE: "PURPOSE",
    EMOTION_CHANGE: "EMOTION",
    IMPLIED_MEANING: "IMPLIED MEANING",
    MAIN_IDEA: "MAIN IDEA",
    CLAIM: "CLAIM",
    TOPIC: "TOPIC",
    TITLE: "TITLE",
    CHART: "CHART",
    FACTUAL_DESCRIPTION: "FACTUAL",
    FACTUAL_PRACTICAL: "PRACTICAL",
    GRAMMAR: "GRAMMAR",
    VOCABULARY: "VOCABULARY",
    BLANK_SHORT: "BLANK",
    BLANK_LONG: "LONG BLANK",
    IRRELEVANT_SENTENCE: "IRRELEVANT SENTENCE",
    PARAGRAPH_ORDER: "PARAGRAPH ORDER",
    SENTENCE_INSERTION: "SENTENCE INSERTION",
    SUMMARY: "SUMMARY",
    LONG_READING_1: "LONG READING",
    LONG_READING_2: "LONG READING",
  };
  return labels[value] || value.replaceAll("_", " ");
}

export function CSATQuestionBlock({
  unit,
  options,
  sameQuestionAsPrevious = false,
  sameQuestionAsNext = false,
}: {
  unit: CSATQuestionRenderUnit;
  options: ResolvedCSATRenderOptions;
  sameQuestionAsPrevious?: boolean;
  sameQuestionAsNext?: boolean;
}) {
  const { question } = unit;
  const stem = unit.showStem ? <h3 className={styles.questionStem}>{withoutImportedPageLabel(question.stem)}</h3> : null;
  return (
    <section className={`${styles.questionBlock}${unit.continuation ? ` ${styles.continuationBlock}` : ""}${sameQuestionAsPrevious ? ` ${styles.samePageContinuation}` : ""}${sameQuestionAsNext ? ` ${styles.samePageBeforeContinuation}` : ""}`}>
      {unit.showQuestionHeader ? (
        <header className={styles.questionHeader}>
          <strong>{String(question.studentNumber).padStart(2, "0")}</strong>
          <span>
            {options.showQuestionType ? <em className={styles.typeChip}>{questionTypeLabel(question.questionType)}</em> : null}
            {options.showDifficulty ? <em className={styles.difficultyChip}>{question.difficulty.toUpperCase()}</em> : null}
            {options.showScore && question.scoreSuggestion === 3 ? <em className={styles.scoreChip}>3 POINT</em> : null}
          </span>
        </header>
      ) : sameQuestionAsPrevious ? null : (
        <div className={styles.continuationLabel}>Q{String(question.studentNumber).padStart(2, "0")} · CONTINUED</div>
      )}
      {unit.stemBeforePassage ? stem : null}
      {unit.passage ? <p className={styles.passage}>{withoutImportedPageLabel(unit.passage)}</p> : null}
      {!unit.stemBeforePassage ? stem : null}
      {unit.choices.length > 0 ? (
        <ol className={styles.choiceList} start={unit.choices[0]?.index ?? 1}>
          {unit.choices.map((choice) => (
            <li key={choice.index}>
              <span aria-hidden="true">{CIRCLED_NUMBERS[choice.index - 1] || choice.index}</span>
              <p>{withoutImportedPageLabel(choice.text)}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {options.showStudyChecklist && unit.showReview ? (
        <div className={styles.studyChecklist} aria-label="학습 점검표">
          <span>□ 다시 보기</span><span>□ 근거 표시</span><span>□ 오답 정리</span>
        </div>
      ) : null}
    </section>
  );
}
