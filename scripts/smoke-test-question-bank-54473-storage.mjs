#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

async function loadEnvironmentFile() {
  const envPath = process.env.QUESTION_BANK_ENV_FILE;
  if (!envPath) return;
  const input = await readFile(path.resolve(envPath), "utf8");
  for (const line of input.split(/\r?\n/u)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || process.env[key]) continue;
    if (!rawValue.startsWith('"')) {
      process.env[key] = rawValue;
      continue;
    }
    try {
      process.env[key] = JSON.parse(rawValue);
      continue;
    } catch {
      const inner = rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue.slice(1);
      let parsed = "";
      let inString = false;
      let escaped = false;
      for (let index = 0; index < inner.length; index += 1) {
        const char = inner[index];
        if (!inString && char === "\\" && inner[index + 1] === "n") {
          parsed += "\n";
          index += 1;
          continue;
        }
        parsed += char;
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
        } else if (char === '"') inString = true;
      }
      process.env[key] = parsed;
    }
  }
}

await loadEnvironmentFile();

const {
  loadStorageProblemShard,
  problemBankProblemToLocalQuestion,
  searchProblemBankStructuralReferences,
  searchReusableProblemBankQuestions,
  validateProblemBankProblemForReuse,
} = await import("../api/_lib/problem-bank/client.mjs");

const storageShard = await loadStorageProblemShard({ questionType: "blank_short", grade: 10 });
if (!storageShard.length || !storageShard.some((problem) => problem.datasetId === "question-bank-54473-v1")) {
  throw new Error("Storage 문제은행 샤드를 직접 불러오지 못했습니다.");
}

const request = {
  targetLevel: "middle",
  targetGrade: "고1",
  userRequest: "고1 중위권 영어 빈칸 추론 시험지",
  requestedTypes: ["blank_short"],
};
const result = await searchReusableProblemBankQuestions({
  request,
  questionTypePlan: ["blank_short"],
  reuseMode: "exam-exact",
});
const problem = result.questions[0];
if (!problem) throw new Error("검수된 문제은행 문항을 찾지 못했습니다.");
const policy = validateProblemBankProblemForReuse(problem, "exam-exact");
if (!policy.valid) throw new Error(`문항 재사용 정책 실패: ${policy.issues.join(", ")}`);
const local = problemBankProblemToLocalQuestion(problem, 1);
if (local.choices.length !== 5 || local.answer < 1 || local.answer > 5) {
  throw new Error("시험지용 문항 변환 결과가 올바르지 않습니다.");
}
const structural = await searchProblemBankStructuralReferences({
  request,
  questionTypes: ["blank_short"],
  limit: 2,
});
if (!structural.references.length || structural.references.some((reference) => reference.questionType !== "BLANK_SHORT")) {
  throw new Error("교재용 구조 참조 변환 결과가 올바르지 않습니다.");
}

console.log(JSON.stringify({
  enabled: result.enabled,
  storageShardRecordCount: storageShard.length,
  found: result.questions.length,
  searchMode: result.searches[0]?.searchMode,
  datasetId: problem.datasetId,
  status: problem.status,
  qualityScore: problem.qualityScore,
  policyPassed: policy.valid,
  localQuestion: {
    id: local.id,
    type: local.questionType,
    choiceCount: local.choices.length,
    answerValid: local.answer >= 1 && local.answer <= 5,
    reusedFromProblemBank: local.qualityMetadata.reusedFromProblemBank,
  },
  textbookReference: {
    found: structural.references.length,
    type: structural.references[0].questionType,
    sourceDatasetId: structural.references[0].sourceDatasetId,
  },
}, null, 2));
