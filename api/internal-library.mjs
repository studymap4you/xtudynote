import admin from "firebase-admin";
import { isSuperAdminEmail } from "./_lib/billing/config.mjs";

function ensureFirebaseAdmin() {
  if (admin.apps.length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("server-auth-not-configured");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

async function requireAuthenticatedUser(req) {
  ensureFirebaseAdmin();
  const authHeader = String(req.headers?.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!bearer) throw new Error("authentication-required");
  return admin.auth().verifyIdToken(bearer);
}

function sanitizeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function sanitizeStringArray(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, 1_000))
    .filter(Boolean)
    .slice(0, maxItems);
}

function toMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function normalizeLibraryItem(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    subject: sanitizeText(data.subject, 300),
    identifier: sanitizeText(data.identifier, 300),
    learningTopic: sanitizeText(data.learningTopic, 1_000),
    section: sanitizeText(data.section, 300),
    sourceDatabase: sanitizeText(data.sourceDatabase, 200),
    libraryCategory: ["problem_bank", "source_material"].includes(data.libraryCategory)
      ? data.libraryCategory
      : "problem_bank",
    type: ["share", "paid", "homework"].includes(data.type) ? data.type : "share",
    homeworkCode: data.homeworkCode == null ? null : sanitizeText(data.homeworkCode, 120),
    shortCode: data.shortCode == null ? null : sanitizeText(data.shortCode, 120),
    createdAtMs: toMillis(data.createdAt),
    learningMaterialFilePaths: sanitizeStringArray(data.learningMaterialFilePaths),
    referenceMaterialFilePaths: sanitizeStringArray(data.referenceMaterialFilePaths),
    themes: sanitizeStringArray(data.themes, 30),
  };
}

async function requireActiveSuperAdmin(authUser) {
  const uid = authUser.uid;
  const snapshot = await admin.firestore().doc(`users/${uid}`).get();
  const profile = snapshot.data() || {};
  const email = String(authUser.email || profile.email || "").trim().toLowerCase();
  if (!snapshot.exists || !isSuperAdminEmail(email) || profile.role !== "super_admin" || profile.accountStatus !== "active") {
    throw new Error("admin-access-required");
  }
}

async function listInternalLibrary() {
  const snapshot = await admin
    .firestore()
    .collection("contents")
    .where("status", "==", "internal")
    .limit(1000)
    .get();
  return snapshot.docs
    .map(normalizeLibraryItem)
    .sort((a, b) => b.createdAtMs - a.createdAtMs || a.subject.localeCompare(b.subject, "ko"));
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authUser = await requireAuthenticatedUser(req);
    await requireActiveSuperAdmin(authUser);
    res.status(200).json({ items: await listInternalLibrary() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "비공개 자료를 불러오지 못했습니다.";
    console.error("[internal-library]", message);
    if (message === "authentication-required" || message.includes("auth/id-token")) {
      res.status(401).json({ error: "로그인 정보가 만료되었습니다. 다시 로그인해주세요." });
      return;
    }
    if (message === "admin-access-required") {
      res.status(403).json({ error: "지정된 관리자 계정만 비공개 자료를 볼 수 있습니다." });
      return;
    }
    if (message === "server-auth-not-configured") {
      res.status(503).json({ error: "서버 로그인 검증 설정이 필요합니다." });
      return;
    }
    res.status(500).json({ error: "비공개 자료를 불러오지 못했습니다." });
  }
}
