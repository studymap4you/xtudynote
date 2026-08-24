import admin from "firebase-admin";
import { FirestoreConceptRepository } from "./_lib/concept-assembly/concept-repository.mjs";
import { runConceptAssemblyPipeline } from "./_lib/concept-assembly/run-concept-assembly-pipeline.mjs";

const CACHE_TTL_MS = 10 * 60 * 1_000;
const conceptCache = new Map();

function ensureFirebaseAdmin() {
  if (admin.apps.length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("server-auth-not-configured");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

async function requireActiveUser(req) {
  ensureFirebaseAdmin();
  const header = String(req.headers?.authorization || "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!bearer) throw new Error("authentication-required");
  const token = await admin.auth().verifyIdToken(bearer);
  const profileSnapshot = await admin.firestore().doc(`users/${token.uid}`).get();
  const profile = profileSnapshot.data() || {};
  if (!profileSnapshot.exists || profile.accountStatus === "banned") throw new Error("account-inactive");
  return { token, profile };
}

function sanitizeText(value, maxLength) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function sanitizeTypes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => sanitizeText(item, 100).toUpperCase()).filter(Boolean))].slice(0, 40);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cacheGet(key) {
  const cached = conceptCache.get(key);
  if (!cached || Date.now() - cached.createdAt > CACHE_TTL_MS) {
    conceptCache.delete(key);
    return null;
  }
  return clone(cached.value);
}

function cacheSet(key, value) {
  if (conceptCache.size >= 100) conceptCache.delete(conceptCache.keys().next().value);
  conceptCache.set(key, { createdAt: Date.now(), value: clone(value) });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { token, profile } = await requireActiveUser(req);
    const questionTypes = sanitizeTypes(req.body?.questionTypes);
    const subject = sanitizeText(req.body?.subject, 120) || "English";
    const targetGrade = sanitizeText(req.body?.targetGrade, 120);
    const cacheKey = JSON.stringify({ uid: token.uid, questionTypes, subject, targetGrade });
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.status(200).json({ result: cached, cached: true });
      return;
    }

    const repository = new FirestoreConceptRepository(admin.firestore());
    const result = await runConceptAssemblyPipeline({
      repository,
      questionTypes,
      subject,
      targetGrade,
      isSuperAdmin: profile.role === "super_admin" && profile.accountStatus === "active",
    });
    cacheSet(cacheKey, result);
    res.status(200).json({ result, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "concept-assembly-failed";
    console.error("[concept-assembly]", message);
    if (message === "authentication-required" || message.includes("auth/id-token")) {
      res.status(401).json({ error: "로그인 정보가 만료되었습니다. 다시 로그인해주세요." });
      return;
    }
    if (message === "account-inactive") {
      res.status(403).json({ error: "활성 계정만 개념 자료를 불러올 수 있습니다." });
      return;
    }
    if (message === "server-auth-not-configured") {
      res.status(503).json({ error: "서버 DB 인증 설정이 필요합니다." });
      return;
    }
    res.status(500).json({ error: "개념 자료를 불러오지 못했습니다. 기존 문제집은 계속 사용할 수 있습니다." });
  }
}

