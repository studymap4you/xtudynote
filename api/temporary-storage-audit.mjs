import admin from "firebase-admin";

const TOKEN = "g3storageaudit_20260901_7LmQp9";
function ensureAdmin() {
  if (admin.apps.length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}
function clean(value, max = 500) { return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max); }
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method-not-allowed" });
  if (clean(req.query?.token, 100) !== TOKEN) return res.status(404).json({ error: "not-found" });
  try {
    ensureAdmin();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "xtudynote.firebasestorage.app";
    const bucket = admin.storage().bucket(bucketName);
    const [files] = await bucket.getFiles({ maxResults: 5000 });
    const matches = files
      .filter((file) => /(?:고3|g3|11유형|variant|mock-exam)/iu.test(file.name))
      .map((file) => ({ name: file.name, size: Number(file.metadata?.size || 0), contentType: file.metadata?.contentType || null, updated: file.metadata?.updated || null }))
      .sort((a,b) => a.name.localeCompare(b.name, "ko"));
    return res.status(200).json({ ok: true, bucket: bucketName, totalFiles: files.length, matchCount: matches.length, matches });
  } catch (error) {
    return res.status(500).json({ error: clean(error instanceof Error ? error.message : error, 800) });
  }
}
