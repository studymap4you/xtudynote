/**
 * Vercel Serverless: 같은 Storage 버킷 안에서 pending_materials → contents 로 서버 복사.
 * 브라우저 getBytes/fetch 실패(storage/retry-limit-exceeded, Failed to fetch) 시 사용.
 *
 * Vercel 환경 변수:
 *   FIREBASE_SERVICE_ACCOUNT_JSON = 서비스 계정 JSON 전체(문자열)
 *   FIREBASE_STORAGE_BUCKET       = 선택, 기본 xtudynote.firebasestorage.app
 */
import admin from "firebase-admin";

function ensureAdmin() {
  if (admin.apps.length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set on the server");
  }
  const cred = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(cred),
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    ensureAdmin();

    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearer) {
      res.status(401).json({ error: "Missing Authorization Bearer token" });
      return;
    }

    const decoded = await admin.auth().verifyIdToken(bearer);
    const userSnap = await admin.firestore().doc(`users/${decoded.uid}`).get();
    const data = userSnap.data();
    if (!data || data.role !== "super_admin" || data.accountStatus !== "active") {
      res.status(403).json({ error: "Super admin only" });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const copies = body.copies;
    if (!Array.isArray(copies) || copies.length === 0) {
      res.status(400).json({ error: "Invalid copies array" });
      return;
    }

    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || "xtudynote.firebasestorage.app";
    const bucket = admin.storage().bucket(bucketName);
    const destPaths = [];

    for (const item of copies) {
      const sourcePath = String(item?.sourcePath ?? "")
        .trim()
        .replace(/^\/+/, "");
      const destPath = String(item?.destPath ?? "")
        .trim()
        .replace(/^\/+/, "");
      if (!sourcePath || !destPath) {
        res.status(400).json({ error: "Each copy needs sourcePath and destPath" });
        return;
      }
      if (!sourcePath.startsWith("pending_materials/")) {
        res.status(400).json({ error: "Invalid sourcePath" });
        return;
      }
      if (!destPath.startsWith("contents/")) {
        res.status(400).json({ error: "Invalid destPath" });
        return;
      }

      const srcFile = bucket.file(sourcePath);
      const destFile = bucket.file(destPath);
      await srcFile.copy(destFile);
      destPaths.push(destPath);
    }

    res.status(200).json({ ok: true, destPaths });
  } catch (e) {
    console.error("[copy-storage-objects]", e);
    const message = e instanceof Error ? e.message : "Copy failed";
    res.status(500).json({ error: message });
  }
}
