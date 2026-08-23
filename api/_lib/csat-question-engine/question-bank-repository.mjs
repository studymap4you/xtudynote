const BANK_TYPE_MAP = {
  PURPOSE: ["purpose"],
  EMOTION_CHANGE: ["emotion-change"],
  IMPLIED_MEANING: ["implicit-meaning"],
  MAIN_IDEA: ["main-idea"],
  CLAIM: ["claim"],
  TOPIC: ["topic"],
  TITLE: ["title"],
  CHART: ["chart"],
  FACTUAL_DESCRIPTION: ["content-match"],
  FACTUAL_PRACTICAL: ["practical-information"],
  GRAMMAR: ["grammar"],
  VOCABULARY: ["vocabulary", "long-passage-vocabulary"],
  BLANK_SHORT: ["blank-inference"],
  BLANK_LONG: ["blank-inference"],
  IRRELEVANT_SENTENCE: ["irrelevant-sentence"],
  PARAGRAPH_ORDER: ["paragraph-order"],
  SENTENCE_INSERTION: ["sentence-insertion"],
  SUMMARY: ["summary-completion"],
  LONG_READING_1: ["long-passage-title", "long-passage-vocabulary"],
  LONG_READING_2: ["integrated-order", "reference-inference", "integrated-content-match"],
};

function sanitizeText(value, maxLength = 2_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeRecord(snapshot, canonicalType) {
  const data = snapshot.data() || {};
  const analysis = data.analysis && typeof data.analysis === "object" ? data.analysis : {};
  const distractorReasons = analysis.distractorReasons && typeof analysis.distractorReasons === "object"
    ? Object.values(analysis.distractorReasons).map((item) => sanitizeText(item, 500)).filter(Boolean)
    : [];
  const generationRules = Array.isArray(analysis.generationRules)
    ? analysis.generationRules.map((item) => sanitizeText(item, 500)).filter(Boolean).slice(0, 8)
    : [];
  return {
    id: snapshot.id,
    exam: "CSAT",
    year: Number(data.examYear) || 0,
    questionNumber: Number(data.questionNumber) || undefined,
    questionType: canonicalType,
    score: Number(data.score) === 3 ? 3 : 2,
    difficulty: Number(data.score) === 3 ? "high" : "medium",
    passageStructure: sanitizeText(analysis.transferableLogic, 1_000),
    answerStructure: sanitizeText(analysis.answerReason, 1_200),
    distractorPatterns: distractorReasons.slice(0, 5),
    reasoningStructure: generationRules,
    bankQuestionType: sanitizeText(data.questionType, 100),
  };
}

export async function searchQuestionBank({ firestore, questionTypes, limit = 15, rotation = 0 }) {
  const snapshot = await firestore
    .collection("csat_english_questions")
    .where("section", "==", "reading")
    .limit(250)
    .get();
  const selected = [];
  const perTypeCount = new Map();
  const requested = [...new Set(questionTypes)];
  const candidates = snapshot.docs
    .filter((doc) => doc.data()?.active !== false)
    .sort((left, right) => Number(right.data()?.examYear || 0) - Number(left.data()?.examYear || 0));

  for (const canonicalType of requested) {
    const bankTypes = new Set(BANK_TYPE_MAP[canonicalType] || []);
    const matching = candidates.filter((doc) => bankTypes.has(doc.data()?.questionType));
    const byYear = new Map();
    for (const doc of matching) {
      const year = Number(doc.data()?.examYear) || 0;
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(doc);
    }
    const years = [...byYear.keys()].sort((left, right) => right - left);
    const yearOffset = years.length ? Math.max(0, Number(rotation) || 0) % years.length : 0;
    const rotatedYears = [...years.slice(yearOffset), ...years.slice(0, yearOffset)];
    const orderedGroups = rotatedYears.map((year, index) => {
      const docs = byYear.get(year) || [];
      const questionOffset = docs.length ? (Number(rotation) + index) % docs.length : 0;
      return docs.length ? [docs[questionOffset], ...docs.filter((_, docIndex) => docIndex !== questionOffset)] : [];
    });
    const rotated = [
      ...orderedGroups.map((docs) => docs[0]).filter(Boolean),
      ...orderedGroups.flatMap((docs) => docs.slice(1)),
    ];
    for (const doc of rotated) {
      if (!bankTypes.has(doc.data()?.questionType)) continue;
      const count = perTypeCount.get(canonicalType) || 0;
      if (count >= 3) break;
      selected.push(normalizeRecord(doc, canonicalType));
      perTypeCount.set(canonicalType, count + 1);
    }
  }
  const interleaved = [];
  for (let round = 0; round < 3; round += 1) {
    for (const canonicalType of requested) {
      const records = selected.filter((record) => record.questionType === canonicalType);
      if (records[round]) interleaved.push(records[round]);
    }
  }
  return interleaved.slice(0, limit);
}
