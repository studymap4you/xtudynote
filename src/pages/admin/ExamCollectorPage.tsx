import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  HardDrive,
  LoaderCircle,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { AdminTopNav } from "@/components/AdminTopNav";
import { useAuth } from "@/contexts/AuthContext";
import {
  enqueueExamCollection,
  loadExamCollectorState,
  type ExamCollectionJob,
  type ExamCollectionStatus,
  type ExamCollectorState,
} from "@/lib/admin/examCollectorApi";
import styles from "./examCollectorPage.module.css";

const GRADES = [1, 2, 3] as const;
const MONTHS = [3, 6, 9, 10] as const;
const ACTIVE_STATUSES = new Set<ExamCollectionStatus>(["queued", "running"]);

const STATUS_LABEL: Record<ExamCollectionStatus, string> = {
  queued: "대기",
  running: "수집 중",
  completed: "완료",
  completed_with_errors: "일부 실패",
  failed: "실패",
  cancelled: "취소",
};

function statusIcon(status: ExamCollectionStatus) {
  if (status === "running") return <LoaderCircle size={16} className={styles.spin} aria-hidden />;
  if (status === "completed") return <CheckCircle2 size={16} aria-hidden />;
  if (status === "completed_with_errors" || status === "failed") return <XCircle size={16} aria-hidden />;
  return <Clock3 size={16} aria-hidden />;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function JobRow({ job, selected, onSelect }: { job: ExamCollectionJob; selected: boolean; onSelect: () => void }) {
  const processed = job.completedTargets + job.failedTargets;
  const progress = job.totalTargets ? Math.min(100, Math.round((processed / job.totalTargets) * 100)) : 0;
  return (
    <button
      type="button"
      className={`${styles.jobRow} ${selected ? styles.jobRowSelected : ""}`}
      onClick={onSelect}
    >
      <span className={`${styles.status} ${styles[`status_${job.status}`]}`}>
        {statusIcon(job.status)} {STATUS_LABEL[job.status]}
      </span>
      <span className={styles.jobScope}>
        고{job.grades.join("·")} · {job.startYear === job.endYear ? job.startYear : `${job.startYear}-${job.endYear}`} · {job.months.join("·")}월
      </span>
      <span className={styles.jobProgress}>{processed}/{job.totalTargets} · {progress}%</span>
      <span className={styles.jobDate}>{formatDate(job.updatedAt || job.createdAt)}</span>
    </button>
  );
}

export function ExamCollectorPage() {
  const { firebaseUser } = useAuth();
  const currentYear = new Date().getFullYear();
  const [grades, setGrades] = useState<number[]>([1, 2, 3]);
  const [months, setMonths] = useState<number[]>([3, 6, 9, 10]);
  const [startYear, setStartYear] = useState(currentYear);
  const [endYear, setEndYear] = useState(currentYear);
  const [state, setState] = useState<ExamCollectorState | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (jobId?: string, quiet = false) => {
    if (!firebaseUser) return;
    if (!quiet) setLoading(true);
    try {
      const nextState = await loadExamCollectorState(firebaseUser, jobId);
      setState(nextState);
      setError("");
      if (!selectedJobId && nextState.jobs[0]) setSelectedJobId(nextState.jobs[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "수집 정보를 불러오지 못했습니다.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [firebaseUser, selectedJobId]);

  useEffect(() => {
    void load(selectedJobId);
  }, [load, selectedJobId]);

  const hasActiveJob = state?.jobs.some((job) => ACTIVE_STATUSES.has(job.status)) ?? false;
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => void load(selectedJobId, true), 5_000);
    return () => window.clearInterval(timer);
  }, [hasActiveJob, load, selectedJobId]);

  const selectedJob = state?.jobs.find((job) => job.id === selectedJobId);
  const totals = useMemo(() => ({
    exams: state?.exams.length ?? 0,
    storedFiles: state?.exams.reduce((sum, exam) => sum
      + Number(Boolean(exam.questionFilePath))
      + Number(Boolean(exam.answerFilePath))
      + Number(Boolean(exam.scriptFilePath)), 0) ?? 0,
    activeJobs: state?.jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).length ?? 0,
  }), [state]);

  const toggle = (value: number, values: number[], setValues: (next: number[]) => void) => {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort((a, b) => a - b));
  };

  const submit = async () => {
    if (!firebaseUser || !grades.length || !months.length || startYear > endYear) {
      setError("학년, 연도, 시행 월을 확인해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await enqueueExamCollection(firebaseUser, { grades, months, startYear, endYear });
      setSelectedJobId(response.job.id);
      await load(response.job.id, true);
      setError("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "수집 작업을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell app-shell--admin app-shell--light">
      <AdminTopNav />
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>PROBLEM BANK</p>
            <h1>모의고사 수집</h1>
            <p>Official English exam archive</p>
          </div>
          <button type="button" className={styles.iconButton} onClick={() => void load(selectedJobId)} title="새로고침" disabled={loading}>
            <RefreshCw size={19} className={loading ? styles.spin : ""} aria-hidden />
            <span className={styles.srOnly}>새로고침</span>
          </button>
        </header>

        <section className={styles.stats} aria-label="수집 현황">
          <div><Database size={20} aria-hidden /><span>등록 시험</span><strong>{totals.exams}</strong></div>
          <div><HardDrive size={20} aria-hidden /><span>저장 파일</span><strong>{totals.storedFiles}</strong></div>
          <div><LoaderCircle size={20} aria-hidden /><span>진행 작업</span><strong>{totals.activeJobs}</strong></div>
        </section>

        {error ? <div className={styles.error} role="alert"><XCircle size={18} aria-hidden />{error}</div> : null}

        <section className={styles.controlSection}>
          <div className={styles.sectionHeading}>
            <h2>새 수집 작업</h2>
            <span>영어</span>
          </div>
          <div className={styles.controls}>
            <fieldset>
              <legend>학년</legend>
              <div className={styles.checkGroup}>
                {GRADES.map((grade) => (
                  <label key={grade}><input type="checkbox" checked={grades.includes(grade)} onChange={() => toggle(grade, grades, setGrades)} />고{grade}</label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>연도 범위</legend>
              <div className={styles.yearRange}>
                <input aria-label="시작 연도" type="number" min={2006} max={currentYear} value={startYear} onChange={(event) => setStartYear(Number(event.target.value))} />
                <span>부터</span>
                <input aria-label="종료 연도" type="number" min={2006} max={currentYear} value={endYear} onChange={(event) => setEndYear(Number(event.target.value))} />
              </div>
            </fieldset>
            <fieldset>
              <legend>시행 월</legend>
              <div className={styles.checkGroup}>
                {MONTHS.map((month) => (
                  <label key={month}><input type="checkbox" checked={months.includes(month)} onChange={() => toggle(month, months, setMonths)} />{month}월</label>
                ))}
              </div>
            </fieldset>
            <button type="button" className={styles.primaryButton} onClick={() => void submit()} disabled={submitting || !grades.length || !months.length}>
              {submitting ? <LoaderCircle size={18} className={styles.spin} aria-hidden /> : <Play size={18} aria-hidden />}
              수집 시작
            </button>
          </div>
        </section>

        <div className={styles.dataGrid}>
          <section className={styles.jobsSection}>
            <div className={styles.sectionHeading}><h2>작업 현황</h2><span>{state?.jobs.length ?? 0}</span></div>
            <div className={styles.jobList}>
              {state?.jobs.length ? state.jobs.map((job) => (
                <JobRow key={job.id} job={job} selected={job.id === selectedJobId} onSelect={() => setSelectedJobId(job.id)} />
              )) : <p className={styles.empty}>등록된 수집 작업이 없습니다.</p>}
            </div>
          </section>

          <section className={styles.detailSection}>
            <div className={styles.sectionHeading}><h2>선택 작업</h2>{selectedJob ? <span>{STATUS_LABEL[selectedJob.status]}</span> : null}</div>
            {selectedJob ? (
              <div className={styles.detailBody}>
                <div><span>대상</span><strong>{selectedJob.totalTargets}</strong></div>
                <div><span>완료</span><strong>{selectedJob.completedTargets}</strong></div>
                <div><span>실패</span><strong>{selectedJob.failedTargets}</strong></div>
                <div><span>Storage 업로드</span><strong>{selectedJob.uploadedFiles}</strong></div>
                <div><span>중복 건너뜀</span><strong>{selectedJob.skippedFiles}</strong></div>
                <div><span>DB 등록</span><strong>{selectedJob.dbRegisteredCount}</strong></div>
              </div>
            ) : <p className={styles.empty}>작업을 선택해주세요.</p>}
            {state?.targets.length ? (
              <div className={styles.targetList}>
                {state.targets.map((target) => (
                  <div key={target.id} className={styles.targetRow}>
                    <span>고{target.grade} · {target.year} · {target.month}월</span>
                    <span>{target.status === "completed" ? <CheckCircle2 size={15} aria-hidden /> : target.status === "failed" ? <XCircle size={15} aria-hidden /> : <Clock3 size={15} aria-hidden />}{target.status}</span>
                    <span><HardDrive size={15} aria-hidden />{target.uploadedFiles + target.skippedFiles}</span>
                    <span><FileCheck2 size={15} aria-hidden />{target.dbRegistered ? "등록" : "대기"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <section className={styles.examsSection}>
          <div className={styles.sectionHeading}><h2>수집된 모의고사</h2><span>{state?.exams.length ?? 0}</span></div>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>시험</th><th>주관</th><th>문제</th><th>답안·해설</th><th>대본</th><th>DB</th><th>수집일</th></tr></thead>
              <tbody>
                {state?.exams.map((exam) => (
                  <tr key={exam.id}>
                    <td>고{exam.grade} · {exam.year} · {exam.month}월</td>
                    <td>{exam.organizer}</td>
                    <td>{exam.questionFilePath ? <CheckCircle2 size={17} aria-label="저장됨" /> : "-"}</td>
                    <td>{exam.answerFilePath ? <CheckCircle2 size={17} aria-label="저장됨" /> : "-"}</td>
                    <td>{exam.scriptFilePath ? <CheckCircle2 size={17} aria-label="저장됨" /> : "-"}</td>
                    <td>{exam.parseStatus}</td>
                    <td>{formatDate(exam.collectedAt)}</td>
                  </tr>
                ))}
                {!state?.exams.length ? <tr><td colSpan={7} className={styles.emptyCell}>수집된 시험이 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
