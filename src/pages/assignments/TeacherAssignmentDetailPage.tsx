import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAssignment,
  listStudentWorksForAssignment,
  subscribeSubmissionEvents,
} from "@/lib/worksheet/assignmentApi";
import type {
  StudentWorkDoc,
  WorksheetAssignmentDoc,
  WorksheetSubmissionEventDoc,
} from "@/types/worksheetAssignment";
import styles from "@/pages/assignments/assignmentPages.module.css";

function formatTs(at: unknown): string {
  if (at && typeof at === "object" && at !== null && "toDate" in at) {
    const d = (at as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
    }
  }
  return "—";
}

function summarizeAnswer(v: string | undefined): ReactNode {
  if (v == null || v === "") return "—";
  if (v.startsWith("data:image")) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
        <img src={v} alt="" style={{ maxWidth: 56, maxHeight: 40, borderRadius: 4, border: "1px solid #e2e8f0" }} />
        손글씨
      </span>
    );
  }
  const t = v.length > 100 ? `${v.slice(0, 100)}…` : v;
  return <span style={{ whiteSpace: "pre-wrap" }}>{t}</span>;
}

export function TeacherAssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";

  const [assignment, setAssignment] = useState<WorksheetAssignmentDoc | null>(null);
  const [works, setWorks] = useState<{ studentId: string; data: StudentWorkDoc }[]>([]);
  const [submissionEvents, setSubmissionEvents] = useState<{ id: string; data: WorksheetSubmissionEventDoc }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const owned = useMemo(() => assignment && uid && assignment.teacherId === uid, [assignment, uid]);

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const a = await getAssignment(assignmentId);
        if (cancelled) return;
        setAssignment(a);
        if (!a) return;
        const list = await listStudentWorksForAssignment(assignmentId);
        if (cancelled) return;
        setWorks(list);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  useEffect(() => {
    if (!assignmentId || !owned) return;
    const unsub = subscribeSubmissionEvents(
      assignmentId,
      (rows) => setSubmissionEvents(rows),
      () => {},
    );
    return () => unsub();
  }, [assignmentId, owned]);

  if (!assignmentId) {
    return (
      <DashboardShell light>
        <main className={styles.main}>
          <p>잘못된 주소입니다.</p>
        </main>
      </DashboardShell>
    );
  }

  if (err) {
    return (
      <DashboardShell light>
        <main className={styles.main}>
          <p className={styles.err}>{err}</p>
          <Link to="/teacher/assignments">목록으로</Link>
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

  if (!owned) {
    return (
      <DashboardShell light>
        <main className={styles.main}>
          <h1 className={styles.title}>권한 없음</h1>
          <p>이 과제의 담당 선생님이 아닙니다.</p>
          <Link to="/teacher/assignments">목록으로</Link>
        </main>
      </DashboardShell>
    );
  }

  const byStudent = new Map(works.map((w) => [w.studentId, w.data]));
  const statusFor = (sid: string) => byStudent.get(sid)?.status ?? "미제출";
  const submittedAtFor = (sid: string) => byStudent.get(sid)?.submittedAt;

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <Link to="/teacher/assignments">← 목록</Link>
        <h1 className={styles.title} style={{ marginTop: "0.75rem" }}>
          {assignment.title}
        </h1>
        <p className={styles.meta}>
          배포 {formatTs(assignment.distributedAt)} · 대상 {assignment.targetStudentIds.length}명
        </p>

        <h2 className={styles.captureTitle} style={{ marginTop: "1.25rem" }}>
          제출 알림
        </h2>
        <p className={styles.meta} style={{ marginTop: "-0.35rem" }}>
          학생이「과제 제출」을 완료할 때마다 아래에 기록됩니다. (실시간)
        </p>
        {submissionEvents.length === 0 ? (
          <p style={{ fontSize: "0.9rem" }}>아직 제출 이벤트가 없습니다.</p>
        ) : (
          <ul className={styles.cardList} style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {submissionEvents.map((ev) => (
              <li
                key={ev.id}
                style={{
                  fontSize: "0.88rem",
                  padding: "0.45rem 0.55rem",
                  borderRadius: 8,
                  border: "1px solid rgba(15, 23, 42, 0.1)",
                  background: "rgba(16, 185, 129, 0.06)",
                }}
              >
                <strong style={{ fontFamily: "monospace", fontWeight: 600 }}>{ev.data.studentId}</strong>
                <span style={{ color: "#64748b", marginLeft: "0.5rem" }}>{formatTs(ev.data.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}

        <h2 className={styles.captureTitle} style={{ marginTop: "1.25rem" }}>
          학생별 현황
        </h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>학생 UID</th>
              <th>상태</th>
              <th>제출 시각</th>
            </tr>
          </thead>
          <tbody>
            {assignment.targetStudentIds.map((sid) => (
              <tr key={sid}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{sid}</td>
                <td>{statusFor(sid)}</td>
                <td>{statusFor(sid) === "submitted" ? formatTs(submittedAtFor(sid)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className={styles.captureTitle} style={{ marginTop: "1.5rem" }}>
          제출 답안 (요약)
        </h2>
        {works.length === 0 ? (
          <p>아직 제출된 답안이 없습니다.</p>
        ) : (
          works.map(({ studentId, data }) => (
            <div key={studentId} className={styles.item}>
              <div className={styles.itemLabel} style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                {studentId} · {data.status}
              </div>
              {(assignment.worksheetItems ?? []).map((item) => (
                <div key={item.id} style={{ marginTop: "0.5rem" }}>
                  <div className={styles.prompt}>
                    <strong>{item.prompt.slice(0, 60)}</strong>
                    {item.prompt.length > 60 ? "…" : ""}
                  </div>
                  <div style={{ fontSize: "0.88rem" }}>{summarizeAnswer(data.answers[item.id])}</div>
                  {item.answerKey ? (
                    <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.15rem" }}>
                      참고 정답: {item.answerKey.length > 120 ? `${item.answerKey.slice(0, 120)}…` : item.answerKey}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))
        )}
      </main>
    </DashboardShell>
  );
}
