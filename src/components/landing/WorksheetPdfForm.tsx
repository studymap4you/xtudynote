import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  generateProfessionalKeySummary,
  generateSubjectiveReviewQuestions,
  type WorksheetAiContext,
} from "@/lib/worksheet/worksheetAiGeneration";
import { downloadWorksheetFormDocx } from "@/lib/worksheet/downloadWorksheetFormDocx";
import { openWorksheetFormPrint } from "@/lib/worksheet/openWorksheetFormPrint";
import "@/pages/pages.css";

type FormState = {
  unit: string;
  objectives: string;
  studyDate: string;
  content: string;
  exercises: string;
  /** 교사용 — PDF 학생용에는 포함하지 않음 */
  exerciseAnswers: string;
  summary: string;
  teacherName: string;
};

const emptyForm = (): FormState => ({
  unit: "",
  objectives: "",
  studyDate: "",
  content: "",
  exercises: "",
  exerciseAnswers: "",
  summary: "",
  teacherName: "",
});

export function WorksheetPdfForm() {
  const { profile } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [wordBusy, setWordBusy] = useState(false);
  const [busyAiQuestions, setBusyAiQuestions] = useState(false);
  const [busyAiSummary, setBusyAiSummary] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiExerciseTools, setAiExerciseTools] = useState(false);
  const [aiSummaryTools, setAiSummaryTools] = useState(false);
  const [aiQuestionCount, setAiQuestionCount] = useState(5);
  const [teacherAnswersOpen, setTeacherAnswersOpen] = useState(false);

  useEffect(() => {
    const dn = profile?.displayName?.trim();
    const em = profile?.email?.trim();
    if (!dn && !em) return;
    setForm((f) => (f.teacherName.trim() ? f : { ...f, teacherName: dn || em || "" }));
  }, [profile?.displayName, profile?.email]);

  const aiContext = useCallback((): WorksheetAiContext => {
    return {
      unit: form.unit.trim(),
      objectives: form.objectives.trim(),
      studyDate: form.studyDate.trim(),
      content: form.content.trim(),
    };
  }, [form.unit, form.objectives, form.studyDate, form.content]);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const openPrint = useCallback(() => {
    setErr(null);
    setMsg(null);
    const unit = form.unit.trim();
    const teacherName = form.teacherName.trim();
    if (!unit || !teacherName) {
      setErr("학습단원과 선생님 성함은 필수입니다.");
      return;
    }
    try {
      openWorksheetFormPrint({
        unit,
        objectives: form.objectives.trim(),
        studyDate: form.studyDate.trim(),
        content: form.content.trim(),
        exercises: form.exercises.trim(),
        summary: form.summary.trim(),
        teacherName,
      });
      setMsg("인쇄 창을 열었습니다. 「PDF로 저장」을 선택하면 파일로 보관할 수 있습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "인쇄 창을 열지 못했습니다.");
    }
  }, [form]);

  const downloadWordDocx = useCallback(async () => {
    setErr(null);
    setMsg(null);
    const unit = form.unit.trim();
    const teacherName = form.teacherName.trim();
    if (!unit || !teacherName) {
      setErr("학습단원과 선생님 성함은 필수입니다.");
      return;
    }
    setWordBusy(true);
    try {
      await downloadWorksheetFormDocx({
        unit,
        objectives: form.objectives.trim(),
        studyDate: form.studyDate.trim(),
        content: form.content.trim(),
        exercises: form.exercises.trim(),
        summary: form.summary.trim(),
        teacherName,
        exerciseAnswers: form.exerciseAnswers.trim() || undefined,
      });
      setMsg("Word(.docx) 파일이 저장되었습니다. Google 문서에서 열어 수정할 수 있습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Word 파일을 만들지 못했습니다.");
    } finally {
      setWordBusy(false);
    }
  }, [form]);

  const runAiQuestions = useCallback(async () => {
    setErr(null);
    setMsg(null);
    setBusyAiQuestions(true);
    try {
      const ctx = aiContext();
      const { questionsText, answersText } = await generateSubjectiveReviewQuestions(ctx, aiQuestionCount);
      setForm((f) => ({
        ...f,
        exercises: questionsText,
        exerciseAnswers: answersText,
      }));
      setTeacherAnswersOpen(true);
      setMsg(`확인문제 ${aiQuestionCount}문항과 교사용 정답을 생성했습니다. 학생용 인쇄·Word에는 문항만 포함됩니다.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
    } finally {
      setBusyAiQuestions(false);
    }
  }, [aiContext, aiQuestionCount]);

  const runAiSummary = useCallback(async () => {
    setErr(null);
    setMsg(null);
    setBusyAiSummary(true);
    try {
      const ctx = aiContext();
      const text = await generateProfessionalKeySummary(ctx);
      setForm((f) => ({ ...f, summary: text }));
      setMsg("핵심요약을 생성했습니다. 필요 시 수정하세요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
    } finally {
      setBusyAiSummary(false);
    }
  }, [aiContext]);

  const aiBusy = busyAiQuestions || busyAiSummary;
  const exportBusy = wordBusy;

  return (
    <section id="worksheet-pdf" className="worksheet-pdf" aria-labelledby="worksheet-pdf-title">
      <div className="worksheet-pdf__inner">
        <h2 id="worksheet-pdf-title" className="worksheet-pdf__title">
          <span className="worksheet-pdf__title-en">Worksheet PDF</span>
          <span className="worksheet-pdf__title-ko">학습지 PDF 자동 생성</span>
        </h2>
        <p className="worksheet-pdf__lede ui-ko">
          입력한 내용으로 브라우저 인쇄에서 A4 학습지를 저장(PDF)하거나, 같은 내용을 Word(.docx)로 내려받아 Google 문서에서 편집할 수 있습니다.
          로그인 없이 사용할 수 있습니다.
        </p>

        <div className="worksheet-pdf__grid">
          <div className="worksheet-pdf__grid--row3">
            <label className="worksheet-pdf__field">
              <span className="worksheet-pdf__label">학습단원</span>
              <input
                className="worksheet-pdf__control"
                value={form.unit}
                onChange={(e) => update("unit", e.target.value)}
                placeholder="예: 수능 영어 독해 — 인과·추론"
                autoComplete="off"
              />
            </label>
            <label className="worksheet-pdf__field">
              <span className="worksheet-pdf__label">학습목표</span>
              <textarea
                className="worksheet-pdf__textarea worksheet-pdf__textarea--compact"
                rows={2}
                value={form.objectives}
                onChange={(e) => update("objectives", e.target.value)}
                placeholder="이번 시간에 달성할 목표를 적어 주세요."
              />
            </label>
            <label className="worksheet-pdf__field">
              <span className="worksheet-pdf__label">학습일자</span>
              <input
                className="worksheet-pdf__control"
                type="date"
                value={form.studyDate}
                onChange={(e) => update("studyDate", e.target.value)}
              />
            </label>
          </div>
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">학습내용</span>
            <textarea
              className="worksheet-pdf__textarea worksheet-pdf__textarea--tall"
              rows={6}
              value={form.content}
              onChange={(e) => update("content", e.target.value)}
              placeholder="본문에 들어갈 학습 내용입니다."
            />
          </label>

          <div className="worksheet-pdf__field worksheet-pdf__field--block">
            <span className="worksheet-pdf__label">확인문제</span>
            <div className="worksheet-pdf__ai-tools">
              <label className="worksheet-pdf__ai-toggle">
                <input
                  type="checkbox"
                  checked={aiExerciseTools}
                  onChange={(e) => setAiExerciseTools(e.target.checked)}
                />
                <span className="worksheet-pdf__ai-toggle-text">AI 자동생성</span>
              </label>
              {aiExerciseTools ? (
                <div className="worksheet-pdf__ai-controls">
                  <label className="worksheet-pdf__ai-count-label">
                    문항 수
                    <select
                      className="worksheet-pdf__ai-count"
                      value={aiQuestionCount}
                      onChange={(e) => setAiQuestionCount(Number(e.target.value))}
                      aria-label="확인문제 문항 수"
                    >
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}문항
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn--primary worksheet-pdf__ai-run"
                    disabled={aiBusy || exportBusy}
                    onClick={() => void runAiQuestions()}
                  >
                    {busyAiQuestions ? "생성 중…" : "AI로 확인문제 생성"}
                  </button>
                </div>
              ) : null}
            </div>
            <p className="worksheet-pdf__ai-note ui-ko">
              AI 생성 시 <strong>주관식(단답형·서술형)</strong>만 출제합니다. 정답은 아래 교사용 영역에서만 확인할 수 있으며{" "}
              <strong>학생용 인쇄·Word에는 포함되지 않습니다.</strong>
            </p>
            <textarea
              className="worksheet-pdf__textarea"
              rows={5}
              value={form.exercises}
              onChange={(e) => update("exercises", e.target.value)}
              placeholder="문항을 직접 입력하거나 AI 생성 결과를 수정해 주세요."
            />
            <details className="worksheet-pdf__teacher-only" open={teacherAnswersOpen} onToggle={(e) => setTeacherAnswersOpen((e.target as HTMLDetailsElement).open)}>
              <summary className="worksheet-pdf__teacher-summary">정답 확인 · 교사용 (학생용 출력 미포함)</summary>
              <textarea
                className="worksheet-pdf__textarea worksheet-pdf__textarea--answers"
                rows={5}
                value={form.exerciseAnswers}
                onChange={(e) => update("exerciseAnswers", e.target.value)}
                placeholder="AI 생성 시 참고 정답이 채워집니다. 직접 편집할 수 있습니다."
                aria-label="확인문제 참고 정답"
              />
            </details>
          </div>

          <div className="worksheet-pdf__field worksheet-pdf__field--block">
            <span className="worksheet-pdf__label">핵심요약</span>
            <div className="worksheet-pdf__ai-tools">
              <label className="worksheet-pdf__ai-toggle">
                <input
                  type="checkbox"
                  checked={aiSummaryTools}
                  onChange={(e) => setAiSummaryTools(e.target.checked)}
                />
                <span className="worksheet-pdf__ai-toggle-text">AI 자동생성</span>
              </label>
              {aiSummaryTools ? (
                <button
                  type="button"
                  className="btn btn--primary worksheet-pdf__ai-run worksheet-pdf__ai-run--solo"
                  disabled={aiBusy || exportBusy}
                  onClick={() => void runAiSummary()}
                >
                  {busyAiSummary ? "생성 중…" : "AI로 핵심요약 작성"}
                </button>
              ) : null}
            </div>
            <p className="worksheet-pdf__ai-note ui-ko">
              AI 요약은 <strong>■ 제목</strong> 아래 <strong>내용</strong> 형식으로 일목요연하게 정리합니다.
            </p>
            <textarea
              className="worksheet-pdf__textarea"
              rows={4}
              value={form.summary}
              onChange={(e) => update("summary", e.target.value)}
              placeholder="한 줄 요약·키워드 등을 적거나 AI 생성 결과를 수정해 주세요."
            />
          </div>

          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">선생님 성함</span>
            <input
              className="worksheet-pdf__control"
              value={form.teacherName}
              onChange={(e) => update("teacherName", e.target.value)}
              placeholder="헤더 브랜딩에 표시됩니다."
              autoComplete="name"
            />
          </label>
        </div>

        {err ? (
          <p className="worksheet-pdf__err" role="alert">
            {err}
          </p>
        ) : null}
        {msg ? (
          <p className="worksheet-pdf__ok" role="status">
            {msg}
          </p>
        ) : null}

        <div className="worksheet-pdf__actions">
          <button
            type="button"
            className="btn btn--primary btn--stack worksheet-pdf__submit"
            disabled={wordBusy}
            onClick={openPrint}
          >
            인쇄 / PDF 저장
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--stack worksheet-pdf__submit"
            disabled={wordBusy}
            onClick={() => void downloadWordDocx()}
          >
            {wordBusy ? "만드는 중…" : "Word(.docx) 내보내기"}
          </button>
        </div>
        <p className="worksheet-pdf__hint ui-ko">
          인쇄 시 브라우저 대화상자에서「PDF로 저장」을 고르면 [날짜]_[선생님성함]_[학습단원] 등 원하는 파일명으로 저장할 수 있습니다.
          <span className="worksheet-pdf__hint-sub">
            {" "}
            AI 기능은 영어 지문 분석과 동일하게 <code className="worksheet-pdf__code">VITE_OPENAI_API_KEY</code> 가
            필요합니다.
          </span>
        </p>
      </div>
    </section>
  );
}
