import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rulesDatabase = require("../../_data/csat_question_rules_db_v0_1.json");

function assertRulesDatabase(value) {
  if (!value || typeof value !== "object") throw new Error("csat-rules-db-invalid");
  if (!Array.isArray(value.question_types) || value.question_types.length === 0) {
    throw new Error("csat-rules-db-question-types-missing");
  }
  if (!Array.isArray(value.global_distractor_patterns) || value.global_distractor_patterns.length === 0) {
    throw new Error("csat-rules-db-distractors-missing");
  }
  for (const rule of value.question_types) {
    if (!rule?.id || !Array.isArray(rule.preferred_distractor_patterns)) {
      throw new Error(`csat-rules-db-type-invalid:${rule?.id || "unknown"}`);
    }
  }
}

assertRulesDatabase(rulesDatabase);

const questionRuleMap = new Map(rulesDatabase.question_types.map((rule) => [rule.id, rule]));
const distractorPatternMap = new Map(
  rulesDatabase.global_distractor_patterns.map((pattern) => [pattern.id, pattern]),
);

export const CSAT_RULES_DB_VERSION = String(rulesDatabase.version || "0.1");
export const SUPPORTED_CSAT_QUESTION_TYPES = Object.freeze([...questionRuleMap.keys()]);
export const SUPPORTED_DISTRACTOR_PATTERNS = Object.freeze([...distractorPatternMap.keys()]);

export function loadQuestionRules(questionTypes = SUPPORTED_CSAT_QUESTION_TYPES) {
  const selectedRules = questionTypes.map((type) => questionRuleMap.get(type)).filter(Boolean);
  if (selectedRules.length !== questionTypes.length) {
    const missing = questionTypes.filter((type) => !questionRuleMap.has(type));
    throw new Error(`csat-rules-not-found:${missing.join(",")}`);
  }
  return {
    dbName: rulesDatabase.db_name,
    version: CSAT_RULES_DB_VERSION,
    scope: rulesDatabase.scope,
    evidencePolicy: rulesDatabase.evidence_policy,
    generationPolicy: rulesDatabase.generation_policy,
    questionTypes: selectedRules,
    distractorPatterns: rulesDatabase.global_distractor_patterns,
  };
}

export function getQuestionRule(questionType) {
  return questionRuleMap.get(questionType) || null;
}

export function getDistractorPattern(patternId) {
  return distractorPatternMap.get(patternId) || null;
}

