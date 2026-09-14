#!/usr/bin/env node

/**
 * 2027학년도 교재 일괄 등록기
 *
 * 대상:
 * - 고3 모의고사 변형문제 -> high_school / grade3_mock
 * - EBS 수능특강 영어독해연습 Variant 2 -> high_school / ebs_special_lecture
 * - EBS 수능완성 영어 Variant 2 -> high_school / ebs_complete
 *
 * 사용 예:
 *   node scripts/import-2027-curriculum-textbooks.mjs --source-dir "$HOME/Downloads" --import --verify
 *
 * 필요한 환경 변수:
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 *   FIREBASE_STORAGE_BUCKET (선택, 기본 xtudynote.firebasestorage.app)
 *
 * 기본 실행은 dry-run이다. 실제 등록은 --import를 명시해야 한다.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import admin from "firebase-admin";

const DEFAULT_BUCKET = "xtudynote.firebasestorage.app";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SOURCE_DIR = path.resolve(readArg("--source-dir") || process.cwd());
const SHOULD_IMPORT = process.argv.includes("--import");
const SHOULD_VERIFY = process.argv.includes("--verify");
const SHOULD_REPLACE = process.argv.includes("--replace");

const RESOURCE_BASE = {
  catalog: "high_school",
  type: "share",
  status: "approved",
  libraryCategory: "problem_bank",
  resourceSource: "batch_import_2027",
  audience: "고등 내신",
  authorId: "system-2027-curriculum-import",
  teacherId: "system-2027-curriculum-import",
};

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function ensureAdmin() {
  if (admin.apps.length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required for --import/--verify");
  }
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(raw)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET,
  });
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) out.push(fullPath);
    }
  }
  return out;
}

function normalizeName(value) {
  return value.normalize("NFC");
}

function safeFileName(name) {
  return normalizeName(name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, "_")
    .slice(-180) || "material.pdf";
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function newestByMtime(files) {
  return [...files].sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

function exactFile(allFiles, exactName) {
  const target = normalizeName(exactName);
  const matches = allFiles.filter((filePath) => normalizeName(path.basename(filePath)) === target);
  return newestByMtime(matches);
}

function findIntegratedGrade3(allFiles) {
  const candidates = allFiles.filter((filePath) => {
    const name = normalizeName(path.basename(filePath));
    return /\.pdf$/iu.test(name)
      && /2027/u.test(name)
      && /고3/u.test(name)
      && /모의고사|모의평가/u.test(name)
      && /변형/u.test(name)
      && /통합|6회분|5회분|학생용|교사용/u.test(name);
  });
  if (!candidates.length) return [];
  const student = newestByMtime(candidates.filter((filePath) => /학생용/u.test(normalizeName(path.basename(filePath)))));
  const teacher = newestByMtime(candidates.filter((filePath) => /교사용/u.test(normalizeName(path.basename(filePath)))));
  if (student || teacher) return [student, teacher].filter(Boolean);
  return [newestByMtime(candidates)].filter(Boolean);
}

function findSessionGrade3(allFiles) {
  const monthMap = new Map();
  for (const filePath of allFiles) {
    const name = normalizeName(path.basename(filePath));
    const match = name.match(/고3[_\s-]*2026년[_\s-]*(0?[3579]|0?6)월.*(?:10|11)유형.*변형문제.*(?:회차완료본|최종|검수).*\.pdf$/iu);
    if (!match) continue;
    const month = Number(match[1]);
    const previous = monthMap.get(month);
    if (!previous || fs.statSync(filePath).mtimeMs > fs.statSync(previous).mtimeMs) monthMap.set(month, filePath);
  }
  return [...monthMap.entries()].sort((a, b) => a[0] - b[0]).map(([, filePath]) => filePath);
}

function resolveResources(allFiles) {
  const grade3Integrated = findIntegratedGrade3(allFiles);
  const grade3Files = grade3Integrated.length ? grade3Integrated : findSessionGrade3(allFiles);

  const specialStudent = exactFile(allFiles, "2027_수능특강_영어독해연습_Variant2_학생용_통합본.pdf");
  const specialTeacher = exactFile(allFiles, "2027_수능특강_영어독해연습_Variant2_교사용_통합본.pdf");
  const completeCombined = exactFile(allFiles, "2027_수능완성_Variant2_영어변형문제_2035문항_문제해설_최종본.pdf");

  return [
    {
      id: "curriculum_2027_grade3_mock_variant",
      category: "grade3_mock",
      title: "2027학년도 고3 영어 모의고사 변형문제",
      description: "2026년 시행 2027학년도 고3 영어 모의고사·모의평가 변형 교재 모음",
      files: grade3Files,
    },
    {
      id: "curriculum_2027_ebs_special_lecture_variant2",
      category: "ebs_special_lecture",
      title: "2027 EBS 수능특강 영어독해연습 Variant 2",
      description: "2027학년도 EBS 수능특강 영어독해연습 변형문제 학생용·교사용 통합본",
      files: [specialStudent, specialTeacher].filter(Boolean),
    },
    {
      id: "curriculum_2027_ebs_complete_variant2",
      category: "ebs_complete",
      title: "2027 EBS 수능완성 영어 Variant 2 · 2,035문항",
      description: "유형편 및 실전 모의고사 1~5회, 문제편 + 정답 및 상세해설편, Explanation V3 전역 QA PASS",
      files: [completeCombined].filter(Boolean),
    },
  ];
}

function validateResource(resource) {
  if (!resource.files.length) {
    return { ok: false, reason: "source file not found" };
  }
  if (resource.files.length > 10) {
    return { ok: false, reason: `too many files (${resource.files.length}); split the resource before import` };
  }
  for (const filePath of resource.files) {
    const stat = fs.statSync(filePath);
    if (stat.size >= MAX_FILE_BYTES) {
      return { ok: false, reason: `${path.basename(filePath)} is ${Math.round(stat.size / 1024 / 1024)}MB (must be <50MB)` };
    }
    if (path.extname(filePath).toLowerCase() !== ".pdf") {
      return { ok: false, reason: `${path.basename(filePath)} is not a PDF` };
    }
  }
  return { ok: true };
}

function storageDestination(resource, filePath) {
  return `contents/system-curriculum/2027/${resource.category}/${safeFileName(path.basename(filePath))}`;
}

async function importResource(resource) {
  ensureAdmin();
  const db = admin.firestore();
  const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET);
  const ref = db.collection("contents").doc(resource.id);
  const existing = await ref.get();

  if (existing.exists && !SHOULD_REPLACE) {
    console.log(`[skip] ${resource.id}: already exists (use --replace to overwrite)`);
    return;
  }

  if (existing.exists && SHOULD_REPLACE) {
    const oldFiles = Array.isArray(existing.data()?.resourceFiles) ? existing.data().resourceFiles : [];
    await Promise.allSettled(oldFiles.map((item) => {
      const filePath = String(item?.path || "");
      return filePath.startsWith("contents/") ? bucket.file(filePath).delete({ ignoreNotFound: true }) : Promise.resolve();
    }));
  }

  const uploaded = [];
  try {
    for (const localPath of resource.files) {
      const destination = storageDestination(resource, localPath);
      const stat = fs.statSync(localPath);
      const checksum = sha256(localPath);
      await bucket.upload(localPath, {
        destination,
        resumable: stat.size >= 5 * 1024 * 1024,
        metadata: {
          contentType: "application/pdf",
          metadata: {
            source: "xuniverse-2027-curriculum-import",
            sha256: checksum,
          },
        },
      });
      uploaded.push({
        name: path.basename(localPath),
        path: destination,
        size: stat.size,
        contentType: "application/pdf",
        sha256: checksum,
      });
      console.log(`[upload] ${path.basename(localPath)} -> ${destination}`);
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set({
      ...RESOURCE_BASE,
      subject: resource.title,
      title: resource.title,
      section: resource.category,
      identifier: resource.id,
      learningTopic: resource.description,
      introduction: resource.description,
      lectureLink: null,
      learningMaterialFilePaths: uploaded.map((file) => file.path),
      referenceMaterialFilePaths: [],
      themes: ["2027학년도", "영어", "변형문제"],
      purchaseLink: null,
      homeworkCode: null,
      homeworkInstruction: null,
      resourceCatalog: RESOURCE_BASE.catalog,
      resourceCategory: resource.category,
      resourceFiles: uploaded,
      createdAt: existing.exists ? (existing.data()?.createdAt || now) : now,
      updatedAt: now,
      importedAt: now,
    }, { merge: false });
    console.log(`[registered] ${resource.title} (${resource.id})`);
  } catch (error) {
    await Promise.allSettled(uploaded.map((file) => bucket.file(file.path).delete({ ignoreNotFound: true })));
    throw error;
  }
}

async function verifyResource(resource) {
  ensureAdmin();
  const db = admin.firestore();
  const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET);
  const snapshot = await db.collection("contents").doc(resource.id).get();
  if (!snapshot.exists) throw new Error(`${resource.id}: Firestore document is missing`);
  const data = snapshot.data() || {};
  if (data.resourceCatalog !== "high_school" || data.resourceCategory !== resource.category || data.status !== "approved") {
    throw new Error(`${resource.id}: catalog/category/status mismatch`);
  }
  const files = Array.isArray(data.resourceFiles) ? data.resourceFiles : [];
  if (!files.length) throw new Error(`${resource.id}: resourceFiles is empty`);
  for (const file of files) {
    const storagePath = String(file?.path || "");
    const [exists] = await bucket.file(storagePath).exists();
    if (!exists) throw new Error(`${resource.id}: storage object missing: ${storagePath}`);
  }
  console.log(`[verified] ${resource.title}: ${files.length} file(s)`);
}

async function main() {
  const allFiles = walkFiles(SOURCE_DIR);
  const resources = resolveResources(allFiles);
  console.log(`sourceDir=${SOURCE_DIR}`);
  console.log(`filesScanned=${allFiles.length}`);
  console.log(`mode=${SHOULD_IMPORT ? "IMPORT" : "DRY_RUN"}${SHOULD_REPLACE ? "+REPLACE" : ""}`);

  let invalidCount = 0;
  for (const resource of resources) {
    const validation = validateResource(resource);
    console.log(`\n[${validation.ok ? "ready" : "blocked"}] ${resource.title}`);
    console.log(`  placement: high_school / ${resource.category}`);
    console.log(`  document: ${resource.id}`);
    for (const filePath of resource.files) console.log(`  file: ${filePath}`);
    if (!validation.ok) {
      invalidCount += 1;
      console.log(`  reason: ${validation.reason}`);
      continue;
    }
    if (SHOULD_IMPORT) await importResource(resource);
    if (SHOULD_VERIFY) await verifyResource(resource);
  }

  if (invalidCount) {
    console.error(`\n${invalidCount} resource(s) are blocked because required source PDFs were not found or failed validation.`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
