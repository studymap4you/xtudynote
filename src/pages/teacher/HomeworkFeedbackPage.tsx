import { useEffect, useMemo, useState } from "react";
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

/** Firestore가 긴 영문으로 반환하는 인덱스 오류를 짧은 안내로 바꿉니다 */
function parseFirestoreListenError(message: string): { friendly: string; consoleUrl: string | null } {
  const t = message.trim();
  if (!t) return { friendly: t, consoleUrl: null };
  const lower = t.toLowerCase();
  const needsIndex =
    lower.includes("requires an index") ||
    lower.includes("the query requires an index") ||
    lower.includes("failed-precondition");

  if (needsIndex) {
    const urlMatch = t.match(/https:\/\/console\.firebase\.google\.com[^\s"'<>]+/);
    let url = urlMatch?.[0] ?? null;
    if (url) url = url.replace(/[)\].,;:'"]+$/u, "");
    return {
      friendly:
        "이 목록을 불러오려면 Firestore 복합 인덱스가 필요합니다. 아래 버튼으로 Firebase 콘솔에서 인덱스를 만들거나, 저장소의 firestore.indexes.json 배포 후 잠시 기다려 주세요.",
      consoleUrl: url,
    };
  }
  return { friendly: t, consoleUrl: null };
}

function HomeworkFeedbackInner() {
  const { firebaseUser, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const errorUi = useMemo(() => (error ? parseFirestoreListenError(error) : null), [error]);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoading(true);
    const q = query(
      collection(db, "submissions"),
      where("teacherId", "==", firebaseUser.uid),
      orderBy("submittedAt", "desc"),
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
      },
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
      <DashboardShell light>
        <main className="admin-layout admin-layout--light homework-feedback homework-feedback--bright">
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="homework-feedback__loading-text">프로필을 불러오는 중…</p>
          </div>
        </main>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell light>
      <main className="admin-layout admin-layout--light homework-feedback homework-feedback--bright">
        <header className="homework-feedback__hero">
          <div className="homework-feedback__hero-bg" aria-hidden />
          <div className="homework-feedback__hero-main">
            <p className="homework-feedback__eyebrow ui-en">Homework feedback</p>
            <h1 className="homework-feedback__h1">과제 피드백</h1>
            <p className="homework-feedback__subtitle ui-ko">제출된 텍스트·파일 · 점수·피드백 입력</p>
          </div>
        </header>

        <div className="homework-feedback__toolbar">
          <Link to="/dashboard" className="btn btn--ghost btn--stack homework-feedback__back">
            ← 대시보드
          </Link>
        </div>

        {errorUi ? (
          <div className="homework-feedback__alert" role="alert">
            <p className="homework-feedback__alert-text">{errorUi.friendly}</p>
            {errorUi.consoleUrl ? (
              <a
                href={errorUi.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn--primary btn--stack homework-feedback__alert-btn"
              >
                Firebase 콘솔에서 인덱스 생성
              </a>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="homework-feedback__loading-text">제출 목록을 불러오는 중…</p>
          </div>
        ) : rows.length === 0 && !error ? (
          <p className="homework-feedback__empty">제출된 과제가 없습니다.</p>
        ) : !error ? (
          <ul className="homework-feedback__list">
            {rows.map((row) => (
              <li key={row.id}>
                <article className="panel panel--light homework-feedback__card">
                  <SubmissionCard row={row} disabled={busyId === row.id} onSave={save} />
                </article>
              </li>
            ))}
          </ul>
        ) : null}
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
    <div className="homework-feedback__card-inner">
      <h2 className="panel__title homework-feedback__card-title">{contentTitle || row.contentId}</h2>
      <p className="homework-feedback__meta">학생 ID: {row.studentId.slice(0, 10)}…</p>
      <section className="homework-feedback__block">
        <h3 className="homework-feedback__block-title">제출 텍스트</h3>
        <pre className="homework-feedback__pre">{row.submissionText || "—"}</pre>
      </section>
      <section className="homework-feedback__block">
        <h3 className="homework-feedback__block-title">제출 파일</h3>
        <ul className="homework-feedback__files">
          {(row.submissionFiles ?? []).length === 0 ? (
            <li className="homework-feedback__files-empty">없음</li>
          ) : (
            (row.submissionFiles ?? []).map((p) => (
              <li key={p}>
                <FileLink path={p} />
              </li>
            ))
          )}
        </ul>
      </section>
      <div className="homework-feedback__grade">
        <label className="homework-feedback__field">
          <span className="homework-feedback__field-label">점수 (숫자)</span>
          <input
            className="homework-feedback__input"
            value={scoreStr}
            onChange={(e) => setScoreStr(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="homework-feedback__field">
          <span className="homework-feedback__field-label">피드백</span>
          <textarea
            className="homework-feedback__textarea"
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary btn--stack homework-feedback__save"
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
  if (err) return <span className="homework-feedback__file-err">{err}</span>;
  if (!href) return <span className="homework-feedback__file-loading">로딩…</span>;
  return (
    <a className="homework-feedback__file-link" href={href} target="_blank" rel="noreferrer">
      {path.split("/").pop()}
    </a>
  );
}
