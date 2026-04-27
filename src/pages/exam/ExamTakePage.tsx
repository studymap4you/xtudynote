import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { gradeShortAnswer } from "@/lib/exam/gradeShortAnswer";
import type { AiExamDocument, AiExamQuestion } from "@/types/aiExam";
import styles from "@/pages/exam/examPages.module.css";
import takeStyles from "@/pages/exam/examTake.module.css";

export function ExamTakePage() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<AiExamDocument | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    (async () => {
      setLoadErr(null);
      try {
        const snap = await getDoc(doc(db, "ai_exams", examId));
        if (!snap.exists()) {
          if (!cancelled) setLoadErr("시험을 찾을 수 없습니다.");
          return;
        }
        const data = snap.data() as Omit<AiExamDocument, "createdAt"> & { createdAt?: unknown };
        if (!cancelled) {
          setExam({
            teacherId: String(data.teacherId ?? ""),
            title: String(data.title ?? ""),
            subject: String(data.subject ?? ""),
            passage: String(data.passage ?? ""),
            totalItems: Number(data.totalItems ?? 0),
            objectiveRatioPercent: Number(data.objectiveRatioPercent ?? 0),
            visibility: data.visibility === "link" ? "link" : "link",
            questions: Array.isArray(data.questions) ? (data.questions as AiExamQuestion[]) : [],
            createdAt: data.createdAt,
          });
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "불러오기 실패");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const setAnswer = useCallback((id: string, v: string) => {
    setAnswers((m) => ({ ...m, [id]: v }));
  }, []);

  const results = useMemo(() => {
    if (!exam || !submitted) return null;
    return exam.questions.map((q) => {
      const user = answers[q.id] ?? "";
      let ok = false;
      if (q.type === "mcq") {
        ok = user.trim() === String(q.correctAnswer).trim();
      } else {
        ok = gradeShortAnswer(user, q.correctAnswer);
      }
      return { q, ok, user };
    });
  }, [exam, submitted, answers]);

  const scoreText = useMemo(() => {
    if (!results) return "";
    const ok = results.filter((r) => r.ok).length;
    return `${ok} / ${results.length} 정답`;
  }, [results]);

  if (!examId) {
    return (
      <div className={`${takeStyles.shell} app-shell app-shell--light`}>
        <p className={styles.err}>잘못된 주소입니다.</p>
        <Link to="/">홈으로</Link>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className={`${takeStyles.shell} app-shell app-shell--light`}>
        <p className={styles.err}>{loadErr}</p>
        <Link to="/">홈으로</Link>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className={`${takeStyles.shell} app-shell app-shell--light`}>
        <div className={styles.spinner} style={{ margin: "2rem auto" }} />
        <p className={styles.overlayText}>불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className={`${takeStyles.shell} app-shell app-shell--light`}>
      <header className={takeStyles.topBar}>
        <Link to="/" className={takeStyles.brand}>
          Xtudy-Universe
        </Link>
        <span className={takeStyles.badge}>시험 응시</span>
      </header>

      <main className={styles.wrap}>
        <h1 className={styles.heroTitle}>{exam.title || "시험"}</h1>
        <p className={styles.heroLead}>
          과목: <strong>{exam.subject}</strong> · 문항 {exam.questions.length}개
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
                  placeholder="본문 근거를 바탕으로 답하세요."
                  rows={4}
                />
              )}
            </div>
          ))}

          {!submitted && (
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => setSubmitted(true)}
              >
                채점하기
              </button>
            </div>
          )}

          {submitted && results && (
            <div className={takeStyles.resultBand}>
              <p className={takeStyles.score}>{scoreText}</p>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => {
                  setSubmitted(false);
                  setAnswers({});
                }}
              >
                다시 풀기
              </button>
            </div>
          )}
        </section>

        {submitted && results && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>정답 및 해설</h2>
            <ul className={takeStyles.explainList}>
              {results.map(({ q, ok, user }, i) => (
                <li key={q.id} className={takeStyles.explainItem}>
                  <div className={takeStyles.explainTop}>
                    <span className={ok ? takeStyles.tagOk : takeStyles.tagBad}>
                      {ok ? "정답" : "오답"}
                    </span>
                    <strong>
                      {i + 1}.{" "}
                      {q.type === "mcq"
                        ? `정답: ${Number(q.correctAnswer) + 1}번`
                        : `모범 답안: ${q.correctAnswer}`}
                    </strong>
                  </div>
                  <p className={takeStyles.small}>내 답: {user.trim() || "(미입력)"}</p>
                  <p className={takeStyles.evidence}>
                    <span className={takeStyles.evLabel}>본문 근거</span>
                    {q.evidenceQuote}
                  </p>
                  {q.explanation ? (
                    <p className={takeStyles.explainBody}>{q.explanation}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
