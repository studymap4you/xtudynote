#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BASE_IMPORTER = path.join(ROOT, "scripts/import-mock-exam-variant-pdfs.mjs");
const EMPHASIS_IMPORTER = path.join(ROOT, "scripts/import-mock-exam-variant-emphasis.mjs");
const TEMP_IMPORTER = path.join(ROOT, "tmp/import-g3-mock-exam-variant-pdfs.generated.mjs");
const OUTPUT = path.join(ROOT, "tmp/g3-mock-exam-variant-import.json");
const DEFAULT_SOURCE_ROOT = path.join(process.env.HOME || "", "Downloads");

const SOURCES = Object.freeze([
  [3, 2025, 3, "고3_2025년_03월_11유형_변형문제_회차완료본_수정2.pdf"],
  [3, 2025, 5, "고3_2025년_05월_11유형_변형문제_회차완료본_수정2.pdf"],
  [3, 2025, 6, "고3_2025년_06월_11유형_변형문제_회차완료본.pdf"],
  [3, 2025, 7, "고3_2025년_07월_11유형_변형문제_회차완료본.pdf"],
  [3, 2025, 9, "고3_2025년_09월_11유형_변형문제_회차완료본.pdf"],
  [3, 2025, 10, "고3_2025년_10월_11유형_변형문제_회차완료본.pdf"],
  [3, 2025, 11, "고3_2025년_11월_2026학년도_수능_11유형_변형문제_회차완료본_최종.pdf"],
  [3, 2026, 3, "고3_2026년_03월_11유형_변형문제_회차완료본.pdf"],
  [3, 2026, 5, "고3_2026년_05월_11유형_변형문제_회차완료본.pdf"],
  [3, 2026, 6, "고3_2026년_06월_11유형_변형문제_회차완료본.pdf"],
  [3, 2026, 7, "고3_2026년_07월_11유형_변형문제_회차완료본_수정.pdf"],
]);

function argumentValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}`));
    });
  });
}

function sourceBlock() {
  const rows = SOURCES.map(([grade, year, month, fileName]) =>
    `  [${grade}, ${year}, ${month}, ${JSON.stringify(fileName)}],`).join("\n");
  return `const SOURCE_FILES = Object.freeze([\n${rows}\n].map(([grade, year, month, fileName]) => ({ grade, year, month, fileName })));`;
}

function patchBaseImporter(source) {
  const blockPattern = /const SOURCE_FILES = Object\.freeze\(\[[\s\S]*?\]\.map\(\(\[grade, year, month, fileName\]\) => \(\{ grade, year, month, fileName \}\)\)\);/u;
  if (!blockPattern.test(source)) throw new Error("SOURCE_FILES block not found in base importer");
  return source
    .replace(blockPattern, sourceBlock())
    .replace('const DEFAULT_OUTPUT = path.resolve("tmp/mock-exam-variant-import.json");', `const DEFAULT_OUTPUT = path.resolve(${JSON.stringify(path.relative(ROOT, OUTPUT))});`);
}

async function normalizeSpecialMetadata() {
  const payload = JSON.parse(await readFile(OUTPUT, "utf8"));
  let problemCount = 0;
  for (const source of payload.sources || []) {
    const isCsat = Number(source.grade) === 3 && Number(source.year) === 2025 && Number(source.month) === 11;
    for (const problem of source.problems || []) {
      problem.examFamily = isCsat ? "csat" : "mock_exam";
      problem.schoolGrade = 3;
      problem.grade = 12;
      problem.conceptTags = [...new Set([...(problem.conceptTags || []), "grade-3", "high-school-english"])];
      problem.skillTags = [...new Set([...(problem.skillTags || []), isCsat ? "csat-variant" : "mock-exam-variant"])];
      problemCount += 1;
    }
    for (const passage of source.passages || []) {
      const byId = new Map((source.problems || []).map((problem) => [problem.questionId, problem]));
      passage.problems = (passage.problems || []).map((problem) => byId.get(problem.questionId) || problem);
    }
  }
  payload.gradeBand = "high-school-3";
  payload.importPurpose = "xuniverse-high-school-internal-exam";
  payload.sourceQuestionCount = problemCount;
  await writeFile(OUTPUT, JSON.stringify(payload, null, 2), "utf8");
}

const sourceRoot = path.resolve(argumentValue("--source-root", DEFAULT_SOURCE_ROOT));
const prepareOnly = process.argv.includes("--prepare-only");

await mkdir(path.dirname(TEMP_IMPORTER), { recursive: true });
const base = await readFile(BASE_IMPORTER, "utf8");
await writeFile(TEMP_IMPORTER, patchBaseImporter(base), "utf8");

try {
  await run(process.execPath, [TEMP_IMPORTER, `--source-root=${sourceRoot}`, `--output=${OUTPUT}`]);
  await normalizeSpecialMetadata();
  if (!prepareOnly) {
    await run(process.execPath, [EMPHASIS_IMPORTER, `--input=${OUTPUT}`, "--import", "--verify"]);
  }
  console.log(JSON.stringify({
    ok: true,
    sourceRoot,
    output: OUTPUT,
    sourceCount: SOURCES.length,
    mode: prepareOnly ? "prepare-only" : "import-and-verify",
    placement: "exams/{grade,year,month} -> problems/{examQuestionNumber,questionType}",
  }, null, 2));
} finally {
  await rm(TEMP_IMPORTER, { force: true });
}
