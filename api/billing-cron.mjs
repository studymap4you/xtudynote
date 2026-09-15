import crypto, { timingSafeEqual } from "node:crypto";
import admin from "firebase-admin";
import { getBillingFirestore } from "./_lib/billing/admin.mjs";
import { getBillingRuntimeConfig } from "./_lib/billing/config.mjs";
import { runBillingScheduler } from "./_lib/billing/service.mjs";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const IMPORT_TOKEN_SHA256 = "3368b3d4b3556108c7b9e3fc4f89440b8186b16962b20486b5e50bd05f340bdc";
const ALLOWED_SERIES = new Set([
  "ebs_special_lecture_2027_er_v2",
  "ebs_complete_2027_v2",
]);

function authorized(req, secret) {
  if (!secret || secret.length < 24) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(String(req.headers?.authorization || ""));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function clean(value, max = 1000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
}

function importAuthorized(req) {
  const token = clean(req.query?.token, 200);
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const left = Buffer.from(digest, "hex");
  const right = Buffer.from(IMPORT_TOKEN_SHA256, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function serviceAccount() {
  const raw = process.env.PROBLEM_BANK_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("problem-bank-service-account-missing");
  const parsed = JSON.parse(raw);
  if (!parsed?.client_email || !parsed?.private_key) throw new Error("problem-bank-service-account-invalid");
  return parsed;
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleDriveAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new Error(`google-oauth-failed:${response.status}:${clean(data?.error_description || data?.error, 300)}`);
  }
  return data.access_token;
}

async function loadDriveProblems(fileId) {
  const account = serviceAccount();
  const accessToken = await googleDriveAccessToken(account);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`drive-download-failed:${response.status}:${clean(await response.text(), 600)}`);
  }
  const payload = JSON.parse(await response.text());
  if (!Array.isArray(payload)) throw new Error("drive-json-not-array");
  return payload;
}

function importDocId(seriesId, questionId) {
  return `curriculum_${crypto.createHash("sha256").update(`${seriesId}:${questionId}`).digest("hex").slice(0, 40)}`;
}

function validateProblem(raw, seriesId) {
  if (!raw || typeof raw !== "object") throw new Error("problem-invalid");
  const questionId = clean(raw.questionId, 200);
  if (!questionId) throw new Error("question-id-missing");
  if (clean(raw.curriculumSeries, 180) !== seriesId) throw new Error(`series-mismatch:${questionId}`);
  const answer = Number(raw.answer);
  if (!Number.isInteger(answer) || answer < 1 || answer > 5) throw new Error(`answer-invalid:${questionId}`);
  if (!Array.isArray(raw.choices) || raw.choices.length !== 5) throw new Error(`choices-invalid:${questionId}`);
  if (!clean(raw.passage, 50000)) throw new Error(`passage-missing:${questionId}`);
  return { ...raw, questionId, answer, status: "approved" };
}

async function importSlice({ fileId, seriesId, offset, limit }) {
  if (!ALLOWED_SERIES.has(seriesId)) throw new Error("series-invalid");
  if (!fileId) throw new Error("file-id-missing");
  const all = await loadDriveProblems(fileId);
  const start = Math.max(0, Number.isInteger(offset) ? offset : 0);
  const take = Math.min(400, Math.max(1, Number.isInteger(limit) ? limit : 300));
  const slice = all.slice(start, start + take);
  const firestore = getProblemBankFirestore();
  const batch = firestore.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  for (const item of slice) {
    const problem = validateProblem(item, seriesId);
    const ref = firestore.collection("problems").doc(importDocId(seriesId, problem.questionId));
    batch.set(ref, { ...problem, importedAt: timestamp, updatedAt: timestamp }, { merge: true });
  }
  if (slice.length) await batch.commit();
  return {
    imported: slice.length,
    offset: start,
    nextOffset: start + slice.length,
    total: all.length,
    done: start + slice.length >= all.length,
  };
}

async function verifySeries(seriesId) {
  if (!ALLOWED_SERIES.has(seriesId)) throw new Error("series-invalid");
  const firestore = getProblemBankFirestore();
  const snapshot = await firestore.collection("problems").where("curriculumSeries", "==", seriesId).limit(5000).get();
  const byQuestionId = new Map();
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    byQuestionId.set(clean(data.questionId || doc.id, 200), data);
  }
  const types = {};
  const groups = {};
  for (const data of byQuestionId.values()) {
    const type = clean(data.questionType || data.variantType || data.typeName, 120) || "unknown";
    types[type] = (types[type] || 0) + 1;
    const group = clean(data.curriculumGroupLabel || data.curriculumGroup, 180) || "other";
    groups[group] = (groups[group] || 0) + 1;
  }
  return { count: byQuestionId.size, types, groups };
}

async function handleImportBridge(req, res) {
  if (!importAuthorized(req)) {
    res.status(404).json({ error: "not-found" });
    return;
  }
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
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  if (String(req.query?.bridge || "") === "curriculum-import") {
    try {
      await handleImportBridge(req, res);
    } catch (error) {
      const code = clean(error instanceof Error ? error.message : "curriculum-import-failed", 1000);
      console.error("[curriculum-import-bridge]", { code });
      res.status(500).json({ error: code });
    }
    return;
  }

  const config = getBillingRuntimeConfig();
  if (!authorized(req, config.cronSecret)) {
    res.status(401).json({ error: "cron-authentication-required" });
    return;
  }
  try {
    const summary = await runBillingScheduler({
      db: getBillingFirestore(),
      config,
      now: new Date(),
    });
    res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    const code = String(error instanceof Error ? error.message : "billing-cron-failed").slice(0, 140);
    console.error("[billing-cron]", { code });
    res.status(500).json({ error: "billing-cron-failed" });
  }
}
