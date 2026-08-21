#!/usr/bin/env node

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { englishReferenceSeedProfiles } from "../api/_data/english-reference-profiles.mjs";
import { examTextbookBlueprintProfiles } from "../api/_data/exam-textbook-blueprints.mjs";

const PROJECT_ID = "xtudynote";
const STORAGE_BUCKET = "xtudynote.firebasestorage.app";
const DOWNLOADS_ROOT = process.env.EXAM_BLUEPRINT_SOURCE_ROOT || path.join(process.env.HOME || "", "Downloads");
const args = new Set(process.argv.slice(2));
const shouldImport = args.has("--import");
const shouldPublishLibrary = args.has("--publish-library");
const shouldVerify = args.has("--verify");
const shouldInspect = args.has("--inspect");
const existingPrivateRegistrations = {
  "ebs-csat-special-2027-blueprint": {
    contentId: "private-reference-ebs-2027-special-english",
    storagePath: "contents/system-private-reference/ebs-2027-special-english/source.pdf",
  },
  "ebs-csat-complete-2026-blueprint": {
    contentId: "private-reference-ebs-2026-final-english",
    storagePath: "contents/system-private-reference/ebs-2026-final-english/source.pdf",
  },
};

function sanitizeText(value, maxLength = 4_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeFileName(name) {
  return String(name).normalize("NFC").replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file.pdf";
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
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

async function createCliAccessToken() {
  const require = createRequire(import.meta.url);
  const firebaseAuth = require("/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js");
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI login is required");
  if (
    account.tokens.access_token
    && Number(account.tokens.expires_at) > Date.now() + 60_000
  ) {
    return account.tokens.access_token;
  }
  const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [
    "email",
    "openid",
    "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
    "https://www.googleapis.com/auth/firebase",
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  if (!token?.access_token) throw new Error("Firebase CLI access token is unavailable");
  return token.access_token;
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

async function sourceFileIndex() {
  const entries = await readdir(DOWNLOADS_ROOT, { recursive: true });
  return entries.map((entry) => path.join(DOWNLOADS_ROOT, entry));
}

async function resolveSourcePath(profile, fileIndex) {
  const expectedName = String(profile.sourceFileName).normalize("NFC");
  for (const candidate of fileIndex) {
    if (path.basename(candidate).normalize("NFC") !== expectedName) continue;
    const sourceStat = await stat(candidate).catch(() => null);
    if (sourceStat?.isFile()) return candidate;
  }
  throw new Error(`Source file was not found: ${profile.sourceFileName}`);
}

async function sourceMetadata(profile, fileIndex) {
  const sourcePath = await resolveSourcePath(profile, fileIndex);
  const bytes = await readFile(sourcePath);
  return {
    profile,
    sourcePath,
    bytes,
    byteSize: bytes.length,
    fingerprint: createHash("sha256").update(bytes).digest("hex"),
    md5Hash: createHash("md5").update(bytes).digest("base64"),
  };
}

function storagePathFor(source) {
  return `contents/system-english-reference/${source.profile.id}/lm_library_0_${safeFileName(source.profile.sourceFileName)}`;
}

async function getStorageMetadata(accessToken, storagePath) {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage metadata check failed (${response.status})`);
  return response.json();
}

async function getFirestoreDocument(accessToken, collectionId, documentId) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}/${documentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore ${collectionId}/${documentId} check failed (${response.status})`);
  return response.json();
}

async function ensurePrivateMetadata(accessToken, storagePath, source) {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: "application/pdf",
        metadata: {
          sourceFingerprint: source.fingerprint,
          sourceProfileId: source.profile.id,
          copyrightPolicy: "derived-structure-only-no-source-republication",
          accessPolicy: "system-reference-only",
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage metadata update failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

async function uploadLibraryAsset(accessToken, source) {
  const storagePath = storagePathFor(source);
  const current = await getStorageMetadata(accessToken, storagePath);
  if (
    current
    && Number(current.size) === source.byteSize
    && current.metadata?.sourceFingerprint === source.fingerprint
  ) {
    await ensurePrivateMetadata(accessToken, storagePath, source);
    console.log(`Kept existing ${storagePath}`);
    return storagePath;
  }
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o`);
  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", storagePath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/pdf" },
    body: source.bytes,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  await ensurePrivateMetadata(accessToken, storagePath, source);
  console.log(`Uploaded ${storagePath}`);
  return storagePath;
}

function profileDocument(source) {
  return {
    ...source.profile,
    sourceFingerprint: source.fingerprint,
    sourceByteSize: source.byteSize,
    provider: "curated-analysis",
    model: "human-reviewed-page-role-blueprint",
    active: true,
    updatedAt: new Date(),
  };
}

function libraryDocument(source, storagePath) {
  const title = sanitizeText(source.profile.title, 240);
  return {
    authorId: "system-english-reference",
    teacherId: "system-english-reference",
    subject: title,
    audience: "고등학생 · 수능 영어 강사",
    section: "수능 영어 교재 구조",
    identifier: `english-reference-${source.profile.id}`,
    learningTopic: `${source.profile.focus} · AI 교재 구조 DB`,
    introduction: `<p><strong>${title}</strong>에서 파생한 AI 교재 구조 청사진입니다.</p><p>원본은 시스템 전용 참고 보관소에 비공개 저장되며, AI는 원문을 복제하지 않고 단원 흐름·풀이 단계·문항 배열·난이도·해설 원리만 신규 XUniverse 교재 제작에 활용합니다.</p>`,
    lectureLink: null,
    learningMaterialFilePaths: [],
    referenceMaterialFilePaths: [],
    type: "share",
    status: "approved",
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
    educationalInstantPublish: true,
    sourceDatabase: "english_reference_profiles",
    sourceDatabaseVersion: "english-reference-profile-v1",
    sourceProfileRef: `english_reference_profiles/${source.profile.id}`,
    sourceArchiveStoragePath: storagePath,
    sourceAccessPolicy: "system-reference-only",
    sourceFingerprint: source.fingerprint,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function importProfiles(accessToken, sources) {
  const allProfiles = [...englishReferenceSeedProfiles, ...examTextbookBlueprintProfiles];
  const writes = sources.map((source) =>
    documentWrite(`english_reference_profiles/${source.profile.id}`, profileDocument(source)),
  );
  writes.push(documentWrite("english_reference_meta/current", {
    schemaVersion: "english-reference-profile-v1",
    profileCount: allProfiles.length,
    profileIds: allProfiles.map((profile) => profile.id),
    copyrightPolicy: "derived-structure-only-no-source-republication",
    active: true,
    updatedAt: new Date(),
  }));
  await commitWrites(accessToken, writes);
  console.log(`Imported ${sources.length} exam textbook blueprints`);
}

async function publishLibrary(accessToken, sources) {
  const writes = [];
  for (const source of sources) {
    const existing = existingPrivateRegistrations[source.profile.id];
    if (existing) {
      const [contentDocument, storageMetadata] = await Promise.all([
        getFirestoreDocument(accessToken, "contents", existing.contentId),
        getStorageMetadata(accessToken, existing.storagePath),
      ]);
      if (
        contentDocument
        && Number(storageMetadata?.size) === source.byteSize
        && (!storageMetadata?.md5Hash || storageMetadata.md5Hash === source.md5Hash)
      ) {
        console.log(`Kept side registration ${existing.contentId} -> ${existing.storagePath}`);
        continue;
      }
    }
    const storagePath = await uploadLibraryAsset(accessToken, source);
    writes.push(documentWrite(`contents/english-reference-${source.profile.id}`, libraryDocument(source, storagePath)));
  }
  if (writes.length) await commitWrites(accessToken, writes);
  console.log(`Published ${writes.length} missing exam textbook files to Library`);
}

async function verify(accessToken, sources) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const result = [];
  for (const source of sources) {
    const existing = existingPrivateRegistrations[source.profile.id];
    const contentId = existing?.contentId || `english-reference-${source.profile.id}`;
    const storagePath = existing?.storagePath || storagePathFor(source);
    const [profileResponse, contentResponse, storageMetadata] = await Promise.all([
      fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/english_reference_profiles/${source.profile.id}`,
        { headers },
      ),
      fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/contents/${contentId}`,
        { headers },
      ),
      getStorageMetadata(accessToken, storagePath),
    ]);
    const valid = profileResponse.ok
      && contentResponse.ok
      && Number(storageMetadata?.size) === source.byteSize
      && (!storageMetadata?.md5Hash || storageMetadata.md5Hash === source.md5Hash);
    if (!valid) throw new Error(`Verification failed: ${source.profile.id}`);
    result.push({ id: source.profile.id, contentId, bytes: source.byteSize, storagePath });
  }
  console.log(JSON.stringify({ verified: result }, null, 2));
}

function firestoreField(document, key) {
  const value = document?.fields?.[key];
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map((item) => item.stringValue).filter(Boolean);
  }
  return undefined;
}

async function listFirestoreCollection(accessToken, collectionId) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}`,
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Firestore ${collectionId} inspection failed (${response.status})`);
    const payload = await response.json();
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return documents;
}

async function inspectRegistrations(accessToken) {
  const [profiles, contents, storageResponse] = await Promise.all([
    listFirestoreCollection(accessToken, "english_reference_profiles"),
    listFirestoreCollection(accessToken, "contents"),
    fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o?prefix=${encodeURIComponent("contents/system-english-reference/")}&maxResults=1000`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
  ]);
  if (!storageResponse.ok) throw new Error(`Storage inspection failed (${storageResponse.status})`);
  const storage = await storageResponse.json();
  const relevantProfiles = profiles
    .map((document) => ({
      id: document.name.split("/").pop(),
      title: firestoreField(document, "title"),
      sourceFileName: firestoreField(document, "sourceFileName"),
      category: firestoreField(document, "category"),
    }))
    .filter((item) => /수능특강|수능완성|수특|exam-textbook|ebs/i.test(Object.values(item).join(" ")));
  const relevantContents = contents
    .map((document) => ({
      id: document.name.split("/").pop(),
      subject: firestoreField(document, "subject"),
      identifier: firestoreField(document, "identifier"),
      learningTopic: firestoreField(document, "learningTopic"),
      learningMaterialFilePaths: firestoreField(document, "learningMaterialFilePaths") || [],
      sourceArchiveStoragePath: firestoreField(document, "sourceArchiveStoragePath"),
    }))
    .filter((item) => /수능특강|수능완성|수특|exam-textbook|ebs/i.test(Object.values(item).flat().join(" ")));
  const relevantStorage = (storage.items || [])
    .map((item) => ({ name: item.name, size: Number(item.size) || 0, metadata: item.metadata || {} }))
    .filter((item) => /수능특강|수능완성|수특|exam-textbook|ebs|special|complete/i.test(item.name));
  const sideStorage = await Promise.all(
    Object.values(existingPrivateRegistrations).map(async ({ contentId, storagePath }) => {
      const metadata = await getStorageMetadata(accessToken, storagePath);
      return {
        contentId,
        storagePath,
        exists: Boolean(metadata),
        size: Number(metadata?.size) || 0,
        hasDownloadToken: Boolean(metadata?.metadata?.firebaseStorageDownloadTokens),
        accessPolicy: metadata?.metadata?.accessPolicy || "unspecified",
      };
    }),
  );
  console.log(JSON.stringify({ relevantProfiles, relevantContents, relevantStorage, sideStorage }, null, 2));
}

if (!shouldImport && !shouldPublishLibrary && !shouldVerify && !shouldInspect) {
  throw new Error("Choose --import, --publish-library, --verify, and/or --inspect");
}

const fileIndex = await sourceFileIndex();
const sources = await Promise.all(examTextbookBlueprintProfiles.map((profile) => sourceMetadata(profile, fileIndex)));
const accessToken = await createCliAccessToken();
if (shouldImport) await importProfiles(accessToken, sources);
if (shouldPublishLibrary) await publishLibrary(accessToken, sources);
if (shouldVerify) await verify(accessToken, sources);
if (shouldInspect) await inspectRegistrations(accessToken);
