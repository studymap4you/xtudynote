import admin from "firebase-admin";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const VALID_GRADES = new Set([1, 2, 3]);
const VALID_FILE_TYPES = new Set(["question", "answer", "script"]);
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
  const user = snapshot.data() || {};
  if (user.accountStatus !== "active" || !["student", "teacher", "super_admin"].includes(user.role)) {
    throw Object.assign(new Error("active-account-required"), { statusCode: 403 });
  }
  return decoded;
}

function cleanText(value, maxLength = 1_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function toIso(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function serializeExam(snapshot) {
  const data = snapshot.data() || {};
  const files = [];
  if (cleanText(data.question_file_path)) files.push("question");
  if (cleanText(data.answer_file_path)) files.push("answer");
  if (cleanText(data.script_file_path)) files.push("script");
  return {
    id: snapshot.id,
    title: cleanText(data.title, 240) || `고${Number(data.grade) || "-"} ${Number(data.month) || "-"}월 영어 모의고사`,
    year: Number(data.year) || 0,
    grade: Number(data.grade) || 0,
    month: Number(data.month) || 0,
    organizer: cleanText(data.organizer, 160) || "EBSi",
    collectedAt: toIso(data.collected_at),
    files,
  };
}

async function listExams(req) {
  const grade = Number(req.query?.grade);
  if (!VALID_GRADES.has(grade)) throw Object.assign(new Error("grade-invalid"), { statusCode: 400 });
  const snapshot = await getProblemBankFirestore().collection("exams").limit(500).get();
  return snapshot.docs
    .map(serializeExam)
    .filter((exam) => exam.grade === grade && exam.files.length > 0)
    .sort((left, right) => right.year - left.year || right.month - left.month);
}

async function createDownload(req) {
  const examId = cleanText(req.query?.examId, 180);
  const fileType = cleanText(req.query?.fileType, 30);
  if (!examId || examId.includes("/") || !VALID_FILE_TYPES.has(fileType)) {
    throw Object.assign(new Error("download-request-invalid"), { statusCode: 400 });
  }
  const snapshot = await getProblemBankFirestore().collection("exams").doc(examId).get();
  if (!snapshot.exists) throw Object.assign(new Error("exam-not-found"), { statusCode: 404 });
  const path = cleanText(snapshot.data()?.[`${fileType}_file_path`], 1_000);
  if (!path) throw Object.assign(new Error("exam-file-not-found"), { statusCode: 404 });
  if (!path.startsWith("exam-files/english/") || path.includes("..")) {
    throw Object.assign(new Error("exam-file-path-invalid"), { statusCode: 400 });
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
    await requireActiveUser(req);
    if (req.query?.examId || req.query?.fileType) {
      res.status(200).json({ url: await createDownload(req) });
      return;
    }
    res.status(200).json({ items: await listExams(req) });
  } catch (error) {
    console.error("[exam-library]", error);
    res.status(Number(error?.statusCode) || 500).json({ error: errorCode(error) });
  }
}
