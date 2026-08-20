import admin from "firebase-admin";

const VALID_STATUSES = new Set(["planning", "generating", "paused", "completed", "failed"]);

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

function toIso(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function normalizeStatus(value, completedUnitCount, totalUnitCount, forDetail = false) {
  const raw = value === "planned" ? "planning" : sanitizeText(value, 24);
  if (totalUnitCount > 0 && completedUnitCount >= totalUnitCount) return "completed";
  if (raw === "completed" || raw === "failed" || raw === "paused") return raw;
  if (forDetail && (raw === "planning" || raw === "generating")) return "paused";
  return VALID_STATUSES.has(raw) ? raw : "planning";
}

function normalizeHistoryItem(snapshot) {
  const data = snapshot.data() || {};
  const plan = data.plan && typeof data.plan === "object" ? data.plan : {};
  const completedUnitIndexes = Array.isArray(data.completedUnitIndexes) ? data.completedUnitIndexes : [];
  const totalUnitCount = Number(plan.unitCount) || (Array.isArray(plan.units) ? plan.units.length : 0);
  return {
    id: snapshot.id,
    title: sanitizeText(plan.title, 120) || "제목 없는 교재",
    subtitle: sanitizeText(plan.subtitle, 180),
    status: normalizeStatus(data.status, completedUnitIndexes.length, totalUnitCount),
    userInstruction: sanitizeText(data.userInstruction, 8_000),
    targetPages: Number(data.targetPages) || Number(plan.targetPages) || 50,
    completedUnitCount: completedUnitIndexes.length,
    totalUnitCount,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function getOwnedJob(uid, id) {
  const cleanId = sanitizeText(id, 100);
  if (!cleanId || cleanId.includes("/")) return null;
  const ref = admin.firestore().doc(`academy_textbook_jobs/${cleanId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.ownerUid !== uid) return null;
  return { ref, snapshot };
}

async function listHistory(uid) {
  const snapshot = await admin
    .firestore()
    .collection("academy_textbook_jobs")
    .where("ownerUid", "==", uid)
    .limit(100)
    .get();
  return snapshot.docs
    .map(normalizeHistoryItem)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 60);
}

async function loadHistoryJob(uid, id) {
  const owned = await getOwnedJob(uid, id);
  if (!owned) return null;
  const data = owned.snapshot.data() || {};
  const unitSnapshot = await owned.ref.collection("units").get();
  const units = unitSnapshot.docs
    .map((snapshot) => snapshot.data())
    .filter((item) => item?.unit)
    .sort((a, b) => Number(a.unitIndex) - Number(b.unitIndex))
    .map((item) => item.unit);
  const totalUnitCount = Number(data.plan?.unitCount) || (Array.isArray(data.plan?.units) ? data.plan.units.length : 0);
  return {
    id: owned.snapshot.id,
    generationVersion: sanitizeText(data.generationVersion, 80) || undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    status: normalizeStatus(data.status, units.length, totalUnitCount, true),
    userInstruction: sanitizeText(data.userInstruction, 8_000),
    learnerLevel: sanitizeText(data.learnerLevel, 40) || "auto",
    targetPages: Number(data.targetPages) || Number(data.plan?.targetPages) || 50,
    templateId: sanitizeText(data.templateId, 80) || "xuniverse-academy-pro",
    sourceText: sanitizeText(data.sourceText, 60_000),
    uploadedFiles: Array.isArray(data.uploadedFiles) ? data.uploadedFiles : [],
    plan: data.plan,
    generatedUnits: units,
    activeUnitIndex: units.length,
    model: sanitizeText(data.model, 120) || undefined,
    source: ["nvidia", "openai", "mock"].includes(data.source) ? data.source : "mock",
    csatReferenceCount: Array.isArray(data.csatReferenceIds) ? data.csatReferenceIds.length : 0,
    englishReferenceCount: Array.isArray(data.englishReferenceIds) ? data.englishReferenceIds.length : 0,
    wordnetReferenceCount: Array.isArray(data.wordnetReferenceLemmas) ? data.wordnetReferenceLemmas.length : 0,
  };
}

async function deleteHistoryJob(uid, id) {
  const owned = await getOwnedJob(uid, id);
  if (!owned) return false;
  const unitSnapshot = await owned.ref.collection("units").get();
  const batch = admin.firestore().batch();
  for (const unit of unitSnapshot.docs) batch.delete(unit.ref);
  batch.delete(owned.ref);
  await batch.commit();
  return true;
}

async function updateHistoryStatus(uid, id, body) {
  const owned = await getOwnedJob(uid, id);
  if (!owned) return false;
  const requestedStatus = sanitizeText(body?.status, 24);
  if (!new Set(["paused", "failed"]).has(requestedStatus)) {
    throw new Error("invalid-history-status");
  }
  await owned.ref.update({
    status: requestedStatus,
    ...(requestedStatus === "failed" ? { error: sanitizeText(body?.error, 1_000) } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const authUser = await requireAuthenticatedUser(req);
    const id = sanitizeText(req.query?.id, 100);

    if (req.method === "GET" && !id) {
      res.status(200).json({ items: await listHistory(authUser.uid) });
      return;
    }
    if (req.method === "GET") {
      const job = await loadHistoryJob(authUser.uid, id);
      if (!job) {
        res.status(404).json({ error: "저장된 교재를 찾을 수 없습니다." });
        return;
      }
      res.status(200).json({ job });
      return;
    }
    if (req.method === "DELETE") {
      const deleted = await deleteHistoryJob(authUser.uid, id);
      if (!deleted) {
        res.status(404).json({ error: "삭제할 교재를 찾을 수 없습니다." });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const updated = await updateHistoryStatus(authUser.uid, id, body);
      if (!updated) {
        res.status(404).json({ error: "수정할 교재를 찾을 수 없습니다." });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "교재 기록을 처리하지 못했습니다.";
    console.error("[textbook-history]", message);
    if (message === "authentication-required" || message.includes("auth/id-token")) {
      res.status(401).json({ error: "로그인 정보가 만료되었습니다. 다시 로그인해주세요." });
      return;
    }
    if (message === "server-auth-not-configured") {
      res.status(503).json({ error: "서버 로그인 검증 설정이 필요합니다." });
      return;
    }
    if (message === "invalid-history-status") {
      res.status(400).json({ error: "변경할 수 없는 교재 상태입니다." });
      return;
    }
    res.status(500).json({ error: "교재 기록을 처리하지 못했습니다. 잠시 후 다시 시도해주세요." });
  }
}
