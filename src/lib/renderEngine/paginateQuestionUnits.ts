import type {
  CSATQuestionRenderUnit,
  CSATRenderPage,
  CSATRenderUnit,
  CSATSharedPassageRenderUnit,
  NormalizedCSATChoice,
  NormalizedCSATQuestion,
} from "@/lib/renderEngine/types";

const MAX_PASSAGE_CHARS_PER_UNIT = 1_000;
const MAX_CHOICES_CHARS_PER_UNIT = 1_050;

function splitTextAtNaturalBoundary(source: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = source.trim();
  while (remaining.length > maxChars) {
    const floor = Math.floor(maxChars * 0.62);
    const window = remaining.slice(0, maxChars + 1);
    const candidates = [window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf("; "), window.lastIndexOf(" ")];
    const boundary = candidates.find((index) => index >= floor) ?? maxChars;
    const end = boundary < maxChars ? boundary + 1 : boundary;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitChoiceGroups(choices: NormalizedCSATChoice[]): NormalizedCSATChoice[][] {
  const groups: NormalizedCSATChoice[][] = [];
  let current: NormalizedCSATChoice[] = [];
  let currentChars = 0;
  choices.forEach((choice) => {
    const weight = choice.text.length + 80;
    if (current.length >= 2 && currentChars + weight > MAX_CHOICES_CHARS_PER_UNIT) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(choice);
    currentChars += weight;
  });
  if (current.length) groups.push(current);
  if (groups.length > 1 && groups.at(-1)?.length === 1) {
    const prior = groups.at(-2);
    const last = groups.at(-1);
    if (prior && prior.length > 2 && last) last.unshift(prior.pop()!);
  }
  return groups;
}

function questionUnits(question: NormalizedCSATQuestion, omitPassage = false): CSATQuestionRenderUnit[] {
  const passageChunks = omitPassage ? [] : splitTextAtNaturalBoundary(question.passage, MAX_PASSAGE_CHARS_PER_UNIT);
  const choiceGroups = splitChoiceGroups(question.choices);
  const needsFragments = passageChunks.length > 1 || choiceGroups.length > 1;
  if (!needsFragments) {
    return [{
      id: `${question.id}-complete`,
      kind: "question",
      question,
      passage: omitPassage ? "" : question.passage,
      choices: question.choices,
      showQuestionHeader: true,
      showStem: true,
      stemBeforePassage: false,
      showReview: true,
      continuation: false,
    }];
  }

  const units: CSATQuestionRenderUnit[] = [];
  passageChunks.forEach((passage, index) => {
    units.push({
      id: `${question.id}-passage-${index + 1}`,
      kind: "question",
      question,
      passage,
      choices: [],
      showQuestionHeader: index === 0,
      showStem: index === 0,
      stemBeforePassage: index === 0,
      showReview: false,
      continuation: index > 0,
    });
  });
  choiceGroups.forEach((choices, index) => {
    units.push({
      id: `${question.id}-choices-${index + 1}`,
      kind: "question",
      question,
      passage: "",
      choices,
      showQuestionHeader: passageChunks.length === 0 && index === 0,
      showStem: passageChunks.length === 0 && index === 0,
      stemBeforePassage: false,
      showReview: index === choiceGroups.length - 1,
      continuation: passageChunks.length > 0 || index > 0,
    });
  });
  return units;
}

function sharedPassageUnits(group: NormalizedCSATQuestion[]): CSATSharedPassageRenderUnit[] {
  const first = group[0];
  if (!first?.groupId) return [];
  const sharedPassage = first.sharedPassage || first.passage;
  return splitTextAtNaturalBoundary(sharedPassage, MAX_PASSAGE_CHARS_PER_UNIT).map((passage, index) => ({
    id: `${first.groupId}-shared-${index + 1}`,
    kind: "shared-passage",
    groupId: first.groupId!,
    startNumber: first.studentNumber,
    endNumber: group.at(-1)?.studentNumber ?? first.studentNumber,
    passage,
    continuation: index > 0,
  }));
}

export function buildCSATRenderUnits(questions: NormalizedCSATQuestion[]): CSATRenderUnit[] {
  const units: CSATRenderUnit[] = [];
  for (let index = 0; index < questions.length;) {
    const question = questions[index];
    if (!question) break;
    if (!question.groupId) {
      units.push(...questionUnits(question));
      index += 1;
      continue;
    }

    const group: NormalizedCSATQuestion[] = [];
    let cursor = index;
    while (questions[cursor]?.groupId === question.groupId) {
      group.push(questions[cursor]!);
      cursor += 1;
    }
    units.push(...sharedPassageUnits(group));
    group.forEach((groupQuestion) => units.push(...questionUnits(groupQuestion, true)));
    index = cursor;
  }
  return units;
}

export function paginateMeasuredCSATUnits(
  units: CSATRenderUnit[],
  measuredHeights: ReadonlyMap<string, number>,
  pageCapacity: number,
  unitGap: number,
): CSATRenderPage[] {
  if (units.length === 0 || pageCapacity <= 0) return [];
  const pages: CSATRenderPage[] = [];
  let current: CSATRenderUnit[] = [];
  let usedHeight = 0;

  const flush = () => {
    if (current.length === 0) return;
    pages.push({ id: `questions-${pages.length + 1}`, units: current });
    current = [];
    usedHeight = 0;
  };

  units.forEach((unit) => {
    const height = Math.max(1, measuredHeights.get(unit.id) ?? pageCapacity);
    const nextHeight = current.length ? usedHeight + unitGap + height : height;
    if (current.length && nextHeight > pageCapacity) flush();
    current.push(unit);
    usedHeight = current.length === 1 ? height : usedHeight + unitGap + height;
    if (height >= pageCapacity) flush();
  });
  flush();
  return pages;
}
