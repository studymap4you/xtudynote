import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeTeacherAssignments } from "@/lib/worksheet/assignmentApi";
import type { WorksheetAssignmentDoc } from "@/types/worksheetAssignment";
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

export function TeacherAssignmentsPage() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const [rows, setRows] = useState<{ id: string; data: WorksheetAssignmentDoc }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeTeacherAssignments(
      uid,
      (list) => {
        setRows(list);
        setErr(null);
      },
      (e) => setErr(e.message),
    );
    return () => unsub();
  }, [uid]);

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
          <Link to="/dashboard">← 대시보드</Link>
          <Link to="/teacher/assignments/new" className="btn btn--primary btn--stack">
            <span className="ui-ko">새 학습지 배포</span>
          </Link>
        </div>
        <h1 className={styles.title}>학습지 과제</h1>
        <p className={styles.meta}>배포한 과제 목록 · 학생 제출 현황은 각 카드에서 확인합니다.</p>
        {err ? <p className={styles.err}>{err}</p> : null}
        <div className={styles.cardList}>
          {rows.length === 0 ? (
            <p>아직 배포한 과제가 없습니다.</p>
          ) : (
            rows.map(({ id, data }) => (
              <Link key={id} to={`/teacher/assignments/${id}`} className={styles.card}>
                <h2 className={styles.cardTitle}>{data.title}</h2>
                <p className={styles.cardMeta}>
                  배포 {formatDistributed(data.distributedAt)} · 대상 {data.targetStudentIds.length}명
                </p>
              </Link>
            ))
          )}
        </div>
      </main>
    </DashboardShell>
  );
}
