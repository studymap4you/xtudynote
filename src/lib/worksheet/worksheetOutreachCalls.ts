import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase/functionsClient";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import type { WorksheetItem, WorksheetLocalAttachment } from "@/types/worksheetAssignment";

export type OutreachRecipientInput = {
  displayName: string;
  phone: string;
  email: string;
};

export type DeployWorksheetOutreachInput = {
  title: string;
  passage: string;
  analysis: SignalLogicAnalysisReportJson | Record<string, unknown>;
  distributedAtMs: number;
  worksheetItems: WorksheetItem[];
  selectedStudentUids: string[];
  recipients: OutreachRecipientInput[];
  contentSource?: "ai" | "local";
  localAttachment?: WorksheetLocalAttachment;
};

export type DeployWorksheetOutreachResult = {
  assignmentId: string;
  appTargetCount: number;
  outreachEmailCount: number;
  /** 미가입 대상에게 sendMail 시도했으나 실패한 경우 메시지 목록 */
  outreachEmailErrors?: string[];
  /** 미가입으로 메일 발송 대상으로 잡힌 인원 수 */
  outreachEmailAttempted?: number;
};

/** Functions 쪽은 `onCall`(callable) — `fetch`/`onRequest`로 호출하지 않음. */
export async function deployWorksheetOutreach(input: DeployWorksheetOutreachInput): Promise<DeployWorksheetOutreachResult> {
  const fn = httpsCallable(functions, "deployWorksheetOutreach");
  const res = await fn({
    title: input.title,
    passage: input.passage,
    analysis: input.analysis,
    distributedAtMs: input.distributedAtMs,
    worksheetItems: input.worksheetItems,
    selectedStudentUids: input.selectedStudentUids,
    recipients: input.recipients,
    ...(input.contentSource ? { contentSource: input.contentSource } : {}),
    ...(input.localAttachment ? { localAttachment: input.localAttachment } : {}),
  });
  const data = res.data as DeployWorksheetOutreachResult;
  if (!data?.assignmentId) throw new Error("배포 응답이 올바르지 않습니다.");
  return data;
}

export async function lookupStudentByEmail(email: string): Promise<{ uid: string | null; registered: boolean }> {
  const fn = httpsCallable(functions, "lookupStudentByEmail");
  const res = await fn({ email: email.trim() });
  return res.data as { uid: string | null; registered: boolean };
}

export type ExternalWorksheetPayload = {
  title: string;
  passage: string;
  worksheetItems: { id: string; kind: string; prompt: string }[];
  distributedAtLabel: string;
};

export async function getExternalWorksheetByToken(token: string): Promise<ExternalWorksheetPayload> {
  const fn = httpsCallable(functions, "getExternalWorksheetByToken");
  const res = await fn({ token: token.trim() });
  return res.data as ExternalWorksheetPayload;
}
