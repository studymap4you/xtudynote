import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { db } from "@/firebase/config";
import { generateAiExamQuestions } from "@/lib/aiExam/generateAiExamQuestions";
import { downloadExamPaperDocx } from "@/lib/exam/downloadExamPaperDocx";
import { openExamPaperPrint } from "@/lib/exam/openExamPaperPrint";
import { parseCommaSeparatedPdfPages } from "@/lib/pdf/parseCommaSeparatedPdfPages";
import {
  extractWorksheetPassageFromUpload,
  isWorksheetPdfUpload,
  type WorksheetExtractOptions,
} from "@/lib/worksheet/extractWorksheetPassageFromUpload";
import type { AiExamQuestion } from "@/types/aiExam";
import type { ClassroomDocument } from "@/types/classroom";
import styles from "@/pages/exam/examPages.module.css";

const MAX_ITEMS = 20;

const PASSAGE_FILE_ACCEPT =
  ".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ManualDraft = {
  key: string;
  type: "mcq" | "short";
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  shortAnswer: string;
  /** 쉼표로 구분 — 단답 채점 시 필수 키워드 */
  requiredKeywords: string;
  evidenceQuote: string;
  explanation: string;
};

function parseKeywordList(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function newManual(): ManualDraft {
  return {
    key: crypto.randomUUID(),
    type: "mcq",
    prompt: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    shortAnswer: "",
    requiredKeywords: "",
    evidenceQuote: "",
    explanation: "",
  };
}

function manualToQuestion(m: ManualDraft): AiExamQuestion | null {
  const prompt = m.prompt.trim();
  const ev = m.evidenceQuote.trim();
  const exp = m.explanation.trim();
  if (!prompt || !ev) return null;
  if (m.type === "mcq") {
    const opts = m.options.map((o) => o.trim());
    return {
      id: crypto.randomUUID(),
      source: "manual",
      type: "mcq",
      prompt,
      options: opts,
      correctAnswer: String(Math.min(3, Math.max(0, m.correctIndex))),
      evidenceQuote: ev,
      explanation: exp,
    };
  }
  const ca = m.shortAnswer.trim();
  if (!ca) return null;
  const kw = parseKeywordList(m.requiredKeywords);
  return {
    id: crypto.randomUUID(),
    source: "manual",
    type: "short",
    prompt,
    correctAnswer: ca,
    evidenceQuote: ev,
    explanation: exp,
    ...(kw.length ? { requiredKeywords: kw } : {}),
  };
}

export function ExamBuilderPage() {
  const { firebaseUser, profile } = useAuth();
  const { showToast } = useToast();
  const uid = firebaseUser?.uid ?? "";

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [passage, setPassage] = useState("");
  const [totalItems, setTotalItems] = useState(10);
  const [objectiveRatio, setObjectiveRatio] = useState(60);
  const [manuals, setManuals] = useState<ManualDraft[]>([]);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedExamUrl, setSavedExamUrl] = useState<string | null>(null);
  const [lastExamId, setLastExamId] = useState<string | null>(null);

  const [assembled, setAssembled] = useState<AiExamQuestion[]>([]);

  const [myClassrooms, setMyClassrooms] = useState<{ id: string; title: string }[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [lastAssignmentId, setLastAssignmentId] = useState<string | null>(null);

  const [pdfLayout, setPdfLayout] = useState<"1col" | "2col">("1col");
  const [pdfStudentName, setPdfStudentName] = useState("");
  const [pdfStudentNo, setPdfStudentNo] = useState("");
  const [pdfExamDate, setPdfExamDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [wordBusy, setWordBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadAnalysisMode, setUploadAnalysisMode] = useState<"full" | "range" | "pick">("full");
  const [pdfPageFromInput, setPdfPageFromInput] = useState("1");
  const [pdfPageToInput, setPdfPageToInput] = useState("");
  const [pdfPageListInput, setPdfPageListInput] = useState("");

  const teacherName = profile?.displayName?.trim() || firebaseUser?.email?.trim() || "선생님";

  useEffect(() => {
    if (!uid) {
      setMyClassrooms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const q = query(collection(db, "classrooms"), where("teacherId", "==", uid));
        const snap = await getDocs(q);
        const rows: { id: string; title: string }[] = [];
        snap.forEach((d) => {
          const x = d.data() as ClassroomDocument;
          rows.push({ id: d.id, title: String(x.title ?? "강의실") });
        });
        rows.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        if (!cancelled) setMyClassrooms(rows);
      } catch {
        if (!cancelled) setMyClassrooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const totalsOk = totalItems >= 1 && totalItems <= MAX_ITEMS;

  const manualValidCount = useMemo(() => {
    let n = 0;
    for (const m of manuals) {
      if (manualToQuestion(m)) n += 1;
    }
    return n;
  }, [manuals]);

  const addManual = useCallback(() => {
    setManuals((xs) => [...xs, newManual()]);
  }, []);

  const removeManual = useCallback((key: string) => {
    setManuals((xs) => xs.filter((m) => m.key !== key));
  }, []);

  const patchManual = useCallback((key: string, patch: Partial<ManualDraft>) => {
    setManuals((xs) => xs.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }, []);

  const processPassageFile = useCallback(
    async (file: File) => {
      setUploadBusy(true);
      try {
        let extractOpts: WorksheetExtractOptions | undefined;
        if (isWorksheetPdfUpload(file)) {
          if (uploadAnalysisMode === "range") {
            const fromPage = Math.max(1, parseInt(pdfPageFromInput.trim(), 10) || 1);
            const toTrim = pdfPageToInput.trim();
            if (toTrim !== "") {
              const toNum = parseInt(toTrim, 10);
              if (!Number.isFinite(toNum) || toNum < fromPage) {
                showToast("err", "PDF 끝 페이지는 시작 페이지 이상이거나 비워 두세요.");
                return;
              }
              extractOpts = { pdfPageFrom: fromPage, pdfPageTo: toNum };
            } else {
              extractOpts = { pdfPageFrom: fromPage };
            }
          } else if (uploadAnalysisMode === "pick") {
            const parsed = parseCommaSeparatedPdfPages(pdfPageListInput);
            if (parsed === "invalid") {
              showToast("err", "페이지는 1 이상의 정수를 쉼표로 구분해 입력하세요. 예: 4, 5, 9");
              return;
            }
            if (parsed === "empty") {
              showToast("err", "추출할 페이지 번호를 입력하세요. 예: 4, 5, 9");
              return;
            }
            extractOpts = { pdfPageList: parsed };
          }
        }

        const ext = file.name.toLowerCase();
        const isTxt = ext.endsWith(".txt") || (file.type || "").toLowerCase() === "text/plain";
        let body: string;
        if (isTxt) {
          body = (await file.text()).replace(/^\uFEFF/, "");
        } else {
          body = await extractWorksheetPassageFromUpload(file, extractOpts);
        }

        const extracted = body.trim();
        if (!extracted) {
          showToast("err", "파일에서 읽을 본문이 없습니다.");
          return;
        }

        const insert = `${file.name ? `【${file.name}】\n\n` : ""}${extracted}`;
        setPassage((prev) => {
          const t = prev.trim();
          return t ? `${t}\n\n---\n\n${insert}` : insert;
        });
        showToast(
          "ok",
          uploadAnalysisMode !== "full" && !isWorksheetPdfUpload(file)
            ? `「${file.name}」전체 본문을 넣었습니다. (페이지 지정은 PDF만 적용)`
            : `「${file.name}」본문을 반영했습니다.`,
        );
      } catch (e) {
        showToast("err", e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
      } finally {
        setUploadBusy(false);
      }
    },
    [
      pdfPageFromInput,
      pdfPageListInput,
      pdfPageToInput,
      showToast,
      uploadAnalysisMode,
    ],
  );

  const onPickPassageFiles = useCallback(
    (list: FileList | null) => {
      const file = list?.[0];
      if (!file) return;
      void processPassageFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [processPassageFile],
  );

  const buildManualQuestions = useCallback((): AiExamQuestion[] => {
    const out: AiExamQuestion[] = [];
    for (const m of manuals) {
      const q = manualToQuestion(m);
      if (q) out.push(q);
    }
    return out;
  }, [manuals]);

  const generateAndSave = useCallback(async () => {
    setError(null);
    setSavedExamUrl(null);

    const subj = subject.trim();
    const pass = passage.trim();
    const ttl = title.trim();
    if (!ttl) {
      setError("시험 제목을 입력해 주세요.");
      return;
    }
    if (!subj) {
      setError("과목을 선택하거나 입력해 주세요.");
      return;
    }
    if (!pass || pass.length < 30) {
      setError("본문은 최소 약 30자 이상 입력해 주세요.");
      return;
    }
    if (!totalsOk) {
      setError(`총 문항 수는 1~${MAX_ITEMS} 사이여야 합니다.`);
      return;
    }
    if (!uid) {
      setError("로그인이 필요합니다.");
      return;
    }

    const manualQs = buildManualQuestions();
    if (manualQs.length > totalItems) {
      setError(`수동 문항(${manualQs.length})이 총 문항(${totalItems})보다 많습니다.`);
      return;
    }

    const remain = totalItems - manualQs.length;
    const nObjective = Math.min(remain, Math.round((remain * objectiveRatio) / 100));
    const nSubjective = remain - nObjective;

    setGenerating(true);
    try {
      let aiQs: AiExamQuestion[] = [];
      if (remain > 0) {
        aiQs = await generateAiExamQuestions({
          passage: pass,
          subject: subj,
          nObjective,
          nSubjective,
          manualSummaries: manualQs.map((q) => q.prompt.slice(0, 200)),
        });
      }

      const merged = [...manualQs, ...aiQs].slice(0, totalItems);

      const examId = crypto.randomUUID();
      const classroomId = selectedClassroomId.trim();
      await setDoc(doc(db, "ai_exams", examId), {
        teacherId: uid,
        title: ttl,
        subject: subj,
        passage: pass,
        totalItems,
        objectiveRatioPercent: objectiveRatio,
        visibility: "link",
        questions: merged,
        createdAt: serverTimestamp(),
        ...(classroomId ? { classroomId } : {}),
      });

      let assignmentId: string | null = null;
      if (classroomId) {
        assignmentId = crypto.randomUUID();
        await setDoc(doc(db, "classroom_exam_assignments", assignmentId), {
          classroomId,
          teacherId: uid,
          examId,
          title: ttl,
          subject: subj,
          createdAt: serverTimestamp(),
        });
        setLastAssignmentId(assignmentId);
      } else {
        setLastAssignmentId(null);
      }

      const url = `${window.location.origin}/exam/${examId}`;
      setSavedExamUrl(url);
      setLastExamId(examId);
      setAssembled(merged);
      showToast(
        "ok",
        classroomId
          ? "시험지가 저장되었고, 선택한 강의실에 배포되었습니다. 학생은 내 강의실 → 오늘의 학습문제에서 응시합니다."
          : "시험지가 저장되었습니다. 학생에게 링크를 공유하세요.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "저장에 실패했습니다.";
      setError(msg);
      showToast("err", msg);
    } finally {
      setGenerating(false);
    }
  }, [
    subject,
    passage,
    title,
    totalsOk,
    uid,
    buildManualQuestions,
    totalItems,
    objectiveRatio,
    showToast,
    selectedClassroomId,
  ]);

  const examPaperPayload = useMemo(
    () => ({
      title: title.trim() || "시험",
      subject: subject.trim(),
      teacherName,
      passage: passage.trim(),
      layout: pdfLayout,
      studentName: pdfStudentName.trim(),
      studentNo: pdfStudentNo.trim(),
      examDate: pdfExamDate.trim(),
      questions: assembled.map((q) =>
        q.type === "mcq"
          ? { type: "mcq" as const, prompt: q.prompt, options: q.options ?? [] }
          : { type: "short" as const, prompt: q.prompt },
      ),
    }),
    [
      assembled,
      passage,
      pdfExamDate,
      pdfLayout,
      pdfStudentName,
      pdfStudentNo,
      subject,
      teacherName,
      title,
    ],
  );

  const openPrint = useCallback(() => {
    if (!assembled.length) {
      showToast("warn", "먼저 문제를 생성·저장해 주세요.");
      return;
    }
    try {
      openExamPaperPrint(examPaperPayload);
      showToast("ok", "인쇄 창을 열었습니다. 「PDF로 저장」을 선택할 수 있습니다.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "인쇄 창을 열지 못했습니다.");
    }
  }, [assembled.length, examPaperPayload, showToast]);

  const exportWord = useCallback(async () => {
    if (!assembled.length) {
      showToast("warn", "먼저 문제를 생성·저장해 주세요.");
      return;
    }
    setWordBusy(true);
    try {
      await downloadExamPaperDocx(examPaperPayload);
      showToast("ok", "Word(.docx) 파일이 저장되었습니다. Google 문서에서 열어 수정할 수 있습니다.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Word 파일을 만들지 못했습니다.");
    } finally {
      setWordBusy(false);
    }
  }, [assembled.length, examPaperPayload, showToast]);

  const passageWorkBusy = generating || uploadBusy;

  return (
    <DashboardShell light>
      <div className={styles.wrap}>
        <h1 className={styles.heroTitle}>AI 문제 생성 · 시험지</h1>
        <p className={styles.heroLead}>
          본문을 기준으로 근거 기반 문항을 만듭니다. 수동으로 넣은 문항이 번호 상 먼저 배치되고, 남은
          칸만 AI가 채웁니다. (총 {MAX_ITEMS}문항까지)
        </p>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>1. 시험 설정</h2>
          <div className={`${styles.fieldGrid} ${styles.cols2}`}>
            <label className={styles.label}>
              시험 제목
              <input
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 1단원 확인 시험"
              />
            </label>
            <label className={styles.label}>
              과목
              <input
                className={styles.input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="국어, 영어, 수학…"
                list="exam-subjects"
              />
              <datalist id="exam-subjects">
                <option value="국어" />
                <option value="영어" />
                <option value="수학" />
                <option value="사회" />
                <option value="과학" />
              </datalist>
            </label>
            <label className={styles.label}>
              강의실 배포 (선택)
              <select
                className={styles.select}
                value={selectedClassroomId}
                onChange={(e) => setSelectedClassroomId(e.target.value)}
              >
                <option value="">없음 — 링크로만 공유</option>
                {myClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>
                선택 시 해당 강의실 학생의「내 강의실 → 오늘의 학습문제」에 표시됩니다.
              </span>
            </label>
          </div>
          <div className={styles.passageBlock}>
            <div className={styles.passageToolbar}>
              <span id="exam-passage-heading" className={styles.passageToolbarTitle}>
                본문 (지문)
              </span>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost} ${styles.filePickBtn}`}
                disabled={passageWorkBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadBusy ? "불러오는 중…" : "파일 선택"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={PASSAGE_FILE_ACCEPT}
              className={styles.fileInputHidden}
              aria-label="본문용 텍스트, PDF, Word 파일"
              onChange={(e) => onPickPassageFiles(e.target.files)}
            />
            <div
              className={`${styles.uploadDrop}${dragOver ? ` ${styles.uploadDropActive}` : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
                onPickPassageFiles(e.dataTransfer.files);
              }}
            >
              <p className={styles.uploadDropText}>
                <strong>PDF · Word(DOCX) · TXT</strong>를 드래그하거나 위에서 파일 선택
              </p>
              <p className={styles.uploadDropSub}>
                추출한 텍스트는 아래 본문에 이어 붙입니다. 이미지 파일은 지원하지 않습니다.
              </p>
            </div>
            <div className={styles.uploadScope}>
              <span className={styles.uploadScopeLabel}>분석 범위 (PDF)</span>
              <div className={styles.segmentRow} role="radiogroup" aria-label="PDF 본문 범위">
                <label className={styles.segmentItem}>
                  <input
                    type="radio"
                    name="exam-passage-scope"
                    checked={uploadAnalysisMode === "full"}
                    onChange={() => setUploadAnalysisMode("full")}
                    disabled={passageWorkBusy}
                  />
                  <span>전체</span>
                </label>
                <label className={styles.segmentItem}>
                  <input
                    type="radio"
                    name="exam-passage-scope"
                    checked={uploadAnalysisMode === "range"}
                    onChange={() => setUploadAnalysisMode("range")}
                    disabled={passageWorkBusy}
                  />
                  <span>
                    페이지 구간 <span className={styles.segmentNote}>(PDF)</span>
                  </span>
                </label>
                <label className={styles.segmentItem}>
                  <input
                    type="radio"
                    name="exam-passage-scope"
                    checked={uploadAnalysisMode === "pick"}
                    onChange={() => setUploadAnalysisMode("pick")}
                    disabled={passageWorkBusy}
                  />
                  <span>
                    특정 페이지 <span className={styles.segmentNote}>(PDF)</span>
                  </span>
                </label>
              </div>
              {uploadAnalysisMode === "range" ? (
                <div className={styles.pageRangeGrid}>
                  <label className={styles.pageField}>
                    <span className={styles.pageFieldLabel}>시작 페이지</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={pdfPageFromInput}
                      onChange={(e) => setPdfPageFromInput(e.target.value)}
                      disabled={passageWorkBusy}
                      aria-label="PDF 시작 페이지"
                    />
                  </label>
                  <label className={styles.pageField}>
                    <span className={styles.pageFieldLabel}>끝 페이지</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={pdfPageToInput}
                      onChange={(e) => setPdfPageToInput(e.target.value)}
                      disabled={passageWorkBusy}
                      placeholder="비우면 마지막까지"
                      aria-label="PDF 끝 페이지"
                    />
                  </label>
                  <p className={styles.scopeHint}>.txt · .docx 는 전체 본문만 반영됩니다.</p>
                </div>
              ) : null}
              {uploadAnalysisMode === "pick" ? (
                <div className={styles.pageRangeGrid}>
                  <label className={styles.pageFieldWide}>
                    <span className={styles.pageFieldLabel}>페이지 번호</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pdfPageListInput}
                      onChange={(e) => setPdfPageListInput(e.target.value)}
                      disabled={passageWorkBusy}
                      placeholder="예: 4, 5, 9"
                      aria-label="PDF 특정 페이지"
                    />
                  </label>
                  <p className={styles.scopeHint}>.txt · .docx 는 구간 없이 전체입니다.</p>
                </div>
              ) : null}
            </div>
            <textarea
              id="exam-passage-textarea"
              className={styles.textarea}
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              disabled={passageWorkBusy}
              placeholder="시험의 근거가 되는 본문을 붙여 넣거나, 위에서 파일을 불러오세요."
              aria-labelledby="exam-passage-heading"
            />
          </div>

          <div className={`${styles.fieldGrid} ${styles.cols2}`} style={{ marginTop: "0.75rem" }}>
            <label className={styles.label}>
              총 문항 수 (최대 {MAX_ITEMS})
              <input
                className={styles.input}
                type="number"
                min={1}
                max={MAX_ITEMS}
                value={totalItems}
                onChange={(e) => setTotalItems(Number(e.target.value))}
              />
            </label>
            <div className={styles.label}>
              AI 구간 객관식 비율
              <div className={styles.rangeRow}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={objectiveRatio}
                  onChange={(e) => setObjectiveRatio(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span className={styles.rangeVal}>{objectiveRatio}%</span>
              </div>
              <span className={styles.hint}>
                수동 문항을 뺀 나머지 문항에만 적용됩니다. 영어 과목은 주관식(근거 문장) 위주로 자동
                조정됩니다.
              </span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className={styles.cardTitle} style={{ marginBottom: 0 }}>
              2. 수동 문항 (선택)
            </h2>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={addManual}>
              + 문항 추가
            </button>
          </div>
          <p className={styles.hint} style={{ marginBottom: "0.75rem" }}>
            입력한 문항은 출제 순서 상 앞쪽에 배치됩니다. 발문·근거 인용은 필수입니다.
          </p>

          {manuals.length === 0 && (
            <p className={styles.hint}>수동 문항이 없으면 전체가 AI 출제입니다.</p>
          )}

          {manuals.map((m, idx) => (
            <div key={m.key} className={styles.manualBlock}>
              <div className={styles.manualHead}>
                <span className={styles.manualIdx}>수동 {idx + 1}</span>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => removeManual(m.key)}
                >
                  삭제
                </button>
              </div>
              <div className={`${styles.fieldGrid} ${styles.cols2}`}>
                <label className={styles.label}>
                  유형
                  <select
                    className={styles.select}
                    value={m.type}
                    onChange={(e) =>
                      patchManual(m.key, {
                        type: e.target.value === "short" ? "short" : "mcq",
                      })
                    }
                  >
                    <option value="mcq">객관식</option>
                    <option value="short">주관식</option>
                  </select>
                </label>
                <label className={styles.label}>
                  발문
                  <input
                    className={styles.input}
                    value={m.prompt}
                    onChange={(e) => patchManual(m.key, { prompt: e.target.value })}
                  />
                </label>
              </div>

              {m.type === "mcq" ? (
                <>
                  <div className={`${styles.fieldGrid} ${styles.cols2}`} style={{ marginTop: "0.5rem" }}>
                    {([0, 1, 2, 3] as const).map((i) => (
                      <label key={i} className={styles.label}>
                        보기 {i + 1}
                        <input
                          className={styles.input}
                          value={m.options[i]}
                          onChange={(e) => {
                            const next = [...m.options] as [string, string, string, string];
                            next[i] = e.target.value;
                            patchManual(m.key, { options: next });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <label className={styles.label} style={{ marginTop: "0.5rem" }}>
                    정답 번호 (1–4)
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      max={4}
                      value={m.correctIndex + 1}
                      onChange={(e) =>
                        patchManual(m.key, {
                          correctIndex: Math.min(3, Math.max(0, Number(e.target.value) - 1)),
                        })
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className={styles.label} style={{ marginTop: "0.5rem" }}>
                    모범 답안
                    <textarea
                      className={styles.textarea}
                      style={{ minHeight: "4rem" }}
                      value={m.shortAnswer}
                      onChange={(e) => patchManual(m.key, { shortAnswer: e.target.value })}
                    />
                  </label>
                  <label className={styles.label} style={{ marginTop: "0.5rem" }}>
                    필수 키워드 (쉼표 구분 · 단답 채점)
                    <input
                      className={styles.input}
                      value={m.requiredKeywords}
                      onChange={(e) => patchManual(m.key, { requiredKeywords: e.target.value })}
                      placeholder="예: 인과관계, 역설, 범위"
                    />
                  </label>
                </>
              )}

              <label className={styles.label} style={{ marginTop: "0.5rem" }}>
                본문 근거 인용
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: "3.2rem" }}
                  value={m.evidenceQuote}
                  onChange={(e) => patchManual(m.key, { evidenceQuote: e.target.value })}
                  placeholder="본문에서 베낀 짧은 문장"
                />
              </label>
              <label className={styles.label} style={{ marginTop: "0.5rem" }}>
                해설 (선택)
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: "2.8rem" }}
                  value={m.explanation}
                  onChange={(e) => patchManual(m.key, { explanation: e.target.value })}
                />
              </label>
            </div>
          ))}
        </section>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={passageWorkBusy}
            onClick={() => void generateAndSave()}
          >
            시험 생성 및 저장
          </button>
          <Link to="/dashboard" className={`${styles.btn} ${styles.btnGhost}`}>
            대시보드
          </Link>
        </div>

        <p className={styles.hint}>
          완성된 유효 수동 문항: {manualValidCount}개 / 설정 총 문항 {totalItems}개
        </p>
        {error && <p className={styles.err}>{error}</p>}
        {savedExamUrl && (
          <div className={styles.linkBox}>
            <strong>학생 응시 링크</strong>
            <a href={savedExamUrl}>{savedExamUrl}</a>
            {lastExamId && (
              <div style={{ marginTop: "0.5rem" }}>
                <Link to={`/exam/${lastExamId}`}>이 탭에서 미리 보기 →</Link>
              </div>
            )}
            {lastAssignmentId && selectedClassroomId && (
              <p className={styles.hint} style={{ marginTop: "0.65rem" }}>
                학생 응시 경로: 내 강의실 → 오늘의 학습문제 →{" "}
                <Link to={`/classroom/${selectedClassroomId}/learn/${lastAssignmentId}`}>
                  바로 열기 (테스트)
                </Link>
              </p>
            )}
          </div>
        )}

        <section className={styles.card} style={{ marginTop: "1.25rem" }}>
          <h2 className={styles.cardTitle}>3. 시험지 인쇄 · Word 내보내기</h2>
          <p className={styles.hint}>
            서버 PDF 대신 브라우저 인쇄로 A4 시험지를 저장(PDF)하거나, 동일 내용을 Word(.docx)로 내려받을 수
            있습니다. 학생 이름·학번·시행일은 아래에서 맞춤 입력하세요.
          </p>
          <div className={`${styles.pdfPanel} ${styles.row}`}>
            <label className={styles.label}>
              레이아웃
              <select
                className={styles.select}
                value={pdfLayout}
                onChange={(e) => setPdfLayout(e.target.value === "2col" ? "2col" : "1col")}
              >
                <option value="1col">1단 (세로 한 줄)</option>
                <option value="2col">2단 (좌우)</option>
              </select>
            </label>
            <label className={styles.label}>
              학생 이름 (표시용)
              <input
                className={styles.input}
                value={pdfStudentName}
                onChange={(e) => setPdfStudentName(e.target.value)}
                placeholder="비우면 빈 칸"
              />
            </label>
            <label className={styles.label}>
              학번·번호
              <input
                className={styles.input}
                value={pdfStudentNo}
                onChange={(e) => setPdfStudentNo(e.target.value)}
              />
            </label>
          </div>
          <label className={styles.label} style={{ marginTop: "0.55rem" }}>
            시행일 (시험지 상단)
            <input
              className={styles.input}
              type="date"
              value={pdfExamDate}
              onChange={(e) => setPdfExamDate(e.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!assembled.length || wordBusy}
              onClick={openPrint}
            >
              인쇄 / PDF 저장
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              disabled={!assembled.length || wordBusy}
              onClick={() => void exportWord()}
            >
              {wordBusy ? "Word 생성 중…" : "Word(.docx) 내보내기"}
            </button>
          </div>
        </section>

        {assembled.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>저장된 문항 미리보기</h2>
            <ol className={styles.previewList}>
              {assembled.map((q, i) => (
                <li key={q.id}>
                  <strong>{i + 1}</strong> [{q.source === "manual" ? "수동" : "AI"} ·{" "}
                  {q.type === "mcq" ? "객관" : "주관"}] {q.prompt.slice(0, 120)}
                  {q.prompt.length > 120 ? "…" : ""}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {passageWorkBusy && (
        <div className={styles.overlay} role="alertdialog" aria-busy aria-live="polite">
          <div className={styles.spinner} />
          <p className={styles.overlayText}>
            {generating ? "문제 생성 중..." : "본문 파일을 읽는 중..."}
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
