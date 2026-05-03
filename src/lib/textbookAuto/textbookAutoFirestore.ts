import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import {
  TEXTBOOK_AUTO_ANSWER_KEY_SCHEMA_VERSION,
  TEXTBOOK_AUTO_SCHEMA_VERSION,
  type TextbookAnswerKeyItem,
  type TextbookUnitContent,
} from "@/types/textbookAuto";
import { unitContentFromFirestoreDoc } from "@/lib/textbookAuto/normalizeUnitContent";

export type TextbookAutoSessionDoc = {
  schemaVersion: number;
  title: string;
  /** 단원별 지문 (인덱스 = 단원 순번) */
  unitPassages: string[];
  totalUnits: number;
  currentUnitIndex: number;
};

function sessionRef(uid: string, sessionId: string) {
  return doc(db, "users", uid, "textbook_auto_sessions", sessionId);
}

function unitsCollection(uid: string, sessionId: string) {
  return collection(db, "users", uid, "textbook_auto_sessions", sessionId, "units");
}

function answerKeysCollection(uid: string, sessionId: string) {
  return collection(db, "users", uid, "textbook_auto_sessions", sessionId, "answer_keys");
}

export async function createTextbookAutoSession(
  uid: string,
  input: { title: string; unitPassages: string[]; totalUnits: number },
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await setDoc(sessionRef(uid, sessionId), {
    schemaVersion: TEXTBOOK_AUTO_SCHEMA_VERSION,
    title: input.title.trim(),
    unitPassages: input.unitPassages,
    totalUnits: input.totalUnits,
    currentUnitIndex: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return sessionId;
}

export async function setSessionCurrentUnit(uid: string, sessionId: string, currentUnitIndex: number) {
  await updateDoc(sessionRef(uid, sessionId), {
    currentUnitIndex,
    updatedAt: serverTimestamp(),
  });
}

const UNIT_DOC_PREFIX = "u";

export function unitDocumentId(unitIndex: number): string {
  return `${UNIT_DOC_PREFIX}${unitIndex}`;
}

function sanitizeUnitForFirestoreWrite(unit: TextbookUnitContent): TextbookUnitContent {
  const t = unit.unitTitle.trim();
  return { ...unit, unitTitle: t || "(제목 미정)" };
}

export async function writeUnitDraft(
  uid: string,
  sessionId: string,
  unitIndex: number,
  unit: TextbookUnitContent,
  model: string,
): Promise<void> {
  const u = sanitizeUnitForFirestoreWrite(unit);
  await setDoc(doc(unitsCollection(uid, sessionId), unitDocumentId(unitIndex)), {
    unitIndex,
    status: "draft",
    unitTitle: u.unitTitle,
    keyConcepts: u.keyConcepts,
    contentStudy: u.contentStudy,
    coreSummary: u.coreSummary,
    practice: u.practice,
    unitTest: u.unitTest,
    model,
    createdAt: serverTimestamp(),
  });
}

export async function writeUnitConfirmed(
  uid: string,
  sessionId: string,
  unitIndex: number,
  unit: TextbookUnitContent,
  model: string,
): Promise<void> {
  const u = sanitizeUnitForFirestoreWrite(unit);
  await setDoc(doc(unitsCollection(uid, sessionId), unitDocumentId(unitIndex)), {
    unitIndex,
    status: "confirmed",
    unitTitle: u.unitTitle,
    keyConcepts: u.keyConcepts,
    contentStudy: u.contentStudy,
    coreSummary: u.coreSummary,
    practice: u.practice,
    unitTest: u.unitTest,
    model,
    createdAt: serverTimestamp(),
    confirmedAt: serverTimestamp(),
  });
}

/** 새로고침·재진입 시 현재 단원 임시저장본 불러오기 */
export async function loadUnitDraft(
  uid: string,
  sessionId: string,
  unitIndex: number,
): Promise<{ unit: TextbookUnitContent; model: string } | null> {
  const snap = await getDoc(doc(unitsCollection(uid, sessionId), unitDocumentId(unitIndex)));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : "";
  if (status !== "draft") return null;
  const unit = unitContentFromFirestoreDoc(data);
  const model = typeof data.model === "string" ? data.model : "";
  return { unit, model };
}

export async function loadConfirmedUnits(
  uid: string,
  sessionId: string,
): Promise<{ unitIndex: number; unit: TextbookUnitContent }[]> {
  const qy = query(unitsCollection(uid, sessionId), orderBy("unitIndex", "asc"));
  const snap = await getDocs(qy);
  const rows: { unitIndex: number; unit: TextbookUnitContent; status: string }[] = [];
  snap.forEach((d) => {
    const data = d.data();
    const status = typeof data.status === "string" ? data.status : "";
    if (status !== "confirmed") return;
    const unitIndex = typeof data.unitIndex === "number" ? data.unitIndex : -1;
    if (unitIndex < 0) return;
    rows.push({
      unitIndex,
      status,
      unit: unitContentFromFirestoreDoc(data as Record<string, unknown>),
    });
  });
  return rows.map(({ unitIndex, unit }) => ({ unitIndex, unit }));
}

export async function writeAnswerKeyItems(
  uid: string,
  sessionId: string,
  items: TextbookAnswerKeyItem[],
  model: string,
): Promise<void> {
  if (items.length === 0) return;
  const col = answerKeysCollection(uid, sessionId);
  let batch = writeBatch(db);
  let n = 0;
  for (const item of items) {
    batch.set(doc(col, item.id), {
      schemaVersion: TEXTBOOK_AUTO_ANSWER_KEY_SCHEMA_VERSION,
      unitIndex: item.unitIndex,
      bucket: item.bucket,
      orderIndex: item.orderIndex,
      question: item.question,
      answer: item.answer,
      explanationBullets: item.explanationBullets,
      model,
      createdAt: serverTimestamp(),
    });
    n++;
    if (n >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

export async function loadAnswerKeyItems(uid: string, sessionId: string): Promise<TextbookAnswerKeyItem[]> {
  const snap = await getDocs(answerKeysCollection(uid, sessionId));
  const rows: TextbookAnswerKeyItem[] = [];
  snap.forEach((d) => {
    const x = d.data();
    rows.push({
      id: d.id,
      unitIndex: typeof x.unitIndex === "number" ? x.unitIndex : 0,
      bucket: x.bucket === "unitTest" ? "unitTest" : "practice",
      orderIndex: typeof x.orderIndex === "number" ? x.orderIndex : 0,
      question: String(x.question ?? ""),
      answer: String(x.answer ?? ""),
      explanationBullets: Array.isArray(x.explanationBullets) ? x.explanationBullets.map(String) : [],
    });
  });
  rows.sort((a, b) => {
    if (a.unitIndex !== b.unitIndex) return a.unitIndex - b.unitIndex;
    if (a.bucket !== b.bucket) return a.bucket === "practice" ? -1 : 1;
    return a.orderIndex - b.orderIndex;
  });
  return rows;
}

export const TEXTBOOK_AUTO_EXPORT_PACKAGE_SCHEMA_VERSION = 1;
export const TEXTBOOK_AUTO_EXPORT_PACKAGE_DOC_ID = "current";

export type TextbookAutoExportPackageDoc = {
  packageSchemaVersion: number;
  studentStoragePath: string;
  teacherStoragePath: string;
  updatedAt: unknown;
  createdAt?: unknown;
};

function exportPackageRef(uid: string, sessionId: string) {
  return doc(
    db,
    "users",
    uid,
    "textbook_auto_sessions",
    sessionId,
    "export_package",
    TEXTBOOK_AUTO_EXPORT_PACKAGE_DOC_ID,
  );
}

export async function loadTextbookExportPackage(
  uid: string,
  sessionId: string,
): Promise<TextbookAutoExportPackageDoc | null> {
  const snap = await getDoc(exportPackageRef(uid, sessionId));
  if (!snap.exists()) return null;
  const x = snap.data();
  return {
    packageSchemaVersion:
      typeof x.packageSchemaVersion === "number" ? x.packageSchemaVersion : TEXTBOOK_AUTO_EXPORT_PACKAGE_SCHEMA_VERSION,
    studentStoragePath: String(x.studentStoragePath ?? ""),
    teacherStoragePath: String(x.teacherStoragePath ?? ""),
    updatedAt: x.updatedAt,
    createdAt: x.createdAt,
  };
}

export async function upsertTextbookExportPackage(
  uid: string,
  sessionId: string,
  paths: { studentStoragePath: string; teacherStoragePath: string },
): Promise<void> {
  const r = exportPackageRef(uid, sessionId);
  const snap = await getDoc(r);
  if (!snap.exists()) {
    await setDoc(r, {
      packageSchemaVersion: TEXTBOOK_AUTO_EXPORT_PACKAGE_SCHEMA_VERSION,
      studentStoragePath: paths.studentStoragePath,
      teacherStoragePath: paths.teacherStoragePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(r, {
      studentStoragePath: paths.studentStoragePath,
      teacherStoragePath: paths.teacherStoragePath,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function deleteAllAnswerKeysForSession(uid: string, sessionId: string): Promise<void> {
  const snap = await getDocs(answerKeysCollection(uid, sessionId));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** 한 단원에 해당하는 정답·해설 문서만 삭제 (단원별 재생성용) */
export async function deleteAnswerKeysForUnit(uid: string, sessionId: string, unitIndex: number): Promise<void> {
  const snap = await getDocs(answerKeysCollection(uid, sessionId));
  const toDelete = snap.docs.filter((d) => {
    const x = d.data();
    return typeof x.unitIndex === "number" && x.unitIndex === unitIndex;
  });
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function updateAnswerKeyItem(
  uid: string,
  sessionId: string,
  itemId: string,
  patch: { answer: string; explanationBullets: string[] },
): Promise<void> {
  const bullets = patch.explanationBullets.map((s) => s.trim()).filter(Boolean).slice(0, 25);
  await updateDoc(doc(answerKeysCollection(uid, sessionId), itemId), {
    answer: patch.answer.trim(),
    explanationBullets: bullets,
  });
}
