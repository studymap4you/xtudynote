import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { HandwritingCanvas } from "@/components/assignments/HandwritingCanvas";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { getAssignment, getStudentWork, saveStudentWorkSubmission } from "@/lib/worksheet/assignmentApi";
import { downloadWorksheetAttachmentAuthenticated } from "@/lib/worksheet/worksheetAttachmentDownloadClient";
import { compressHandwritingAnswers } from "@/lib/worksheet/compressInkImage";
import type { WorksheetAssignmentDoc, WorksheetItem } from "@/types/worksheetAssignment";
import styles from "@/pages/assignments/assignmentPages.module.css";

function formatDistributed(at: unknown): string {
  if (at && typeof at === "object" && at !== null && "toDate" in at) {
    const d = (at as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
    }
  }
  return "—";
}

function stripAnswerKeys(items: WorksheetItem[]): WorksheetItem[] {
  return items.map(({ id, kind, prompt }) => ({ id, kind, prompt }));
}

function payloadSize(answers: Record<string, string>): number {
  let n = 0;
  for (const v of Object.values(answers)) {
    n += v.length;
  }
  return n;
}

export function StudentWorksheetPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { firebaseUser, isStudent } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const captureRef = useRef<HTMLDivElement>(null);

  const printWorksheet = useReactToPrint({
    contentRef: captureRef,
    documentTitle: () =>
      assignmentId ? `Xtudy-Universe_Worksheet_${assignmentId.slice(0, 8)}` : "Xtudy-Universe_Worksheet",
    pageStyle: REACT_TO_PRINT_A4_PAGE_STYLE,
    onBeforePrint: async () => {
      setPdfBusy(true);
    },
    onAfterPrint: () => {
      setPdfBusy(false);
    },
    onPrintError: (_loc, err) => {
      setMsg(err.message);
      setPdfBusy(false);
    },
  });

  const [assignment, setAssignment] = useState<WorksheetAssignmentDoc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"draft" | "submitted">("draft");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    (async () => {
      setLoadErr(null);
      try {
        const a = await getAssignment(assignmentId);
        if (cancelled) return;
        setAssignment(a);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  useEffect(() => {
    if (!assignmentId || !uid || !assignment) return;
    if (!assignment.targetStudentIds.includes(uid)) return;
    let cancelled = false;
    getStudentWork(assignmentId, uid).then((doc) => {
      if (cancelled) return;
      if (doc?.answers) setAnswers(doc.answers);
      if (doc?.status) setStatus(doc.status);
    });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, uid, assignment]);

  const allowed = useMemo(() => {
    if (!assignment || !uid) return false;
    return assignment.targetStudentIds.includes(uid);
  }, [assignment, uid]);

  const canEdit = allowed && isStudent;

  const itemsStudentView = useMemo(
    () => (assignment ? stripAnswerKeys(assignment.worksheetItems ?? []) : []),
    [assignment],
  );

  const setText = useCallback((id: string, v: string) => {
    setAnswers((prev) => ({ ...prev, [id]: v }));
  }, []);

  const saveDraft = useCallback(async () => {
    if (!assignmentId || !uid || !canEdit) return;
    setBusy(true);
    setMsg(null);
    try {
      const packed = await compressHandwritingAnswers(answers);
      await saveStudentWorkSubmission(assignmentId, uid, packed, "draft");
      setAnswers(packed);
      setMsg("임시 저장되었습니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [assignmentId, uid, canEdit, answers]);

  const submit = useCallback(async () => {
    if (!assignmentId || !uid || !canEdit) return;
    const packed = await compressHandwritingAnswers(answers);
    const sz = payloadSize(packed);
    if (sz > 900_000) {
      setMsg("답안 용량이 너무 큽니다. 손글씨를 지우고 다시 시도해 주세요.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await saveStudentWorkSubmission(assignmentId, uid, packed, "submitted");
      setAnswers(packed);
      setStatus("submitted");
      setMsg("과제가 제출되었습니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [assignmentId, uid, canEdit, answers]);

  const downloadPdf = useCallback(() => {
    printWorksheet();
  }, [printWorksheet]);

  const downloadTeacherAttachment = useCallback(async () => {
    if (!assignmentId) return;
    setAttachBusy(true);
    setMsg(null);
    try {
      await downloadWorksheetAttachmentAuthenticated(assignmentId);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAttachBusy(false);
    }
  }, [assignmentId]);

  if (!assignmentId) {
    return (
      <DashboardShell light>
        <main className={styles.main}>
          <p>잘못된 주소입니다.</p>
        </main>
      </DashboardShell>
    );
  }

  if (loadErr) {
    return (
      <DashboardShell light>
        <main className={styles.main}>
          <p className={styles.err}>{loadErr}</p>
          <Link to="/dashboard">대시보드로</Link>
        </main>
      </DashboardShell>
    );
  }

  if (!assignment) {
    return (
      <DashboardShell light>
        <main className={styles.main}>
          <p>불러오는 중…</p>
        </main>
      </DashboardShell>
    );
  }

  if (!allowed) {
    return (
      <DashboardShell light>
        <main className={styles.main}>
          <h1 className={styles.title}>접근할 수 없습니다</h1>
          <p>이 과제의 대상 학생 목록에 포함되어 있지 않습니다.</p>
          <Link to="/dashboard">대시보드로</Link>
        </main>
      </DashboardShell>
    );
  }

  const submittedLocked = status === "submitted";
  const inputsLocked = submittedLocked || !canEdit;

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <Link to="/dashboard" style={{ fontSize: "0.9rem" }}>
          ← 학습자 대시보드
        </Link>
        <h1 className={styles.title} style={{ marginTop: "0.75rem" }}>
          {assignment.title}
        </h1>
        <p className={styles.meta}>배포 {formatDistributed(assignment.distributedAt)}</p>
        {assignment.localAttachment ? (
          <p style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="btn btn--ghost btn--stack"
              disabled={attachBusy}
              onClick={() => void downloadTeacherAttachment()}
            >
              {attachBusy ? "링크 준비 중…" : `선생님 첨부 파일 받기 (${assignment.localAttachment.originalName})`}
            </button>
          </p>
        ) : null}
        {allowed && !isStudent ? (
          <p className={styles.err} role="note">
            이 과제는 학생 계정에서만 임시 저장·제출할 수 있습니다. (미리보기)
          </p>
        ) : null}

        <div ref={captureRef} className={`${styles.capture} ${styles.captureA4}`}>
          <header className={styles.captureBrand}>
            <span className={styles.captureBrandMain}>
              Xtudy-Universe <span className={styles.captureBrandAccent}>|</span> 학습지
            </span>
            <span className={styles.captureBrandSub}>학생용 · 정답·모범답 미포함</span>
          </header>
          <h2 className={styles.captureTitle}>학습지</h2>
          <p className={styles.captureSub}>학생용 — 정답·모범답은 포함되지 않습니다.</p>
          <div className={`${styles.passage} ${styles.captureSection}`}>
            {assignment.passage?.trim()
              ? assignment.passage
              : assignment.localAttachment
                ? "※ 지문 텍스트가 없습니다. 위의「선생님 첨부 파일 받기」에서 본문 파일을 내려받아 풀어 주세요."
                : "(지문 없음)"}
          </div>

          {itemsStudentView.map((item) => (
            <div key={item.id} className={`${styles.item} ${styles.captureItem}`}>
              <div className={styles.itemLabel}>
                {item.kind === "blank" ? "빈칸" : item.kind === "short" ? "주관식" : "손글씨·도식"}
              </div>
              <p className={styles.prompt}>{item.prompt}</p>
              {item.kind === "handwriting" ? (
                <HandwritingCanvas
                  value={answers[item.id] ?? ""}
                  onChange={(v) => setAnswers((p) => ({ ...p, [item.id]: v }))}
                  disabled={inputsLocked}
                />
              ) : item.kind === "short" ? (
                <textarea
                  className={styles.textarea}
                  value={answers[item.id] ?? ""}
                  onChange={(e) => setText(item.id, e.target.value)}
                  disabled={inputsLocked}
                  maxLength={8000}
                />
              ) : (
                <input
                  className={styles.input}
                  type="text"
                  value={answers[item.id] ?? ""}
                  onChange={(e) => setText(item.id, e.target.value)}
                  disabled={inputsLocked}
                  maxLength={2000}
                />
              )}
            </div>
          ))}
          <p className={styles.captureScreenHint}>
            화면에는 A4 본문 영역 높이마다 옅은 가이드선이 표시됩니다. PDF·인쇄 시에는 사라집니다.
          </p>
          <footer
            className={styles.capturePrintFooter}
            title="Chromium·Edge 등에서는 인쇄 대화상자의「머리글 및 바닥글」에서도 페이지 번호를 켤 수 있습니다."
          >
            [Xtudy-Universe · 지식 큐레이터]
          </footer>
        </div>

        <div className={styles.actions}>
          <button type="button" className={`${styles.actionBtn} ${styles.actionBtnPdf}`} disabled={pdfBusy} onClick={downloadPdf}>
            <span className="ui-ko">{pdfBusy ? "PDF 생성 중…" : "과제 PDF 다운로드"}</span>
            <span className={`ui-en ${styles.actionBtnSub}`}>Print-friendly (no answer key)</span>
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnSave}`}
            disabled={busy || submittedLocked || !canEdit}
            onClick={() => void saveDraft()}
          >
            <span className="ui-ko">임시 저장</span>
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnSubmit}`}
            disabled={busy || submittedLocked || !canEdit}
            onClick={() => void submit()}
          >
            <span className="ui-ko">과제 제출</span>
          </button>
        </div>
        {submittedLocked ? (
          <p className={styles.ok}>제출이 완료되어 답안을 수정할 수 없습니다. PDF는 계속 받을 수 있습니다.</p>
        ) : null}
        {msg ? <p className={msg.includes("실패") || msg.includes("용량") || msg.length > 120 ? styles.err : styles.ok}>{msg}</p> : null}
      </main>
    </DashboardShell>
  );
}
