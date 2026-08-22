#!/usr/bin/env node

import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";

const PROJECT_ID = "xtudynote";
const STORAGE_BUCKET = "xtudynote.firebasestorage.app";
const SOURCE_ROOT = path.resolve(
  process.env.OPEN_ACCESS_PAPERS_ROOT || "/Users/chogihwa/Downloads/open_access_100_papers",
);
const args = new Set(process.argv.slice(2));
const shouldImport = args.has("--import");
const shouldVerify = args.has("--verify");
const dryRun = args.has("--dry-run");

function sanitizeText(value, maxLength = 4_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return sanitizeText(value, 4_000)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
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

async function createCliAccessToken() {
  const require = createRequire(import.meta.url);
  const firebaseAuth = require("/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js");
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI login is required");
  if (account.tokens.access_token && Number(account.tokens.expires_at) > Date.now() + 60_000) {
    return account.tokens.access_token;
  }
  const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [
    "email",
    "openid",
    "https://www.googleapis.com/auth/firebase",
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  if (!token?.access_token) throw new Error("Firebase CLI access token is unavailable");
  return token.access_token;
}

function parseManifest(source) {
  const entries = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    if (match) entries.set(match[2].normalize("NFC"), match[1].toLowerCase());
  }
  return entries;
}

function resolveSourceFile(relativePath) {
  const normalized = sanitizeText(relativePath, 500).replaceAll("\\", "/");
  const absolutePath = path.resolve(SOURCE_ROOT, normalized);
  if (!absolutePath.startsWith(`${SOURCE_ROOT}${path.sep}`)) {
    throw new Error(`Unsafe source path: ${relativePath}`);
  }
  return { normalized, absolutePath };
}

async function loadIndex() {
  const workbook = XLSX.readFile(path.join(SOURCE_ROOT, "INDEX.csv"), { type: "file" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const rows = rawRows
    .map((row) => ({
      number: Number(row.no ?? row["﻿no"]),
      field: sanitizeText(row.field, 240),
      title: sanitizeText(row.title, 500),
      doi: sanitizeText(row.doi, 240),
      sourceCollection: sanitizeText(row.source_collection, 500),
      sourceUrl: sanitizeText(row.source_url, 1_000),
      license: sanitizeText(row.license, 120),
      pages: Number(row.pages) || 0,
      pdfFile: sanitizeText(row.pdf_file, 500),
      textFile: sanitizeText(row.text_file, 500),
    }))
    .sort((a, b) => a.number - b.number);
  if (rows.length !== 100 || rows.some((row, index) => row.number !== index + 1)) {
    throw new Error(`INDEX.csv must contain paper numbers 1-100 exactly; found ${rows.length}`);
  }
  return rows;
}

async function prepareSourceAsset(relativePath, manifest) {
  const { normalized, absolutePath } = resolveSourceFile(relativePath);
  const sourceStat = await stat(absolutePath);
  if (!sourceStat.isFile()) throw new Error(`Source asset is not a file: ${normalized}`);
  const bytes = await readFile(absolutePath);
  const fingerprint = createHash("sha256").update(bytes).digest("hex");
  const expected = manifest.get(normalized.normalize("NFC"));
  if (!expected || fingerprint !== expected) throw new Error(`Checksum mismatch: ${normalized}`);
  return { bytes, fingerprint };
}

async function getStorageMetadata(accessToken, storagePath) {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage metadata failed (${response.status}): ${storagePath}`);
  return response.json();
}

async function setStorageMetadata(accessToken, storagePath, contentType, fingerprint, currentToken) {
  const downloadToken = currentToken || randomUUID();
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}?updateMask=contentType,metadata`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          sourceFingerprint: fingerprint,
          sourceCollection: "open-access-100-papers",
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

async function uploadAsset(accessToken, source, storagePath, contentType) {
  const current = await getStorageMetadata(accessToken, storagePath);
  const currentToken = current?.metadata?.firebaseStorageDownloadTokens;
  if (
    current
    && Number(current.size) === source.bytes.length
    && current.metadata?.sourceFingerprint === source.fingerprint
  ) {
    if (!currentToken || current.contentType !== contentType) {
      await setStorageMetadata(accessToken, storagePath, contentType, source.fingerprint, currentToken);
    }
    return "kept";
  }
  const uploadUrl = new URL(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o`,
  );
  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", storagePath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: source.bytes,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  await setStorageMetadata(accessToken, storagePath, contentType, source.fingerprint, currentToken);
  return "uploaded";
}

function paperId(number) {
  return `open-access-paper-${String(number).padStart(3, "0")}`;
}

function storagePaths(number) {
  const folder = `contents/system-private-reference/open-access-papers/${String(number).padStart(3, "0")}`;
  return { pdf: `${folder}/paper.pdf`, text: `${folder}/paper.txt` };
}

function libraryDocument(row, paths, fingerprints) {
  const paperNumber = String(row.number).padStart(3, "0");
  const title = escapeHtml(row.title);
  const field = escapeHtml(row.field);
  const doi = escapeHtml(row.doi);
  const license = escapeHtml(row.license);
  return {
    authorId: "system-private-reference",
    teacherId: "system-private-reference",
    subject: row.title,
    audience: "마스터 계정 · 모의 수능 영어 교재 제작",
    section: row.field,
    identifier: paperId(row.number),
    learningTopic: `${row.field} · 모의 수능 영어 지문·문항 제작 원문소스`,
    introduction: `<p><strong>${title}</strong></p><p>분야: ${field}</p><p>DOI: ${doi || "미기재"} · 라이선스: ${license}</p><p>모의 수능 영어 지문과 문항 생성 테스트를 위한 마스터 전용 원문소스입니다. 재사용 시 원저자·논문명·출처·라이선스를 표시해야 합니다.</p>`,
    lectureLink: row.sourceUrl || null,
    learningMaterialFilePaths: [paths.pdf],
    referenceMaterialFilePaths: [paths.text],
    type: "share",
    status: "internal",
    libraryCategory: "source_material",
    themes: ["academic"],
    thumbnailPath: null,
    previewUrl: null,
    clickCount: 0,
    purchaseLink: null,
    homeworkCode: null,
    shortCode: null,
    homeworkInstruction: null,
    classroomId: null,
    classroomTitle: null,
    sourceDatabase: "open_access_paper_sources",
    sourceDatabaseVersion: "open-access-paper-sources-v1",
    sourcePaperNumber: row.number,
    sourceField: row.field,
    sourceDoi: row.doi,
    sourceCollection: row.sourceCollection,
    sourceUrl: row.sourceUrl,
    sourceLicense: row.license,
    sourcePageCount: row.pages,
    sourcePdfFingerprint: fingerprints.pdf,
    sourceTextFingerprint: fingerprints.text,
    sourceAccessPolicy: "master-only",
    sourceAttributionRequired: true,
    sourceLabel: `Open Access Paper ${paperNumber}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function commitWrites(accessToken, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Firestore commit failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

async function importPapers(accessToken, rows, manifest) {
  const writes = [];
  let uploaded = 0;
  let kept = 0;
  for (const row of rows) {
    const paths = storagePaths(row.number);
    const [pdf, text] = await Promise.all([
      prepareSourceAsset(row.pdfFile, manifest),
      prepareSourceAsset(row.textFile, manifest),
    ]);
    const pdfResult = await uploadAsset(accessToken, pdf, paths.pdf, "application/pdf");
    const textResult = await uploadAsset(accessToken, text, paths.text, "text/plain; charset=utf-8");
    uploaded += Number(pdfResult === "uploaded") + Number(textResult === "uploaded");
    kept += Number(pdfResult === "kept") + Number(textResult === "kept");
    writes.push(
      documentWrite(`contents/${paperId(row.number)}`, libraryDocument(row, paths, {
        pdf: pdf.fingerprint,
        text: text.fingerprint,
      })),
    );
    console.log(`[${String(row.number).padStart(3, "0")}/100] ${row.title}`);
  }
  await commitWrites(accessToken, writes);
  console.log(JSON.stringify({ registered: writes.length, uploadedAssets: uploaded, keptAssets: kept }));
}

async function verifyImport(accessToken, rows) {
  const [contentsResponse, storageResponse] = await Promise.all([
    fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/contents?pageSize=300`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
    fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o?prefix=${encodeURIComponent("contents/system-private-reference/open-access-papers/")}&maxResults=1000`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
  ]);
  if (!contentsResponse.ok || !storageResponse.ok) throw new Error("Verification query failed");
  const contents = await contentsResponse.json();
  const storage = await storageResponse.json();
  const documents = new Map(
    (contents.documents || []).map((document) => [document.name.split("/").pop(), document.fields || {}]),
  );
  const objects = new Map((storage.items || []).map((item) => [item.name, item]));
  const errors = [];
  for (const row of rows) {
    const id = paperId(row.number);
    const fields = documents.get(id);
    const paths = storagePaths(row.number);
    if (!fields) errors.push(`Missing Firestore document: ${id}`);
    if (fields?.status?.stringValue !== "internal") errors.push(`Invalid status: ${id}`);
    if (fields?.libraryCategory?.stringValue !== "source_material") errors.push(`Invalid category: ${id}`);
    for (const storagePath of [paths.pdf, paths.text]) {
      const item = objects.get(storagePath);
      if (!item) errors.push(`Missing Storage object: ${storagePath}`);
      if (!item?.metadata?.firebaseStorageDownloadTokens) errors.push(`Missing download token: ${storagePath}`);
      if (item?.metadata?.accessPolicy !== "master-only") errors.push(`Invalid access policy: ${storagePath}`);
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 20).join("\n"));
  console.log(JSON.stringify({ verifiedDocuments: rows.length, verifiedAssets: rows.length * 2 }));
}

if (!shouldImport && !shouldVerify && !dryRun) {
  throw new Error("Choose --import, --verify, and/or --dry-run");
}

const rows = await loadIndex();
const manifest = parseManifest(await readFile(path.join(SOURCE_ROOT, "MANIFEST.sha256"), "utf8"));
if (dryRun) {
  for (const row of rows) {
    await prepareSourceAsset(row.pdfFile, manifest);
    await prepareSourceAsset(row.textFile, manifest);
  }
  console.log(JSON.stringify({ papers: rows.length, assets: rows.length * 2, checksums: "valid" }));
}
if (shouldImport || shouldVerify) {
  const accessToken = await createCliAccessToken();
  if (shouldImport) await importPapers(accessToken, rows, manifest);
  if (shouldVerify) await verifyImport(accessToken, rows);
}
