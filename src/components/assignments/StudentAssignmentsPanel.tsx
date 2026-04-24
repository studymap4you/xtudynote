import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeStudentAssignments } from "@/lib/worksheet/assignmentApi";
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

export function StudentAssignmentsPanel() {
  const { firebaseUser, isStudent } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const [rows, setRows] = useState<{ id: string; data: WorksheetAssignmentDoc }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !isStudent) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeStudentAssignments(
      uid,
      (list) => {
        setRows(list);
        setErr(null);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid, isStudent]);

  if (!isStudent) return null;

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">학습지 과제함</h2>
          <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
            선생님이 배포한 Signal Logic 학습지 · 날짜순
          </span>
        </div>
        <span className="panel__badge panel__badge--ok">Assignments</span>
      </div>
      {loading ? <p className="ui-ko">불러오는 중…</p> : null}
      {err ? <p style={{ color: "#b91c1c", fontSize: "0.9rem" }}>{err}</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="ui-ko" style={{ color: "var(--text-muted, #64748b)" }}>
          아직 배정된 학습지가 없습니다. 선생님께 본인 계정 UID를 알려 주세요.
        </p>
      ) : (
        <div className={styles.cardList}>
          {rows.map(({ id, data }) => (
            <Link key={id} to={`/assignment/${id}`} className={styles.card}>
              <h3 className={styles.cardTitle}>{data.title}</h3>
              <p className={styles.cardMeta}>배포 {formatDistributed(data.distributedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
