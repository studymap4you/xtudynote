import admin from "firebase-admin";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const DEFAULT_BUCKET = "xtudynote.firebasestorage.app";

function ensurePrimaryAdmin() {
  const existing = admin.apps.find((app) => app?.name === "[DEFAULT]");
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("server-auth-not-configured");
  return admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(raw)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET,
  });
}

async function requireActiveUser(req) {
  const authorization = String(req.headers.authorization || "");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!bearer) throw Object.assign(new Error("authentication-required"), { statusCode: 401 });
  ensurePrimaryAdmin();
  const decoded = await admin.auth().verifyIdToken(bearer);
  const snapshot = await admin.firestore().doc(`users/${decoded.uid}`).get();
  const profile = snapshot.data() || {};
  if (profile.accountStatus !== "active" || !["student", "teacher", "super_admin"].includes(profile.role)) {
    throw Object.assign(new Error("active-account-required"), { statusCode: 403 });
  }
  return { decoded, role: profile.role };
}

function cleanText(value, maxLength = 1_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function toIso(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function sourceIdToCategory(value) {
  const identifier = cleanText(value, 180).toLowerCase().replace(/_/gu, "-");
  const prefixes = [
    ["common-english-1-", "textbook_common1_"],
    ["common-english-2-", "textbook_common2_"],
    ["english-1-", "textbook_english1_"],
    ["english-2-", "textbook_english2_"],
    ["reading-writing-", "textbook_reading_writing_"],
    ["advanced-english-", "textbook_advanced_"],
  ];
  const match = prefixes.find(([prefix]) => identifier.startsWith(prefix));
  if (!match) return "textbook_general";
  const suffix = identifier.slice(match[0].length).replace(/-/gu, "_");
  return suffix ? `${match[1]}${suffix}` : "textbook_general";
}

function canReadSource(data, role) {
  return data.visibility !== "master_only" || role === "super_admin";
}

function serializeSource(snapshot) {
  const data = snapshot.data() || {};
  const courseTitle = cleanText(data.course_title, 160) || "영어 교과서";
  const publisher = cleanText(data.publisher, 120);
  const leadAuthor = cleanText(data.lead_author, 120);
  return {
    id: snapshot.id,
    category: sourceIdToCategory(snapshot.id),
    title: [courseTitle, publisher && leadAuthor ? `${publisher}(${leadAuthor})` : publisher || leadAuthor]
      .filter(Boolean)
      .join(" · "),
    courseTitle,
    publisher,
    leadAuthor,
    collectedAt: toIso(data.collected_at),
    size: Number(data.size_bytes) || 0,
  };
}

async function listSources(req, role) {
  const category = cleanText(req.query?.category, 180);
  if (category && !/^textbook_[a-z0-9_]+$/u.test(category)) {
    throw Object.assign(new Error("textbook-category-invalid"), { statusCode: 400 });
  }
  const snapshot = await getProblemBankFirestore().collection("textbook_sources").limit(250).get();
  return snapshot.docs
    .filter((document) => {
      const data = document.data() || {};
      return data.collection_status === "collected" && cleanText(data.storage_path) && canReadSource(data, role);
    })
    .map(serializeSource)
    .filter((source) => !category || source.category === category)
    .sort((left, right) => left.title.localeCompare(right.title, "ko"));
}

async function createDownload(req, role) {
  const sourceId = cleanText(req.query?.sourceId, 180);
  if (!sourceId || sourceId.includes("/")) {
    throw Object.assign(new Error("textbook-download-invalid"), { statusCode: 400 });
  }
  const snapshot = await getProblemBankFirestore().collection("textbook_sources").doc(sourceId).get();
  if (!snapshot.exists) throw Object.assign(new Error("textbook-source-not-found"), { statusCode: 404 });
  const data = snapshot.data() || {};
  if (!canReadSource(data, role)) throw Object.assign(new Error("textbook-source-forbidden"), { statusCode: 403 });
  const path = cleanText(data.storage_path, 1_000);
  if (data.collection_status !== "collected" || !path) {
    throw Object.assign(new Error("textbook-file-not-found"), { statusCode: 404 });
  }
  if (!path.startsWith("textbook-files/english/") || path.includes("..")) {
    throw Object.assign(new Error("textbook-file-path-invalid"), { statusCode: 400 });
  }
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const [url] = await admin.storage().bucket(bucketName).file(path).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 2 * 60 * 1_000,
  });
  return url;
}

function errorCode(error) {
  const raw = error instanceof Error ? error.message : "request-failed";
  if (raw.includes("PERMISSION_DENIED") || raw.includes("permission-denied")) {
    return "problem-bank-permission-denied";
  }
  return cleanText(raw, 300) || "request-failed";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "method-not-allowed" });
      return;
    }
    const user = await requireActiveUser(req);
    if (req.query?.sourceId) {
      res.status(200).json({ url: await createDownload(req, user.role) });
      return;
    }
    res.status(200).json({ items: await listSources(req, user.role) });
  } catch (error) {
    console.error("[textbook-library]", error);
    res.status(Number(error?.statusCode) || 500).json({ error: errorCode(error) });
  }
}
