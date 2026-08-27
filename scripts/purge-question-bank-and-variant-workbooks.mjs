#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { gzipSync } from "node:zlib";

const MAIN_PROJECT_ID = "xtudynote";
const PROBLEM_BANK_PROJECT_ID = "xstudy-problem-bank";
const STORAGE_BUCKET = "xtudynote.firebasestorage.app";
const VARIANT_DATASET_ID = "high-school-variant-problem-bank-v1";
const QUESTION_DATASET_ID = "question-bank-54473-v1";
const SOURCE_BACKUP_ID = "preserved-source-export-2026-08-28";
const SOURCE_BACKUP_PATH = `problem-bank-sources/preserved/${SOURCE_BACKUP_ID}.jsonl.gz`;
const args = new Set(process.argv.slice(2));
const shouldExecute = args.has("--execute");
const shouldVerify = args.has("--verify") || shouldExecute;

function text(value, maxLength = 100_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadOptionalEnvironmentFile() {
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

async function createAccessToken() {
  const require = createRequire(import.meta.url);
  const raw = process.env.PROBLEM_BANK_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("서버 Firebase 자격 증명이 필요합니다.");
  const credentials = JSON.parse(raw);
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/firebase",
    ],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) throw new Error("Firebase access token을 발급받지 못했습니다.");
  return token.token;
}

function decodeFirestoreValue(value = {}) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) return Object.fromEntries(
    Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, decodeFirestoreValue(child)]),
  );
  return undefined;
}

function decodeDocument(document) {
  return {
    id: document.name.split("/").pop(),
    name: document.name,
    data: Object.fromEntries(
      Object.entries(document.fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
    ),
  };
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
    },
  };
}

function documentWrite(projectId, documentPath, data) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${documentPath}`,
      fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)])),
    },
  };
}

function documentDelete(projectId, documentPath) {
  return { delete: `projects/${projectId}/databases/(default)/documents/${documentPath}` };
}

async function listDocuments(accessToken, projectId, collectionPath) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`,
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 404) return [];
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Firestore ${projectId}/${collectionPath} 조회 실패 (${response.status}): ${detail.slice(0, 500)}`);
    }
    const body = await response.json();
    documents.push(...(body.documents || []).map(decodeDocument));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return documents;
}

async function commitWrites(accessToken, projectId, writes, label) {
  let completed = 0;
  for (let index = 0; index < writes.length; index += 300) {
    const batch = writes.slice(index, index + 300);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ writes: batch }),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${label} 실패 (${response.status}): ${detail.slice(0, 700)}`);
    }
    completed += batch.length;
    if (writes.length > 300) console.log(`${label} ${completed}/${writes.length}`);
  }
  return completed;
}

async function listStorageObjects(accessToken, prefix) {
  const objects = [];
  let pageToken = "";
  do {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Storage ${prefix} 조회 실패 (${response.status})`);
    const body = await response.json();
    objects.push(...(body.items || []).map((item) => item.name));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return objects;
}

async function uploadSourceBackup(accessToken, sourceDocuments) {
  const lines = sourceDocuments
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((source) => JSON.stringify({ sourceId: source.id, ...source.data }))
    .join("\n") + "\n";
  const compressed = gzipSync(Buffer.from(lines, "utf8"), { level: 9 });
  const fingerprint = sha256(compressed);
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o`);
  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", SOURCE_BACKUP_PATH);
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/gzip" },
    body: compressed,
  });
  if (!upload.ok && upload.status !== 409) {
    const detail = await upload.text().catch(() => "");
    throw new Error(`원문 백업 업로드 실패 (${upload.status}): ${detail.slice(0, 500)}`);
  }
  const patch = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(SOURCE_BACKUP_PATH)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: "application/gzip",
        metadata: {
          sourceRole: "source-only-backup",
          sourceCount: String(sourceDocuments.length),
          questionCount: "0",
          sha256: fingerprint,
          visibility: "server-only",
        },
      }),
    },
  );
  if (!patch.ok) throw new Error(`원문 백업 metadata 저장 실패 (${patch.status})`);
  return { fingerprint, byteSize: compressed.length };
}

async function deleteStorageObjects(accessToken, objectNames, label) {
  let deleted = 0;
  for (const objectName of [...new Set(objectNames)]) {
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(objectName)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`${label} Storage 삭제 실패 (${response.status}): ${objectName}`);
    deleted += 1;
  }
  console.log(`${label} Storage 삭제: ${deleted}개`);
  return deleted;
}

function variantWorkbookContent(document) {
  const data = document.data || {};
  const highSchool = data.resourceCatalog === "high_school"
    || String(data.section || "").startsWith("grade")
    || String(data.resourceCategory || "").startsWith("grade");
  const variant = data.resourceSource === VARIANT_DATASET_ID
    || /변형\s*문제/iu.test(`${data.subject || ""} ${data.learningTopic || ""} ${data.introduction || ""}`);
  return highSchool && variant;
}

function resourceStoragePaths(document) {
  const data = document.data || {};
  return [
    ...(Array.isArray(data.learningMaterialFilePaths) ? data.learningMaterialFilePaths : []),
    ...(Array.isArray(data.referenceMaterialFilePaths) ? data.referenceMaterialFilePaths : []),
    ...(Array.isArray(data.resourceFiles) ? data.resourceFiles.map((file) => file?.path) : []),
  ].map((value) => text(value, 500)).filter(Boolean);
}

async function inventory(accessToken) {
  const [problems, sources, duplicateClusters, usageEvents, contents, shardObjects, variantSourceObjects, workbookObjects, recentArchiveObjects] = await Promise.all([
    listDocuments(accessToken, PROBLEM_BANK_PROJECT_ID, "problems"),
    listDocuments(accessToken, PROBLEM_BANK_PROJECT_ID, "sources"),
    listDocuments(accessToken, PROBLEM_BANK_PROJECT_ID, "duplicate_clusters"),
    listDocuments(accessToken, PROBLEM_BANK_PROJECT_ID, "usage_events"),
    listDocuments(accessToken, MAIN_PROJECT_ID, "contents"),
    listStorageObjects(accessToken, `problem-bank-shards/${QUESTION_DATASET_ID}/`),
    listStorageObjects(accessToken, "problem-bank-sources/variant/"),
    listStorageObjects(accessToken, "contents/system-variant-workbooks/"),
    listStorageObjects(accessToken, "problem-bank-sources/question-bank-54473/"),
  ]);
  const variantContents = contents.filter(variantWorkbookContent);
  const datasetCounts = {};
  for (const problem of problems) {
    const dataset = text(problem.data?.datasetId, 120) || "unspecified";
    datasetCounts[dataset] = Number(datasetCounts[dataset] || 0) + 1;
  }
  return {
    problems,
    sources,
    duplicateClusters,
    usageEvents,
    variantContents,
    datasetCounts,
    storageObjects: [...new Set([
      ...shardObjects,
      ...variantSourceObjects,
      ...workbookObjects,
      ...recentArchiveObjects,
      ...variantContents.flatMap(resourceStoragePaths),
    ])].filter((objectName) => objectName !== SOURCE_BACKUP_PATH),
  };
}

function reportInventory(found) {
  const report = {
    problemDocuments: found.problems.length,
    problemDatasets: found.datasetCounts,
    preservedSourceDocuments: found.sources.length,
    duplicateClusters: found.duplicateClusters.length,
    usageEvents: found.usageEvents.length,
    highSchoolVariantContents: found.variantContents.length,
    storageObjectsToDelete: found.storageObjects.length,
    contentSamples: found.variantContents.slice(0, 5).map((item) => ({ id: item.id, subject: item.data.subject })),
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function executePurge(accessToken, found) {
  const sourceCountBefore = found.sources.length;
  if (!sourceCountBefore) throw new Error("보존할 원문이 없어 삭제를 중단했습니다.");
  const backup = await uploadSourceBackup(accessToken, found.sources);
  await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, [documentWrite(
    PROBLEM_BANK_PROJECT_ID,
    `source_archives/${SOURCE_BACKUP_ID}`,
    {
      archiveId: SOURCE_BACKUP_ID,
      title: "문항 삭제 전 원문 전용 백업",
      storageBucket: STORAGE_BUCKET,
      storagePath: SOURCE_BACKUP_PATH,
      sourceCount: sourceCountBefore,
      questionCount: 0,
      sourceFingerprint: backup.fingerprint,
      sourceByteSize: backup.byteSize,
      visibility: "server_only",
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  )], "원문 백업 등록");

  const problemDeletes = found.problems.map((document) => ({ delete: document.name }));
  await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, problemDeletes, "문제은행 문항 삭제");
  await commitWrites(
    accessToken,
    PROBLEM_BANK_PROJECT_ID,
    [
      ...found.duplicateClusters.map((document) => ({ delete: document.name })),
      ...found.usageEvents.map((document) => ({ delete: document.name })),
      documentDelete(PROBLEM_BANK_PROJECT_ID, `source_archives/${QUESTION_DATASET_ID}`),
      documentDelete(PROBLEM_BANK_PROJECT_ID, "source_archives/variant-problem-bank-grade1"),
      documentDelete(PROBLEM_BANK_PROJECT_ID, "source_archives/variant-problem-bank-grade2"),
      documentDelete(PROBLEM_BANK_PROJECT_ID, "source_archives/variant-problem-bank-grade3"),
      documentDelete(PROBLEM_BANK_PROJECT_ID, "source_archives/variant-workbook-style-reference-v1"),
      documentDelete(PROBLEM_BANK_PROJECT_ID, `import_runs/${QUESTION_DATASET_ID}`),
      documentDelete(PROBLEM_BANK_PROJECT_ID, `import_runs/${VARIANT_DATASET_ID}-grade1`),
      documentDelete(PROBLEM_BANK_PROJECT_ID, `import_runs/${VARIANT_DATASET_ID}-grade2`),
      documentDelete(PROBLEM_BANK_PROJECT_ID, `import_runs/${VARIANT_DATASET_ID}-grade3`),
    ],
    "문항 부속 메타데이터 삭제",
  );
  await commitWrites(
    accessToken,
    MAIN_PROJECT_ID,
    found.variantContents.map((document) => ({ delete: document.name })),
    "고등내신 변형문제 게시물 삭제",
  );
  await deleteStorageObjects(accessToken, found.storageObjects, "문항·변형문제");
  return sourceCountBefore;
}

async function verifyPurge(accessToken, expectedSourceCount) {
  const found = await inventory(accessToken);
  const sourceBackup = await listStorageObjects(accessToken, SOURCE_BACKUP_PATH);
  const result = {
    problemDocuments: found.problems.length,
    sourceDocuments: found.sources.length,
    expectedSourceDocuments: expectedSourceCount,
    highSchoolVariantContents: found.variantContents.length,
    remainingQuestionStorageObjects: found.storageObjects.length,
    sourceBackupPresent: sourceBackup.includes(SOURCE_BACKUP_PATH),
  };
  if (result.problemDocuments !== 0
    || result.sourceDocuments !== expectedSourceCount
    || result.highSchoolVariantContents !== 0
    || result.remainingQuestionStorageObjects !== 0
    || !result.sourceBackupPresent) {
    throw new Error(`삭제 검증 실패: ${JSON.stringify(result)}`);
  }
  console.log(`삭제 검증 완료: ${JSON.stringify(result)}`);
  return result;
}

await loadOptionalEnvironmentFile();
const accessToken = await createAccessToken();
const found = await inventory(accessToken);
reportInventory(found);

if (!shouldExecute) {
  console.log("DRY RUN: 실제 삭제는 수행하지 않았습니다.");
} else {
  const expectedSourceCount = await executePurge(accessToken, found);
  if (shouldVerify) await verifyPurge(accessToken, expectedSourceCount);
}
