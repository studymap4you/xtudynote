import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import { TEXTBOOK_AUTO_SCHEMA_VERSION, type TextbookUnitContent } from "@/types/textbookAuto";

export type TextbookAutoSessionDoc = {
  schemaVersion: number;
  title: string;
  sourceText: string;
  totalUnits: number;
  currentUnitIndex: number;
};

function sessionRef(uid: string, sessionId: string) {
  return doc(db, "users", uid, "textbook_auto_sessions", sessionId);
}

function unitsCollection(uid: string, sessionId: string) {
  return collection(db, "users", uid, "textbook_auto_sessions", sessionId, "units");
}

export async function createTextbookAutoSession(
  uid: string,
  input: { title: string; sourceText: string; totalUnits: number },
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await setDoc(sessionRef(uid, sessionId), {
    schemaVersion: TEXTBOOK_AUTO_SCHEMA_VERSION,
    title: input.title.trim(),
    sourceText: input.sourceText.trim(),
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

export async function writeUnitDraft(
  uid: string,
  sessionId: string,
  unitIndex: number,
  unit: TextbookUnitContent,
  model: string,
): Promise<void> {
  await setDoc(doc(unitsCollection(uid, sessionId), unitDocumentId(unitIndex)), {
    unitIndex,
    status: "draft",
    unitTitle: unit.unitTitle,
    keyConcepts: unit.keyConcepts,
    contentStudy: unit.contentStudy,
    coreSummary: unit.coreSummary,
    practice: unit.practice,
    unitTest: unit.unitTest,
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
  await setDoc(doc(unitsCollection(uid, sessionId), unitDocumentId(unitIndex)), {
    unitIndex,
    status: "confirmed",
    unitTitle: unit.unitTitle,
    keyConcepts: unit.keyConcepts,
    contentStudy: unit.contentStudy,
    coreSummary: unit.coreSummary,
    practice: unit.practice,
    unitTest: unit.unitTest,
    model,
    createdAt: serverTimestamp(),
    confirmedAt: serverTimestamp(),
  });
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
      unit: {
        unitTitle: String(data.unitTitle ?? ""),
        keyConcepts: Array.isArray(data.keyConcepts) ? data.keyConcepts.map(String) : [],
        contentStudy: Array.isArray(data.contentStudy) ? data.contentStudy.map(String) : [],
        coreSummary: Array.isArray(data.coreSummary) ? data.coreSummary.map(String) : [],
        practice: Array.isArray(data.practice) ? data.practice.map(String) : [],
        unitTest: Array.isArray(data.unitTest) ? data.unitTest.map(String) : [],
      },
    });
  });
  return rows.map(({ unitIndex, unit }) => ({ unitIndex, unit }));
}
