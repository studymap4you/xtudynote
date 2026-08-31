import { Fragment, type ReactNode } from "react";
import type { CSATQuestionRenderUnit, ResolvedCSATRenderOptions } from "@/lib/renderEngine/types";
import styles from "@/components/renderEngine/csatRender.module.css";

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤"];
const IMPORTED_PAGE_LABEL = /\s*Xtudy Universe\s*\|\s*고[1-3]\s+\d{4}년\s+0?\d{1,2}월\s+11유형\s+변형문제(?:\s+\d+)?\s*$/iu;
const INLINE_CANDIDATE_TYPES = new Set(["GRAMMAR", "VOCABULARY"]);
const POSITION_SELECTION_TYPES = new Set(["SENTENCE_INSERTION", "IRRELEVANT_SENTENCE"]);
const INLINE_ONLY_TYPES = new Set([...INLINE_CANDIDATE_TYPES, ...POSITION_SELECTION_TYPES]);

function withoutImportedPageLabel(value: string): string {
  return value.replace(IMPORTED_PAGE_LABEL, "").trimEnd();
}

function stripChoicePrefix(value: string, index: number): string {
  let text = withoutImportedPageLabel(value).trim();
  const circled = CIRCLED_NUMBERS[index - 1];
  if (circled && text.startsWith(circled)) text = text.slice(circled.length).trimStart();
  text = text.replace(new RegExp(`^\\(?${index}\\)?[.)]?\\s+`, "u"), "").trim();
  return text;
}

function stripTrailingPositionEcho(value: string): string {
  return value.replace(/\s*①\s*②\s*③\s*④\s*⑤\s*$/u, "").trimEnd();
}

function extractTrailingCandidateEcho(value: string): { passage: string; candidates: string[] } | null {
  const markers = [...value.matchAll(/[①②③④⑤]/gu)];
  if (markers.length < 10) return null;
  const tail = markers.slice(-5);
  if (tail.map((marker) => marker[0]).join("") !== "①②③④⑤") return null;

  const candidates = tail.map((marker, index) => withoutImportedPageLabel(value.slice(
    Number(marker.index) + marker[0].length,
    index + 1 < tail.length ? Number(tail[index + 1].index) : value.length,
  )).trim());
  if (candidates.some((candidate) => !candidate || candidate.length > 180)) return null;

  const passage = value.slice(0, Number(tail[0].index)).trimEnd();
  const duplicateMatches = candidates.filter((candidate) => passage.includes(candidate)).length;
  if (duplicateMatches < 4) return null;
  return { passage, candidates };
}

function emphasizeExactCandidate(value: string, candidate: string, marker?: string): string {
  if (!candidate || value.includes(`**${candidate}**`)) return value;
  const searchStart = marker ? value.indexOf(marker) : -1;
  const candidateIndex = value.indexOf(candidate, Math.max(0, searchStart));
  if (candidateIndex < 0) return value;
  if (marker && searchStart >= 0) {
    const between = value.slice(searchStart + marker.length, candidateIndex);
    if (!/^\s*$/u.test(between) || between.length > 4) return value;
  }
  return `${value.slice(0, candidateIndex)}**${candidate}**${value.slice(candidateIndex + candidate.length)}`;
}

function emphasizeInlineCandidates(value: string, candidates: string[]): string {
  return candidates.reduce((current, candidate, index) => (
    emphasizeExactCandidate(current, candidate, CIRCLED_NUMBERS[index])
  ), value);
}

function impliedMeaningTarget(explanation: string): string {
  const match = explanation.match(/(?:굵게\s*표시된|굵은\s*글씨로\s*강조된|밑줄\s*친|밑줄\s*표시된)\s*[“\"']([^”\"']{2,180})[”\"']/u);
  return match?.[1]?.trim() || "";
}

function preparePassage(
  questionType: string,
  rawPassage: string,
  choices: CSATQuestionRenderUnit["choices"],
  explanation: string,
): string {
  const type = questionType.toUpperCase();
  let passage = withoutImportedPageLabel(rawPassage);

  if (POSITION_SELECTION_TYPES.has(type)) return stripTrailingPositionEcho(passage);

  if (INLINE_CANDIDATE_TYPES.has(type)) {
    const echoed = extractTrailingCandidateEcho(passage);
    if (echoed) passage = echoed.passage;

    const choiceCandidates = choices
      .map((choice) => stripChoicePrefix(choice.text, choice.index))
      .filter((candidate) => candidate.length > 0 && candidate.length <= 180);
    const candidates = echoed?.candidates?.length === 5
      ? echoed.candidates
      : choiceCandidates.length === 5 ? choiceCandidates : [];
    if (candidates.length === 5) passage = emphasizeInlineCandidates(passage, candidates);
    return passage;
  }

  if (type === "IMPLIED_MEANING" && !/(?:\*\*|__|<(?:strong|b|u)>)/iu.test(passage)) {
    const target = impliedMeaningTarget(explanation);
    if (target) passage = emphasizeExactCandidate(passage, target);
  }
  return passage;
}

function renderInlineMarkup(value: string): ReactNode {
  const normalized = value.replace(/<(?:strong|b|u)>([\s\S]*?)<\/(?:strong|b|u)>/giu, "**$1**");
  const parts = normalized.split(/(\*\*[^*]+\*\*|__[^_]+__)/gu).filter(Boolean);
  if (parts.length === 1) return normalized;
  return parts.map((part, index) => {
    const markdownBold = part.startsWith("**") && part.endsWith("**");
    const markdownUnderlineAlias = part.startsWith("__") && part.endsWith("__");
    if (!markdownBold && !markdownUnderlineAlias) return <Fragment key={`${index}-${part.slice(0, 12)}`}>{part}</Fragment>;
    return <strong key={`${index}-${part.slice(0, 12)}`}>{part.slice(2, -2)}</strong>;
  });
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
  const questionType = question.questionType.toUpperCase();
  const stem = unit.showStem
    ? <h3 className={styles.questionStem}>{renderInlineMarkup(withoutImportedPageLabel(question.stem))}</h3>
    : null;
  const passage = unit.passage
    ? preparePassage(questionType, unit.passage, unit.choices, question.explanation || "")
    : "";
  const showExternalChoices = unit.choices.length > 0 && !INLINE_ONLY_TYPES.has(questionType);

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
      {passage ? <p className={styles.passage}>{renderInlineMarkup(passage)}</p> : null}
      {!unit.stemBeforePassage ? stem : null}
      {showExternalChoices ? (
        <ol className={styles.choiceList} start={unit.choices[0]?.index ?? 1}>
          {unit.choices.map((choice) => {
            const stripped = stripChoicePrefix(choice.text, choice.index);
            const displayText = stripped || withoutImportedPageLabel(choice.text);
            return (
              <li key={choice.index}>
                <span aria-hidden="true">{CIRCLED_NUMBERS[choice.index - 1] || choice.index}</span>
                <p>{renderInlineMarkup(displayText)}</p>
              </li>
            );
          })}
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
