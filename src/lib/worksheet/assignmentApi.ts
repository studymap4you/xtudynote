import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import type { StudentWorkDoc, WorksheetAssignmentDoc, WorksheetItem } from "@/types/worksheetAssignment";

const ASSIGNMENTS = "assignments";

export function subscribeStudentAssignments(
  studentUid: string,
  onData: (rows: { id: string; data: WorksheetAssignmentDoc }[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, ASSIGNMENTS),
    where("targetStudentIds", "array-contains", studentUid),
    orderBy("distributedAt", "desc"),
    limit(40),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows: { id: string; data: WorksheetAssignmentDoc }[] = [];
      snap.forEach((d) => rows.push({ id: d.id, data: d.data() as WorksheetAssignmentDoc }));
      onData(rows);
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

export function subscribeTeacherAssignments(
  teacherUid: string,
  onData: (rows: { id: string; data: WorksheetAssignmentDoc }[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, ASSIGNMENTS),
    where("teacherId", "==", teacherUid),
    orderBy("distributedAt", "desc"),
    limit(80),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows: { id: string; data: WorksheetAssignmentDoc }[] = [];
      snap.forEach((d) => rows.push({ id: d.id, data: d.data() as WorksheetAssignmentDoc }));
      onData(rows);
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

export async function getAssignment(assignmentId: string): Promise<WorksheetAssignmentDoc | null> {
  const ref = doc(db, ASSIGNMENTS, assignmentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as WorksheetAssignmentDoc;
}

export async function getStudentWork(
  assignmentId: string,
  studentUid: string,
): Promise<StudentWorkDoc | null> {
  const ref = doc(db, ASSIGNMENTS, assignmentId, "student_work", studentUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as StudentWorkDoc;
}

export async function listStudentWorksForAssignment(
  assignmentId: string,
): Promise<{ studentId: string; data: StudentWorkDoc }[]> {
  const snap = await getDocs(collection(db, ASSIGNMENTS, assignmentId, "student_work"));
  const out: { studentId: string; data: StudentWorkDoc }[] = [];
  snap.forEach((d) => out.push({ studentId: d.id, data: d.data() as StudentWorkDoc }));
  return out;
}

export type CreateWorksheetAssignmentInput = {
  teacherId: string;
  title: string;
  passage: string;
  analysis: SignalLogicAnalysisReportJson;
  distributedAt: Date;
  targetStudentIds: string[];
  worksheetItems: WorksheetItem[];
};

export async function createWorksheetAssignment(input: CreateWorksheetAssignmentInput): Promise<string> {
  const ref = await addDoc(collection(db, ASSIGNMENTS), {
    schemaVersion: 1,
    teacherId: input.teacherId,
    title: input.title.trim(),
    passage: input.passage.trim(),
    analysis: JSON.parse(JSON.stringify(input.analysis)) as SignalLogicAnalysisReportJson,
    distributedAt: input.distributedAt,
    targetStudentIds: [...new Set(input.targetStudentIds.filter(Boolean))],
    worksheetItems: input.worksheetItems.map((w) => ({
      id: w.id,
      kind: w.kind,
      prompt: w.prompt,
      ...(w.answerKey != null && w.answerKey !== "" ? { answerKey: w.answerKey } : {}),
    })),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveStudentWorkSubmission(
  assignmentId: string,
  studentUid: string,
  answers: Record<string, string>,
  status: "draft" | "submitted",
): Promise<void> {
  const ref = doc(db, ASSIGNMENTS, assignmentId, "student_work", studentUid);
  const payload: Record<string, unknown> = {
    studentId: studentUid,
    answers,
    status,
    updatedAt: serverTimestamp(),
  };
  if (status === "submitted") {
    payload.submittedAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
}
