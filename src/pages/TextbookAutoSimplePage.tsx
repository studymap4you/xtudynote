import { type DragEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BookOpenCheck, LoaderCircle, Paperclip, Pause, Play, Square, X } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { PremiumTextbookPreview } from "@/components/premium/PremiumTextbookPreview";
import { TextbookAutoPrintView } from "@/components/textbookAuto/TextbookAutoPrintView";
import type { UniversalAttachmentItem } from "@/components/UniversalFileAttachmentPanel";
import {
  getXUniversePremiumTemplate,
  xuniversePremiumTemplates,
  type XUniversePremiumTemplateId,
} from "@/data/xuniversePremiumTemplates";
import {
  createAcademyTextbookPlan,
  generateAcademyTextbookUnit,
  selectRelevantSourceExcerpt,
} from "@/lib/academyTextbookGenerator";
import { extractPlainTextFromLocalFile } from "@/lib/localFile/extractLocalFileText";
import { parseManuscriptToModules } from "@/lib/localDocumentAuto/manuscriptModules";
import {
  generatePremiumTextbook,
  toPremiumUploadedFileMetadata,
  type GeneratePremiumTextbookResult,
} from "@/lib/premiumTextbookGenerator";
import { requestTextbookUnitGeneration } from "@/lib/textbookAuto/requestTextbookUnitGeneration";
import type {
  AcademyLearnerLevel,
  AcademyTargetPages,
  AcademyTextbookJob,
} from "@/types/academyTextbook";
import type { PremiumTextbook, PremiumUploadedFileMetadata } from "@/types/premiumTextbook";
import { DEFAULT_SECTION_INCLUSION, type TextbookAnswerKeyLayout, type TextbookUnitContent } from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoSimple.module.css";

type GenerationMode = "worksheet" | "workbook" | "premium";

type StandardGenerationResult = {
  mode: Exclude<GenerationMode, "premium">;
  title: string;
  model: string;
  answerKeyLayout: TextbookAnswerKeyLayout;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
};

type PremiumGenerationResult = {
  mode: "premium";
  title: string;
  model: string;
  source: GeneratePremiumTextbookResult["meta"]["source"];
  templateId: XUniversePremiumTemplateId;
  uploadedFiles: PremiumUploadedFileMetadata[];
  textbook: PremiumTextbook;
};

type GenerationResult = StandardGenerationResult | PremiumGenerationResult;

type AttachmentSource = {
  status: "extracting" | "ready" | "unsupported" | "error";
  text?: string;
  message: string;
};

const AI_SOURCE_SLICE = 24_000;
const ACADEMY_SOURCE_LIMIT = 240_000;
const ACADEMY_JOB_STORAGE_KEY = "xtudy-academy-textbook-job-v1";
const TARGET_PAGE_OPTIONS: AcademyTargetPages[] = [50, 100, 150, 200];

function inferTargetPagesFromPrompt(prompt: string): AcademyTargetPages {
  const match = prompt.match(/(\d{2,3})\s*(?:쪽|페이지|pages?)/i);
  if (!match) return 50;
  const requested = Number(match[1]);
  return TARGET_PAGE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - requested) < Math.abs(closest - requested) ? option : closest,
  );
}

function inferLearnerLevelFromPrompt(prompt: string): AcademyLearnerLevel {
  const normalized = prompt.replace(/\s+/g, " ");
  if (/(고3|수능).*(실전|심화|고난도)|(?:실전|심화|고난도).*(고3|수능)/i.test(normalized)) return "csat-intensive";
  if (/(고3|수능)/i.test(normalized)) return "csat-foundation";
  if (/고등?(?:학교)?\s*2|고2/i.test(normalized)) return "high-2";
  if (/고등?(?:학교)?\s*1|고1/i.test(normalized)) return "high-1";
  if (/중학.*심화|중등.*심화|중학생.*심화/i.test(normalized)) return "middle-advanced";
  if (/중학|중등|중학생/i.test(normalized)) return "middle-basic";
  return "auto";
}

function inferTemplateFromPrompt(prompt: string): XUniversePremiumTemplateId {
  return /(기본|베이직|basic|깔끔한\s*시험지)/i.test(prompt)
    ? "xuniverse-premium-basic"
    : "xuniverse-academy-pro";
}

function attachmentItem(file: File): UniversalAttachmentItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    file,
  };
}

function sliceForAi(source: string): string {
  return source.length <= AI_SOURCE_SLICE ? source : source.slice(0, AI_SOURCE_SLICE);
}

function sampleForPlanning(source: string): string {
  if (source.length <= 60_000) return source;
  const sampleSize = 20_000;
  const middleStart = Math.max(0, Math.floor(source.length / 2) - sampleSize / 2);
  return [
    source.slice(0, sampleSize),
    source.slice(middleStart, middleStart + sampleSize),
    source.slice(-sampleSize),
  ].join("\n\n[자료 구간 전환]\n\n");
}

function inferTitle(source: string, mode: GenerationMode): string {
  const fallback = mode === "worksheet" ? "AI 학습지" : mode === "workbook" ? "AI 워크북" : "프리미엄 AI 교재";
  const firstLine = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return fallback;
  return firstLine.replace(/^#{1,6}\s*/, "").slice(0, 64) || fallback;
}

function buildWorksheetUnit(source: string, title: string): TextbookUnitContent {
  const modules = parseManuscriptToModules(source);
  return {
    unitTitle: title,
    keyConcepts: [],
    contentStudy: [],
    coreSummary: [],
    practice: [],
    unitTest: [],
    manuscriptModules:
      modules.length > 0
        ? modules
        : [
            {
              id: "simple-worksheet-source",
              field: "problem",
              body: source,
            },
          ],
    sectionInclusion: {
      keyConcepts: false,
      contentStudy: false,
      coreSummary: false,
      practice: false,
      unitTest: false,
    },
  };
}

function canExtractText(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    /\.(txt|md|csv|tsv|json|html?|pdf|docx|xlsx?)$/.test(name) ||
    type.startsWith("text/") ||
    type === "application/pdf" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type.includes("spreadsheet") ||
    type.includes("excel")
  );
}

function buildAcademyTextbook(job: AcademyTextbookJob): PremiumTextbook | null {
  if (!job.plan) return null;
  let questionNumber = 0;
  const answerKey = job.generatedUnits.flatMap((unit) =>
    unit.questions.map((question) => ({
      questionNumber: (questionNumber += 1),
      answer: question.answer,
      explanation: question.explanation,
    })),
  );
  const completed = job.status === "completed";
  return {
    title: job.plan.title,
    subtitle: job.plan.subtitle,
    brandLabel: "Xtudy-Universe · AI Learning Platform",
    templateId: job.templateId,
    targetLearner: job.plan.targetLearner,
    overview: job.plan.overview,
    units: job.generatedUnits,
    answerKey,
    generationPlan: {
      longForm: true,
      conceptPages: job.plan.pageAllocation.conceptPages,
      targetPages: job.plan.targetPages,
      questionPlan: { totalCount: job.plan.questionCount },
      completed,
      missingCount: Math.max(0, job.plan.questionCount - answerKey.length),
    },
    generationWarning: completed
      ? undefined
      : `${job.generatedUnits.length}/${job.plan.unitCount}개 단원이 완성되었습니다. 생성 작업을 재개하면 남은 단원부터 이어서 만듭니다.`,
  };
}

function academyResultFromJob(job: AcademyTextbookJob): PremiumGenerationResult | null {
  const textbook = buildAcademyTextbook(job);
  if (!textbook || job.generatedUnits.length === 0) return null;
  return {
    mode: "premium",
    title: textbook.title,
    model: job.model || "academy-batch",
    source: job.source || "openai",
    templateId: job.templateId,
    uploadedFiles: job.uploadedFiles,
    textbook,
  };
}

function persistAcademyJob(job: AcademyTextbookJob | null) {
  try {
    if (!job) {
      window.localStorage.removeItem(ACADEMY_JOB_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACADEMY_JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {
    // 생성은 계속 진행하되, 저장 공간이 부족한 경우 재개 기능만 제한됩니다.
  }
}

export function TextbookAutoSimplePage() {
  const [sourceText] = useState("");
  const [attachments, setAttachments] = useState<UniversalAttachmentItem[]>([]);
  const [attachmentSources, setAttachmentSources] = useState<Record<string, AttachmentSource>>({});
  const [userInstruction, setUserInstruction] = useState("");
  const [learnerLevel, setLearnerLevel] = useState<AcademyLearnerLevel>("auto");
  const [targetPages, setTargetPages] = useState<AcademyTargetPages>(50);
  const [selectedTemplateId, setSelectedTemplateId] = useState<XUniversePremiumTemplateId>("xuniverse-academy-pro");
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [busyMode, setBusyMode] = useState<GenerationMode | null>(null);
  const [academyRunning, setAcademyRunning] = useState(false);
  const [academyJob, setAcademyJob] = useState<AcademyTextbookJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const attachmentIdsRef = useRef(new Set<string>());
  const academyControlRef = useRef({ pause: false, cancel: false });
  const academyAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sourceCorpus = useMemo(() => {
    const fileSections = attachments.flatMap((item) => {
      const extracted = attachmentSources[item.id];
      return extracted?.status === "ready" && extracted.text
        ? [`[첨부 파일: ${item.file.name}]\n${extracted.text}`]
        : [];
    });
    return [sourceText.trim(), ...fileSections].filter(Boolean).join("\n\n").slice(0, ACADEMY_SOURCE_LIMIT);
  }, [attachmentSources, attachments, sourceText]);

  const extractingCount = useMemo(
    () => Object.values(attachmentSources).filter((source) => source.status === "extracting").length,
    [attachmentSources],
  );

  const selectedTemplate = getXUniversePremiumTemplate(selectedTemplateId) ?? xuniversePremiumTemplates[0];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACADEMY_JOB_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as AcademyTextbookJob;
      const restored = stored.status === "planning" || stored.status === "generating"
        ? { ...stored, status: "paused" as const, updatedAt: new Date().toISOString() }
        : stored;
      setAcademyJob(restored);
      persistAcademyJob(restored);
      const restoredResult = academyResultFromJob(restored);
      if (restoredResult) setResult(restoredResult);
    } catch {
      window.localStorage.removeItem(ACADEMY_JOB_STORAGE_KEY);
    }
  }, []);

  const extractAttachment = useCallback(async (item: UniversalAttachmentItem) => {
    if (!canExtractText(item.file)) {
      setAttachmentSources((current) => ({
        ...current,
        [item.id]: { status: "unsupported", message: "첨부 완료 · 본문 자동 추출 미지원" },
      }));
      return;
    }

    setAttachmentSources((current) => ({
      ...current,
      [item.id]: { status: "extracting", message: "본문을 읽는 중..." },
    }));
    try {
      const extracted = (await extractPlainTextFromLocalFile(item.file)).trim();
      if (!attachmentIdsRef.current.has(item.id)) return;
      setAttachmentSources((current) => ({
        ...current,
        [item.id]: extracted
          ? { status: "ready", text: extracted, message: `${extracted.length.toLocaleString()}자 자동 분석 준비 완료` }
          : { status: "error", message: "읽을 수 있는 본문이 없습니다." },
      }));
    } catch (caught) {
      if (!attachmentIdsRef.current.has(item.id)) return;
      setAttachmentSources((current) => ({
        ...current,
        [item.id]: {
          status: "error",
          message: caught instanceof Error ? caught.message : "파일 본문을 읽지 못했습니다.",
        },
      }));
    }
  }, []);

  const handleAttachmentsChange = useCallback(
    (next: UniversalAttachmentItem[]) => {
      const nextIds = new Set(next.map((item) => item.id));
      attachmentIdsRef.current = nextIds;
      const added = next.filter((item) => !attachments.some((existing) => existing.id === item.id));
      setAttachments(next);
      setAttachmentSources((current) => Object.fromEntries(Object.entries(current).filter(([id]) => nextIds.has(id))));
      setAttachmentNotice(null);
      for (const item of added) void extractAttachment(item);
    },
    [attachments, extractAttachment],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const added = Array.from(files).map(attachmentItem);
      if (added.length > 0) handleAttachmentsChange([...attachments, ...added]);
    },
    [attachments, handleAttachmentsChange],
  );

  const removeAttachment = useCallback(
    (id: string) => handleAttachmentsChange(attachments.filter((item) => item.id !== id)),
    [attachments, handleAttachmentsChange],
  );

  const handleComposerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (!academyRunning && event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
    },
    [academyRunning, addFiles],
  );

  const generate = useCallback(
    async (mode: GenerationMode) => {
      const source = sourceCorpus.trim();
      const instruction = userInstruction.trim();
      const uploadedFiles = attachments.map((item) => toPremiumUploadedFileMetadata(item.file));
      setError(null);

      if (mode !== "premium" && !source) {
        setError("교재로 만들 텍스트를 먼저 입력해주세요.");
        return;
      }
      if (mode === "premium") {
        if (!instruction) {
          setError("어떤 교재를 만들지 주문을 입력해주세요.");
          return;
        }
        if (!source && uploadedFiles.length === 0) {
          setError("교재 제작에 사용할 원문을 붙여넣거나 파일을 업로드해주세요.");
          return;
        }
      }

      const title = inferTitle(source, mode);
      setBusyMode(mode);
      try {
        if (mode === "worksheet") {
          setResult({
            mode,
            title,
            model: "module-rule",
            answerKeyLayout: "appendix",
            units: [{ unitIndex: 0, unit: buildWorksheetUnit(source, title) }],
          });
          return;
        }
        if (mode === "premium") {
          const premiumResult = await generatePremiumTextbook({
            templateId: selectedTemplateId,
            userInstruction: instruction,
            pastedText: sliceForAi(source),
            uploadedFiles,
          });
          setResult({
            mode,
            title: premiumResult.textbook.title || title,
            model: premiumResult.meta.model,
            source: premiumResult.meta.source,
            templateId: selectedTemplateId,
            uploadedFiles,
            textbook: premiumResult.textbook,
          });
          return;
        }

        const { unit, meta } = await requestTextbookUnitGeneration({
          bookTitle: title,
          sourceText: sliceForAi(source),
          unitIndex: 0,
          totalUnits: 1,
          practiceMin: 4,
          unitTestMcq: 3,
          unitTestShort: 2,
          sectionInclusion: DEFAULT_SECTION_INCLUSION,
        });
        setResult({
          mode,
          title,
          model: meta.model,
          answerKeyLayout: "inline",
          units: [{ unitIndex: 0, unit }],
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "알 수 없는 오류가 발생했습니다.";
        setError(
          message.includes("API 키")
            ? "AI 생성 설정이 아직 연결되지 않았습니다. OpenAI API 키 설정을 확인해주세요."
            : `교재 생성에 실패했습니다. ${message}`,
        );
      } finally {
        setBusyMode(null);
      }
    },
    [attachments, selectedTemplateId, sourceCorpus, userInstruction],
  );

  const runAcademyJob = useCallback(async (initialJob: AcademyTextbookJob) => {
    academyControlRef.current = { pause: false, cancel: false };
    const controller = new AbortController();
    academyAbortRef.current = controller;
    setAcademyRunning(true);
    setError(null);
    let working: AcademyTextbookJob = {
      ...initialJob,
      status: "planning",
      error: undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (!working.plan) {
        setAcademyJob(working);
        persistAcademyJob(working);
        const planResponse = await createAcademyTextbookPlan(
          {
            userInstruction: working.userInstruction,
            learnerLevel: working.learnerLevel,
            targetPages: working.targetPages,
            templateId: working.templateId,
            sourceText: sampleForPlanning(working.sourceText),
            uploadedFiles: working.uploadedFiles,
          },
          controller.signal,
        );
        working = {
          ...working,
          status: "generating",
          plan: planResponse.plan,
          model: planResponse.meta.model,
          source: planResponse.meta.source,
          updatedAt: new Date().toISOString(),
        };
        setAcademyJob(working);
        persistAcademyJob(working);
      } else {
        working = { ...working, status: "generating", updatedAt: new Date().toISOString() };
        setAcademyJob(working);
        persistAcademyJob(working);
      }

      while (working.plan && working.generatedUnits.length < working.plan.units.length) {
        if (academyControlRef.current.pause) {
          working = { ...working, status: "paused", updatedAt: new Date().toISOString() };
          setAcademyJob(working);
          persistAcademyJob(working);
          break;
        }

        const plan = working.plan;
        const unitPlan = plan.units[working.generatedUnits.length];
        working = {
          ...working,
          activeUnitIndex: unitPlan.unitIndex,
          status: "generating",
          updatedAt: new Date().toISOString(),
        };
        setAcademyJob(working);
        persistAcademyJob(working);
        const sourceExcerpt = selectRelevantSourceExcerpt(working.sourceText, unitPlan);
        const previousQuestionSignatures = working.generatedUnits.flatMap((unit) =>
          unit.questions.map((question) => question.question.slice(0, 220)),
        );
        const unitResponse = await generateAcademyTextbookUnit(
          {
            userInstruction: working.userInstruction,
            learnerLevel: working.learnerLevel,
            targetPages: working.targetPages,
            templateId: working.templateId,
            sourceText: sourceExcerpt,
            uploadedFiles: working.uploadedFiles,
            plan,
            unit: unitPlan,
            sourceExcerpt,
            previousQuestionSignatures,
          },
          controller.signal,
        );
        working = {
          ...working,
          generatedUnits: [...working.generatedUnits, unitResponse.unit],
          activeUnitIndex: unitPlan.unitIndex + 1,
          model: unitResponse.meta.model,
          source: unitResponse.meta.source,
          updatedAt: new Date().toISOString(),
        };
        setAcademyJob(working);
        persistAcademyJob(working);
        const partialResult = academyResultFromJob(working);
        if (partialResult) setResult(partialResult);
      }

      if (working.plan && working.generatedUnits.length === working.plan.units.length) {
        working = { ...working, status: "completed", updatedAt: new Date().toISOString() };
        setAcademyJob(working);
        persistAcademyJob(working);
        const completedResult = academyResultFromJob(working);
        if (completedResult) setResult(completedResult);
      }
    } catch (caught) {
      if (academyControlRef.current.cancel) return;
      const message = caught instanceof Error ? caught.message : "장편 교재 생성 중 문제가 발생했습니다.";
      const failed = {
        ...working,
        status: "failed" as const,
        error: message,
        updatedAt: new Date().toISOString(),
      };
      setAcademyJob(failed);
      persistAcademyJob(failed);
      setError(`장편 교재 생성이 중단되었습니다. ${message} 완성된 단원 다음부터 다시 시작할 수 있습니다.`);
    } finally {
      academyAbortRef.current = null;
      setAcademyRunning(false);
    }
  }, []);

  const startAcademyGeneration = useCallback(() => {
    const instruction = userInstruction.trim();
    if (!instruction) {
      setError("학생 수준과 만들고 싶은 교재를 자연어로 입력해주세요.");
      return;
    }
    if (extractingCount > 0) {
      setError("첨부 파일 본문을 읽고 있습니다. 분석이 끝난 뒤 다시 눌러주세요.");
      return;
    }
    const inferredLevel = inferLearnerLevelFromPrompt(instruction);
    const inferredPages = inferTargetPagesFromPrompt(instruction);
    const inferredTemplate = inferTemplateFromPrompt(instruction);
    const sourceForJob = sourceCorpus.trim() || instruction;
    const now = new Date().toISOString();
    const nextJob: AcademyTextbookJob = {
      id: `academy-job-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      status: "planning",
      userInstruction: instruction,
      learnerLevel: inferredLevel,
      targetPages: inferredPages,
      templateId: inferredTemplate,
      sourceText: sourceForJob,
      uploadedFiles: attachments.map((item) => toPremiumUploadedFileMetadata(item.file)),
      generatedUnits: [],
      activeUnitIndex: 0,
    };
    setLearnerLevel(inferredLevel);
    setTargetPages(inferredPages);
    setSelectedTemplateId(inferredTemplate);
    setPreviewOpen(false);
    setResult(null);
    setAcademyJob(nextJob);
    persistAcademyJob(nextJob);
    void runAcademyJob(nextJob);
  }, [attachments, extractingCount, runAcademyJob, sourceCorpus, userInstruction]);

  const pauseAcademyGeneration = useCallback(() => {
    academyControlRef.current.pause = true;
    setAttachmentNotice("현재 단원 생성을 마치면 안전하게 일시정지합니다.");
  }, []);

  const cancelAcademyGeneration = useCallback(() => {
    academyControlRef.current = { pause: false, cancel: true };
    academyAbortRef.current?.abort();
    setAcademyRunning(false);
    setAcademyJob(null);
    setResult(null);
    setError(null);
    setAttachmentNotice("장편 교재 작업을 취소했습니다.");
    persistAcademyJob(null);
  }, []);

  const academyProgress = academyJob?.plan
    ? Math.round((academyJob.generatedUnits.length / academyJob.plan.unitCount) * 100)
    : academyJob
      ? 3
      : 0;

  const handlePromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !academyRunning && !academyJob) {
        event.preventDefault();
        startAcademyGeneration();
      }
    },
    [academyJob, academyRunning, startAcademyGeneration],
  );

  return (
    <DashboardShell>
      <main className={styles.studioMain}>
        <section className={styles.studioStage} aria-label="AI 교재 자동 생성">
          <div
            className={`${styles.neonComposer}${isDragging ? ` ${styles.neonComposerDragging}` : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!academyRunning) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleComposerDrop}
          >
            <div className={styles.studioSignal} aria-hidden="true">
              <span />
              <b>AI TEXTBOOK STUDIO</b>
            </div>

            <textarea
              className={styles.neonTextarea}
              value={userInstruction}
              onChange={(event) => {
                setUserInstruction(event.target.value);
                setError(null);
              }}
              onKeyDown={handlePromptKeyDown}
              placeholder="예: 고2 영어 중위권 학생이 수능 빈칸과 순서 문제를 단계적으로 익히는 100쪽 교재를 만들어줘. 각 개념은 쉬운 설명과 대표 예시로 시작하고, 단원 마지막에는 실전 문제와 자세한 오답 해설을 넣어줘."
              aria-label="만들고 싶은 교재"
              disabled={academyRunning || academyJob !== null}
            />

            {attachments.length > 0 ? (
              <div className={styles.neonFiles} aria-label="첨부 파일">
                {attachments.map((item) => {
                  const source = attachmentSources[item.id];
                  return (
                    <span key={item.id} className={styles.neonFileChip}>
                      {source?.status === "extracting" ? <LoaderCircle className={styles.inlineSpinner} size={13} aria-hidden="true" /> : <Paperclip size={13} aria-hidden="true" />}
                      <b>{item.file.name}</b>
                      <em>{source?.message || "첨부 완료"}</em>
                      {!academyRunning && !academyJob ? (
                        <button type="button" onClick={() => removeAttachment(item.id)} aria-label={`${item.file.name} 제거`} title="파일 제거">
                          <X size={13} aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {academyJob ? (
              <div className={styles.neonJob} aria-live="polite">
                <div className={styles.neonJobCopy}>
                  {academyRunning ? <LoaderCircle className={styles.jobSpinner} size={18} aria-hidden="true" /> : <BookOpenCheck size={18} aria-hidden="true" />}
                  <div>
                    <strong>
                      {academyJob.status === "completed"
                        ? "교재 제작이 완료되었습니다"
                        : academyJob.plan
                          ? `${academyJob.plan.title} 제작 중`
                          : "교재의 전체 구조를 설계하고 있습니다"}
                    </strong>
                    <span>
                      {academyJob.plan
                        ? `${academyJob.generatedUnits.length}/${academyJob.plan.unitCount}개 단원 · ${academyJob.plan.targetPages}쪽 · ${academyProgress}%`
                        : `${academyJob.targetPages}쪽 · ${academyProgress}%`}
                    </span>
                  </div>
                </div>
                <div className={styles.neonProgress} aria-label={`교재 생성 진행률 ${academyProgress}%`}>
                  <span style={{ width: `${academyProgress}%` }} />
                </div>
                <div className={styles.neonJobActions}>
                  {academyRunning ? (
                    <button type="button" className={styles.neonIconButton} onClick={pauseAcademyGeneration} aria-label="현재 단원 후 일시정지" title="현재 단원 후 일시정지">
                      <Pause size={17} aria-hidden="true" />
                    </button>
                  ) : academyJob.status !== "completed" ? (
                    <button type="button" className={styles.neonCommandButton} onClick={() => void runAcademyJob(academyJob)}>
                      <Play size={17} aria-hidden="true" /> 남은 단원 이어서 생성
                    </button>
                  ) : result ? (
                    <button type="button" className={styles.neonCommandButton} onClick={() => setPreviewOpen(true)}>
                      <BookOpenCheck size={17} aria-hidden="true" /> 완성 교재 열기
                    </button>
                  ) : null}
                  <button type="button" className={styles.neonIconButton} onClick={cancelAcademyGeneration} aria-label="현재 작업 지우기" title="현재 작업 지우기">
                    {academyRunning ? <Square size={15} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            ) : null}

            {error || attachmentNotice ? (
              <p className={error ? styles.neonError : styles.neonNotice}>{error || attachmentNotice}</p>
            ) : null}

            <div className={styles.neonFooter}>
              <input
                ref={fileInputRef}
                className={styles.hiddenFileInput}
                type="file"
                multiple
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className={styles.neonIconButton}
                onClick={() => fileInputRef.current?.click()}
                disabled={academyRunning || academyJob !== null}
                aria-label="참고 자료 첨부"
                title="참고 자료 첨부"
              >
                <Paperclip size={18} aria-hidden="true" />
              </button>
              <span className={styles.neonHint}>
                {extractingCount > 0 ? `파일 ${extractingCount}개 분석 중` : attachments.length > 0 ? `자료 ${attachments.length}개 준비됨` : "자료 첨부"}
              </span>
              {!academyJob ? (
                <button
                  type="button"
                  className={styles.neonSendButton}
                  onClick={startAcademyGeneration}
                  disabled={!userInstruction.trim() || academyRunning || extractingCount > 0}
                  aria-label="교재 생성 시작"
                  title="교재 생성 시작"
                >
                  {extractingCount > 0 ? <LoaderCircle className={styles.inlineSpinner} size={19} aria-hidden="true" /> : <ArrowUp size={20} aria-hidden="true" />}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {previewOpen && result ? (
          <div className={styles.previewOverlay} role="dialog" aria-modal="true" aria-label="완성 교재 미리보기">
            <button type="button" className={styles.previewClose} onClick={() => setPreviewOpen(false)} aria-label="미리보기 닫기" title="닫기">
              <X size={22} aria-hidden="true" />
            </button>
            <div className={styles.previewScroll}>
              {result.mode === "premium" ? (
                <PremiumTextbookPreview
                  textbook={result.textbook}
                  template={getXUniversePremiumTemplate(result.templateId) ?? selectedTemplate}
                  uploadedFiles={result.uploadedFiles}
                />
              ) : (
                <TextbookAutoPrintView
                  bookTitle={result.title}
                  units={result.units}
                  answerKeyLayout={result.answerKeyLayout}
                  answerKeyItems={[]}
                />
              )}
            </div>
          </div>
        ) : null}

        <div hidden aria-hidden="true">
          <button type="button" onClick={() => void generate("worksheet")}>{busyMode}</button>
          <button type="button" onClick={() => void generate("workbook")}>{learnerLevel}</button>
          <button type="button" onClick={() => void generate("premium")}>{targetPages}</button>
        </div>
      </main>
    </DashboardShell>
  );

  /* Legacy multi-control editor kept in source for rollback, intentionally not rendered.
  return (
    <DashboardShell light>
      <main className={styles.main}>
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>{BRAND_APP_NAME}</p>
            <h1 className={styles.title}>AI 교재 자동 생성</h1>
            <p className={styles.lead}>
              학생 수준과 수업 목표를 적고 자료를 올리면, 개념 설명부터 수준별 문제와 해설까지 실제 수업용 교재로 구성합니다.
            </p>
          </header>

          <section className={styles.composer} aria-label="AI 교재 자동 생성">
            <div className={styles.academyHeader}>
              <div className={styles.academyTitleRow}>
                <BookOpen aria-hidden="true" size={22} />
                <div>
                  <h2>학원용 장편 교재 제작</h2>
                  <p>50~200쪽 교재를 전체 설계한 뒤 단원별로 생성합니다.</p>
                </div>
              </div>
              <span className={styles.academyBadge}>개념 · 문제 · 정답 · 해설</span>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>만들고 싶은 교재</span>
              <textarea
                className={styles.instructionTextarea}
                value={userInstruction}
                onChange={(event) => setUserInstruction(event.target.value)}
                placeholder="예: 고2 영어 중위권 학생이 수능 빈칸과 순서 문제를 단계적으로 익히는 교재를 만들어줘. 각 개념은 쉬운 설명과 대표 예시로 시작하고, 단원 마지막에는 실전 문제와 자세한 오답 해설을 넣어줘."
                disabled={academyRunning}
              />
            </label>

            <div className={styles.academyControls}>
              <label className={styles.selectField}>
                <span className={styles.label}>학생 수준</span>
                <select value={learnerLevel} onChange={(event) => setLearnerLevel(event.target.value as AcademyLearnerLevel)} disabled={academyRunning}>
                  {LEARNER_LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <fieldset className={styles.pageField} disabled={academyRunning}>
                <legend className={styles.label}>목표 분량</legend>
                <div className={styles.pageSegments}>
                  {TARGET_PAGE_OPTIONS.map((pageCount) => (
                    <button
                      key={pageCount}
                      type="button"
                      className={targetPages === pageCount ? styles.pageSegmentActive : styles.pageSegment}
                      onClick={() => setTargetPages(pageCount)}
                      aria-pressed={targetPages === pageCount}
                    >
                      {pageCount}쪽
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>교재 원문과 참고 자료</span>
              <textarea
                className={styles.textarea}
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder="수업 원문, 개념 설명, 기사, 지문, 단어 목록 등을 붙여넣으세요. 파일만 업로드해도 자동으로 읽습니다."
                disabled={academyRunning}
              />
            </label>

            <div className={styles.attachmentBlock}>
              <UniversalFileAttachmentPanel
                title="참고 자료 업로드"
                description="PDF, DOCX, TXT, MD, CSV, JSON, XLS, XLSX는 본문을 자동으로 읽습니다. EBS·수능 자료는 사용 권한이 있는 파일을 올려주세요."
                items={attachments}
                onChange={handleAttachmentsChange}
                disabled={isBusy}
                emptyLabel="교재의 근거가 될 파일을 끌어오거나 추가해 주세요."
                renderItemAction={(item) => {
                  const source = attachmentSources[item.id];
                  if (!source) return null;
                  if (source.status === "ready") {
                    return (
                      <button type="button" className={styles.extractButton} disabled={isBusy} onClick={() => void appendAttachmentText(item)}>
                        <FileCheck2 aria-hidden="true" size={15} /> 원문에도 넣기
                      </button>
                    );
                  }
                  return <span className={`${styles.fileStatus} ${styles[`fileStatus_${source.status}`]}`}>{source.message}</span>;
                }}
              />
              {attachmentNotice ? <p className={styles.attachmentNotice}>{attachmentNotice}</p> : null}
            </div>

            <div className={styles.templateBlock}>
              <div className={styles.templateTitleRow}>
                <div>
                  <span className={styles.label}>교재 디자인</span>
                  <p>{selectedTemplate.name} · {selectedTemplate.designTone}</p>
                </div>
              </div>
              <PremiumTemplateSelector
                templates={xuniversePremiumTemplates}
                selectedId={selectedTemplateId}
                onSelect={setSelectedTemplateId}
                disabled={academyRunning}
              />
            </div>

            <div className={styles.sourcePolicy}>
              <CheckCircle2 aria-hidden="true" size={17} />
              <span>제공 자료의 개념과 출제 경향을 분석해 새로운 설명과 문항을 만듭니다. 원문 지문이나 출판사 디자인은 복제하지 않습니다.</span>
            </div>

            {academyJob ? (
              <section className={styles.jobPanel} aria-live="polite">
                <div className={styles.jobTopline}>
                  <div>
                    <strong>
                      {academyJob.status === "completed"
                        ? "교재 제작 완료"
                        : academyJob.plan
                          ? `${academyJob.plan.title} 제작 중`
                          : "전체 목차와 페이지를 설계하는 중"}
                    </strong>
                    <span>
                      {academyJob.plan
                        ? `${academyJob.generatedUnits.length}/${academyJob.plan.unitCount}개 단원 · 목표 ${academyJob.plan.targetPages}쪽 · ${academyJob.plan.questionCount}문항`
                        : `${academyJob.targetPages}쪽 교재 설계`}
                    </span>
                  </div>
                  <em>{academyProgress}%</em>
                </div>
                <div className={styles.progressTrack} aria-label={`교재 생성 진행률 ${academyProgress}%`}>
                  <span style={{ width: `${academyProgress}%` }} />
                </div>
                {academyJob.plan ? (
                  <div className={styles.pageAllocation}>
                    <span>개념 {academyJob.plan.pageAllocation.conceptPages}쪽</span>
                    <span>문제 {academyJob.plan.pageAllocation.practicePages}쪽</span>
                    <span>정답·해설 {academyJob.plan.pageAllocation.answerPages}쪽</span>
                  </div>
                ) : null}
                <div className={styles.jobActions}>
                  {academyRunning ? (
                    <button type="button" className={styles.secondaryButton} onClick={pauseAcademyGeneration}>
                      <Pause aria-hidden="true" size={17} /> 현재 단원 후 일시정지
                    </button>
                  ) : academyJob.status !== "completed" ? (
                    <button type="button" className={styles.resumeButton} onClick={() => void runAcademyJob(academyJob)}>
                      <Play aria-hidden="true" size={17} /> 남은 단원 이어서 생성
                    </button>
                  ) : (
                    <button type="button" className={styles.secondaryButton} onClick={startAcademyGeneration}>
                      <RotateCcw aria-hidden="true" size={17} /> 같은 설정으로 새로 만들기
                    </button>
                  )}
                  <button type="button" className={styles.cancelButton} onClick={cancelAcademyGeneration}>
                    <Square aria-hidden="true" size={16} /> 작업 지우기
                  </button>
                </div>
              </section>
            ) : (
              <button type="button" className={styles.academyButton} disabled={isBusy || extractingCount > 0} onClick={startAcademyGeneration}>
                <Sparkles aria-hidden="true" size={19} />
                {extractingCount > 0 ? `파일 ${extractingCount}개 분석 중...` : `${targetPages}쪽 학원용 교재 제작 시작`}
              </button>
            )}

            <div className={styles.quickSection}>
              <div>
                <strong>빠른 1회 생성</strong>
                <span>기존 학습지 모듈과 워크북·프리미엄 생성 방식은 그대로 사용할 수 있습니다.</span>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.button} disabled={isBusy} onClick={() => void generate("worksheet")}>
                  {busyMode === "worksheet" ? "생성 중..." : "학습지 자동생성"}
                </button>
                <button type="button" className={styles.button} disabled={isBusy} onClick={() => void generate("workbook")}>
                  {busyMode === "workbook" ? "생성 중..." : "워크북 생성"}
                </button>
                <button type="button" className={styles.button} disabled={isBusy} onClick={() => void generate("premium")}>
                  {busyMode === "premium" ? "생성 중..." : "프리미엄 교재 생성"}
                </button>
              </div>
            </div>
          </section>

          <section className={styles.resultArea} aria-live="polite">
            <h2 className={styles.resultTitle}>생성 결과</h2>
            {busyMode ? (
              <div className={styles.statusCard}>
                <span className={styles.spinner} aria-hidden="true" />
                <p>{busyMode === "premium" ? "개념, 문제, 정답과 해설을 생성하고 있습니다." : "교재를 생성하고 있습니다."}</p>
              </div>
            ) : error ? (
              <div className={styles.errorCard}>{error}</div>
            ) : result ? (
              <article className={styles.documentCard}>
                <div className={styles.resultMeta}>
                  <strong>{result.title}</strong>
                  <span>
                    {modeLabel(result.mode)} · {result.model}
                    {result.mode === "premium" ? ` · ${result.source}` : ""}
                  </span>
                </div>
                {result.mode === "premium" ? (
                  <PremiumTextbookPreview
                    textbook={result.textbook}
                    template={getXUniversePremiumTemplate(result.templateId) ?? selectedTemplate}
                    uploadedFiles={result.uploadedFiles}
                  />
                ) : (
                  <TextbookAutoPrintView
                    bookTitle={result.title}
                    units={result.units}
                    answerKeyLayout={result.answerKeyLayout}
                    answerKeyItems={[]}
                  />
                )}
              </article>
            ) : academyRunning ? (
              <div className={styles.statusCard}>
                <span className={styles.spinner} aria-hidden="true" />
                <p>전체 교재 구조를 설계하고 있습니다. 설계가 끝나면 완성된 단원부터 바로 미리보기에 표시됩니다.</p>
              </div>
            ) : (
              <div className={styles.emptyCard}>교재 조건과 자료를 입력한 뒤 제작을 시작해주세요.</div>
            )}
          </section>
        </div>
      </main>
    </DashboardShell>
  );
  */
}
