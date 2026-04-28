import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { db } from "@/firebase/config";
import { submitClassroomExamAttempt } from "@/lib/exam/submitClassroomExamAttempt";
import type { AiExamDocument, AiExamQuestion } from "@/types/aiExam";
import type { ClassroomExamAssignmentDocument } from "@/types/classroomExamAssignment";
import styles from "@/pages/exam/examPages.module.css";
import takeStyles from "@/pages/exam/examTake.module.css";

export function ClassroomTodayExamPage() {
  const { classroomId, assignmentId } = useParams<{ classroomId: string; assignmentId: string }>();
  const { firebaseUser, isStudent, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const uid = firebaseUser?.uid ?? "";

  const [assignment, setAssignment] = useState<(ClassroomExamAssignmentDocument & { id: string }) | null>(
    null,
  );
  const [exam, setExam] = useState<AiExamDocument | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultPayload, setResultPayload] = useState<Awaited<
    ReturnType<typeof submitClassroomExamAttempt>
  > | null>(null);
  useEffect(() => {
    if (!classroomId || !assignmentId || !uid) return;
    let cancelled = false;
    (async () => {
      setLoadErr(null);
      try {
        const roomSnap = await getDoc(doc(db, "classrooms", classroomId));
        if (!roomSnap.exists()) {
          if (!cancelled) setLoadErr("강의실을 찾을 수 없습니다.");
          return;
        }
        const members = (roomSnap.data().memberStudentIds ?? []) as string[];
        if (!members.includes(uid)) {
          if (!cancelled) setLoadErr("이 강의실에 등록된 학습자만 응시할 수 있습니다.");
          return;
        }

        const asRef = doc(db, "classroom_exam_assignments", assignmentId);
        const asSnap = await getDoc(asRef);
        if (!asSnap.exists()) {
          if (!cancelled) setLoadErr("배포 정보를 찾을 수 없습니다.");
          return;
        }
        const ad = asSnap.data() as ClassroomExamAssignmentDocument;
        if (ad.classroomId !== classroomId) {
          if (!cancelled) setLoadErr("강의실과 배포 정보가 일치하지 않습니다.");
          return;
        }
        if (!cancelled) setAssignment({ id: asSnap.id, ...ad });

        const exRef = doc(db, "ai_exams", ad.examId);
        const exSnap = await getDoc(exRef);
        if (!exSnap.exists()) {
          if (!cancelled) setLoadErr("시험 문서를 찾을 수 없습니다.");
          return;
        }
        const data = exSnap.data() as Omit<AiExamDocument, "createdAt"> & { createdAt?: unknown };
        if (!cancelled) {
          setExam({
            teacherId: String(data.teacherId ?? ""),
            title: String(data.title ?? ""),
            subject: String(data.subject ?? ""),
            passage: String(data.passage ?? ""),
            totalItems: Number(data.totalItems ?? 0),
            objectiveRatioPercent: Number(data.objectiveRatioPercent ?? 0),
            visibility: "link",
            questions: Array.isArray(data.questions) ? (data.questions as AiExamQuestion[]) : [],
            createdAt: data.createdAt,
            classroomId: typeof data.classroomId === "string" ? data.classroomId : undefined,
          });
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "불러오기 실패");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomId, assignmentId, uid]);

  const canTake = useMemo(() => {
    if (!classroomId || !firebaseUser || !isStudent) return false;
    return true;
  }, [classroomId, firebaseUser, isStudent]);

  const setAnswer = useCallback((id: string, v: string) => {
    setAnswers((m) => ({ ...m, [id]: v }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!assignment || !exam || !classroomId || !assignmentId || !uid) return;
    setBusy(true);
    try {
      const payload = await submitClassroomExamAttempt({
        assignmentId,
        classroomId,
        exam,
        examId: assignment.examId,
        studentId: uid,
        teacherId: assignment.teacherId,
        answers,
      });
      setResultPayload(payload);
      setSubmitted(true);
      showToast("ok", "제출 및 채점이 완료되었습니다.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [assignment, exam, classroomId, assignmentId, uid, answers, showToast]);

  if (!classroomId || !assignmentId) {
    return (
      <DashboardShell light>
        <main className={styles.wrap}>
          <p className={styles.err}>잘못된 주소입니다.</p>
        </main>
      </DashboardShell>
    );
  }

  if (authLoading) {
    return (
      <DashboardShell light>
        <main className={styles.wrap}>
          <div className={styles.spinner} style={{ margin: "2rem auto" }} />
          <p className={styles.overlayText}>연결 중…</p>
        </main>
      </DashboardShell>
    );
  }

  if (!firebaseUser) {
    return (
      <DashboardShell light>
        <main className={styles.wrap}>
          <p className={styles.err}>로그인 후 응시할 수 있습니다.</p>
          <Link to="/login">로그인</Link>
        </main>
      </DashboardShell>
    );
  }

  if (loadErr) {
    return (
      <DashboardShell light>
        <main className={styles.wrap}>
          <p className={styles.err}>{loadErr}</p>
          <Link to={`/classroom/${classroomId}`}>강의실로 돌아가기</Link>
        </main>
      </DashboardShell>
    );
  }

  if (!assignment || !exam) {
    return (
      <DashboardShell light>
        <main className={styles.wrap}>
          <div className={styles.spinner} style={{ margin: "2rem auto" }} />
          <p className={styles.overlayText}>불러오는 중…</p>
        </main>
      </DashboardShell>
    );
  }

  if (!canTake) {
    return (
      <DashboardShell light>
        <main className={styles.wrap}>
          <p className={styles.err}>학습자 계정으로 로그인한 경우에만 응시할 수 있습니다.</p>
          <Link to="/login">로그인</Link>
        </main>
      </DashboardShell>
    );
  }

  const aggregate = resultPayload?.aggregateScore;

  return (
    <DashboardShell light>
      <main className={styles.wrap}>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link to={`/classroom/${classroomId}`} style={{ fontSize: "0.9rem" }}>
            ← 강의실로
          </Link>
        </p>
        <h1 className={styles.heroTitle}>{exam.title || "오늘의 학습문제"}</h1>
        <p className={styles.heroLead}>
          과목: <strong>{exam.subject}</strong> · 문항 {exam.questions.length}개 · 단답은 최대{" "}
          <strong>2문장</strong>, AI 의미 채점
        </p>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>본문</h2>
          <div className={takeStyles.passage}>{exam.passage}</div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>문항</h2>
          {exam.questions.map((q, idx) => (
            <div key={q.id} className={takeStyles.qBlock}>
              <p className={takeStyles.qHead}>
                {idx + 1}. {q.prompt}
              </p>
              {q.type === "short" && q.requiredKeywords && q.requiredKeywords.length > 0 ? (
                <p className={styles.hint} style={{ margin: "0.25rem 0 0.5rem" }}>
                  필수 키워드: {q.requiredKeywords.join(", ")}
                </p>
              ) : null}
              {q.type === "mcq" && q.options && (
                <div className={takeStyles.opts}>
                  {q.options.map((opt, i) => (
                    <label key={i} className={takeStyles.opt}>
                      <input
                        type="radio"
                        name={q.id}
                        value={String(i)}
                        checked={(answers[q.id] ?? "") === String(i)}
                        disabled={submitted}
                        onChange={() => setAnswer(q.id, String(i))}
                      />
                      <span>
                        {i + 1}) {opt}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {q.type === "short" && (
                <textarea
                  className={styles.textarea}
                  disabled={submitted}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="최대 2문장으로 답하세요."
                  rows={3}
                />
              )}
            </div>
          ))}

          {!submitted && (
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={busy}
                onClick={() => void handleSubmit()}
              >
                {busy ? "채점 중…" : "제출 · AI 채점"}
              </button>
            </div>
          )}

          {submitted && resultPayload && (
            <div className={takeStyles.resultBand}>
              <p className={takeStyles.score}>
                총점(문항 평균): <strong>{aggregate ?? 0}</strong> / 100
              </p>
            </div>
          )}
        </section>

        {submitted && resultPayload && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>채점 결과</h2>
            <ul className={takeStyles.explainList}>
              {exam.questions.map((q, i) => {
                const row = resultPayload.perQuestion[q.id];
                if (!row) return null;
                const ev = row.evaluation;
                return (
                  <li key={q.id} className={takeStyles.explainItem}>
                    <div className={takeStyles.explainTop}>
                      <span className={ev.isCorrect ? takeStyles.tagOk : takeStyles.tagBad}>
                        {ev.isCorrect ? "통과" : "미통과"} · {ev.score}점
                      </span>
                      <strong>
                        {i + 1}. {q.type === "short" ? "주관식" : "객관식"}
                      </strong>
                    </div>
                    {row.type === "short" ? (
                      <p className={takeStyles.small}>내 답: {row.answerText.trim() || "(미입력)"}</p>
                    ) : (
                      <p className={takeStyles.small}>선택: {Number(row.selectedIndex) + 1}번</p>
                    )}
                    <p className={takeStyles.explainBody}>{ev.comment}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </DashboardShell>
  );
}
