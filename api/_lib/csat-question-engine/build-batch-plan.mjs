export const QUESTION_BATCH_MIN = 1;
export const QUESTION_BATCH_MAX = 2;
export const MAX_BATCH_RETRY = 3;

const DEFAULT_CSAT_TYPE_DISTRIBUTION = Object.freeze([
  "PURPOSE",
  "EMOTION_CHANGE",
  "MAIN_IDEA",
  "CLAIM",
  "TOPIC",
  "TITLE",
  "IMPLIED_MEANING",
  "VOCABULARY",
  "GRAMMAR",
  "BLANK_SHORT",
  "BLANK_LONG",
  "BLANK_SHORT",
  "BLANK_LONG",
  "IRRELEVANT_SENTENCE",
  "PARAGRAPH_ORDER",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERTION",
  "SENTENCE_INSERTION",
  "SUMMARY",
  "FACTUAL_DESCRIPTION",
]);

export function buildQuestionTypePlan(request) {
  const requested = Array.isArray(request?.requestedTypes) ? request.requestedTypes.filter(Boolean) : [];
  const distribution = requested.length ? requested : DEFAULT_CSAT_TYPE_DISTRIBUTION;
  return Array.from(
    { length: request.targetQuestionCount },
    (_, index) => distribution[index % distribution.length],
  );
}

function countByType(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

export function buildNextBatchTypes(questionTypePlan, acceptedQuestions, maxSize = QUESTION_BATCH_MAX) {
  const acceptedCounts = countByType(acceptedQuestions.map((question) => question.questionType));
  const consumed = new Map();
  const missing = [];
  for (const type of questionTypePlan) {
    const seen = consumed.get(type) || 0;
    const accepted = acceptedCounts.get(type) || 0;
    consumed.set(type, seen + 1);
    if (seen >= accepted) missing.push(type);
  }
  const requestedSize = Number.isFinite(Number(maxSize)) ? Number(maxSize) : QUESTION_BATCH_MAX;
  const batchSize = Math.max(QUESTION_BATCH_MIN, Math.min(QUESTION_BATCH_MAX, requestedSize));
  return missing.slice(0, batchSize);
}

export function assignSourcesToBatch(questionTypes, sources) {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("source-db-empty");
  const assignments = [];
  const usage = new Map();
  let cursor = 0;
  for (const questionType of questionTypes) {
    let selected = null;
    for (let offset = 0; offset < sources.length; offset += 1) {
      const candidate = sources[(cursor + offset) % sources.length];
      if ((usage.get(candidate.id) || 0) < 2) {
        selected = candidate;
        cursor = (cursor + offset + 1) % sources.length;
        break;
      }
    }
    if (!selected) selected = sources[cursor++ % sources.length];
    usage.set(selected.id, (usage.get(selected.id) || 0) + 1);
    assignments.push({ questionType, sourceId: selected.id });
  }
  return assignments;
}
