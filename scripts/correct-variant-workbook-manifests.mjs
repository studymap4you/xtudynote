#!/usr/bin/env node

import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  correctVariantQuestion,
  validateCorrectedVariantQuestion,
  VARIANT_QUESTION_CORRECTION_VERSION,
} from "./lib/variant-question-corrector.mjs";

const ROOT = path.resolve("tmp/variant-problem-bank");
const CHECK_ONLY = process.argv.includes("--check");
const EXPECTED_FILES = 30;
const EXPECTED_QUESTIONS = 1_500;

function increment(map, key) {
  map[key] = Number(map[key] || 0) + 1;
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.next`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function main() {
  const files = (await readdir(ROOT))
    .filter((name) => /^grade[123]-workbook-\d{2}\.json$/u.test(name))
    .sort();
  if (files.length !== EXPECTED_FILES) {
    throw new Error(`교재 manifest가 ${files.length}개입니다. ${EXPECTED_FILES}개가 필요합니다.`);
  }

  const byType = {};
  const byTransformation = {};
  const workbookReports = [];
  let totalQuestions = 0;

  for (const fileName of files) {
    const filePath = path.join(ROOT, fileName);
    const manifest = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(manifest.questions) || manifest.questions.length !== 50) {
      throw new Error(`${fileName}: 50문항 교재가 아닙니다.`);
    }
    const correctedQuestions = manifest.questions.map((question) => {
      const corrected = question.correctionVersion === VARIANT_QUESTION_CORRECTION_VERSION
        ? question
        : correctVariantQuestion(question, {
            typeLabel: question.typeLabel,
            difficulty: question.difficulty,
          });
      const validation = validateCorrectedVariantQuestion(corrected);
      if (!validation.valid) {
        throw new Error(`${corrected.questionId}: ${validation.issues.join(", ")}`);
      }
      increment(byType, corrected.type);
      increment(byTransformation, corrected.transformation?.kind || "unknown");
      return { ...corrected, number: question.number, validation };
    });
    totalQuestions += correctedQuestions.length;
    const correctedManifest = {
      ...manifest,
      schemaVersion: "xstudy-variant-workbook-v3",
      questionCorrectionVersion: VARIANT_QUESTION_CORRECTION_VERSION,
      questions: correctedQuestions,
      correctedAt: new Date().toISOString(),
    };
    if (!CHECK_ONLY) await atomicWriteJson(filePath, correctedManifest);
    workbookReports.push({
      file: fileName,
      grade: Number(manifest.grade),
      volume: Number(manifest.volume),
      questionCount: correctedQuestions.length,
      valid: true,
    });
    console.log(`${CHECK_ONLY ? "검수" : "교정"} 완료: ${fileName} · 50/50`);
  }

  if (totalQuestions !== EXPECTED_QUESTIONS) {
    throw new Error(`전체 교정 문항 수가 ${totalQuestions}/${EXPECTED_QUESTIONS}입니다.`);
  }
  const report = {
    correctionVersion: VARIANT_QUESTION_CORRECTION_VERSION,
    mode: CHECK_ONLY ? "check" : "correct",
    workbookCount: files.length,
    questionCount: totalQuestions,
    failedQuestionCount: 0,
    byType,
    byTransformation,
    workbooks: workbookReports,
    completedAt: new Date().toISOString(),
  };
  await atomicWriteJson(path.join(ROOT, "variant-question-correction-report.json"), report);
  console.log(`전체 교정 검수 통과: ${totalQuestions}/${EXPECTED_QUESTIONS}문항`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
