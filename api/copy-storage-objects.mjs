import crypto from "node:crypto";
import admin from "firebase-admin";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN_SHA256 = "3368b3d4b3556108c7b9e3fc4f89440b8186b16962b20486b5e50bd05f340bdc";
const ALLOWED_SERIES = new Set([
  "ebs_special_lecture_2027_er_v2",
  "ebs_complete_2027_v2",
]);

function clean(value, max = 1000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
}

function authorized(req) {
  const token = clean(req.query?.token, 200);
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const left = Buffer.from(digest, "hex");
  const right = Buffer.from(TOKEN_SHA256, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function serviceAccount() {
  const raw = process.env.PROBLEM_BANK_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("problem-bank-service-account-missing");
  const parsed = JSON.parse(raw);
  if (!parsed?.client_email || !parsed?.private_key) throw new Error("problem-bank-service-account-invalid");
  return parsed;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new Error(`google-oauth-failed:${response.status}:${clean(data?.error_description || data?.error, 300)}`);
  }
  return data.access_token;
}

async function driveJson(fileId) {
  const account = serviceAccount();
  const accessToken = await googleAccessToken(account);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = clean(await response.text(), 800);
    throw new Error(`drive-download-failed:${response.status}:${text}`);
  }
  const text = await response.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("drive-json-not-array");
  return data;
}

function documentId(seriesId, questionId) {
  const digest = crypto.createHash("sha256").update(`${seriesId}:${questionId}`).digest("hex").slice(0, 40);
  return `curriculum_${digest}`;
}

function serializableProblem(problem, seriesId) {
  if (!problem || typeof problem !== "object") throw new Error("problem-invalid");
  const questionId = clean(problem.questionId, 200);
  if (!questionId) throw new Error("question-id-missing");
  if (clean(problem.curriculumSeries, 180) !== seriesId) throw new Error(`series-mismatch:${questionId}`);
  const answer = Number(problem.answer);
  if (!Number.isInteger(answer) || answer < 1 || answer > 5) throw new Error(`answer-invalid:${questionId}`);
  if (!Array.isArray(problem.choices) || problem.choices.length !== 5) throw new Error(`choices-invalid:${questionId}`);
  return { ...problem, questionId, answer, status: "approved" };
}

async function importSlice({ fileId, seriesId, offset, limit }) {
  if (!ALLOWED_SERIES.has(seriesId)) throw new Error("series-invalid");
  const all = await driveJson(fileId);
  const start = Math.max(0, Number.isInteger(offset) ? offset : 0);
  const max = Math.min(400, Math.max(1, Number.isInteger(limit) ? limit : 300));
  const slice = all.slice(start, start + max);
  const firestore = getProblemBankFirestore();
  const batch = firestore.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const raw of slice) {
    const problem = serializableProblem(raw, seriesId);
    const ref = firestore.collection("problems").doc(documentId(seriesId, problem.questionId));
    batch.set(ref, { ...problem, importedAt: now, updatedAt: now }, { merge: true });
  }
  if (slice.length) await batch.commit();
  return { imported: slice.length, offset: start, nextOffset: start + slice.length, total: all.length, done: start + slice.length >= all.length };
}

async function verifySeries(seriesId) {
  if (!ALLOWED_SERIES.has(seriesId)) throw new Error("series-invalid");
  const firestore = getProblemBankFirestore();
  const snapshot = await firestore.collection("problems").where("curriculumSeries", "==", seriesId).limit(5000).get();
  const byQuestionId = new Map();
  const types = {};
  const groups = {};
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const questionId = clean(data.questionId || doc.id, 200);
    byQuestionId.set(questionId, data);
  }
  for (const data of byQuestionId.values()) {
    const type = clean(data.questionType || data.variantType || data.typeName, 120) || "unknown";
    types[type] = (types[type] || 0) + 1;
    const group = clean(data.curriculumGroupLabel || data.curriculumGroup, 180) || "other";
    groups[group] = (groups[group] || 0) + 1;
  }
  return { count: byQuestionId.size, types, groups };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!authorized(req)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    const action = clean(req.query?.action, 80);
    if (action === "service-email") {
      res.status(200).json({ email: serviceAccount().client_email });
      return;
    }
    if (action === "import") {
      const result = await importSlice({
        fileId: clean(req.query?.fileId, 200),
        seriesId: clean(req.query?.seriesId, 180),
        offset: Number(req.query?.offset),
        limit: Number(req.query?.limit),
      });
      res.status(200).json(result);
      return;
    }
    if (action === "verify") {
      res.status(200).json(await verifySeries(clean(req.query?.seriesId, 180)));
      return;
    }
    res.status(400).json({ error: "action-invalid" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "import-failed";
    console.error("[temporary-curriculum-import]", message);
    res.status(500).json({ error: clean(message, 1000) });
  }
}
