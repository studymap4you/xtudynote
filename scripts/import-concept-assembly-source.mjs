#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildConceptRecordDocuments,
  buildSyntaxRecordDocuments,
  CONCEPT_SOURCE_DATABASE_VERSION,
  CONCEPT_SOURCE_TITLE,
  normalizeConceptSourceDataset,
  parseJsonLines,
} from "../api/_lib/concept-assembly/source-dataset-adapter.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "xtudynote";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "xtudynote.firebasestorage.app";
const DEFAULT_ARCHIVE = "/Users/chogihwa/Downloads/xstudy_concept_assembly_source.zip";
const STORAGE_PREFIX = `contents/system-private-reference/${CONCEPT_SOURCE_DATABASE_VERSION}`;
const LIBRARY_DOCUMENT_ID = "concept-assembly-source-ebs-v1";
const EXPECTED_FILES = Object.freeze([
  "CODEX_INTEGRATION_PROMPT.md",
  "README.md",
  "concept_assembly_core.csv",
  "concept_assembly_core.json",
  "concept_assembly_core.jsonl",
  "concept_assembly_guide.md",
  "manifest.json",
  "syntax_explanations_index.csv",
  "syntax_explanations_raw.jsonl",
]);

const args = process.argv.slice(2);
const shouldImport = args.includes("--import");
const shouldVerify = args.includes("--verify");
const dryRun = args.includes("--dry-run");
const archiveArg = args.find((value) => value.startsWith("--archive="));
const firebaseTokenArg = args.find((value) => value.startsWith("--firebase-token-file="));
const archivePath = path.resolve(archiveArg ? archiveArg.slice("--archive=".length) : DEFAULT_ARCHIVE);
const firebaseTokenPath = firebaseTokenArg
  ? path.resolve(firebaseTokenArg.slice("--firebase-token-file=".length))
  : process.env.FIREBASE_USER_ID_TOKEN_FILE
    ? path.resolve(process.env.FIREBASE_USER_ID_TOKEN_FILE)
    : "";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFileName(value) {
  return String(value ?? "").normalize("NFC").replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

function mimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".zip") return "application/zip";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".jsonl") return "application/x-ndjson; charset=utf-8";
  if (extension === ".csv") return "text/csv; charset=utf-8";
  if (extension === ".md") return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

async function readZipEntry(entryName) {
  const result = await execFileAsync("unzip", ["-p", archivePath, entryName], {
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  return Buffer.from(result.stdout);
}

async function loadArchive() {
  if (!existsSync(archivePath)) throw new Error(`Archive not found: ${archivePath}`);
  const listing = await execFileAsync("unzip", ["-Z1", archivePath], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  const entries = String(listing.stdout).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (entries.some((entry) => entry.startsWith("/") || entry.split("/").includes(".."))) {
    throw new Error("Archive contains an unsafe path");
  }
  const entryByBaseName = new Map();
  entries.forEach((entry) => {
    const baseName = path.posix.basename(entry);
    if (EXPECTED_FILES.includes(baseName)) entryByBaseName.set(baseName, entry);
  });
  const missing = EXPECTED_FILES.filter((fileName) => !entryByBaseName.has(fileName));
  if (missing.length) throw new Error(`Archive is missing: ${missing.join(", ")}`);

  const extractedFiles = [];
  for (const fileName of EXPECTED_FILES) {
    const bytes = await readZipEntry(entryByBaseName.get(fileName));
    extractedFiles.push({
      fileName,
      bytes,
      byteSize: bytes.length,
      sha256: sha256(bytes),
      contentType: mimeType(fileName),
    });
  }
  const archiveBytes = await readFile(archivePath);
  const sourceFiles = [
    {
      fileName: path.basename(archivePath).normalize("NFC"),
      bytes: archiveBytes,
      byteSize: archiveBytes.length,
      sha256: sha256(archiveBytes),
      contentType: mimeType(archivePath),
      archive: true,
    },
    ...extractedFiles,
  ];
  const byName = new Map(extractedFiles.map((file) => [file.fileName, file]));
  const manifest = JSON.parse(byName.get("manifest.json").bytes.toString("utf8"));
  const coreRecords = parseJsonLines(byName.get("concept_assembly_core.jsonl").bytes.toString("utf8"), "concept core");
  const syntaxRecords = parseJsonLines(byName.get("syntax_explanations_raw.jsonl").bytes.toString("utf8"), "syntax explanations");
  const dataset = normalizeConceptSourceDataset({ manifest, coreRecords, syntaxRecords });
  return {
    manifest,
    dataset,
    sourceFiles,
    datasetFingerprint: sourceFiles[0].sha256,
  };
}

function firebaseAuthModule() {
  const candidates = [
    process.env.FIREBASE_TOOLS_AUTH_PATH,
    "/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js",
    "/usr/local/lib/node_modules/firebase-tools/lib/auth.js",
  ].filter(Boolean);
  const modulePath = candidates.find((candidate) => existsSync(candidate));
  if (!modulePath) throw new Error("firebase-tools auth module was not found; install Firebase CLI first");
  return createRequire(import.meta.url)(modulePath);
}

async function createCliAccessToken() {
  const firebaseAuth = firebaseAuthModule();
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI login is required");
  if (
    account.tokens.access_token
    && Number(account.tokens.expires_at) > Date.now() + 60_000
  ) return account.tokens.access_token;
  const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [
    "email",
    "openid",
    "https://www.googleapis.com/auth/firebase",
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  if (!token?.access_token) throw new Error("Firebase CLI access token is unavailable");
  return token.access_token;
}

function jwtPayload(token) {
  const encoded = String(token ?? "").split(".")[1];
  if (!encoded) throw new Error("Firebase user token is malformed");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

async function assertActiveSuperAdmin(authContext) {
  if (authContext.mode !== "firebase-user") return;
  const payload = jwtPayload(authContext.token);
  const uid = payload.user_id || payload.sub;
  if (!uid) throw new Error("Firebase user token has no UID");
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${authContext.token}` } },
  );
  if (!response.ok) throw new Error(`Master profile verification failed (${response.status})`);
  const document = await response.json();
  const role = document.fields?.role?.stringValue;
  const accountStatus = document.fields?.accountStatus?.stringValue;
  if (role !== "super_admin" || accountStatus !== "active") {
    throw new Error("Firebase user token does not belong to an active super_admin");
  }
}

async function createAuthContext() {
  if (firebaseTokenPath) {
    const token = (await readFile(firebaseTokenPath, "utf8")).trim();
    if (!token) throw new Error(`Firebase user token file is empty: ${firebaseTokenPath}`);
    const context = { mode: "firebase-user", token };
    await assertActiveSuperAdmin(context);
    return context;
  }
  return { mode: "google-iam", token: await createCliAccessToken() };
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, child]) => child !== undefined)
            .map(([key, child]) => [key, firestoreValue(child)]),
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function documentWrite(documentPath, data) {
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`,
      fields: Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, firestoreValue(value)]),
      ),
    },
  };
}

async function commitWrites(authContext, writes) {
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = writes.slice(offset, offset + 400);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${authContext.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ writes: batch }),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Firestore commit failed (${response.status}): ${detail.slice(0, 1_000)}`);
    }
  }
}

function storagePathFor(file) {
  if (file.archive) return `${STORAGE_PREFIX}/source/${safeFileName(file.fileName)}`;
  return `${STORAGE_PREFIX}/extracted/${safeFileName(file.fileName)}`;
}

function storageObjectUrl(authContext, storagePath) {
  if (authContext.mode === "firebase-user") {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`;
  }
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`;
}

function storageAuthorization(authContext) {
  return authContext.mode === "firebase-user"
    ? `Firebase ${authContext.token}`
    : `Bearer ${authContext.token}`;
}

async function getStorageMetadata(authContext, storagePath) {
  const response = await fetch(
    storageObjectUrl(authContext, storagePath),
    { headers: { Authorization: storageAuthorization(authContext) } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage metadata check failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return response.json();
}

async function updateStorageMetadata(authContext, file, storagePath, downloadToken) {
  const response = await fetch(
    storageObjectUrl(authContext, storagePath),
    {
      method: "PATCH",
      headers: { Authorization: storageAuthorization(authContext), "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: file.contentType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          sourceFingerprint: file.sha256,
          sourceDatabaseVersion: CONCEPT_SOURCE_DATABASE_VERSION,
          accessPolicy: "master-only",
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage metadata update failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

async function uploadFile(authContext, file) {
  const storagePath = storagePathFor(file);
  const current = await getStorageMetadata(authContext, storagePath);
  const currentToken = current?.metadata?.firebaseStorageDownloadTokens;
  const matches = current
    && Number(current.size) === file.byteSize
    && current.metadata?.sourceFingerprint === file.sha256
    && current.metadata?.sourceDatabaseVersion === CONCEPT_SOURCE_DATABASE_VERSION;
  if (matches) {
    await updateStorageMetadata(authContext, file, storagePath, currentToken || randomUUID());
    console.log(`Kept existing ${storagePath}`);
    return storagePath;
  }

  const uploadUrl = new URL(
    authContext.mode === "firebase-user"
      ? `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(STORAGE_BUCKET)}/o`
      : `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o`,
  );
  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", storagePath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: storageAuthorization(authContext), "Content-Type": file.contentType },
    body: file.bytes,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  await updateStorageMetadata(authContext, file, storagePath, randomUUID());
  console.log(`Uploaded ${storagePath}`);
  return storagePath;
}

function buildLibraryDocument({ archive, uploadedPaths, conceptDocuments, syntaxDocuments, importedAt, ingestionMode }) {
  const pathByName = new Map(archive.sourceFiles.map((file, index) => [file.fileName, uploadedPaths[index]]));
  const coreIndex = archive.dataset.core.map((item) => ({
    conceptId: item.conceptId,
    questionType: item.questionType,
    title: item.title,
    conceptKeys: item.conceptKeys,
  }));
  const learningNames = [
    "concept_assembly_core.json",
    "concept_assembly_core.jsonl",
    "concept_assembly_core.csv",
    "concept_assembly_guide.md",
    "syntax_explanations_index.csv",
    "syntax_explanations_raw.jsonl",
  ];
  const archiveName = archive.sourceFiles[0].fileName;
  const referenceNames = [archiveName, "manifest.json", "README.md", "CODEX_INTEGRATION_PROMPT.md"];
  return {
    authorId: "system-private-reference",
    teacherId: "system-private-reference",
    subject: "개념 조립 원문 DB · EBS 영어",
    audience: "마스터 계정 · AI 교재 개념 조립 엔진",
    section: "수능 영어 개념 · 구문 설명",
    identifier: LIBRARY_DOCUMENT_ID,
    learningTopic: "수능 영어 20개 유형 개념과 구문 설명 200개를 개념 조립에 사용하는 원문소스",
    introduction: "<p><strong>Xstudy Concept Assembly Source v1</strong> 원본 자료입니다.</p><p>핵심 유형 개념 20개는 기존 CSAT 개념 키로 정규화되어 개념 조립 엔진이 불러오며, 구문 설명 200개는 마스터 전용 검색 인덱스로 보관됩니다.</p>",
    lectureLink: null,
    learningMaterialFilePaths: learningNames.map((name) => pathByName.get(name)).filter(Boolean),
    referenceMaterialFilePaths: referenceNames.map((name) => pathByName.get(name)).filter(Boolean),
    resourceFiles: archive.sourceFiles.map((file, index) => ({
      fileName: file.fileName,
      storagePath: uploadedPaths[index],
      byteSize: file.byteSize,
      sha256: file.sha256,
      contentType: file.contentType,
    })),
    type: "share",
    status: "internal",
    visibility: "master_only",
    libraryCategory: "source_material",
    themes: ["k_entrance"],
    thumbnailPath: null,
    previewUrl: null,
    clickCount: 0,
    purchaseLink: null,
    homeworkCode: null,
    shortCode: null,
    homeworkInstruction: null,
    classroomId: null,
    classroomTitle: null,
    educationalInstantPublish: false,
    sourceDatabase: "concept_assembly_sources",
    sourceDatabaseVersion: CONCEPT_SOURCE_DATABASE_VERSION,
    sourceDatasetTitle: archive.manifest.dataset,
    sourceDatasetFingerprint: archive.datasetFingerprint,
    sourceCoreConceptCount: archive.dataset.core.length,
    sourceSyntaxExplanationCount: archive.dataset.syntax.length,
    sourceConceptIndex: coreIndex,
    syntaxTagIndex: archive.dataset.syntaxTags,
    conceptRecords: conceptDocuments.map((document) => document.data),
    syntaxExplanationRecords: syntaxDocuments.map((document) => document.data),
    ingestionMode,
    sourceAccessPolicy: "master-only",
    copyrightPolicy: "system-reference-only-no-source-republication",
    createdAt: importedAt,
    updatedAt: importedAt,
  };
}

async function importArchive(archive) {
  const authContext = await createAuthContext();
  const uploadedPaths = [];
  for (const file of archive.sourceFiles) uploadedPaths.push(await uploadFile(authContext, file));
  const importedAt = new Date();
  const conceptDocuments = buildConceptRecordDocuments({
    dataset: archive.dataset,
    datasetFingerprint: archive.datasetFingerprint,
    importedAt,
  });
  const syntaxDocuments = buildSyntaxRecordDocuments({
    dataset: archive.dataset,
    datasetFingerprint: archive.datasetFingerprint,
    importedAt,
  });
  const libraryDocument = buildLibraryDocument({
    archive,
    uploadedPaths,
    conceptDocuments,
    syntaxDocuments,
    importedAt,
    ingestionMode: authContext.mode,
  });
  const serializedBytes = Buffer.byteLength(JSON.stringify(libraryDocument), "utf8");
  if (serializedBytes >= 900_000) throw new Error(`Library document is too large: ${serializedBytes} bytes`);
  const writes = authContext.mode === "google-iam"
    ? [
        ...conceptDocuments.map((document) => documentWrite(`concept_records/${document.id}`, document.data)),
        ...syntaxDocuments.map((document) => documentWrite(`concept_syntax_records/${document.id}`, document.data)),
        documentWrite(`contents/${LIBRARY_DOCUMENT_ID}`, libraryDocument),
      ]
    : [documentWrite(`contents/${LIBRARY_DOCUMENT_ID}`, libraryDocument)];
  await commitWrites(authContext, writes);
  console.log(`Imported ${conceptDocuments.length} embedded concept records and ${syntaxDocuments.length} syntax records`);
  if (authContext.mode === "google-iam") console.log("Also imported direct concept and syntax collections");
  console.log(`Published ${archive.sourceFiles.length} master-only source files to Library`);
}

async function runQueryCount(authContext, collectionId) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${authContext.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: "sourceDatabaseVersion" },
              op: "EQUAL",
              value: { stringValue: CONCEPT_SOURCE_DATABASE_VERSION },
            },
          },
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Firestore verification query failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  const rows = await response.json();
  return rows.filter((row) => row.document).length;
}

async function verifyArchive(archive) {
  const authContext = await createAuthContext();
  const expectedConceptCount = buildConceptRecordDocuments({
    dataset: archive.dataset,
    datasetFingerprint: archive.datasetFingerprint,
  }).length;
  const libraryResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/contents/${LIBRARY_DOCUMENT_ID}`,
    { headers: { Authorization: `Bearer ${authContext.token}` } },
  );
  if (!libraryResponse.ok) throw new Error(`Library document verification failed (${libraryResponse.status})`);
  const libraryDocument = await libraryResponse.json();
  const embeddedConceptCount = libraryDocument.fields?.conceptRecords?.arrayValue?.values?.length || 0;
  const embeddedSyntaxCount = libraryDocument.fields?.syntaxExplanationRecords?.arrayValue?.values?.length || 0;
  if (embeddedConceptCount !== expectedConceptCount) {
    throw new Error(`Expected ${expectedConceptCount} embedded concept records, found ${embeddedConceptCount}`);
  }
  if (embeddedSyntaxCount !== archive.dataset.syntax.length) {
    throw new Error(`Expected ${archive.dataset.syntax.length} embedded syntax records, found ${embeddedSyntaxCount}`);
  }
  if (libraryDocument.fields?.libraryCategory?.stringValue !== "source_material") {
    throw new Error("Library document is not registered as source_material");
  }
  if (libraryDocument.fields?.status?.stringValue !== "internal") {
    throw new Error("Library document is not master-only internal content");
  }

  let storedFiles = 0;
  for (const file of archive.sourceFiles) {
    const metadata = await getStorageMetadata(authContext, storagePathFor(file));
    if (
      metadata
      && Number(metadata.size) === file.byteSize
      && metadata.metadata?.sourceFingerprint === file.sha256
      && metadata.metadata?.accessPolicy === "master-only"
      && metadata.metadata?.firebaseStorageDownloadTokens
    ) storedFiles += 1;
  }
  if (storedFiles !== archive.sourceFiles.length) {
    throw new Error(`Expected ${archive.sourceFiles.length} stored files, verified ${storedFiles}`);
  }
  if (authContext.mode === "google-iam") {
    const [directConceptCount, directSyntaxCount] = await Promise.all([
      runQueryCount(authContext, "concept_records"),
      runQueryCount(authContext, "concept_syntax_records"),
    ]);
    if (directConceptCount !== expectedConceptCount || directSyntaxCount !== archive.dataset.syntax.length) {
      throw new Error(`Direct collection verification failed: ${directConceptCount} concepts, ${directSyntaxCount} syntax records`);
    }
  }
  console.log(`Verified Firestore: ${embeddedConceptCount} embedded concept records, ${embeddedSyntaxCount} syntax records`);
  console.log(`Verified Library and Storage: 1 master-only item, ${storedFiles} files`);
}

const archive = await loadArchive();
const conceptDocuments = buildConceptRecordDocuments({
  dataset: archive.dataset,
  datasetFingerprint: archive.datasetFingerprint,
});
if (dryRun) {
  console.log(JSON.stringify({
    archivePath,
    dataset: archive.manifest.dataset,
    datasetVersion: archive.manifest.version,
    datasetFingerprint: archive.datasetFingerprint,
    sourceFiles: archive.sourceFiles.map((file) => ({ fileName: file.fileName, byteSize: file.byteSize, sha256: file.sha256 })),
    coreConcepts: archive.dataset.core.length,
    conceptRecords: conceptDocuments.length,
    syntaxRecords: archive.dataset.syntax.length,
    topSyntaxTags: archive.dataset.syntaxTags.slice(0, 12),
  }, null, 2));
}
if (shouldImport) await importArchive(archive);
if (shouldVerify) await verifyArchive(archive);
if (!dryRun && !shouldImport && !shouldVerify) {
  throw new Error("Choose --dry-run, --import, or --verify");
}
