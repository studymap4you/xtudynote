#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";
import {
  buildQuestionBank54473Record,
  buildQuestionBank54473Source,
  QUESTION_BANK_54473_DATASET_ID,
  QUESTION_BANK_54473_DATASET_VERSION,
  QUESTION_BANK_54473_QUALITY_GATE_VERSION,
  questionBank54473DocumentId,
} from "./lib/question-bank-54473.mjs";

const execFileAsync = promisify(execFile);
const PROBLEM_BANK_PROJECT_ID = "xstudy-problem-bank";
const STORAGE_BUCKET = "xtudynote.firebasestorage.app";
const EXPECTED_SOURCE_COUNT = 2_867;
const EXPECTED_QUESTION_COUNT = 54_473;
const ARCHIVE_PATH = path.resolve(
  process.env.QUESTION_BANK_54473_ARCHIVE
    || path.join(process.env.HOME || "", "Downloads", "question_bank_54473.zip"),
);
const WORK_ROOT = path.resolve(process.env.QUESTION_BANK_54473_WORK_ROOT || "tmp/question-bank-54473");
const SOURCE_ROOT = path.join(WORK_ROOT, "source");
const PREPARED_ROOT = path.join(WORK_ROOT, "prepared");
const SOURCE_OUTPUT = path.join(PREPARED_ROOT, "sources.jsonl");
const PROBLEM_OUTPUT = path.join(PREPARED_ROOT, "problems.jsonl");
const AUDIT_OUTPUT = path.join(PREPARED_ROOT, "audit.json");
const SHARD_ROOT = path.join(PREPARED_ROOT, "storage-shards");
const SHARD_MANIFEST = path.join(SHARD_ROOT, "manifest.json");
const args = new Set(process.argv.slice(2));
const shouldImport = args.has("--import");
const shouldVerify = args.has("--verify");
const storageOnly = args.has("--storage-only");
const shouldPrepare = args.has("--prepare") || (!shouldImport && !shouldVerify);

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

function normalizedName(value) {
  return String(value || "").normalize("NFC");
}

function text(value, maxLength = 100_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  await once(stream, "end");
  return hash.digest("hex");
}

async function actualFile(sourceRoot, expectedName) {
  const files = await readdir(sourceRoot);
  const found = files.find((file) => normalizedName(file) === normalizedName(expectedName));
  if (!found) throw new Error(`압축에서 ${expectedName} 파일을 찾지 못했습니다.`);
  return path.join(sourceRoot, found);
}

async function ensureExtracted() {
  await mkdir(SOURCE_ROOT, { recursive: true });
  const checksumPath = await actualFile(SOURCE_ROOT, "SHA256SUMS.txt").catch(() => null);
  if (!checksumPath) {
    const archiveStat = await stat(ARCHIVE_PATH).catch(() => null);
    if (!archiveStat?.isFile()) throw new Error(`문제은행 압축파일을 찾지 못했습니다: ${ARCHIVE_PATH}`);
    await execFileAsync("bsdtar", ["-xf", ARCHIVE_PATH, "-C", SOURCE_ROOT]);
  }
  await verifyChecksums();
}

async function verifyChecksums() {
  const checksumPath = await actualFile(SOURCE_ROOT, "SHA256SUMS.txt");
  const manifest = await readFile(checksumPath, "utf8");
  const rows = manifest.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const row of rows) {
    const match = row.match(/^([a-f0-9]{64})\s{2}(.+)$/iu);
    if (!match) throw new Error(`잘못된 SHA256SUMS 행입니다: ${row.slice(0, 120)}`);
    const filePath = await actualFile(SOURCE_ROOT, match[2]);
    const actual = await sha256File(filePath);
    if (actual !== match[1].toLowerCase()) throw new Error(`체크섬 불일치: ${match[2]}`);
  }
  console.log(`원본 체크섬 검증 완료: ${rows.length}개 파일`);
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  const headers = (rows.shift() || []).map((header, index) => index === 0 ? header.replace(/^\uFEFF/u, "") : header);
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ));
}

async function readJsonLines(filePath, onRecord) {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let index = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    index += 1;
    await onRecord(JSON.parse(line), index);
  }
  return index;
}

async function writeJsonLine(stream, record) {
  if (!stream.write(`${JSON.stringify(record)}\n`)) await once(stream, "drain");
}

function increment(target, key) {
  target[key] = Number(target[key] || 0) + 1;
}

async function prepareDataset() {
  await ensureExtracted();
  await mkdir(PREPARED_ROOT, { recursive: true });
  const [sourcePath, questionPath, answerPath, indexPath] = await Promise.all([
    actualFile(SOURCE_ROOT, "원문_2867.jsonl"),
    actualFile(SOURCE_ROOT, "문제은행_54473.jsonl"),
    actualFile(SOURCE_ROOT, "정답표_54473.csv"),
    actualFile(SOURCE_ROOT, "문제_인덱스.csv"),
  ]);
  const [answerText, indexText, archiveFingerprint] = await Promise.all([
    readFile(answerPath, "utf8"),
    readFile(indexPath, "utf8"),
    sha256File(ARCHIVE_PATH),
  ]);
  const answerRows = parseCsv(answerText);
  const indexRows = parseCsv(indexText);
  const answers = new Map(answerRows.map((row) => [row.question_id, row]));
  const indexes = new Map(indexRows.map((row) => [row.question_id, row]));
  if (answers.size !== EXPECTED_QUESTION_COUNT || indexes.size !== EXPECTED_QUESTION_COUNT) {
    throw new Error(`정답표/인덱스 수량 불일치: answers=${answers.size}, indexes=${indexes.size}`);
  }

  const sourceMap = new Map();
  const sourceOutput = createWriteStream(SOURCE_OUTPUT, { encoding: "utf8" });
  const sourceCount = await readJsonLines(sourcePath, async (rawSource) => {
    if (!rawSource.passage_id || sourceMap.has(rawSource.passage_id)) {
      throw new Error(`원문 ID 중복 또는 누락: ${rawSource.passage_id || "없음"}`);
    }
    sourceMap.set(rawSource.passage_id, rawSource);
    await writeJsonLine(sourceOutput, buildQuestionBank54473Source(rawSource));
  });
  sourceOutput.end();
  await once(sourceOutput, "finish");
  if (sourceCount !== EXPECTED_SOURCE_COUNT) throw new Error(`원문 수량 불일치: ${sourceCount}`);

  const summary = {
    datasetId: QUESTION_BANK_54473_DATASET_ID,
    datasetVersion: QUESTION_BANK_54473_DATASET_VERSION,
    qualityGateVersion: QUESTION_BANK_54473_QUALITY_GATE_VERSION,
    archivePath: ARCHIVE_PATH,
    archiveSha256: archiveFingerprint,
    sourceCount,
    questionCount: 0,
    approvedCount: 0,
    needsReviewCount: 0,
    byGrade: {},
    byType: {},
    approvedByType: {},
    needsReviewByType: {},
    issueCounts: {},
    correctionCounts: {},
    issueSamples: [],
    preparedAt: new Date().toISOString(),
  };
  const seenQuestionIds = new Set();
  const problemOutput = createWriteStream(PROBLEM_OUTPUT, { encoding: "utf8" });
  const questionCount = await readJsonLines(questionPath, async (raw, lineNumber) => {
    if (!raw.question_id || seenQuestionIds.has(raw.question_id)) {
      throw new Error(`문항 ID 중복 또는 누락: ${raw.question_id || `line-${lineNumber}`}`);
    }
    seenQuestionIds.add(raw.question_id);
    const source = sourceMap.get(raw.passage_id);
    const record = buildQuestionBank54473Record({
      raw,
      source,
      answerRow: answers.get(raw.question_id),
      indexRow: indexes.get(raw.question_id),
    });
    await writeJsonLine(problemOutput, record);
    summary.questionCount += 1;
    if (record.status === "approved") {
      summary.approvedCount += 1;
      increment(summary.approvedByType, record.questionType || "UNKNOWN");
    } else {
      summary.needsReviewCount += 1;
      increment(summary.needsReviewByType, record.questionType || "UNKNOWN");
    }
    increment(summary.byGrade, String(record.grade || "unknown"));
    increment(summary.byType, record.questionType || "UNKNOWN");
    for (const [name, changed] of Object.entries(record.corrections || {})) {
      if (changed) increment(summary.correctionCounts, name);
    }
    for (const issue of record.validation?.issues || []) {
      const fullIssue = text(issue, 1_000);
      const prefix = `${record.questionId}: `;
      const key = text(fullIssue.startsWith(prefix) ? fullIssue.slice(prefix.length) : fullIssue, 240);
      increment(summary.issueCounts, key);
      if (summary.issueSamples.length < 100) summary.issueSamples.push({ questionId: record.questionId, issue: fullIssue });
    }
    if (lineNumber % 500 === 0 || lineNumber === EXPECTED_QUESTION_COUNT) {
      console.log(`교정·검수 ${lineNumber}/${EXPECTED_QUESTION_COUNT} · 승인 ${summary.approvedCount} · 검토 ${summary.needsReviewCount}`);
    }
  });
  problemOutput.end();
  await once(problemOutput, "finish");
  if (questionCount !== EXPECTED_QUESTION_COUNT || seenQuestionIds.size !== EXPECTED_QUESTION_COUNT) {
    throw new Error(`문항 수량 불일치: ${questionCount}`);
  }
  await writeFile(AUDIT_OUTPUT, JSON.stringify(summary, null, 2), "utf8");
  console.log(`로컬 교정 완료: ${JSON.stringify({ total: summary.questionCount, approved: summary.approvedCount, needsReview: summary.needsReviewCount })}`);
  return summary;
}

async function loadPreparedSummary() {
  const [auditStat, sourceStat, problemStat] = await Promise.all([
    stat(AUDIT_OUTPUT).catch(() => null),
    stat(SOURCE_OUTPUT).catch(() => null),
    stat(PROBLEM_OUTPUT).catch(() => null),
  ]);
  if (!auditStat?.isFile() || !sourceStat?.isFile() || !problemStat?.isFile()) return prepareDataset();
  const summary = JSON.parse(await readFile(AUDIT_OUTPUT, "utf8"));
  const archiveFingerprint = await sha256File(ARCHIVE_PATH);
  if (summary.datasetId !== QUESTION_BANK_54473_DATASET_ID
    || summary.datasetVersion !== QUESTION_BANK_54473_DATASET_VERSION
    || summary.archiveSha256 !== archiveFingerprint
    || Number(summary.sourceCount) !== EXPECTED_SOURCE_COUNT
    || Number(summary.questionCount) !== EXPECTED_QUESTION_COUNT) {
    return prepareDataset();
  }
  console.log(`기존 교정 결과 사용: 승인 ${summary.approvedCount}, 검토 ${summary.needsReviewCount}`);
  return summary;
}

async function buildStorageShards(summary) {
  const existing = await readFile(SHARD_MANIFEST, "utf8").then(JSON.parse).catch(() => null);
  if (existing?.datasetId === QUESTION_BANK_54473_DATASET_ID
    && existing?.datasetVersion === QUESTION_BANK_54473_DATASET_VERSION
    && Number(existing?.questionCount) === EXPECTED_QUESTION_COUNT
    && Array.isArray(existing?.shards)
    && existing.shards.length === 57) {
    const complete = (await Promise.all(existing.shards.map((shard) => (
      stat(path.join(SHARD_ROOT, shard.relativePath)).then((value) => value.isFile()).catch(() => false)
    )))).every(Boolean);
    if (complete) {
      console.log(`기존 Storage 샤드 사용: ${existing.shards.length}개`);
      return existing;
    }
  }

  await mkdir(SHARD_ROOT, { recursive: true });
  const streams = new Map();
  const streamFor = async (record) => {
    const type = text(record.questionType, 80).replace(/[^a-z0-9_-]/giu, "_").toLowerCase();
    const grade = Number(record.grade) || 12;
    const key = `${type}/grade${grade}`;
    if (streams.has(key)) return streams.get(key);
    const relativePath = `${key}.jsonl.gz`;
    const outputPath = path.join(SHARD_ROOT, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    const gzip = createGzip({ level: 9 });
    const output = createWriteStream(outputPath);
    gzip.pipe(output);
    const entry = { key, relativePath, outputPath, gzip, output, finished: once(output, "finish"), count: 0 };
    streams.set(key, entry);
    return entry;
  };
  let questionCount = 0;
  await readJsonLines(PROBLEM_OUTPUT, async (record, index) => {
    const entry = await streamFor(record);
    await writeJsonLine(entry.gzip, record);
    entry.count += 1;
    questionCount += 1;
    if (index % 5_000 === 0) console.log(`Storage 샤드 구성 ${index}/${EXPECTED_QUESTION_COUNT}`);
  });
  for (const entry of streams.values()) entry.gzip.end();
  await Promise.all([...streams.values()].map((entry) => entry.finished));
  const shards = [];
  for (const entry of [...streams.values()].sort((left, right) => left.key.localeCompare(right.key))) {
    const [fileStat, fingerprint] = await Promise.all([stat(entry.outputPath), sha256File(entry.outputPath)]);
    shards.push({
      key: entry.key,
      relativePath: entry.relativePath,
      storagePath: `problem-bank-shards/${QUESTION_BANK_54473_DATASET_ID}/${entry.relativePath}`,
      questionCount: entry.count,
      byteSize: fileStat.size,
      sha256: fingerprint,
    });
  }
  if (questionCount !== EXPECTED_QUESTION_COUNT || shards.length !== 57) {
    throw new Error(`Storage 샤드 수량 불일치: questions=${questionCount}, shards=${shards.length}`);
  }
  const manifest = {
    datasetId: QUESTION_BANK_54473_DATASET_ID,
    datasetVersion: QUESTION_BANK_54473_DATASET_VERSION,
    qualityGateVersion: QUESTION_BANK_54473_QUALITY_GATE_VERSION,
    questionCount,
    approvedCount: summary.approvedCount,
    needsReviewCount: summary.needsReviewCount,
    shardStrategy: "questionType+grade",
    shards,
    createdAt: new Date().toISOString(),
  };
  await writeFile(SHARD_MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Storage 샤드 구성 완료: ${shards.length}개 · ${questionCount}문항`);
  return manifest;
}

function firestoreValue(value, fieldName = "") {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") {
    if (/At$/u.test(fieldName) && /^\d{4}-\d{2}-\d{2}T/u.test(value)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => firestoreValue(item)) } };
  }
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value)
          .filter(([, child]) => child !== undefined)
          .map(([key, child]) => [key, firestoreValue(child, key)]),
      ),
    },
  };
}

function documentWrite(projectId, documentPath, data) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${documentPath}`,
      fields: Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, firestoreValue(value, key)]),
      ),
    },
  };
}

async function createCliAccessToken() {
  const require = createRequire(import.meta.url);
  const serviceAccountJson = process.env.PROBLEM_BANK_SERVICE_ACCOUNT_JSON
    || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const credentials = JSON.parse(serviceAccountJson);
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
    if (!token?.token) throw new Error("Service account access token is unavailable");
    return token.token;
  }
  const firebaseAuth = require("/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js");
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI login is required");
  if (account.tokens.access_token && Number(account.tokens.expires_at) > Date.now() + 120_000) {
    return account.tokens.access_token;
  }
  const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [
    "email",
    "openid",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ]);
  if (!token?.access_token) throw new Error("Firebase CLI access token is unavailable");
  return token.access_token;
}

async function commitWrites(accessToken, projectId, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Firestore ${projectId} commit failed (${response.status}): ${detail.slice(0, 1_000)}`);
  }
}

async function uploadStorageFile(accessToken, localPath, storagePath, contentType, metadata = {}) {
  const bytes = await readFile(localPath);
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o`);
  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", storagePath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: bytes,
  });
  if (!response.ok && response.status !== 409) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage 업로드 실패 (${response.status}): ${detail.slice(0, 800)}`);
  }
  const metadataResponse = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType,
        metadata: {
          datasetId: QUESTION_BANK_54473_DATASET_ID,
          datasetVersion: QUESTION_BANK_54473_DATASET_VERSION,
          accessPolicy: "server-only",
          ...metadata,
        },
      }),
    },
  );
  if (!metadataResponse.ok) throw new Error(`Storage metadata 저장 실패 (${metadataResponse.status})`);
  return { storagePath, byteSize: bytes.length };
}

async function uploadArchive(accessToken, summary) {
  const storagePath = `problem-bank-sources/question-bank-54473/${path.basename(ARCHIVE_PATH)}`;
  return uploadStorageFile(accessToken, ARCHIVE_PATH, storagePath, "application/zip", {
    sourceFingerprint: summary.archiveSha256,
    sourceRole: "original-question-bank-archive",
  });
}

async function uploadStorageShards(accessToken, manifest) {
  let uploaded = 0;
  for (const shard of manifest.shards) {
    await uploadStorageFile(
      accessToken,
      path.join(SHARD_ROOT, shard.relativePath),
      shard.storagePath,
      "application/x-ndjson",
      {
        contentEncoding: "gzip",
        sourceFingerprint: shard.sha256,
        sourceRole: "problem-bank-runtime-shard",
        shardKey: shard.key,
        questionCount: String(shard.questionCount),
      },
    );
    uploaded += 1;
    console.log(`Storage 샤드 업로드 ${uploaded}/${manifest.shards.length}`);
  }
  const remoteManifestPath = `problem-bank-shards/${QUESTION_BANK_54473_DATASET_ID}/manifest.json`;
  await uploadStorageFile(
    accessToken,
    SHARD_MANIFEST,
    remoteManifestPath,
    "application/json",
    { sourceRole: "problem-bank-runtime-manifest" },
  );
  return { uploaded, manifestStoragePath: remoteManifestPath };
}

async function importJsonLines(accessToken, filePath, collection, idForRecord, label, batchSize = 140) {
  let batch = [];
  let count = 0;
  await readJsonLines(filePath, async (record) => {
    batch.push(documentWrite(
      PROBLEM_BANK_PROJECT_ID,
      `${collection}/${idForRecord(record)}`,
      record,
    ));
    if (batch.length >= batchSize) {
      await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, batch);
      count += batch.length;
      batch = [];
      console.log(`${label} ${count}`);
    }
  });
  if (batch.length) {
    await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, batch);
    count += batch.length;
  }
  console.log(`${label} 완료: ${count}`);
  return count;
}

async function importDataset(summary) {
  const accessToken = await createCliAccessToken();
  const shardManifest = await buildStorageShards(summary);
  const archive = await uploadArchive(accessToken, summary);
  const shardUpload = await uploadStorageShards(accessToken, shardManifest);
  if (storageOnly) {
    console.log(`Storage 문제은행 등록 완료: ${shardUpload.uploaded}개 샤드 · ${shardManifest.questionCount}문항`);
    return {
      accessToken,
      sourceCount: summary.sourceCount,
      questionCount: summary.questionCount,
      shardManifest,
      storageOnly: true,
    };
  }
  const sourceCount = await importJsonLines(
    accessToken,
    SOURCE_OUTPUT,
    "sources",
    (record) => record.sourceId,
    "원문 DB",
    180,
  );
  const questionCount = await importJsonLines(
    accessToken,
    PROBLEM_OUTPUT,
    "problems",
    (record) => questionBank54473DocumentId(record.questionId),
    "문항 DB",
    140,
  );
  const timestamp = new Date();
  await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, [
    documentWrite(PROBLEM_BANK_PROJECT_ID, `source_archives/${QUESTION_BANK_54473_DATASET_ID}`, {
      archiveId: QUESTION_BANK_54473_DATASET_ID,
      datasetId: QUESTION_BANK_54473_DATASET_ID,
      datasetVersion: QUESTION_BANK_54473_DATASET_VERSION,
      title: "영어 변형문제 문제은행 54,473문항",
      storageBucket: STORAGE_BUCKET,
      storagePath: archive.storagePath,
      sourceFingerprint: summary.archiveSha256,
      sourceByteSize: archive.byteSize,
      sourceCount,
      questionCount,
      approvedCount: summary.approvedCount,
      needsReviewCount: summary.needsReviewCount,
      qualityGateVersion: QUESTION_BANK_54473_QUALITY_GATE_VERSION,
      status: "ready",
      visibility: "server_only",
      updatedAt: timestamp,
      createdAt: new Date("2026-08-27T00:00:00.000Z"),
    }),
    documentWrite(PROBLEM_BANK_PROJECT_ID, `import_runs/${QUESTION_BANK_54473_DATASET_ID}`, {
      importRunId: QUESTION_BANK_54473_DATASET_ID,
      ...summary,
      status: "completed",
      completedAt: timestamp,
      updatedAt: timestamp,
    }),
  ]);
  console.log(`클라우드 등록 완료: 원문 ${sourceCount}, 문항 ${questionCount}`);
  return { accessToken, sourceCount, questionCount, shardManifest, storageOnly: false };
}

async function storageObjectMetadata(accessToken, storagePath) {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  return response.json();
}

async function storageObjectSha256(accessToken, storagePath) {
  const response = await fetch(
    `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Storage 파일 다운로드 검증 실패 (${response.status}): ${storagePath}`);
  return sha256(Buffer.from(await response.arrayBuffer()));
}

async function verifyStorageShards(accessToken, manifest) {
  const remoteManifestPath = `problem-bank-shards/${QUESTION_BANK_54473_DATASET_ID}/manifest.json`;
  const remoteManifest = await storageObjectMetadata(accessToken, remoteManifestPath);
  if (!remoteManifest) throw new Error("Storage 문제은행 manifest를 찾지 못했습니다.");
  let total = 0;
  for (const shard of manifest.shards) {
    const [metadata, remoteSha256] = await Promise.all([
      storageObjectMetadata(accessToken, shard.storagePath),
      storageObjectSha256(accessToken, shard.storagePath),
    ]);
    if (!metadata
      || Number(metadata.size) !== Number(shard.byteSize)
      || metadata.metadata?.sourceFingerprint !== shard.sha256
      || remoteSha256 !== shard.sha256) {
      throw new Error(`Storage 문제은행 샤드 검증 실패: ${shard.key}`);
    }
    total += Number(shard.questionCount) || 0;
  }
  if (total !== EXPECTED_QUESTION_COUNT) throw new Error(`Storage 문항 수량 검증 실패: ${total}`);
  console.log(`Storage 문제은행 검증 완료: ${manifest.shards.length}개 샤드 · ${total}문항`);
  return { shards: manifest.shards.length, questions: total };
}

async function aggregateCount(accessToken, collectionId, filters) {
  const filterList = Object.entries(filters).map(([fieldPath, value]) => ({
    fieldFilter: {
      field: { fieldPath },
      op: "EQUAL",
      value: firestoreValue(value),
    },
  }));
  const where = filterList.length === 1 ? filterList[0] : { compositeFilter: { op: "AND", filters: filterList } };
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROBLEM_BANK_PROJECT_ID}/databases/(default)/documents:runAggregationQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery: { from: [{ collectionId }], where },
          aggregations: [{ alias: "total", count: {} }],
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`등록 수량 검증 실패 (${response.status}): ${detail.slice(0, 800)}`);
  }
  const rows = await response.json();
  return Number(rows?.[0]?.result?.aggregateFields?.total?.integerValue || 0);
}

async function verifyDataset(accessToken = null) {
  const token = accessToken || await createCliAccessToken();
  const [sources, questions, approved, needsReview] = await Promise.all([
    aggregateCount(token, "sources", { datasetId: QUESTION_BANK_54473_DATASET_ID }),
    aggregateCount(token, "problems", { datasetId: QUESTION_BANK_54473_DATASET_ID }),
    aggregateCount(token, "problems", { datasetId: QUESTION_BANK_54473_DATASET_ID, status: "approved" }),
    aggregateCount(token, "problems", { datasetId: QUESTION_BANK_54473_DATASET_ID, status: "needs_review" }),
  ]);
  if (sources !== EXPECTED_SOURCE_COUNT || questions !== EXPECTED_QUESTION_COUNT || approved + needsReview !== questions) {
    throw new Error(`클라우드 검증 실패: ${JSON.stringify({ sources, questions, approved, needsReview })}`);
  }
  console.log(`클라우드 검증 완료: ${JSON.stringify({ sources, questions, approved, needsReview })}`);
  return { sources, questions, approved, needsReview };
}

await loadOptionalEnvironmentFile();

let summary = null;
if (shouldPrepare) summary = await prepareDataset();
if (shouldImport) {
  if (!summary) summary = await loadPreparedSummary();
  const imported = await importDataset(summary);
  if (shouldVerify) {
    await verifyStorageShards(imported.accessToken, imported.shardManifest);
    if (!imported.storageOnly) await verifyDataset(imported.accessToken);
  }
} else if (shouldVerify) {
  if (storageOnly) {
    if (!summary) summary = await loadPreparedSummary();
    const accessToken = await createCliAccessToken();
    const manifest = await buildStorageShards(summary);
    await verifyStorageShards(accessToken, manifest);
  } else {
    await verifyDataset();
  }
}
