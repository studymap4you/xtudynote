import admin from "firebase-admin";
import { getProblemBankFirestore, problemBankSettings } from "./_lib/problem-bank/admin.mjs";
import { isSuperAdminEmail } from "./_lib/billing/config.mjs";

const VALID_GRADES = new Set([1, 2, 3]);
const VALID_MONTHS = new Set([3, 6, 9, 10]);
const VALID_STATUSES = new Set([
  "queued",
  "running",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
]);

function ensurePrimaryAdmin() {
  const existing = admin.apps.find((app) => app?.name === "[DEFAULT]");
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("server-auth-not-configured");
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

async function requireSuperAdmin(req) {
  ensurePrimaryAdmin();
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!bearer) throw Object.assign(new Error("authentication-required"), { statusCode: 401 });
  const decoded = await admin.auth().verifyIdToken(bearer);
  const userSnapshot = await admin.firestore().doc(`users/${decoded.uid}`).get();
  const user = userSnapshot.data() || {};
  const email = String(decoded.email || user.email || "").trim().toLowerCase();
  if (!isSuperAdminEmail(email) || user.role !== "super_admin" || user.accountStatus !== "active") {
    throw Object.assign(new Error("super-admin-only"), { statusCode: 403 });
  }
  return { uid: decoded.uid, email };
}

function integers(value, allowed, field) {
  if (!Array.isArray(value)) throw Object.assign(new Error(`${field}-required`), { statusCode: 400 });
  const normalized = [...new Set(value.map(Number))].filter((item) => allowed.has(item)).sort((a, b) => a - b);
  if (!normalized.length || normalized.length !== new Set(value.map(Number)).size) {
    throw Object.assign(new Error(`${field}-invalid`), { statusCode: 400 });
  }
  return normalized;
}

function parseBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body && typeof req.body === "object" ? req.body : {};
}

function toIso(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function cleanText(value, maxLength = 1_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function serializeJob(snapshot) {
  const data = snapshot.data() || {};
  const status = VALID_STATUSES.has(data.status) ? data.status : "queued";
  return {
    id: snapshot.id,
    status,
    subject: cleanText(data.subject, 40) || "english",
    grades: Array.isArray(data.grades) ? data.grades.map(Number) : [],
    months: Array.isArray(data.months) ? data.months.map(Number) : [],
    startYear: Number(data.start_year) || 0,
    endYear: Number(data.end_year) || 0,
    totalTargets: Number(data.total_targets) || 0,
    completedTargets: Number(data.completed_targets) || 0,
    failedTargets: Number(data.failed_targets) || 0,
    uploadedFiles: Number(data.uploaded_files) || 0,
    skippedFiles: Number(data.skipped_files) || 0,
    dbRegisteredCount: Number(data.db_registered_count) || 0,
    currentTarget: cleanText(data.current_target, 120) || null,
    error: cleanText(data.error, 500) || null,
    requestedByEmail: cleanText(data.requested_by_email, 200) || null,
    createdAt: toIso(data.created_at),
    startedAt: toIso(data.started_at),
    completedAt: toIso(data.completed_at),
    updatedAt: toIso(data.updated_at),
  };
}

function serializeExam(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: cleanText(data.id, 160) || snapshot.id,
    year: Number(data.year) || 0,
    grade: Number(data.grade) || 0,
    month: Number(data.month) || 0,
    subject: cleanText(data.subject, 40) || "english",
    organizer: cleanText(data.organizer, 120) || "EBSi",
    questionFilePath: cleanText(data.question_file_path, 1_000) || null,
    answerFilePath: cleanText(data.answer_file_path, 1_000) || null,
    scriptFilePath: cleanText(data.script_file_path, 1_000) || null,
    parseStatus: cleanText(data.parse_status, 80) || "not_started",
    collectedAt: toIso(data.collected_at),
    updatedAt: toIso(data.updated_at),
  };
}

function timestampValue(item) {
  return Date.parse(item.updatedAt || item.createdAt || item.collectedAt || "") || 0;
}

async function listState(req) {
  const firestore = getProblemBankFirestore();
  const [jobsSnapshot, examsSnapshot] = await Promise.all([
    firestore.collection("exam_collection_jobs").limit(60).get(),
    firestore.collection("exams").limit(250).get(),
  ]);
  const jobs = jobsSnapshot.docs.map(serializeJob).sort((left, right) => timestampValue(right) - timestampValue(left));
  const exams = examsSnapshot.docs.map(serializeExam).sort((left, right) => (
    right.year - left.year || right.grade - left.grade || right.month - left.month
  ));
  const jobId = cleanText(req.query?.jobId, 160);
  let targets = [];
  if (jobId && !jobId.includes("/")) {
    const targetsSnapshot = await firestore.collection("exam_collection_jobs").doc(jobId).collection("targets").limit(400).get();
    targets = targetsSnapshot.docs.map((snapshot) => {
      const data = snapshot.data() || {};
      return {
        id: snapshot.id,
        grade: Number(data.grade) || 0,
        year: Number(data.year) || 0,
        month: Number(data.month) || 0,
        status: cleanText(data.status, 60) || "queued",
        discoveredFiles: Number(data.discovered_files) || 0,
        uploadedFiles: Number(data.uploaded_files) || 0,
        skippedFiles: Number(data.skipped_files) || 0,
        dbRegistered: Boolean(data.db_registered),
        error: cleanText(data.error, 500) || null,
        updatedAt: toIso(data.updated_at),
      };
    }).sort((left, right) => left.year - right.year || left.grade - right.grade || left.month - right.month);
  }
  const settings = problemBankSettings();
  return {
    projectId: settings.projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "xtudynote.firebasestorage.app",
    jobs,
    exams,
    targets,
  };
}

async function enqueueJob(req, actor) {
  const body = parseBody(req);
  const grades = integers(body.grades, VALID_GRADES, "grades");
  const months = integers(body.months, VALID_MONTHS, "months");
  const currentYear = new Date().getFullYear();
  const startYear = Number(body.startYear);
  const endYear = Number(body.endYear);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)
    || startYear < 2006 || endYear > currentYear || startYear > endYear) {
    throw Object.assign(new Error("year-range-invalid"), { statusCode: 400 });
  }
  const firestore = getProblemBankFirestore();
  const ref = firestore.collection("exam_collection_jobs").doc();
  const now = new Date();
  const totalTargets = grades.length * months.length * (endYear - startYear + 1);
  await ref.create({
    id: ref.id,
    status: "queued",
    source: "ebsi-official-archive",
    subject: "english",
    grades,
    months,
    start_year: startYear,
    end_year: endYear,
    total_targets: totalTargets,
    completed_targets: 0,
    failed_targets: 0,
    uploaded_files: 0,
    skipped_files: 0,
    db_registered_count: 0,
    requested_by_uid: actor.uid,
    requested_by_email: actor.email,
    created_at: now,
    updated_at: now,
  });
  return serializeJob(await ref.get());
}

function errorMessage(error) {
  const raw = error instanceof Error ? error.message : "request-failed";
  if (raw.includes("PERMISSION_DENIED") || raw.includes("permission-denied")) {
    return "problem-bank-permission-denied";
  }
  return cleanText(raw, 500) || "request-failed";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  try {
    const actor = await requireSuperAdmin(req);
    if (req.method === "GET") {
      res.status(200).json(await listState(req));
      return;
    }
    if (req.method === "POST") {
      const job = await enqueueJob(req, actor);
      res.status(202).json({ ok: true, job });
      return;
    }
    res.status(405).json({ error: "method-not-allowed" });
  } catch (error) {
    console.error("[admin-exam-collector]", error);
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({ error: errorMessage(error) });
  }
}
