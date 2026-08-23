import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FileText,
  LoaderCircle,
  PanelLeft,
  Paperclip,
  Pause,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { type ChangeEvent, type DragEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { CSATBookletPreview } from "@/components/renderEngine/CSATBookletPreview";
import { extractPlainTextFromLocalFile } from "@/lib/localFile/extractLocalFileText";
import {
  deleteCsatQuestionJob,
  generateNextCsatQuestionBatch,
  getCsatQuestionJob,
  listCsatQuestionJobs,
  startCsatQuestionJob,
} from "@/lib/csatQuestionEngine";
import type { CsatQuestionJob, CsatQuestionJobSummary, GeneratedCsatQuestion } from "@/types/csatQuestionEngine";
import type { CSATRenderInput } from "@/lib/renderEngine/types";
import styles from "@/pages/csatQuestionStudio.module.css";

type AttachedSource = {
  id: string;
  file: File;
  status: "extracting" | "ready" | "error" | "unsupported";
  text: string;
  message: string;
};

const ACTIVE_JOB_STORAGE_KEY = "xtudy-csat-question-job-v1";
const MAX_SOURCE_LENGTH = 120_000;

function canExtractText(file: File): boolean {
  return /\.(txt|md|csv|tsv|json|html?|pdf|docx|xlsx?)$/iu.test(file.name)
    || file.type.startsWith("text/")
    || file.type === "application/pdf"
    || file.type.includes("wordprocessingml")
    || file.type.includes("spreadsheet");
}

function statusLabel(status: CsatQuestionJobSummary["status"]): string {
  if (status === "completed") return "완료";
  if (status === "failed") return "확인 필요";
  if (status === "paused") return "일시정지";
  if (status === "generating") return "생성 중";
  return "준비 중";
}

function dateLabel(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time === 0) return "방금 전";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

function typeLabel(value: string): string {
  const labels: Record<string, string> = {
    PURPOSE: "목적",
    EMOTION_CHANGE: "심경 변화",
    IMPLIED_MEANING: "함축 의미",
    MAIN_IDEA: "요지",
    CLAIM: "주장",
    TOPIC: "주제",
    TITLE: "제목",
    CHART: "도표",
    FACTUAL_DESCRIPTION: "내용 일치",
    FACTUAL_PRACTICAL: "실용문",
    GRAMMAR: "어법",
    VOCABULARY: "어휘",
    BLANK_SHORT: "짧은 빈칸",
    BLANK_LONG: "긴 빈칸",
    IRRELEVANT_SENTENCE: "무관한 문장",
    PARAGRAPH_ORDER: "문단 순서",
    SENTENCE_INSERTION: "문장 삽입",
    SUMMARY: "요약",
    LONG_READING_1: "장문 독해",
    LONG_READING_2: "장문 서사",
  };
  return labels[value] || value;
}

function QuestionReviewItem({ question }: { question: GeneratedCsatQuestion }) {
  return (
    <details className={styles.questionItem}>
      <summary>
        <span className={styles.questionNumber}>{question.sequence}</span>
        <span className={styles.questionSummaryCopy}>
          <b>{typeLabel(question.questionType)}</b>
          <span>{question.stem}</span>
        </span>
        <span className={styles.questionDifficulty}>{question.difficulty}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className={styles.questionBody}>
        <p className={styles.passage}>{question.passage}</p>
        <h3>{question.stem}</h3>
        <ol className={styles.choiceList}>
          {question.choices.map((choice) => (
            <li key={choice.index} data-correct={choice.isCorrect || undefined}>
              <span>{choice.text}</span>
              {choice.isCorrect ? <Check size={16} aria-label="정답" /> : null}
              <small>{choice.isCorrect ? "정답 근거" : choice.distractorPattern} · {choice.rationale}</small>
            </li>
          ))}
        </ol>
        <div className={styles.explanation}>
          <b>정답 {question.answer}번 · 해설</b>
          <p>{question.explanation}</p>
          <small>Source {question.sourceId} · Batch {question.qualityMetadata.batchId}</small>
        </div>
      </div>
    </details>
  );
}

export function CsatQuestionStudioPage() {
  const [userRequest, setUserRequest] = useState("");
  const [sources, setSources] = useState<AttachedSource[]>([]);
  const [job, setJob] = useState<CsatQuestionJob | null>(null);
  const [history, setHistory] = useState<CsatQuestionJobSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState("문제 생성 준비 중...");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const pauseRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const extractingCount = sources.filter((source) => source.status === "extracting").length;
  const progress = job ? Math.min(100, Math.round((job.acceptedCount / job.targetQuestionCount) * 100)) : 0;
  const sourceText = useMemo(
    () => sources
      .filter((source) => source.status === "ready" && source.text)
      .map((source) => `[첨부 파일: ${source.file.name}]\n${source.text}`)
      .join("\n\n")
      .slice(0, MAX_SOURCE_LENGTH),
    [sources],
  );
  const renderInput = useMemo<CSATRenderInput | null>(() => {
    if (!job || job.status !== "completed" || job.questions.length === 0) return null;
    const level = job.request.targetLevel === "high" ? "High Level" : job.request.targetLevel === "low" ? "Foundation" : "Standard Level";
    return {
      title: job.title,
      subtitle: "Reading · Reasoning · Accuracy",
      target: `${job.request.targetGrade} · ${level}`,
      templateId: "xuniverse-csat-studygram-pop-v1",
      questions: job.questions,
      options: {
        mode: "student",
        showDifficulty: false,
        showScore: true,
        showQuestionType: true,
        showAnswerKey: false,
      },
    };
  }, [job]);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await listCsatQuestionJobs());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제 세트 기록을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
    const activeId = window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!activeId) return;
    void getCsatQuestionJob(activeId)
      .then((stored) => {
        setJob(stored);
        setUserRequest(stored.userRequest);
        setStatusText(stored.status === "completed" ? "문제 검수 완료" : "저장된 문제 세트를 이어서 생성할 수 있습니다.");
      })
      .catch(() => window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY));
  }, [refreshHistory]);

  const runBatches = useCallback(async (initialJob: CsatQuestionJob) => {
    pauseRef.current = false;
    setRunning(true);
    setError(null);
    setPreviewOpen(false);
    let working = initialJob;
    try {
      while (working.acceptedCount < working.targetQuestionCount && !pauseRef.current) {
        setStatusText(`Source 자료 검색 및 수능 유형 분석 중 · ${working.acceptedCount}/${working.targetQuestionCount}`);
        const response = await generateNextCsatQuestionBatch(working.id);
        working = response.job;
        setJob(working);
        window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, working.id);
        setStatusText(
          response.batch.accepted > 0
            ? `문제 검수 완료 ${working.acceptedCount}/${working.targetQuestionCount} · 이번 배치 ${response.batch.accepted}문항 통과`
            : `이번 배치가 품질 기준을 통과하지 못했습니다 · 누적 ${working.acceptedCount}/${working.targetQuestionCount}`,
        );
        void refreshHistory();
        if (working.status === "completed" || working.status === "failed") break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (working.status === "completed") setStatusText(`문제 검수 완료 ${working.acceptedCount}/${working.targetQuestionCount}`);
      else if (pauseRef.current) setStatusText("현재 배치까지 저장하고 일시정지했습니다.");
      else if (working.status === "failed") setError(working.warning || "일부 문제 생성이 반복해서 거부되었습니다. 현재 결과를 확인하거나 다시 시도해주세요.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제 생성이 중단되었습니다.");
      setStatusText("통과한 문제까지 저장했습니다. 이어서 다시 시도할 수 있습니다.");
    } finally {
      setRunning(false);
    }
  }, [refreshHistory]);

  const startGeneration = useCallback(async () => {
    const instruction = userRequest.trim();
    if (!instruction) {
      setError("만들고 싶은 수능 영어 문제를 자연어로 입력해주세요.");
      return;
    }
    if (extractingCount > 0) {
      setError("첨부 파일을 읽고 있습니다. 분석이 끝난 뒤 시작해주세요.");
      return;
    }
    setRunning(true);
    setError(null);
    setStatusText("요청을 구조화하고 Source DB를 확인하고 있습니다.");
    try {
      const created = await startCsatQuestionJob({
        userRequest: instruction,
        sourceText,
        uploadedFiles: sources.map((source) => ({ name: source.file.name, size: source.file.size, type: source.file.type })),
      });
      setJob(created);
      window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, created.id);
      await runBatches(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제 생성 작업을 시작하지 못했습니다.");
      setRunning(false);
    }
  }, [extractingCount, runBatches, sourceText, sources, userRequest]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const added = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      status: canExtractText(file) ? "extracting" as const : "unsupported" as const,
      text: "",
      message: canExtractText(file) ? "본문을 읽는 중..." : "본문 자동 추출을 지원하지 않는 파일입니다.",
    }));
    setSources((current) => [...current, ...added]);
    for (const item of added) {
      if (item.status !== "extracting") continue;
      void extractPlainTextFromLocalFile(item.file)
        .then((text) => setSources((current) => current.map((source) => source.id === item.id
          ? { ...source, status: text.trim() ? "ready" : "error", text: text.trim(), message: text.trim() ? `${text.trim().length.toLocaleString()}자 준비 완료` : "읽을 수 있는 본문이 없습니다." }
          : source)))
        .catch((caught: unknown) => setSources((current) => current.map((source) => source.id === item.id
          ? { ...source, status: "error", message: caught instanceof Error ? caught.message : "파일을 읽지 못했습니다." }
          : source)));
    }
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!running && !job && event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }, [addFiles, job, running]);

  const startNew = useCallback(() => {
    if (running) return;
    setJob(null);
    setUserRequest("");
    setSources([]);
    setError(null);
    setStatusText("문제 생성 준비 중...");
    setHistoryOpen(false);
    setPreviewOpen(false);
    window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
  }, [running]);

  const openHistoryItem = useCallback(async (id: string) => {
    if (running) return;
    setHistoryBusyId(id);
    setError(null);
    try {
      const stored = await getCsatQuestionJob(id);
      setJob(stored);
      setUserRequest(stored.userRequest);
      setSources([]);
      setPreviewOpen(false);
      setHistoryOpen(false);
      setStatusText(stored.status === "completed" ? "문제 검수 완료" : "저장된 문제 다음 배치부터 이어서 생성할 수 있습니다.");
      window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, stored.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제 세트를 열지 못했습니다.");
    } finally {
      setHistoryBusyId(null);
    }
  }, [running]);

  const removeHistoryItem = useCallback(async (id: string, title: string) => {
    if (!window.confirm(`'${title}' 문제 세트를 삭제할까요?`)) return;
    setHistoryBusyId(id);
    try {
      await deleteCsatQuestionJob(id);
      if (job?.id === id) startNew();
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제 세트를 삭제하지 못했습니다.");
    } finally {
      setHistoryBusyId(null);
    }
  }, [job?.id, refreshHistory, startNew]);

  const downloadJson = useCallback(() => {
    if (!job) return;
    const payload = {
      schemaVersion: "xuniverse-csat-question-set-v1",
      request: job.request,
      rulesVersion: job.rulesVersion,
      questions: job.questions,
      quality: {
        acceptedCount: job.acceptedCount,
        rejectedCount: job.rejectedCount,
        modelCallCount: job.modelCallCount,
        retryCount: job.retryCount,
      },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `xuniverse-csat-questions-${job.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [job]);

  const handlePromptKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !running && !job) {
      event.preventDefault();
      void startGeneration();
    }
  }, [job, running, startGeneration]);

  const displayedHistory = useMemo(() => {
    if (!job) return history;
    const current: CsatQuestionJobSummary = job;
    return [current, ...history.filter((item) => item.id !== job.id)]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [history, job]);

  return (
    <DashboardShell>
      <main className={styles.main}>
        <button type="button" className={styles.mobileHistoryButton} onClick={() => setHistoryOpen(true)} aria-label="문제 세트 기록 열기" title="문제 세트 기록">
          <PanelLeft size={19} aria-hidden="true" />
        </button>
        <div className={styles.workspace}>
          <aside className={`${styles.sidebar}${historyOpen ? ` ${styles.sidebarOpen}` : ""}`} aria-label="내 문제 세트">
            <header>
              <strong>내 문제 세트</strong>
              <button type="button" onClick={startNew} disabled={running} aria-label="새 문제 세트" title="새 문제 세트"><Plus size={18} /></button>
            </header>
            <div className={styles.historyList}>
              {historyLoading && displayedHistory.length === 0 ? <p>기록 불러오는 중...</p> : null}
              {!historyLoading && displayedHistory.length === 0 ? <p>아직 저장된 문제 세트가 없습니다.</p> : null}
              {displayedHistory.map((item) => (
                <div key={item.id} className={`${styles.historyRow}${job?.id === item.id ? ` ${styles.historyRowActive}` : ""}`}>
                  <button type="button" className={styles.historyOpenButton} onClick={() => void openHistoryItem(item.id)} disabled={running || historyBusyId === item.id}>
                    <b>{item.title}</b>
                    <span>{statusLabel(item.status)} · {item.acceptedCount}/{item.targetQuestionCount}</span>
                    <small>{dateLabel(item.updatedAt)}</small>
                  </button>
                  <button type="button" className={styles.historyDeleteButton} onClick={() => void removeHistoryItem(item.id, item.title)} disabled={running || historyBusyId === item.id} aria-label={`${item.title} 삭제`} title="삭제">
                    {historyBusyId === item.id ? <LoaderCircle className={styles.spinner} size={14} /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          </aside>
          {historyOpen ? <button type="button" className={styles.backdrop} onClick={() => setHistoryOpen(false)} aria-label="기록 닫기" /> : null}

          <section className={styles.stage}>
            <div
              className={`${styles.composer}${dragging ? ` ${styles.composerDragging}` : ""}`}
              onDragOver={(event) => { event.preventDefault(); if (!running && !job) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <header className={styles.signal}><span /><b>CSAT QUESTION ENGINE</b></header>
              {job ? (
                <div className={styles.requestMessage}><small>나</small><p>{job.userRequest}</p></div>
              ) : (
                <textarea
                  className={styles.prompt}
                  value={userRequest}
                  onChange={(event) => { setUserRequest(event.target.value); setError(null); }}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="예: 고3 상위권 수능 영어 문제 50개 만들어줘. 빈칸, 순서, 삽입, 제목, 요지 중심으로 만들어줘."
                  aria-label="만들고 싶은 수능 영어 문제"
                  disabled={running}
                />
              )}

              {sources.length > 0 && !job ? (
                <div className={styles.fileList}>
                  {sources.map((source) => (
                    <span key={source.id}>
                      {source.status === "extracting" ? <LoaderCircle className={styles.spinner} size={13} /> : <FileText size={13} />}
                      <b>{source.file.name}</b><em>{source.message}</em>
                      <button type="button" onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} aria-label={`${source.file.name} 제거`} title="파일 제거"><X size={13} /></button>
                    </span>
                  ))}
                </div>
              ) : null}

              {job ? (
                <div className={styles.jobPanel} aria-live="polite">
                  <div className={styles.jobHeadline}>
                    {running ? <LoaderCircle className={styles.spinner} size={19} /> : <Check size={19} />}
                    <div><strong>{statusText}</strong><span>규칙 DB {job.rulesVersion} · 모델 호출 {job.modelCallCount}회 · 거부 {job.rejectedCount}문항</span></div>
                    <b>{job.acceptedCount}/{job.targetQuestionCount}</b>
                  </div>
                  <div className={styles.progressTrack} aria-label={`문제 생성 진행률 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
                  <div className={styles.jobActions}>
                    {running ? (
                      <button type="button" onClick={() => { pauseRef.current = true; setStatusText("현재 배치 검수 후 일시정지합니다."); }}><Pause size={16} /> 일시정지</button>
                    ) : job.status !== "completed" ? (
                      <button type="button" onClick={() => void runBatches(job)}><Play size={16} /> 이어서 생성</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => setPreviewOpen(true)}><BookOpen size={16} /> 문제집 미리보기</button>
                        <button type="button" onClick={downloadJson}><Download size={16} /> JSON 다운로드</button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {error ? <p className={styles.error}>{error}</p> : null}
              <footer>
                <input ref={fileInputRef} type="file" multiple hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
                <button type="button" className={styles.iconButton} onClick={() => fileInputRef.current?.click()} disabled={running || Boolean(job)} aria-label="원문 자료 첨부" title="원문 자료 첨부"><Paperclip size={18} /></button>
                <span>{extractingCount ? `파일 ${extractingCount}개 분석 중` : sources.length ? `원문 ${sources.length}개 준비됨` : "원문 자료 첨부"}</span>
                {!job ? (
                  <button type="button" className={styles.sendButton} onClick={() => void startGeneration()} disabled={running || extractingCount > 0 || !userRequest.trim()} aria-label="문제 생성 시작" title="문제 생성 시작">
                    {running ? <LoaderCircle className={styles.spinner} size={19} /> : <ArrowUp size={20} />}
                  </button>
                ) : null}
              </footer>
            </div>

            {job?.questions.length ? (
              <section className={styles.results} aria-label="검수 통과 문제 목록">
                <header><div><small>VALIDATED QUESTION SET</small><h1>{job.title}</h1></div><span>{job.questions.length}문항</span></header>
                <div className={styles.questionList}>{job.questions.map((question) => <QuestionReviewItem key={question.id} question={question} />)}</div>
              </section>
            ) : null}
          </section>
        </div>
      </main>
      {previewOpen && renderInput ? <CSATBookletPreview input={renderInput} onClose={() => setPreviewOpen(false)} /> : null}
    </DashboardShell>
  );
}
