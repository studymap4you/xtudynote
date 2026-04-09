import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/firebase/config";
import { DashboardShell } from "@/components/DashboardShell";
import { TeacherRoute } from "@/components/TeacherRoute";
import type { SubmissionDocument } from "@/types/content";
import "@/pages/pages.css";

type Row = SubmissionDocument & { id: string; studentEmail?: string };

function HomeworkFeedbackInner() {
  const { firebaseUser, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoading(true);
    const q = query(
      collection(db, "submissions"),
      where("teacherId", "==", firebaseUser.uid),
      orderBy("submittedAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Row[] = [];
        snap.forEach((d) => {
          const x = d.data() as SubmissionDocument;
          list.push({ id: d.id, ...x });
        });
        setRows(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [firebaseUser]);

  async function save(row: Row, score: number | null, feedback: string) {
    setBusyId(row.id);
    setError(null);
    try {
      await updateDoc(doc(db, "submissions", row.id), {
        score,
        feedback,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusyId(null);
    }
  }

  if (!profile) {
    return (
      <DashboardShell>
        <main className="dashboard">
          <p>프로필을 불러오는 중…</p>
        </main>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <main className="admin-layout homework-feedback">
        <div className="admin-layout__title-row">
          <h1>과제 피드백</h1>
          <span className="ui-ko">제출된 텍스트·파일 · 점수·피드백 입력</span>
        </div>
        <p style={{ marginBottom: "1rem" }}>
          <Link to="/dashboard" className="btn btn--ghost btn--stack">
            ← 대시보드
          </Link>
        </p>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <div className="route-loading">
            <div className="route-loading__spinner" />
          </div>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>제출된 과제가 없습니다.</p>
        ) : (
          <ul className="homework-feedback__list">
            {rows.map((row) => (
              <li key={row.id} className="panel homework-feedback__card">
                <SubmissionCard row={row} disabled={busyId === row.id} onSave={save} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </DashboardShell>
  );
}

export function HomeworkFeedbackPage() {
  return (
    <TeacherRoute>
      <HomeworkFeedbackInner />
    </TeacherRoute>
  );
}

function SubmissionCard({
  row,
  disabled,
  onSave,
}: {
  row: Row;
  disabled: boolean;
  onSave: (row: Row, score: number | null, feedback: string) => void;
}) {
  const [scoreStr, setScoreStr] = useState(row.score != null ? String(row.score) : "");
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [contentTitle, setContentTitle] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getDoc(doc(db, "contents", row.contentId));
      if (!cancelled && s.exists()) {
        const d = s.data();
        setContentTitle(String(d.subject ?? row.contentId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.contentId]);

  return (
    <div>
      <h2 className="panel__title">{contentTitle || row.contentId}</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
        학생 ID: {row.studentId.slice(0, 10)}…
      </p>
      <section className="homework-feedback__block">
        <h3>제출 텍스트</h3>
        <pre className="homework-student__pre">{row.submissionText || "—"}</pre>
      </section>
      <section className="homework-feedback__block">
        <h3>제출 파일</h3>
        <ul>
          {row.submissionFiles.length === 0 ? (
            <li>없음</li>
          ) : (
            row.submissionFiles.map((p) => (
              <li key={p}>
                <FileLink path={p} />
              </li>
            ))
          )}
        </ul>
      </section>
      <div className="homework-feedback__grade">
        <label className="auth-field">
          점수 (숫자)
          <input
            className="add-passage__control"
            value={scoreStr}
            onChange={(e) => setScoreStr(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="auth-field">
          피드백
          <textarea
            className="add-passage__control add-passage__intro"
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary btn--stack"
          disabled={disabled}
          onClick={() => {
            const n = scoreStr.trim() === "" ? null : Number(scoreStr);
            const sc = n != null && !Number.isNaN(n) ? n : null;
            onSave(row, sc, feedback);
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}

function FileLink({ path }: { path: string }) {
  const [href, setHref] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getDownloadURL(ref(storage, path));
        if (!cancelled) setHref(url);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "링크 실패");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (err) return <span className="auth-error">{err}</span>;
  if (!href) return <span>로딩…</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {path.split("/").pop()}
    </a>
  );
}
