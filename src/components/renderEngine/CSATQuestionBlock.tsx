import { Fragment, type ReactNode } from "react";
import type {
  CSATEmphasisRange,
  CSATQuestionRenderUnit,
  ResolvedCSATRenderOptions,
} from "@/lib/renderEngine/types";
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

function impliedMeaningTarget(explanation: string): string {
  const match = explanation.match(/(?:굵게\s*표시된|굵은\s*글씨로\s*강조된|밑줄\s*친|밑줄\s*표시된)\s*[“"']([^”"']{2,180})[”"']/u);
  return match?.[1]?.trim() || "";
}

function explicitRanges(
  ranges: CSATEmphasisRange[],
  target: CSATEmphasisRange["target"],
  textLength: number,
  choiceIndex?: number,
): CSATEmphasisRange[] {
  return ranges
    .filter((range) => range.target === target)
    .filter((range) => target !== "choice" || range.choiceIndex === choiceIndex)
    .filter((range) => range.start >= 0 && range.end > range.start && range.end <= textLength)
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function inferCandidateRanges(value: string, candidates: string[]): CSATEmphasisRange[] {
  const ranges: CSATEmphasisRange[] = [];
  let cursor = 0;
  candidates.forEach((candidate, index) => {
    const marker = CIRCLED_NUMBERS[index];
    const markerIndex = marker ? value.indexOf(marker, cursor) : -1;
    const searchFrom = markerIndex >= 0 ? markerIndex + marker.length : cursor;
    const candidateIndex = value.indexOf(candidate, Math.max(0, searchFrom));
    if (candidateIndex < 0) return;
    if (markerIndex >= 0) {
      const between = value.slice(markerIndex + marker.length, candidateIndex);
      if (!/^\s*$/u.test(between) || between.length > 4) return;
    }
    ranges.push({
      target: "passage",
      start: candidateIndex,
      end: candidateIndex + candidate.length,
      style: "bold",
      source: "legacy-inline-candidate",
    });
    cursor = candidateIndex + candidate.length;
  });
  return ranges;
}

function inferImpliedMeaningRange(value: string, explanation: string): CSATEmphasisRange[] {
  const target = impliedMeaningTarget(explanation);
  if (!target) return [];
  const start = value.indexOf(target);
  if (start < 0) return [];
  return [{
    target: "passage",
    start,
    end: start + target.length,
    style: "bold",
    source: "legacy-explanation-target",
  }];
}

function preparePassage(
  questionType: string,
  rawPassage: string,
  choices: CSATQuestionRenderUnit["choices"],
  explanation: string,
  ranges: CSATEmphasisRange[],
): { text: string; ranges: CSATEmphasisRange[] } {
  const type = questionType.toUpperCase();
  let passage = withoutImportedPageLabel(rawPassage);

  if (POSITION_SELECTION_TYPES.has(type)) {
    passage = stripTrailingPositionEcho(passage);
    return { text: passage, ranges: explicitRanges(ranges, "passage", passage.length) };
  }

  if (INLINE_CANDIDATE_TYPES.has(type)) {
    const echoed = extractTrailingCandidateEcho(passage);
    if (echoed) passage = echoed.passage;

    const storedRanges = explicitRanges(ranges, "passage", passage.length);
    if (storedRanges.length > 0) return { text: passage, ranges: storedRanges };

    const choiceCandidates = choices
      .map((choice) => stripChoicePrefix(choice.text, choice.index))
      .filter((candidate) => candidate.length > 0 && candidate.length <= 180);
    const candidates = echoed?.candidates?.length === 5
      ? echoed.candidates
      : choiceCandidates.length === 5 ? choiceCandidates : [];
    return {
      text: passage,
      ranges: candidates.length === 5 ? inferCandidateRanges(passage, candidates) : [],
    };
  }

  const storedRanges = explicitRanges(ranges, "passage", passage.length);
  if (storedRanges.length > 0) return { text: passage, ranges: storedRanges };
  if (type === "IMPLIED_MEANING") {
    return { text: passage, ranges: inferImpliedMeaningRange(passage, explanation) };
  }
  return { text: passage, ranges: [] };
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

function renderTextWithRanges(value: string, ranges: CSATEmphasisRange[]): ReactNode {
  if (!ranges.length) return renderInlineMarkup(value);
  const usable: CSATEmphasisRange[] = [];
  let lastEnd = 0;
  ranges
    .filter((range) => range.start >= 0 && range.end <= value.length && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach((range) => {
      if (range.start < lastEnd) return;
      usable.push(range);
      lastEnd = range.end;
    });
  if (!usable.length) return renderInlineMarkup(value);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  usable.forEach((range, index) => {
    if (range.start > cursor) nodes.push(<Fragment key={`plain-${index}`}>{value.slice(cursor, range.start)}</Fragment>);
    const emphasized = value.slice(range.start, range.end);
    nodes.push(range.style === "underline"
      ? <u key={`em-${index}`}>{emphasized}</u>
      : <strong key={`em-${index}`}>{emphasized}</strong>);
    cursor = range.end;
  });
  if (cursor < value.length) nodes.push(<Fragment key="plain-tail">{value.slice(cursor)}</Fragment>);
  return nodes;
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
  const stemText = withoutImportedPageLabel(question.stem);
  const stemRanges = explicitRanges(question.emphasisRanges, "stem", stemText.length);
  const stem = unit.showStem
    ? <h3 className={styles.questionStem}>{renderTextWithRanges(stemText, stemRanges)}</h3>
    : null;
  const preparedPassage = unit.passage
    ? preparePassage(questionType, unit.passage, unit.choices, question.explanation || "", question.emphasisRanges)
    : { text: "", ranges: [] };
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
      {preparedPassage.text ? <p className={styles.passage}>{renderTextWithRanges(preparedPassage.text, preparedPassage.ranges)}</p> : null}
      {!unit.stemBeforePassage ? stem : null}
      {showExternalChoices ? (
        <ol className={styles.choiceList} start={unit.choices[0]?.index ?? 1}>
          {unit.choices.map((choice) => {
            const stripped = stripChoicePrefix(choice.text, choice.index);
            const displayText = stripped || withoutImportedPageLabel(choice.text);
            const choiceRanges = explicitRanges(question.emphasisRanges, "choice", displayText.length, choice.index);
            return (
              <li key={choice.index}>
                <span aria-hidden="true">{CIRCLED_NUMBERS[choice.index - 1] || choice.index}</span>
                <p>{renderTextWithRanges(displayText, choiceRanges)}</p>
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
