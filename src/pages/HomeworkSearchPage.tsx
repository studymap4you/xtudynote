import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { useAuth } from "@/contexts/AuthContext";
import { fetchHomeworkListForUser, type HomeworkListRow } from "@/lib/homeworkClassroomList";
import "@/pages/pages.css";

function formatCreated(at: unknown): string {
  if (at && typeof at === "object" && at !== null && "toDate" in at) {
    const d = (at as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
    }
  }
  return "—";
}

export function HomeworkSearchPage() {
  const { firebaseUser, profile, loading: authLoading, isTeacherApproved, isSuperAdmin, isStudent } =
    useAuth();
  const [rows, setRows] = useState<HomeworkListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const includeAuthorHomework = isTeacherApproved || isSuperAdmin;

  const load = useCallback(async () => {
    if (!firebaseUser?.uid) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchHomeworkListForUser(firebaseUser.uid, { includeAuthorHomework });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser?.uid, includeAuthorHomework]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const roleHint = isStudent
    ? "수강 중인 강의실에 배포된 과제가 여기 모입니다."
    : isTeacherApproved || isSuperAdmin
      ? "개설·소속 강의실 과제와 내가 출제한 과제가 함께 표시됩니다."
      : "강의실에 초대되면 해당 강의실의 과제가 표시됩니다.";

  return (
    <PublicShell>
      <main className="admin-layout homework-hub admin-layout--light">
        <div className="homework-hub__head">
          <div className="homework-hub__titles">
            <h1 className="homework-hub__title">
              <span className="homework-hub__title-en">Homework</span>
              <span className="homework-hub__title-ko">과제함</span>
            </h1>
            <p className="homework-hub__lede">{roleHint}</p>
          </div>
          {!authLoading && firebaseUser ? (
            <button type="button" className="btn btn--ghost btn--stack homework-hub__refresh" onClick={() => void load()}>
              <span className="ui-en">Refresh</span>
              <span className="ui-ko">새로고침</span>
            </button>
          ) : null}
        </div>

        {!authLoading && !firebaseUser ? (
          <div className="homework-hub__panel homework-hub__panel--notice">
            <p className="homework-hub__notice-title">로그인이 필요합니다</p>
            <p className="homework-hub__notice-body">
              강의실에 등록된 과제 목록을 보려면 로그인해 주세요.
            </p>
            <Link to="/login" className="btn btn--primary btn--stack homework-hub__cta">
              <span className="ui-en">Log in</span>
              <span className="ui-ko">로그인</span>
            </Link>
          </div>
        ) : null}

        {firebaseUser && error ? (
          <p className="homework-hub__error" role="alert">
            {error}
          </p>
        ) : null}

        {firebaseUser && loading ? <p className="homework-hub__loading">불러오는 중…</p> : null}

        {firebaseUser && !loading && !error && rows.length === 0 ? (
          <div className="homework-hub__panel homework-hub__panel--notice">
            <p className="homework-hub__notice-title">표시할 과제가 없습니다</p>
            <p className="homework-hub__notice-body">
              {profile?.role === "student"
                ? "강의실에 학생으로 등록되어 있고, 선생님이 과제를 배포하면 이곳에 나타납니다."
                : "강의실에서 과제를 출제하거나, 학생을 강의실에 초대한 뒤 과제를 배포해 보세요."}
            </p>
            <div className="homework-hub__notice-actions">
              <Link to="/classroom" className="btn btn--primary btn--stack">
                <span className="ui-en">Classrooms</span>
                <span className="ui-ko">강의실</span>
              </Link>
            </div>
          </div>
        ) : null}

        {firebaseUser && !loading && rows.length > 0 ? (
          <ul className="homework-hub__list" aria-label="과제 목록">
            {rows.map((row) => (
              <li key={row.contentId}>
                <Link
                  to={`/homework/${encodeURIComponent(row.homeworkCode)}`}
                  className="homework-hub__card"
                >
                  <div className="homework-hub__card-main">
                    <h2 className="homework-hub__card-title">{row.learningTopic || row.subject}</h2>
                    <p className="homework-hub__card-subject">{row.subject}</p>
                  </div>
                  <div className="homework-hub__card-meta">
                    <span className="homework-hub__pill" aria-label="과제 안내 번호">
                      {row.shortCode ? `#${row.shortCode}` : row.homeworkCode}
                    </span>
                    <span className="homework-hub__date">{formatCreated(row.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </PublicShell>
  );
}
