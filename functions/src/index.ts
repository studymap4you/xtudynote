import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest, type Request } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import nodemailer from "nodemailer";
import { buildWorksheetOutreachEmailHtml } from "./emailTemplates.js";
import {
  buildWorksheetPdfBytes,
  buildWorksheetPdfFilename,
  type WorksheetPdfInput,
} from "./worksheetPdfGenerator.js";

initializeApp();
const db = getFirestore();
const authAdmin = getAuth();

const appPublicOrigin = defineString("APP_PUBLIC_ORIGIN", { default: "http://localhost:3000" });
const smtpHost = defineString("SMTP_HOST", { default: "" });
const smtpPort = defineString("SMTP_PORT", { default: "587" });
const smtpUser = defineString("SMTP_USER", { default: "" });
const smtpPass = defineString("SMTP_PASS", { default: "" });
const smtpSecure = defineString("SMTP_SECURE", { default: "false" });
const mailFrom = defineString("MAIL_FROM", { default: "" });
/** Gmail 앱 비밀번호 등 — SMTP_* 대신 이 둘만 있어도 smtp.gmail.com 으로 발송 */
const gmailUser = defineString("GMAIL_USER", { default: "" });
const gmailPass = defineString("GMAIL_PASS", { default: "" });

const REGION = "asia-northeast3";

/**
 * Gen2 callable → Cloud Run. 비공개(invoker)이면 OPTIONS 프리플라이트가 막혀
 * 브라우저에 "No Access-Control-Allow-Origin"처럼 보입니다. 공개 호출 허용 후
 * 함수 본문에서 request.auth 로 보호합니다.
 * @see https://cloud.google.com/run/docs/securing/managing-access
 */
const HTTPS_CALLABLE_CORS: (string | RegExp)[] = (() => {
  const fromParam = appPublicOrigin.value().replace(/\/$/, "").trim();
  const list: (string | RegExp)[] = [];
  if (fromParam.startsWith("http://") || fromParam.startsWith("https://")) {
    list.push(fromParam);
  }
  list.push(
    "https://xtudynote.vercel.app",
    "https://xtudynote.web.app",
    "https://xtudynote.firebaseapp.com",
    /^https:\/\/.+\.vercel\.app$/,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  );
  return list;
})();

function assertTeacherOrSuper(profile: DocumentData | undefined): void {
  const role = profile?.role;
  const status = profile?.accountStatus;
  if (status !== "active") {
    throw new HttpsError("permission-denied", "활성 계정만 배포할 수 있습니다.");
  }
  if (role !== "teacher" && role !== "super_admin") {
    throw new HttpsError("permission-denied", "선생님 또는 관리자만 배포할 수 있습니다.");
  }
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

function randomTokenHex(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

type MailerBundle = { transporter: nodemailer.Transporter; fromAddress: string };

function gmailCredentialsFromEnv(): { user: string; pass: string } {
  const u =
    gmailUser.value().trim() ||
    String(process.env.GMAIL_USER ?? process.env["gmail.user"] ?? "").trim();
  const p = String(gmailPass.value() || process.env.GMAIL_PASS || process.env["gmail.pass"] || "");
  return { user: u, pass: p };
}

async function getMailer(): Promise<MailerBundle | null> {
  const { user: gu, pass: gp } = gmailCredentialsFromEnv();
  const host = smtpHost.value().trim();
  const from = mailFrom.value().trim();
  const pass = smtpPass.value();
  const user = smtpUser.value().trim();

  if (gu && gp) {
    const smtpHostFinal = host || "smtp.gmail.com";
    const port = Number(smtpPort.value()) || 587;
    const secure = smtpSecure.value() === "true" || port === 465;
    const fromAddress = (from || gu).trim();
    if (!fromAddress.includes("@")) {
      console.error(
        "[deployWorksheetOutreach] Gmail 발신 주소 없음: MAIL_FROM 또는 GMAIL_USER에 유효한 이메일을 설정하세요.",
      );
      return null;
    }
    return {
      transporter: nodemailer.createTransport({
        host: smtpHostFinal,
        port,
        secure,
        auth: { user: gu, pass: gp },
      }),
      fromAddress,
    };
  }

  if (!host || !from || !pass) {
    console.error(
      "[deployWorksheetOutreach] SMTP 미구성: `deployWorksheetOutreach`에 (1) GMAIL_USER+GMAIL_PASS 또는 (2) SMTP_HOST, MAIL_FROM, SMTP_PASS(필수), SMTP_USER(선택)을 설정하세요. 로컬 에뮬레이터는 `gmail.user` / `gmail.pass` 환경 변수도 읽습니다.",
    );
    return null;
  }
  const port = Number(smtpPort.value()) || 587;
  const secure = smtpSecure.value() === "true" || port === 465;
  const login = user || from;
  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: login, pass },
    }),
    fromAddress: from,
  };
}

type WorksheetItemIn = { id: string; kind: string; prompt: string; answerKey?: string };

function stripAnswerKeys(items: WorksheetItemIn[]): { id: string; kind: string; prompt: string }[] {
  return items.map(({ id, kind, prompt }) => ({ id, kind, prompt }));
}

function parseWorksheetPdfBody(raw: Record<string, unknown>): WorksheetPdfInput {
  const unit = String(raw.unit ?? raw.learningUnit ?? "").trim();
  const objectives = String(raw.objectives ?? raw.learningGoals ?? "").trim();
  const studyDate = String(raw.studyDate ?? raw.learningDate ?? "").trim();
  const content = String(raw.content ?? raw.learningContent ?? "").trim();
  const exercises = String(raw.exercises ?? raw.reviewQuestions ?? "").trim();
  const summary = String(raw.summary ?? raw.keySummary ?? "").trim();
  const teacherName = String(raw.teacherName ?? "").trim();
  return { unit, objectives, studyDate, content, exercises, summary, teacherName };
}

function readRequestJson(req: Request): Record<string, unknown> {
  const b = (req as { body?: unknown }).body;
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) {
    return b as Record<string, unknown>;
  }
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString("utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof b === "string" && b.trim().length > 0) {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** 랜딩 학습지 PDF — 공개 POST, 바이너리 PDF 반환 */
export const generateWorksheetPdf = onRequest(
  {
    region: REGION,
    cors: true,
    invoker: "public",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).set("Allow", "POST").send("Method Not Allowed");
      return;
    }
    try {
      const raw = readRequestJson(req);
      const payload = parseWorksheetPdfBody(raw);
      if (!payload.unit || !payload.teacherName) {
        res.status(400).send("학습단원과 선생님 성함은 필수입니다.");
        return;
      }
      const bytes = await buildWorksheetPdfBytes(payload);
      const name = buildWorksheetPdfFilename(payload);
      const asciiName = name.replace(/[^\x20-\x7E.]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      );
      res.status(200).send(Buffer.from(bytes));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[generateWorksheetPdf]", e);
      res.status(500).send(`PDF 생성 오류: ${msg.slice(0, 400)}`);
    }
  },
);

export const lookupStudentByEmail = onCall(
  { region: REGION, cors: HTTPS_CALLABLE_CORS, invoker: "public" },
  async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const prof = (await db.doc(`users/${request.auth.uid}`).get()).data();
  assertTeacherOrSuper(prof);

  const email = normalizeEmail(String(request.data?.email ?? ""));
  if (!email || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "올바른 이메일을 입력해 주세요.");
  }
  try {
    const u = await authAdmin.getUserByEmail(email);
    return { uid: u.uid, registered: true };
  } catch {
    return { uid: null as string | null, registered: false };
  }
});

export const getExternalWorksheetByToken = onCall(
  { region: REGION, cors: HTTPS_CALLABLE_CORS, invoker: "public" },
  async (request) => {
    const token = String(request.data?.token ?? "").trim();
    if (token.length < 16) throw new HttpsError("invalid-argument", "유효하지 않은 링크입니다.");

    const tokRef = db.doc(`external_worksheet_tokens/${token}`);
    const tokSnap = await tokRef.get();
    if (!tokSnap.exists) throw new HttpsError("not-found", "만료되었거나 잘못된 링크입니다.");

    const td = tokSnap.data()!;
    const exp = td.expiresAt as Timestamp | undefined;
    if (exp && exp.toMillis() < Date.now()) {
      throw new HttpsError("failed-precondition", "링크가 만료되었습니다.");
    }

    const aid = String(td.assignmentId ?? "");
    if (!aid) throw new HttpsError("internal", "데이터 오류");

    const asSnap = await db.doc(`assignments/${aid}`).get();
    if (!asSnap.exists) throw new HttpsError("not-found", "과제를 찾을 수 없습니다.");

    const a = asSnap.data()!;
    const items = (a.worksheetItems ?? []) as WorksheetItemIn[];
    const dist = a.distributedAt as Timestamp | undefined;
    const distributedAtLabel = dist
      ? dist.toDate().toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })
      : "—";

    return {
      title: String(a.title ?? "학습지"),
      passage: String(a.passage ?? ""),
      worksheetItems: stripAnswerKeys(items),
      distributedAtLabel,
    };
  },
);

/**
 * HTTPS Callable (Gen2 `onCall`) — HTTP `onRequest`가 아님. 클라이언트는 반드시 `httpsCallable`로 호출.
 * 보안: Cloud Run 공개 호출(invoker) + 본문에서 `request.auth` 검증.
 */
export const deployWorksheetOutreach = onCall(
  { region: REGION, cors: HTTPS_CALLABLE_CORS, invoker: "public" },
  async (request) => {
  try {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const teacherId = request.auth.uid;
  const prof = (await db.doc(`users/${teacherId}`).get()).data();
  assertTeacherOrSuper(prof);

  const title = String(request.data?.title ?? "").trim().slice(0, 200);
  const passage = String(request.data?.passage ?? "").trim();
  const analysis = request.data?.analysis;
  const distributedAtMs = Number(request.data?.distributedAtMs);
  const worksheetItems = request.data?.worksheetItems as WorksheetItemIn[] | undefined;
  const selectedStudentUids = (request.data?.selectedStudentUids as string[] | undefined) ?? [];
  const recipientsRaw = (request.data?.recipients as { displayName?: string; phone?: string; email?: string }[] | undefined) ?? [];

  if (!title) throw new HttpsError("invalid-argument", "제목이 필요합니다.");
  if (!passage || passage.length > 120_000) throw new HttpsError("invalid-argument", "지문이 비어 있거나 너무 깁니다.");
  if (!analysis || typeof analysis !== "object") throw new HttpsError("invalid-argument", "분석 데이터가 필요합니다.");
  if (!Number.isFinite(distributedAtMs)) throw new HttpsError("invalid-argument", "배포 일시가 올바르지 않습니다.");
  if (!worksheetItems?.length || worksheetItems.length > 60) {
    throw new HttpsError("invalid-argument", "문항이 비어 있거나 너무 많습니다.");
  }
  if (recipientsRaw.length > 200) throw new HttpsError("invalid-argument", "수신자는 200명까지입니다.");

  const cleanedUids = [...new Set(selectedStudentUids.map((u) => String(u).trim()).filter((u) => u.length >= 8))];
  if (cleanedUids.length > 120) throw new HttpsError("invalid-argument", "앱 대상 학생은 120명까지입니다.");

  const rows = recipientsRaw
    .map((r) => ({
      displayName: String(r.displayName ?? "").trim().slice(0, 120),
      phone: String(r.phone ?? "").trim().slice(0, 40),
      email: normalizeEmail(String(r.email ?? "")),
    }))
    .filter((r) => r.displayName || r.email || r.phone);

  for (const r of rows) {
    if (r.email && !r.email.includes("@")) {
      throw new HttpsError("invalid-argument", `이메일 형식 오류: ${r.email}`);
    }
  }

  const targetSet = new Set<string>(cleanedUids);
  type EmailRow = { row: (typeof rows)[0]; uid: string | null };
  const emailRows: EmailRow[] = [];
  const seenEmail = new Set<string>();

  for (const r of rows) {
    if (!r.email) continue;
    if (seenEmail.has(r.email)) continue;
    seenEmail.add(r.email);
    let uid: string | null = null;
    try {
      const u = await authAdmin.getUserByEmail(r.email);
      uid = u.uid;
    } catch {
      uid = null;
    }
    if (uid) targetSet.add(uid);
    emailRows.push({ row: r, uid });
  }

  const hasExternalEmail = emailRows.some((t) => t.row.email && !t.uid);
  if (targetSet.size === 0 && !hasExternalEmail) {
    throw new HttpsError(
      "invalid-argument",
      "앱에 표시할 학생 UID 또는 미가입 이메일 수신자를 한 명 이상 지정해 주세요.",
    );
  }

  const mailer = await getMailer();
  const transporter = mailer?.transporter ?? null;
  const smtpFromAddress = mailer?.fromAddress ?? mailFrom.value().trim();
  if (hasExternalEmail && !transporter) {
    throw new HttpsError(
      "failed-precondition",
      "미가입 학생에게 메일을내려면 Cloud Functions에 발신용 메일 설정이 필요합니다. Gmail: GMAIL_USER·GMAIL_PASS, 그 외(네이버·Outlook·사내 메일 등): SMTP_HOST·MAIL_FROM·SMTP_PASS. 로그: firebase functions:log --only deployWorksheetOutreach",
    );
  }

  if (transporter && hasExternalEmail) {
    try {
      await transporter.verify();
      console.error("[deployWorksheetOutreach] SMTP verify: OK");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[deployWorksheetOutreach] SMTP verify 실패:", msg);
      throw new HttpsError(
        "failed-precondition",
        `SMTP 서버 연결에 실패했습니다: ${msg}. Gmail은 GMAIL_USER·GMAIL_PASS(앱 비밀번호) 또는 일반 SMTP는 SMTP_HOST·SMTP_USER·SMTP_PASS·MAIL_FROM을 확인하세요.`,
      );
    }
  }

  const teacherName =
    (typeof prof?.displayName === "string" && prof.displayName.trim()) ||
    (typeof prof?.email === "string" && prof.email) ||
    "선생님";

  const distributedAt = Timestamp.fromMillis(distributedAtMs);

  const csRaw = request.data?.contentSource;
  const contentSource = csRaw === "ai" || csRaw === "local" ? csRaw : null;
  const laRaw = request.data?.localAttachment as { storagePath?: unknown; originalName?: unknown } | undefined;
  let localAttachment: { storagePath: string; originalName: string } | undefined;
  if (laRaw && typeof laRaw.storagePath === "string" && typeof laRaw.originalName === "string") {
    const sp = laRaw.storagePath.trim().slice(0, 500);
    const on = laRaw.originalName.trim().slice(0, 240);
    if (sp && on) localAttachment = { storagePath: sp, originalName: on };
  }

  let analysisForFirestore: Record<string, unknown>;
  try {
    analysisForFirestore = JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;
  } catch {
    throw new HttpsError("invalid-argument", "분석 데이터에 저장할 수 없는 값이 포함되어 있습니다. AI 학습지 첨부를 다시 시도해 주세요.");
  }

  const assignRef = await db.collection("assignments").add({
    schemaVersion: 1,
    teacherId,
    title,
    passage,
    analysis: analysisForFirestore,
    distributedAt,
    targetStudentIds: [...targetSet],
    worksheetItems: worksheetItems.map((w) => ({
      id: w.id,
      kind: w.kind,
      prompt: w.prompt,
      ...(w.answerKey != null && w.answerKey !== "" ? { answerKey: w.answerKey } : {}),
    })),
    createdAt: FieldValue.serverTimestamp(),
    outreachEmailSent: 0,
    ...(contentSource ? { contentSource } : {}),
    ...(localAttachment ? { localAttachment } : {}),
  });
  const assignmentId = assignRef.id;
  const recipientsCol = db.collection("assignments").doc(assignmentId).collection("distribution_recipients");

  const origin = appPublicOrigin.value().replace(/\/$/, "");
  let outreachSent = 0;
  const outreachEmailErrors: string[] = [];

  for (const { row, uid } of emailRows) {
    if (!row.email) continue;
    const recRef = recipientsCol.doc();
    if (uid) {
      await recRef.set({
        displayName: row.displayName || "—",
        phone: row.phone || "",
        emailLower: row.email,
        matchedStudentUid: uid,
        delivery: "app",
        emailSentAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      const token = randomTokenHex(24);
      const tokenRef = db.doc(`external_worksheet_tokens/${token}`);
      const batch = db.batch();
      batch.set(recRef, {
        displayName: row.displayName || "—",
        phone: row.phone || "",
        emailLower: row.email,
        matchedStudentUid: null,
        delivery: "email",
        emailSentAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(tokenRef, {
        assignmentId,
        teacherId,
        recipientEmail: row.email,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      await batch.commit();

      const viewUrl = `${origin}/worksheet/outreach?t=${encodeURIComponent(token)}`;
      const html = buildWorksheetOutreachEmailHtml({
        assignmentTitle: title,
        teacherDisplayName: teacherName,
        viewUrl,
      });
      if (transporter) {
        try {
          await transporter.sendMail({
            from: smtpFromAddress,
            to: row.email,
            subject: `[Xtudy-Universe] ${title} — 학습지 안내`,
            html,
          });
          outreachSent++;
          await recRef.update({ emailSentAt: FieldValue.serverTimestamp() });
        } catch (mailErr) {
          const em = mailErr instanceof Error ? mailErr.message : String(mailErr);
          console.error(`[deployWorksheetOutreach] sendMail 실패 to=${row.email}:`, em);
          outreachEmailErrors.push(`${row.email}: ${em}`);
        }
      }
    }
  }

  for (const r of rows) {
    if (r.email) continue;
    await recipientsCol.doc().set({
      displayName: r.displayName || "—",
      phone: r.phone || "",
      emailLower: "",
      matchedStudentUid: null,
      delivery: "app",
      note: "이메일 미기재 — 메일 미발송",
      emailSentAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await assignRef.update({ outreachEmailSent: outreachSent });

  if (hasExternalEmail && outreachSent === 0 && outreachEmailErrors.length > 0) {
    console.error("[deployWorksheetOutreach] 미가입 대상 메일 전부 실패:", outreachEmailErrors);
  }

  return {
    assignmentId,
    appTargetCount: targetSet.size,
    outreachEmailCount: outreachSent,
    outreachEmailErrors,
    outreachEmailAttempted: emailRows.filter((t) => t.row.email && !t.uid).length,
  };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[deployWorksheetOutreach] 예기치 않은 오류:", e);
    throw new HttpsError(
      "failed-precondition",
      `배포 처리 중 서버 오류: ${msg.slice(0, 400)} (원인 확인: firebase functions:log --only deployWorksheetOutreach)`,
    );
  }
});
