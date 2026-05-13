import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { DashboardShell } from "@/components/DashboardShell";
import { LocalDocumentAutomationPanel } from "@/components/localDocumentAuto/LocalDocumentAutomationPanel";
import { TextbookAutoAnswerKeyPrintView } from "@/components/textbookAuto/TextbookAutoAnswerKeyPrintView";
import { TextbookAutoMasterBookPanel } from "@/components/textbookAuto/TextbookAutoMasterBookPanel";
import { PassageClassificationPanel } from "@/components/passageClassification/PassageClassificationPanel";
import { TextbookAutoPrintView } from "@/components/textbookAuto/TextbookAutoPrintView";
import { useAuth } from "@/contexts/AuthContext";
import { storage } from "@/firebase/config";
import { BRAND_APP_NAME } from "@/lib/brand";
import { combineUnitPassage, emptyModule, emptyUnitSetup, getSourceModuleFieldValue, normalizeUnitSetup } from "@/lib/textbookAuto/combineUnitPassage";
import { requestSourceModuleFieldAi } from "@/lib/textbookAuto/requestSourceModuleFieldAi";
import {
  requestReviewStudyBodyAi,
  requestSubQuestionOptionsAi,
  requestSubQuestionStemAi,
  requestUnitEvalOptionsAi,
  requestUnitEvalStemAi,
} from "@/lib/textbookAuto/requestTextbookSetupExtras";
import {
  KEY_SUMMARY_REPORT_HEAD,
  PASSAGE_ANALYSIS_REPORT_HEAD,
} from "@/lib/textbookAuto/reportTemplates";
import { buildPracticeItemsFromReviewSetup, buildUnitTestFromEvalQuestions } from "@/lib/textbookAuto/unitSetupSupplements";
import { parseManuscriptToModules } from "@/lib/localDocumentAuto/manuscriptModules";
import { extractUnitSourceFile } from "@/lib/textbookAuto/extractUnitSourceFile";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { buildAnswerKeyItemsFromUnit, embeddedNeedsAiFill, mergeAnswerKeyAiWithEmbedded } from "@/lib/textbookAuto/buildAnswerKeyItemsFromUnit";
import { buildAnswerKeyStubs } from "@/lib/textbookAuto/buildAnswerKeyStubs";
import { validateDraftUnit } from "@/lib/textbookAuto/validateDraftUnit";
import { applySectionInclusionToUnit, getSectionInclusion, unitForStudentOutput } from "@/lib/textbookAuto/sectionInclusion";
import { requestTextbookAnswerKeyForUnit } from "@/lib/textbookAuto/requestTextbookAnswerKey";
import { downloadTextbookAutoStudentDocx, downloadTextbookAutoTeacherDocx } from "@/lib/textbookAuto/downloadTextbookAutoDocx";
import { publishTextbookAutoPackage } from "@/lib/textbookAuto/publishTextbookAutoPackage";
import {
  createTextbookAutoSession,
  deleteAllAnswerKeysForSession,
  deleteAnswerKeysForUnit,
  loadAnswerKeyItems,
  loadConfirmedUnits,
  loadTextbookAutoSession,
  loadTextbookExportPackage,
  setSessionCurrentUnit,
  updateAnswerKeyItem,
  updateSessionAnswerKeyLayout,
  updateSessionUnitDisplayOrder,
  writeAnswerKeyItems,
  writeUnitConfirmed,
  type TextbookAutoExportPackageDoc,
} from "@/lib/textbookAuto/textbookAutoFirestore";
import type {
  TextbookAnswerKeyItem,
  TextbookAnswerKeyLayout,
  TextbookModuleSubQuestion,
  TextbookSetupPendingFile,
  TextbookSetupPendingMode,
  TextbookUnitContent,
  TextbookUnitEvalQuestionSetup,
  TextbookUnitSetupState,
  TextbookUnitSourceModule,
  SourceModuleFieldKey,
} from "@/types/textbookAuto";
import {
  DEFAULT_TEXTBOOK_ANSWER_KEY_LAYOUT,
  MODULES_ONLY_SECTION_INCLUSION,
  SOURCE_MODULE_FIELD_KEYS,
  SOURCE_MODULE_FIELD_LABELS,
  emptySubQuestion,
  normalizeUnitEvaluationSetup,
} from "@/types/textbookAuto";
import { formatKeyContextForAnswerKey } from "@/lib/textbookAuto/formatKeyContextForAnswerKey";
import { defaultUnitDisplayOrder, orderUnitsForBook } from "@/lib/textbookAuto/orderConfirmedUnits";
import styles from "@/pages/textbookAutoBuilder.module.css";

type BuilderWorkspaceTab = "unitBook" | "worksheet" | "evaluation" | "passageClassify";

const DEFAULT_TOTAL_UNITS = 3;
const MAX_UNITS = 30;
/** Firestore·AI 안정용 단원당 상한 */
const MAX_UNIT_PASSAGE_CHARS = 38_000;
const AI_SOURCE_SLICE = 24_000;

const SOURCE_MODULE_FIELD_UI: readonly {
  key: SourceModuleFieldKey;
  label: string;
  placeholder?: string;
  rows: number;
  multiline: boolean;
  maxLength?: number;
}[] = [
  { key: "passageNo", label: "지문번호", placeholder: "예: 01, A독해-3", rows: 1, multiline: false, maxLength: 80 },
  { key: "passage", label: "지문", placeholder: "본 지문 전체", rows: 12, multiline: true },
  { key: "passageAnalysis", label: "지문분석 (보고서)", rows: 12, multiline: true },
  { key: "keySummary", label: "핵심정리 (보고서)", rows: 12, multiline: true },
];

function sliceForAi(full: string): string {
  if (full.length <= AI_SOURCE_SLICE) return full;
  return full.slice(0, AI_SOURCE_SLICE);
}

/** 세션 시작 시 1단계 지문으로 자동 확정할 단원 본문(원고 모듈만) + 확인학습·단원평가 */
function buildInitialConfirmedUnit(
  unitIndex: number,
  passage: string,
  setup: TextbookUnitSetupState,
): TextbookUnitContent {
  const passageMods = parseManuscriptToModules(sliceForAi(passage));
  const nSetup = normalizeUnitSetup(setup);
  const practice = buildPracticeItemsFromReviewSetup(nSetup.reviewStudy);
  const unitTest = buildUnitTestFromEvalQuestions(nSetup.unitEvaluation.questions);
  const wantsUnitTest = nSetup.unitEvaluation.mcqCount > 0 || nSetup.unitEvaluation.shortCount > 0;
  const inc = {
    ...MODULES_ONLY_SECTION_INCLUSION,
    practice: practice.length > 0,
    unitTest: wantsUnitTest,
  };
  return {
    unitTitle: `제 ${unitIndex + 1}단원`,
    keyConcepts: [],
    contentStudy: [],
    coreSummary: [],
    practice,
    unitTest,
    manuscriptModules: passageMods.length > 0 ? passageMods : [],
    sectionInclusion: inc,
  };
}

export function TextbookAutoBuilderPage() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const [workspaceTab, setWorkspaceTab] = useState<BuilderWorkspaceTab>("unitBook");
  const printRef = useRef<HTMLDivElement>(null);
  const answerKeyPrintRef = useRef<HTMLDivElement>(null);

  const [bookTitle, setBookTitle] = useState("");
  const [totalUnits, setTotalUnits] = useState(DEFAULT_TOTAL_UNITS);
  const [unitInputs, setUnitInputs] = useState<TextbookUnitSetupState[]>(() =>
    Array.from({ length: DEFAULT_TOTAL_UNITS }, () => emptyUnitSetup()),
  );
  /** 세션 시작 시 고정된 단원별 지문 (생성 단계에서만 사용) */
  const [sessionUnitPassages, setSessionUnitPassages] = useState<string[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [confirmedUnits, setConfirmedUnits] = useState<{ unitIndex: number; unit: TextbookUnitContent }[]>([]);
  /** 학생용 본문·Word 등 표시 순서 (unitIndex 순열); 세션 메타와 동기 */
  const [unitDisplayOrder, setUnitDisplayOrder] = useState<number[] | null>(null);
  const [answerKeyLayout, setAnswerKeyLayout] = useState<TextbookAnswerKeyLayout>(DEFAULT_TEXTBOOK_ANSWER_KEY_LAYOUT);
  const [busy, setBusy] = useState(false);
  const [extractBusyId, setExtractBusyId] = useState<string | null>(null);
  /** 모듈 칸별 AI 생성 중 — `${unitIndex}|${moduleId}|${field}` */
  const [sourceFieldAiBusyKey, setSourceFieldAiBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answerKeyItems, setAnswerKeyItems] = useState<TextbookAnswerKeyItem[]>([]);
  const [docxBusy, setDocxBusy] = useState<"student" | "teacher" | null>(null);
  const [phase2UnitBusy, setPhase2UnitBusy] = useState<number | null>(null);
  const [exportPackage, setExportPackage] = useState<TextbookAutoExportPackageDoc | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);

  const isComplete = sessionId !== null && currentUnitIndex >= totalUnits;
  const displayOrderedUnits = useMemo(
    () => orderUnitsForBook(confirmedUnits, unitDisplayOrder),
    [confirmedUnits, unitDisplayOrder],
  );

  useEffect(() => {
    if (!uid || !sessionId) return;
    let cancelled = false;
    void loadTextbookAutoSession(uid, sessionId).then((s) => {
      if (cancelled || !s) return;
      if (s.answerKeyLayout === "inline" || s.answerKeyLayout === "appendix") setAnswerKeyLayout(s.answerKeyLayout);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, sessionId]);

  useEffect(() => {
    setUnitInputs((prev) => {
      if (prev.length === totalUnits) return prev;
      if (prev.length > totalUnits) return prev.slice(0, totalUnits);
      const add: TextbookUnitSetupState[] = Array.from(
        { length: totalUnits - prev.length },
        () => emptyUnitSetup(),
      );
      return [...prev, ...add];
    });
  }, [totalUnits]);

  const printBook = useReactToPrint({
    contentRef: printRef,
    documentTitle: () =>
      bookTitle.trim() ? `Xtudy_Textbook_${bookTitle.trim().slice(0, 24)}` : "Xtudy_Textbook",
    pageStyle: REACT_TO_PRINT_A4_PAGE_STYLE,
  });

  const printAnswerKey = useReactToPrint({
    contentRef: answerKeyPrintRef,
    documentTitle: () =>
      bookTitle.trim()
        ? `Xtudy_Textbook_Answers_${bookTitle.trim().slice(0, 20)}`
        : "Xtudy_Textbook_Answers",
    pageStyle: REACT_TO_PRINT_A4_PAGE_STYLE,
  });

  const resetSession = useCallback(() => {
    setSessionId(null);
    setSessionUnitPassages(null);
    setCurrentUnitIndex(0);
    setConfirmedUnits([]);
    setAnswerKeyItems([]);
    setExportPackage(null);
    setMsg(null);
    setErr(null);
    setUnitDisplayOrder(null);
    setAnswerKeyLayout(DEFAULT_TEXTBOOK_ANSWER_KEY_LAYOUT);
  }, []);

  /** 2단계 → 1단계(지문 설정). 세션 UI만 끊음 — Firestore 데이터는 유지됨 */
  const goBackToStepOne = useCallback(() => {
    if (!sessionId) return;
    const ok = window.confirm(
      "1단계(단원별 지문 설정)로 돌아갑니다. 이 화면의 세션 연결이 끊기며, 저장하지 않은 편집 내용은 사라질 수 있습니다. (임시저장·확정은 이미 서버에 반영된 경우 유지됩니다.) 계속할까요?",
    );
    if (!ok) return;
    resetSession();
  }, [sessionId, resetSession]);

  useEffect(() => {
    if (!uid || !sessionId || !isComplete) return;
    let cancelled = false;
    void loadAnswerKeyItems(uid, sessionId).then((rows) => {
      if (!cancelled) setAnswerKeyItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, sessionId, isComplete]);

  useEffect(() => {
    if (!uid || !sessionId || !isComplete) return;
    let cancelled = false;
    void loadTextbookExportPackage(uid, sessionId).then((p) => {
      if (!cancelled) setExportPackage(p);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, sessionId, isComplete]);

  useEffect(() => {
    if (!uid || !sessionId || !isComplete) return;
    let cancelled = false;
    const n = confirmedUnits.length;
    if (n === 0) return;
    void loadTextbookAutoSession(uid, sessionId).then((s) => {
      if (cancelled) return;
      const o = s?.unitDisplayOrder;
      if (o && o.length === n) setUnitDisplayOrder(o);
      else setUnitDisplayOrder(defaultUnitDisplayOrder(n));
    });
    return () => {
      cancelled = true;
    };
  }, [uid, sessionId, isComplete, confirmedUnits.length]);

  const goSetupAddUnit = useCallback(() => {
    setErr(null);
    const n = Math.min(MAX_UNITS, Math.max(1, Math.floor(totalUnits)));
    if (n >= MAX_UNITS) {
      setErr(`단원은 최대 ${MAX_UNITS}개까지입니다.`);
      return;
    }
    const nextN = n + 1;
    setTotalUnits(nextN);
    setMsg(`제 ${nextN}단원 블록이 추가되었습니다.`);
  }, [totalUnits]);

  const removeSetupUnit = useCallback((unitIndexToRemove: number) => {
    setErr(null);
    const n = Math.min(MAX_UNITS, Math.max(1, Math.floor(totalUnits)));
    if (n <= 1) {
      setErr("단원은 최소 1개가 필요합니다.");
      return;
    }
    if (unitIndexToRemove < 0 || unitIndexToRemove >= n) return;
    if (
      !window.confirm(
        `제 ${unitIndexToRemove + 1}단원을 삭제할까요? 이 단원에 입력·추출한 내용이 모두 사라집니다.`,
      )
    ) {
      return;
    }
    const newN = n - 1;
    setUnitInputs((prev) => prev.filter((_, i) => i !== unitIndexToRemove));
    setTotalUnits(newN);
    setMsg(`단원을 삭제했습니다. 현재 총 ${newN}단원입니다.`);
  }, [totalUnits]);

  const startSession = useCallback(async () => {
    setErr(null);
    setMsg(null);
    const title = bookTitle.trim();
    const n = Math.min(MAX_UNITS, Math.max(1, Math.floor(totalUnits)));
    if (!uid) {
      setErr("로그인 정보가 없습니다.");
      return;
    }
    if (!title) {
      setErr("교재 제목을 입력하세요.");
      return;
    }
    const slice = unitInputs.slice(0, n).map((row) => normalizeUnitSetup(row));
    for (let i = 0; i < n; i++) {
      const u = slice[i]!;
      if (u.pendingFiles.length > 0) {
        setErr(`제 ${i + 1}단원: 추출하지 않은 파일이 있습니다. 먼저 「추출」을 누르거나 대기 목록에서 제거하세요.`);
        return;
      }
      for (const mod of u.modules) {
        for (const key of SOURCE_MODULE_FIELD_KEYS) {
          if (mod.fieldModes[key] === "ai" && !getSourceModuleFieldValue(mod, key).trim()) {
            setErr(
              `제 ${i + 1}단원: 「${SOURCE_MODULE_FIELD_LABELS[key]}」이(가) AI 생성으로 선택되었습니다. 「AI 생성」을 실행하거나 「직접 입력」으로 바꿔 주세요.`,
            );
            return;
          }
        }
        for (const sq of mod.subQuestions) {
          if (sq.stemMode === "ai" && !sq.stem.trim()) {
            setErr(
              `제 ${i + 1}단원: 모듈 문항이 AI(발문)인데 비어 있습니다. AI를 실행하거나 직접 입력하세요.`,
            );
            return;
          }
          if (sq.kind === "mcq" && sq.optionsMode === "ai" && !sq.options.trim()) {
            setErr(
              `제 ${i + 1}단원: 객관식 문항이 AI(선택지)인데 비어 있습니다. AI를 실행하거나 직접 입력하세요.`,
            );
            return;
          }
        }
      }
      if (u.reviewStudy.fieldMode === "ai" && !u.reviewStudy.body.trim()) {
        setErr(`제 ${i + 1}단원: 확인학습이 AI인데 내용이 비어 있습니다. 「AI 생성」을 실행하세요.`);
        return;
      }
      for (const eq of u.unitEvaluation.questions) {
        if (eq.stemMode === "ai" && !eq.stem.trim()) {
          setErr(`제 ${i + 1}단원: 단원평가 문항 발문이 AI인데 비어 있습니다.`);
          return;
        }
        if (eq.kind === "mcq" && eq.optionsMode === "ai" && !eq.options.trim()) {
          setErr(`제 ${i + 1}단원: 단원평가 객관식 선택지가 AI인데 비어 있습니다.`);
          return;
        }
      }
    }
    const passages = slice.map((u) => combineUnitPassage(u));
    for (let i = 0; i < n; i++) {
      const t = passages[i]?.trim() ?? "";
      if (!t) {
        setErr(`제 ${i + 1}단원: 모듈을 입력하거나 파일을 추출해 주세요.`);
        return;
      }
      if (t.length > MAX_UNIT_PASSAGE_CHARS) {
        setErr(
          `제 ${i + 1}단원 지문이 너무 깁니다 (${t.length.toLocaleString()}자). 단원당 약 ${MAX_UNIT_PASSAGE_CHARS.toLocaleString()}자 이내로 나눠 주세요.`,
        );
        return;
      }
    }
    setBusy(true);
    try {
      const sid = await createTextbookAutoSession(uid, { title, unitPassages: passages, totalUnits: n });
      const model = "session-auto";
      const confirmed: { unitIndex: number; unit: TextbookUnitContent }[] = [];
      let answerKeyNote = "";

      for (let i = 0; i < n; i++) {
        const setupRow = slice[i]!;
        const raw = buildInitialConfirmedUnit(i, passages[i]!, setupRow);
        const inc = raw.sectionInclusion ?? MODULES_ONLY_SECTION_INCLUSION;
        const toSave = applySectionInclusionToUnit(raw, inc);
        const v = validateDraftUnit(toSave, {
          practiceMin: inc.practice ? 1 : 0,
          unitTestMcq: inc.unitTest ? setupRow.unitEvaluation.mcqCount : 0,
          unitTestShort: inc.unitTest ? setupRow.unitEvaluation.shortCount : 0,
          sectionInclusion: inc,
        });
        if (v) {
          throw new Error(`제 ${i + 1}단원: ${v}`);
        }
        await writeUnitConfirmed(uid, sid, i, toSave, model);
        confirmed.push({ unitIndex: i, unit: toSave });

        try {
          const passageRaw = passages[i] ?? "";
          const passageSnippet = sliceForAi(passageRaw);
          await deleteAnswerKeysForUnit(uid, sid, i);
          const outForKey = unitForStudentOutput(toSave);
          const embedded = buildAnswerKeyItemsFromUnit(i, outForKey);
          if (embedded.length > 0) {
            const incForKey = getSectionInclusion(toSave);
            let itemsToWrite = embedded;
            let modelUsed = "embedded";
            if (embedded.some(embeddedNeedsAiFill)) {
              const stubs = buildAnswerKeyStubs(i, outForKey);
              try {
                const { items: aiItems, meta } = await requestTextbookAnswerKeyForUnit({
                  bookTitle: title,
                  unitTitle: toSave.unitTitle,
                  unitIndex: i,
                  stubs,
                  sourceExcerpt: passageSnippet.trim() || undefined,
                  unitKeyContext: formatKeyContextForAnswerKey(toSave, incForKey),
                });
                itemsToWrite = mergeAnswerKeyAiWithEmbedded(embedded, aiItems);
                modelUsed = meta.model;
              } catch {
                itemsToWrite = embedded;
                modelUsed = "embedded";
                answerKeyNote =
                  " (일부 단원에서 AI 정답·해설 보완에 실패했을 수 있습니다. 3단계에서 확인하세요.)";
              }
            }
            await writeAnswerKeyItems(uid, sid, itemsToWrite, modelUsed);
          }
        } catch (akErr) {
          answerKeyNote = ` (정답·해설 자동 저장 중 오류: ${akErr instanceof Error ? akErr.message : "오류"} — 3단계에서 재시도할 수 있습니다.)`;
        }
      }

      await setSessionCurrentUnit(uid, sid, n);
      const akRows = await loadAnswerKeyItems(uid, sid);

      setSessionId(sid);
      setTotalUnits(n);
      setSessionUnitPassages(passages);
      setCurrentUnitIndex(n);
      setConfirmedUnits(confirmed);
      setUnitDisplayOrder(defaultUnitDisplayOrder(n));
      setAnswerKeyItems(akRows);
      setMsg(
        `교재 세션을 시작하고 ${n}개 단원을 1단계 원고 모듈로 확정했습니다.${answerKeyNote} 아래에서 순서·정답·해설·출력을 진행하세요.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "세션을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [uid, bookTitle, unitInputs, totalUnits]);

  const refreshConfirmedForPrint = useCallback(async () => {
    if (!uid || !sessionId) return;
    const rows = await loadConfirmedUnits(uid, sessionId);
    setConfirmedUnits(rows);
    const sess = await loadTextbookAutoSession(uid, sessionId);
    const n = rows.length;
    const o = sess?.unitDisplayOrder;
    if (o && o.length === n) setUnitDisplayOrder(o);
    else if (n > 0) setUnitDisplayOrder(defaultUnitDisplayOrder(n));
    if (sess?.answerKeyLayout === "inline" || sess?.answerKeyLayout === "appendix") {
      setAnswerKeyLayout(sess.answerKeyLayout);
    }
    const ak = await loadAnswerKeyItems(uid, sessionId);
    setAnswerKeyItems(ak);
    const pkg = await loadTextbookExportPackage(uid, sessionId);
    setExportPackage(pkg);
    setMsg("단원·정답·패키지 정보를 Firestore에서 다시 불러왔습니다.");
  }, [uid, sessionId]);

  const runPhase2All = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!uid || !sessionId) return;
    const sorted = [...confirmedUnits].sort((a, b) => a.unitIndex - b.unitIndex);
    if (sorted.length === 0) {
      setErr("확정된 단원이 없습니다.");
      return;
    }
    setBusy(true);
    try {
      await deleteAllAnswerKeysForSession(uid, sessionId);
      const title = bookTitle.trim() || "교재";
      let totalWritten = 0;
      for (const { unitIndex, unit } of sorted) {
        const outForKey = unitForStudentOutput(unit);
        const embedded = buildAnswerKeyItemsFromUnit(unitIndex, outForKey);
        if (embedded.length === 0) continue;
        const passageSnippet = sliceForAi(sessionUnitPassages?.[unitIndex] ?? "");
        const incForKey = getSectionInclusion(unit);
        let itemsToWrite = embedded;
        let modelUsed = "embedded";
        if (embedded.some(embeddedNeedsAiFill)) {
          const stubs = buildAnswerKeyStubs(unitIndex, outForKey);
          try {
            const { items: aiItems, meta } = await requestTextbookAnswerKeyForUnit({
              bookTitle: title,
              unitTitle: unit.unitTitle,
              unitIndex,
              stubs,
              sourceExcerpt: passageSnippet.trim() || undefined,
              unitKeyContext: formatKeyContextForAnswerKey(unit, incForKey),
            });
            itemsToWrite = mergeAnswerKeyAiWithEmbedded(embedded, aiItems);
            modelUsed = meta.model;
          } catch {
            itemsToWrite = embedded;
            modelUsed = "embedded";
          }
        }
        await writeAnswerKeyItems(uid, sessionId, itemsToWrite, modelUsed);
        totalWritten += itemsToWrite.length;
      }
      const rows = await loadAnswerKeyItems(uid, sessionId);
      setAnswerKeyItems(rows);
      setMsg(
        totalWritten > 0
          ? `3단계(AI): ${totalWritten}개 문항의 정답·해설을 저장했습니다. 아래에서 수정·Word 내보내기를 할 수 있습니다.`
          : "확인학습·단원평가 문항이 없어 저장할 항목이 없습니다.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "정답·해설 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [uid, sessionId, confirmedUnits, bookTitle, sessionUnitPassages]);

  const patchSourceModule = useCallback(
    (unitIndex: number, moduleId: string, patch: Partial<Omit<TextbookUnitSourceModule, "id">>) => {
      setUnitInputs((prev) => {
        const next = [...prev];
        const row = normalizeUnitSetup(next[unitIndex]);
        row.modules = row.modules.map((mod) => (mod.id === moduleId ? { ...mod, ...patch } : mod));
        next[unitIndex] = row;
        return next;
      });
    },
    [],
  );

  const patchModuleFieldMode = useCallback(
    (unitIndex: number, moduleId: string, field: SourceModuleFieldKey, mode: "manual" | "ai") => {
      setUnitInputs((prev) => {
        const next = [...prev];
        const row = normalizeUnitSetup(next[unitIndex]);
        row.modules = row.modules.map((m) =>
          m.id === moduleId ? { ...m, fieldModes: { ...m.fieldModes, [field]: mode } } : m,
        );
        next[unitIndex] = row;
        return next;
      });
    },
    [],
  );

  const runSourceFieldAi = useCallback(
    async (ui: number, mod: TextbookUnitSourceModule, field: SourceModuleFieldKey, moduleOrdinal: number) => {
      setErr(null);
      const busyKey = `${ui}|${mod.id}|${field}`;
      setSourceFieldAiBusyKey(busyKey);
      try {
        const title = bookTitle.trim() || "교재";
        const text = await requestSourceModuleFieldAi({
          bookTitle: title,
          unitIndex: ui,
          moduleOrdinal,
          field,
          module: mod,
        });
        patchSourceModule(ui, mod.id, { [field]: text } as Partial<Omit<TextbookUnitSourceModule, "id">>);
        setMsg(
          `제 ${ui + 1}단원 · 모듈 ${moduleOrdinal} · ${SOURCE_MODULE_FIELD_LABELS[field]}: AI 결과를 넣었습니다. 필요하면 바로 고칠 수 있습니다.`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
      } finally {
        setSourceFieldAiBusyKey(null);
      }
    },
    [bookTitle, patchSourceModule],
  );

  const addSourceModule = useCallback((unitIndex: number) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      row.modules = [...row.modules, emptyModule()];
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const removeSourceModule = useCallback((unitIndex: number, moduleId: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      if (row.modules.length <= 1) return prev;
      row.modules = row.modules.filter((m) => m.id !== moduleId);
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const applyReportTemplateToModule = useCallback(
    (unitIndex: number, moduleId: string, field: "passageAnalysis" | "keySummary") => {
      const head = field === "passageAnalysis" ? PASSAGE_ANALYSIS_REPORT_HEAD : KEY_SUMMARY_REPORT_HEAD;
      setUnitInputs((prev) => {
        const next = [...prev];
        const row = normalizeUnitSetup(next[unitIndex]);
        row.modules = row.modules.map((m) => {
          if (m.id !== moduleId) return m;
          const cur = (field === "passageAnalysis" ? m.passageAnalysis : m.keySummary).trim();
          const text = cur ? `${head.trimEnd()}\n\n${cur}` : head;
          return { ...m, [field]: text };
        });
        next[unitIndex] = row;
        return next;
      });
    },
    [],
  );

  const patchSubQuestion = useCallback(
    (unitIndex: number, moduleId: string, sqId: string, patch: Partial<TextbookModuleSubQuestion>) => {
      setUnitInputs((prev) => {
        const next = [...prev];
        const row = normalizeUnitSetup(next[unitIndex]);
        row.modules = row.modules.map((mod) =>
          mod.id === moduleId
            ? { ...mod, subQuestions: mod.subQuestions.map((sq) => (sq.id === sqId ? { ...sq, ...patch } : sq)) }
            : mod,
        );
        next[unitIndex] = row;
        return next;
      });
    },
    [],
  );

  const addSubQuestion = useCallback((unitIndex: number, moduleId: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      row.modules = row.modules.map((mod) =>
        mod.id === moduleId ? { ...mod, subQuestions: [...mod.subQuestions, emptySubQuestion()] } : mod,
      );
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const removeSubQuestion = useCallback((unitIndex: number, moduleId: string, sqId: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      row.modules = row.modules.map((mod) => {
        if (mod.id !== moduleId) return mod;
        if (mod.subQuestions.length <= 1) return mod;
        return { ...mod, subQuestions: mod.subQuestions.filter((sq) => sq.id !== sqId) };
      });
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const runSubQuestionStemAi = useCallback(
    async (ui: number, mod: TextbookUnitSourceModule, sq: TextbookModuleSubQuestion, moduleOrdinal: number) => {
      setErr(null);
      const bk = `sqStem|${ui}|${mod.id}|${sq.id}`;
      setSourceFieldAiBusyKey(bk);
      try {
        const text = await requestSubQuestionStemAi({
          bookTitle: bookTitle.trim() || "교재",
          unitIndex: ui,
          moduleOrdinal,
          mod,
          sq,
        });
        patchSubQuestion(ui, mod.id, sq.id, { stem: text });
        setMsg(`제 ${ui + 1}단원 · 모듈 ${moduleOrdinal}: 발문 AI를 반영했습니다.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
      } finally {
        setSourceFieldAiBusyKey(null);
      }
    },
    [bookTitle, patchSubQuestion],
  );

  const runSubQuestionOptionsAi = useCallback(
    async (ui: number, mod: TextbookUnitSourceModule, sq: TextbookModuleSubQuestion, moduleOrdinal: number) => {
      setErr(null);
      const bk = `sqOpt|${ui}|${mod.id}|${sq.id}`;
      setSourceFieldAiBusyKey(bk);
      try {
        const text = await requestSubQuestionOptionsAi({
          bookTitle: bookTitle.trim() || "교재",
          unitIndex: ui,
          moduleOrdinal,
          mod,
          sq,
        });
        patchSubQuestion(ui, mod.id, sq.id, { options: text });
        setMsg(`제 ${ui + 1}단원 · 모듈 ${moduleOrdinal}: 선택지 AI를 반영했습니다.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
      } finally {
        setSourceFieldAiBusyKey(null);
      }
    },
    [bookTitle, patchSubQuestion],
  );

  const patchUnitReviewStudy = useCallback((ui: number, patch: Partial<TextbookUnitSetupState["reviewStudy"]>) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[ui]);
      next[ui] = normalizeUnitSetup({ ...row, reviewStudy: { ...row.reviewStudy, ...patch } });
      return next;
    });
  }, []);

  const patchUnitEval = useCallback((ui: number, patch: Partial<TextbookUnitSetupState["unitEvaluation"]>) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[ui]);
      const merged = { ...row.unitEvaluation, ...patch };
      next[ui] = normalizeUnitSetup({ ...row, unitEvaluation: normalizeUnitEvaluationSetup(merged) });
      return next;
    });
  }, []);

  const patchEvalQuestion = useCallback((ui: number, qid: string, patch: Partial<TextbookUnitEvalQuestionSetup>) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[ui]);
      const questions = row.unitEvaluation.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q));
      next[ui] = normalizeUnitSetup({
        ...row,
        unitEvaluation: normalizeUnitEvaluationSetup({ ...row.unitEvaluation, questions }),
      });
      return next;
    });
  }, []);

  const runReviewStudyAi = useCallback(
    async (ui: number) => {
      setErr(null);
      const bk = `rs|${ui}`;
      setSourceFieldAiBusyKey(bk);
      try {
        const row = normalizeUnitSetup(unitInputs[ui]);
        const excerpt = combineUnitPassage(row);
        const text = await requestReviewStudyBodyAi({
          bookTitle: bookTitle.trim() || "교재",
          unitIndex: ui,
          passageExcerpt: excerpt,
          setup: row.reviewStudy,
        });
        patchUnitReviewStudy(ui, { body: text });
        setMsg(`제 ${ui + 1}단원 확인학습 AI를 반영했습니다.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
      } finally {
        setSourceFieldAiBusyKey(null);
      }
    },
    [bookTitle, unitInputs, patchUnitReviewStudy],
  );

  const runUnitEvalStemAi = useCallback(
    async (ui: number, q: TextbookUnitEvalQuestionSetup, ordinal: number) => {
      setErr(null);
      const bk = `evStem|${ui}|${q.id}`;
      setSourceFieldAiBusyKey(bk);
      try {
        const row = normalizeUnitSetup(unitInputs[ui]);
        const excerpt = combineUnitPassage(row);
        const text = await requestUnitEvalStemAi({
          bookTitle: bookTitle.trim() || "교재",
          unitIndex: ui,
          passageExcerpt: excerpt,
          q,
          ordinal,
        });
        patchEvalQuestion(ui, q.id, { stem: text });
        setMsg(`제 ${ui + 1}단원 단원평가 ${ordinal}번 발문 AI를 반영했습니다.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
      } finally {
        setSourceFieldAiBusyKey(null);
      }
    },
    [bookTitle, unitInputs, patchEvalQuestion],
  );

  const runUnitEvalOptionsAi = useCallback(
    async (ui: number, q: TextbookUnitEvalQuestionSetup, ordinal: number) => {
      setErr(null);
      const bk = `evOpt|${ui}|${q.id}`;
      setSourceFieldAiBusyKey(bk);
      try {
        const row = normalizeUnitSetup(unitInputs[ui]);
        const excerpt = combineUnitPassage(row);
        const stem = q.stem.trim();
        if (!stem) {
          setErr("먼저 발문을 입력하거나 AI로 생성하세요.");
          return;
        }
        const text = await requestUnitEvalOptionsAi({
          bookTitle: bookTitle.trim() || "교재",
          unitIndex: ui,
          passageExcerpt: excerpt,
          stem,
          q,
          ordinal,
        });
        patchEvalQuestion(ui, q.id, { options: text });
        setMsg(`제 ${ui + 1}단원 단원평가 ${ordinal}번 선택지 AI를 반영했습니다.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "AI 생성에 실패했습니다.");
      } finally {
        setSourceFieldAiBusyKey(null);
      }
    },
    [bookTitle, unitInputs, patchEvalQuestion],
  );

  const addPendingFiles = useCallback((unitIndex: number, files: File[]) => {
    if (!files.length) return;
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      const batch = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        mode: "all" as TextbookSetupPendingMode,
        fromPage: "",
        toPage: "",
        pagesRaw: "",
      }));
      row.pendingFiles = [...row.pendingFiles, ...batch];
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const patchPending = useCallback((unitIndex: number, pendingId: string, patch: Partial<TextbookSetupPendingFile>) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      row.pendingFiles = row.pendingFiles.map((p) => (p.id === pendingId ? { ...p, ...patch } : p));
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const removePending = useCallback((unitIndex: number, pendingId: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      row.pendingFiles = row.pendingFiles.filter((p) => p.id !== pendingId);
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const removeFileSegment = useCallback((unitIndex: number, segmentId: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = normalizeUnitSetup(next[unitIndex]);
      row.fileSegments = row.fileSegments.filter((s) => s.id !== segmentId);
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const extractPending = useCallback(
    async (unitIndex: number, pendingId: string) => {
      const row = unitInputs[unitIndex];
      const pending = row?.pendingFiles.find((p) => p.id === pendingId);
      if (!pending) return;
      setErr(null);
      setExtractBusyId(pendingId);
      try {
        const fromRaw = pending.fromPage.trim();
        const toRaw = pending.toPage.trim();
        const fromNum = fromRaw === "" ? undefined : Number(fromRaw);
        const toNum = toRaw === "" ? undefined : Number(toRaw);
        const { text, extractNote } = await extractUnitSourceFile(pending.file, {
          mode: pending.mode,
          fromPage: fromNum !== undefined && Number.isFinite(fromNum) ? Math.max(1, Math.floor(fromNum)) : undefined,
          toPage: toNum !== undefined && Number.isFinite(toNum) ? Math.max(1, Math.floor(toNum)) : undefined,
          pagesRaw: pending.pagesRaw,
        });
        if (!text.trim()) {
          setErr(`「${pending.file.name}」에서 추출된 텍스트가 없습니다. 페이지 범위를 확인하세요.`);
          return;
        }
        const segId = crypto.randomUUID();
        setUnitInputs((prev) => {
          const next = [...prev];
          const u = normalizeUnitSetup(next[unitIndex]);
          u.fileSegments = [
            ...u.fileSegments,
            { id: segId, fileName: pending.file.name, extractNote, text },
          ];
          u.pendingFiles = u.pendingFiles.filter((p) => p.id !== pendingId);
          next[unitIndex] = u;
          return next;
        });
        setMsg(`제 ${unitIndex + 1}단원: 「${pending.file.name}」 추출을 추가했습니다.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "추출에 실패했습니다.");
      } finally {
        setExtractBusyId(null);
      }
    },
    [unitInputs],
  );

  const answerKeysByUnit = useMemo(() => {
    const m = new Map<number, TextbookAnswerKeyItem[]>();
    for (const it of answerKeyItems) {
      const arr = m.get(it.unitIndex) ?? [];
      arr.push(it);
      m.set(it.unitIndex, arr);
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([unitIndex, items]) => ({
        unitIndex,
        items: [...items].sort((a, b) => {
          if (a.bucket !== b.bucket) return a.bucket === "practice" ? -1 : 1;
          return a.orderIndex - b.orderIndex;
        }),
      }));
  }, [answerKeyItems]);

  const [savingKeyId, setSavingKeyId] = useState<string | null>(null);

  const saveAnswerKeyEdit = useCallback(
    async (itemId: string, answer: string, explanationBullets: string[]) => {
      if (!uid || !sessionId) return;
      setSavingKeyId(itemId);
      setErr(null);
      try {
        await updateAnswerKeyItem(uid, sessionId, itemId, { answer, explanationBullets });
        setAnswerKeyItems((prev) =>
          prev.map((x) =>
            x.id === itemId
              ? {
                  ...x,
                  answer: answer.trim(),
                  explanationBullets: explanationBullets.map((s) => s.trim()).filter(Boolean).slice(0, 25),
                }
              : x,
          ),
        );
        setMsg("정답·해설을 저장했습니다.");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
      } finally {
        setSavingKeyId(null);
      }
    },
    [uid, sessionId],
  );

  const runPhase2ForUnit = useCallback(
    async (unitIndex: number) => {
      setErr(null);
      setMsg(null);
      if (!uid || !sessionId) return;
      const row = confirmedUnits.find((u) => u.unitIndex === unitIndex);
      if (!row) {
        setErr("해당 단원을 찾을 수 없습니다.");
        return;
      }
      setPhase2UnitBusy(unitIndex);
      try {
        await deleteAnswerKeysForUnit(uid, sessionId, unitIndex);
        const title = bookTitle.trim() || "교재";
        const outForKey = unitForStudentOutput(row.unit);
        const embedded = buildAnswerKeyItemsFromUnit(unitIndex, outForKey);
        if (embedded.length === 0) {
          setMsg(`제 ${unitIndex + 1}단원: 확인학습·단원평가 문항이 없어 건너뜁니다.`);
          const rows = await loadAnswerKeyItems(uid, sessionId);
          setAnswerKeyItems(rows);
          return;
        }
        const passageSnippet = sliceForAi(sessionUnitPassages?.[unitIndex] ?? "");
        const incForKey = getSectionInclusion(row.unit);
        let itemsToWrite = embedded;
        let modelUsed = "embedded";
        let aiFillFailed = false;
        if (embedded.some(embeddedNeedsAiFill)) {
          const stubs = buildAnswerKeyStubs(unitIndex, outForKey);
          try {
            const { items: aiItems, meta } = await requestTextbookAnswerKeyForUnit({
              bookTitle: title,
              unitTitle: row.unit.unitTitle,
              unitIndex,
              stubs,
              sourceExcerpt: passageSnippet.trim() || undefined,
              unitKeyContext: formatKeyContextForAnswerKey(row.unit, incForKey),
            });
            itemsToWrite = mergeAnswerKeyAiWithEmbedded(embedded, aiItems);
            modelUsed = meta.model;
          } catch {
            itemsToWrite = embedded;
            modelUsed = "embedded";
            aiFillFailed = true;
          }
        }
        await writeAnswerKeyItems(uid, sessionId, itemsToWrite, modelUsed);
        const rows = await loadAnswerKeyItems(uid, sessionId);
        setAnswerKeyItems(rows);
        setMsg(
          aiFillFailed
            ? `제 ${unitIndex + 1}단원: 정답·해설 ${itemsToWrite.length}개를 저장했습니다. (AI 보완 실패 — 편집기·3단계에서 채울 수 있습니다.)`
            : `제 ${unitIndex + 1}단원: 정답·해설 ${itemsToWrite.length}개를 저장했습니다.`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "단원 정답·해설 생성에 실패했습니다.");
      } finally {
        setPhase2UnitBusy(null);
      }
    },
    [uid, sessionId, confirmedUnits, bookTitle, sessionUnitPassages],
  );

  const runDownloadStudentDocx = useCallback(async () => {
    if (displayOrderedUnits.length === 0) return;
    setDocxBusy("student");
    setErr(null);
    try {
      await downloadTextbookAutoStudentDocx({
        bookTitle: bookTitle.trim() || "교재",
        units: displayOrderedUnits,
        answerKeyLayout,
        answerKeyItems,
      });
      setMsg("학생용 Word(.docx)를 받았습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Word 내보내기에 실패했습니다.");
    } finally {
      setDocxBusy(null);
    }
  }, [displayOrderedUnits, bookTitle, answerKeyLayout, answerKeyItems]);

  const runDownloadTeacherDocx = useCallback(async () => {
    if (answerKeyItems.length === 0) return;
    setDocxBusy("teacher");
    setErr(null);
    try {
      await downloadTextbookAutoTeacherDocx({
        bookTitle: bookTitle.trim() || "교재",
        unitTitles: displayOrderedUnits.map(({ unitIndex, unit }) => ({ unitIndex, unitTitle: unit.unitTitle })),
        items: answerKeyItems,
      });
      setMsg("교사용 정답·해설 Word(.docx)를 받았습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Word 내보내기에 실패했습니다.");
    } finally {
      setDocxBusy(null);
    }
  }, [answerKeyItems, displayOrderedUnits, bookTitle]);

  const runPublishPackage = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!uid || !sessionId || confirmedUnits.length === 0) return;
    setPackageBusy(true);
    try {
      await publishTextbookAutoPackage({
        uid,
        sessionId,
        bookTitle: bookTitle.trim() || "교재",
        units: displayOrderedUnits,
        answerKeyItems,
        answerKeyLayout,
      });
      const pkg = await loadTextbookExportPackage(uid, sessionId);
      setExportPackage(pkg);
      setMsg("클라우드에 Word 패키지를 저장했습니다. 아래에서 다시 받을 수 있습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "패키지 업로드에 실패했습니다.");
    } finally {
      setPackageBusy(false);
    }
  }, [uid, sessionId, displayOrderedUnits, bookTitle, answerKeyItems, answerKeyLayout]);

  const moveBookUnit = useCallback(
    async (displayPos: number, dir: -1 | 1) => {
      if (!uid || !sessionId || !isComplete) return;
      const n = confirmedUnits.length;
      if (n < 2) return;
      const base = unitDisplayOrder ?? defaultUnitDisplayOrder(n);
      const j = displayPos + dir;
      if (j < 0 || j >= n) return;
      const next = [...base];
      [next[displayPos], next[j]] = [next[j]!, next[displayPos]!];
      setUnitDisplayOrder(next);
      setErr(null);
      try {
        await updateSessionUnitDisplayOrder(uid, sessionId, next);
        setMsg("단원 표시 순서를 바꿨습니다. 학생용 PDF·Word·완성본 본문에 반영됩니다.");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "순서 저장에 실패했습니다.");
      }
    },
    [uid, sessionId, isComplete, confirmedUnits.length, unitDisplayOrder],
  );

  const persistAnswerKeyLayout = useCallback(
    async (layout: TextbookAnswerKeyLayout) => {
      setAnswerKeyLayout(layout);
      if (!uid || !sessionId) return;
      setErr(null);
      try {
        await updateSessionAnswerKeyLayout(uid, sessionId, layout);
        setMsg(
          layout === "inline"
            ? "학생용 본문에 정답·해설을 문항 바로 아래 표시합니다. (인쇄·Word·완성본에 반영)"
            : "정답·해설을 말미 부록으로 둡니다. (인쇄·Word·완성본에 반영)",
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "설정 저장에 실패했습니다.");
      }
    },
    [uid, sessionId],
  );

  const openCloudDownload = useCallback(async (path: string) => {
    if (!path) return;
    setErr(null);
    try {
      const url = await getDownloadURL(storageRef(storage, path));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "다운로드 링크를 열지 못했습니다.");
    }
  }, []);

  const setupUnitCount = Math.min(MAX_UNITS, Math.max(1, Math.floor(totalUnits)));

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>{BRAND_APP_NAME}</p>
            <h1 className={styles.title}>교재 자동 생성 · 통합 작업실</h1>
            {workspaceTab === "unitBook" ? (
              <p className={styles.lead}>
                <strong>교재 제목·단원 수</strong>를 정한 뒤, 같은 화면에서 <strong>단원별 지문·모듈을 자유 순서로</strong> 입력·추출·AI 생성할 수 있습니다. 「교재 생성」으로 세션을 시작할 때만 전 단원이 함께 결합되며, 그때 1단계 내용이 확정되고 정답·해설 초안이 저장됩니다. 이후에는 순서·검수·출력·완성본 작업을 합니다.
              </p>
            ) : workspaceTab === "passageClassify" ? (
              <p className={styles.lead}>
                비정형 원고를 문제 번호·선택지·앵커 태그로 나누어 JSON으로 만든 뒤, 값이 있는 Phase만 HTML로 순서대로 냅니다. 로컬 스크립트 경로는{" "}
                <span className={styles.pathChip}>document-automation/passage-classification/</span> 입니다.
              </p>
            ) : (
              <p className={styles.lead}>
                마커 원고를 모듈로 나눈 뒤 순서·내용을 편집하고 PDF로 내보냅니다. WeasyPrint로 동일 서식을 맞추려면 내려받은 원고·YAML 로 프로젝트 루트의{" "}
                <span className={styles.pathChip}>document-automation/</span> 스크립트를 실행하면 됩니다.
              </p>
            )}
          </header>

          <div className={styles.tabBar} role="tablist" aria-label="문서 작업 유형">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceTab === "unitBook"}
              className={`${styles.tab}${workspaceTab === "unitBook" ? ` ${styles.tabActive}` : ""}`}
              onClick={() => setWorkspaceTab("unitBook")}
            >
              단원별 교재제작
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceTab === "worksheet"}
              className={`${styles.tab}${workspaceTab === "worksheet" ? ` ${styles.tabActive}` : ""}`}
              onClick={() => setWorkspaceTab("worksheet")}
            >
              학습지
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceTab === "evaluation"}
              className={`${styles.tab}${workspaceTab === "evaluation" ? ` ${styles.tabActive}` : ""}`}
              onClick={() => setWorkspaceTab("evaluation")}
            >
              평가문제지
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceTab === "passageClassify"}
              className={`${styles.tab}${workspaceTab === "passageClassify" ? ` ${styles.tabActive}` : ""}`}
              onClick={() => setWorkspaceTab("passageClassify")}
            >
              지문 분류
            </button>
          </div>

          {workspaceTab === "worksheet" ? (
            <LocalDocumentAutomationPanel kind="worksheet" />
          ) : workspaceTab === "evaluation" ? (
            <LocalDocumentAutomationPanel kind="evaluation" />
          ) : workspaceTab === "passageClassify" ? (
            <PassageClassificationPanel />
          ) : !sessionId ? (
            <section className={styles.card} aria-labelledby="setup-h">
              <h2 id="setup-h" className={styles.cardTitle}>
                교재 구성 — 세션 시작 전
              </h2>
              <p className={styles.hint}>
                단원별 입력·추출·AI 생성은 순서와 관계 없이 진행할 수 있습니다. 「교재 생성」은 맨 아래에서만 누르며, 그때 전 단원이 함께 검증·결합됩니다. 미추출
                파일이 있거나 AI 생성으로 비어 있는 칸이 있으면 세션을 열 수 없습니다.
              </p>

              <div className={styles.setupOnePageMeta}>
                <h3 className={styles.unitCardTitle}>교재 정보</h3>
                <label className={styles.field}>
                  <span className={styles.label}>교재 제목</span>
                  <input
                    className={styles.input}
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder="예: 독해 논리 마스터 1단계"
                    maxLength={200}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>총 단원 수 (1–{MAX_UNITS})</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    max={MAX_UNITS}
                    value={totalUnits}
                    onChange={(e) => setTotalUnits(Number(e.target.value) || 1)}
                  />
                </label>
                <p className={styles.hint}>
                  숫자를 바꾸면 아래 단원 블록 개수가 늘거나 줄어듭니다. 「단원 추가」·각 단원의 「이 단원 삭제」로도 조정할 수 있습니다.
                </p>
              </div>

              <div className={styles.setupUnitToolbar}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={goSetupAddUnit}
                  disabled={setupUnitCount >= MAX_UNITS}
                >
                  단원 추가
                </button>
              </div>

              <div className={styles.unitGrid} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                {Array.from({ length: setupUnitCount }, (_, ui) => {
                  const unitState = normalizeUnitSetup(unitInputs[ui]);
                  return (
                    <div key={ui} className={styles.setupUnitBlock}>
                      <div className={styles.unitCard}>
                        <div className={styles.unitCardHead}>
                          <h3 className={styles.unitCardTitle}>제 {ui + 1}단원 — 모듈 구성</h3>
                          <div className={styles.setupUnitToolbar}>
                            <button
                              type="button"
                              className={styles.btnGhost}
                              onClick={() => removeSetupUnit(ui)}
                              disabled={setupUnitCount <= 1}
                            >
                              이 단원 삭제
                            </button>
                            <button type="button" className={styles.btnSecondary} onClick={() => addSourceModule(ui)}>
                              모듈 추가
                            </button>
                          </div>
                        </div>
                        <p className={styles.hint}>
                          카테고리마다 「직접 입력」과 「AI 생성」을 고를 수 있습니다. AI는 같은 모듈의 다른 칸·교재 제목을 참고합니다. 여러 지문 세트는
                          「모듈 추가」·모듈 카드의 「모듈 삭제」로 나눕니다.
                        </p>
                    {unitState.modules.map((mod, mi) => (
                      <div key={mod.id} className={styles.sourceModuleCard}>
                        <div className={styles.sourceModuleToolbar}>
                          <span className={styles.sourceModuleBadge}>모듈 {mi + 1}</span>
                          {unitState.modules.length > 1 ? (
                            <button
                              type="button"
                              className={styles.btnMiniGhost}
                              onClick={() => removeSourceModule(ui, mod.id)}
                            >
                              모듈 삭제
                            </button>
                          ) : null}
                        </div>
                        {SOURCE_MODULE_FIELD_UI.map((spec) => {
                          const mode = mod.fieldModes[spec.key];
                          const val = getSourceModuleFieldValue(mod, spec.key);
                          const bk = `${ui}|${mod.id}|${spec.key}`;
                          const isThisBusy = sourceFieldAiBusyKey === bk;
                          const aiBlocked = sourceFieldAiBusyKey !== null;
                          const onPatchVal = (next: string) =>
                            patchSourceModule(ui, mod.id, {
                              [spec.key]: next,
                            } as Partial<Omit<TextbookUnitSourceModule, "id">>);
                          return (
                            <div key={spec.key}>
                              <div className={styles.sourceModuleField}>
                                <div className={styles.fieldHeadRow}>
                                  <span className={styles.fieldHeadLabel}>{spec.label}</span>
                                  <div className={styles.fieldHeadExtras}>
                                    {spec.key === "passageAnalysis" || spec.key === "keySummary" ? (
                                      <button
                                        type="button"
                                        className={styles.btnMiniGhost}
                                        onClick={() =>
                                          applyReportTemplateToModule(
                                            ui,
                                            mod.id,
                                            spec.key === "passageAnalysis" ? "passageAnalysis" : "keySummary",
                                          )
                                        }
                                      >
                                        보고서 양식 넣기
                                      </button>
                                    ) : null}
                                    <div className={styles.fieldModeToggle} role="group" aria-label={`${spec.label} 입력 방식`}>
                                      <button
                                        type="button"
                                        className={`${styles.fieldModeBtn}${mode === "manual" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                        onClick={() => patchModuleFieldMode(ui, mod.id, spec.key, "manual")}
                                      >
                                        직접 입력
                                      </button>
                                      <button
                                        type="button"
                                        className={`${styles.fieldModeBtn}${mode === "ai" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                        onClick={() => patchModuleFieldMode(ui, mod.id, spec.key, "ai")}
                                      >
                                        AI 생성
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                {mode === "ai" ? (
                                  <div className={styles.fieldAiRow}>
                                    <button
                                      type="button"
                                      className={styles.btnMini}
                                      disabled={aiBlocked}
                                      onClick={() => void runSourceFieldAi(ui, mod, spec.key, mi + 1)}
                                    >
                                      {isThisBusy ? "생성 중…" : "AI 생성"}
                                    </button>
                                    <span className={styles.fieldAiHint}>
                                      OpenAI로 이 칸만 채웁니다. 보고서 머리말·본문 형식을 맞춥니다.
                                    </span>
                                  </div>
                                ) : null}
                                {spec.multiline ? (
                                  <textarea
                                    className={styles.textarea}
                                    rows={spec.rows}
                                    value={val}
                                    onChange={(e) => onPatchVal(e.target.value)}
                                    placeholder={spec.placeholder}
                                  />
                                ) : (
                                  <input
                                    className={styles.input}
                                    value={val}
                                    onChange={(e) => onPatchVal(e.target.value)}
                                    placeholder={spec.placeholder}
                                    maxLength={spec.maxLength}
                                  />
                                )}
                              </div>
                              {spec.key === "passage" ? (
                                <div className={styles.subQuestionsWrap}>
                                  <div className={styles.subQuestionsHead}>
                                    <span className={styles.fieldHeadLabel}>문제 · 선택지 (통합)</span>
                                    <button
                                      type="button"
                                      className={styles.btnSecondary}
                                      onClick={() => addSubQuestion(ui, mod.id)}
                                    >
                                      문항 추가
                                    </button>
                                  </div>
                                  <p className={styles.hint}>
                                    유형(객관식·주관식)과 언어(한국어·영어)를 고른 뒤 발문·선택지를 입력합니다. 객관식만 선택지 칸과 「선택지 AI」가
                                    활성화됩니다.
                                  </p>
                                  {mod.subQuestions.map((sq, sqi) => {
                                    const stemBk = `sqStem|${ui}|${mod.id}|${sq.id}`;
                                    const optBk = `sqOpt|${ui}|${mod.id}|${sq.id}`;
                                    const stemBusy = sourceFieldAiBusyKey === stemBk;
                                    const optBusy = sourceFieldAiBusyKey === optBk;
                                    const sqAiBlocked = sourceFieldAiBusyKey !== null;
                                    return (
                                      <div key={sq.id} className={styles.subQuestionCard}>
                                        <div className={styles.subQuestionToolbar}>
                                          <span className={styles.sourceModuleBadge}>문항 {sqi + 1}</span>
                                          <select
                                            className={styles.select}
                                            value={sq.kind}
                                            onChange={(e) =>
                                              patchSubQuestion(ui, mod.id, sq.id, {
                                                kind: e.target.value as "mcq" | "short",
                                              })
                                            }
                                            aria-label="문항 유형"
                                          >
                                            <option value="mcq">객관식</option>
                                            <option value="short">주관식</option>
                                          </select>
                                          <select
                                            className={styles.select}
                                            value={sq.lang}
                                            onChange={(e) =>
                                              patchSubQuestion(ui, mod.id, sq.id, {
                                                lang: e.target.value as "ko" | "en",
                                              })
                                            }
                                            aria-label="문항 언어"
                                          >
                                            <option value="ko">한국어</option>
                                            <option value="en">영어</option>
                                          </select>
                                          {mod.subQuestions.length > 1 ? (
                                            <button
                                              type="button"
                                              className={styles.btnMiniGhost}
                                              onClick={() => removeSubQuestion(ui, mod.id, sq.id)}
                                            >
                                              문항 삭제
                                            </button>
                                          ) : null}
                                        </div>
                                        <div className={styles.fieldHeadRow}>
                                          <span className={styles.fieldHeadLabel}>발문</span>
                                          <div className={styles.fieldModeToggle} role="group" aria-label="발문 입력 방식">
                                            <button
                                              type="button"
                                              className={`${styles.fieldModeBtn}${sq.stemMode === "manual" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                              onClick={() => patchSubQuestion(ui, mod.id, sq.id, { stemMode: "manual" })}
                                            >
                                              직접 입력
                                            </button>
                                            <button
                                              type="button"
                                              className={`${styles.fieldModeBtn}${sq.stemMode === "ai" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                              onClick={() => patchSubQuestion(ui, mod.id, sq.id, { stemMode: "ai" })}
                                            >
                                              AI 생성
                                            </button>
                                          </div>
                                        </div>
                                        {sq.stemMode === "ai" ? (
                                          <div className={styles.fieldAiRow}>
                                            <button
                                              type="button"
                                              className={styles.btnMini}
                                              disabled={sqAiBlocked}
                                              onClick={() => void runSubQuestionStemAi(ui, mod, sq, mi + 1)}
                                            >
                                              {stemBusy ? "생성 중…" : "발문 AI"}
                                            </button>
                                          </div>
                                        ) : null}
                                        <textarea
                                          className={styles.textarea}
                                          rows={8}
                                          value={sq.stem}
                                          onChange={(e) => patchSubQuestion(ui, mod.id, sq.id, { stem: e.target.value })}
                                          placeholder="발문"
                                        />
                                        {sq.kind === "mcq" ? (
                                          <>
                                            <div className={styles.fieldHeadRow}>
                                              <span className={styles.fieldHeadLabel}>선택지 (5지, 한 줄에 ① 하나)</span>
                                              <div className={styles.fieldModeToggle} role="group" aria-label="선택지 입력 방식">
                                                <button
                                                  type="button"
                                                  className={`${styles.fieldModeBtn}${sq.optionsMode === "manual" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                                  onClick={() => patchSubQuestion(ui, mod.id, sq.id, { optionsMode: "manual" })}
                                                >
                                                  직접 입력
                                                </button>
                                                <button
                                                  type="button"
                                                  className={`${styles.fieldModeBtn}${sq.optionsMode === "ai" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                                  onClick={() => patchSubQuestion(ui, mod.id, sq.id, { optionsMode: "ai" })}
                                                >
                                                  AI 생성
                                                </button>
                                              </div>
                                            </div>
                                            {sq.optionsMode === "ai" ? (
                                              <div className={styles.fieldAiRow}>
                                                <button
                                                  type="button"
                                                  className={styles.btnMini}
                                                  disabled={sqAiBlocked}
                                                  onClick={() => void runSubQuestionOptionsAi(ui, mod, sq, mi + 1)}
                                                >
                                                  {optBusy ? "생성 중…" : "선택지 AI"}
                                                </button>
                                              </div>
                                            ) : null}
                                            <textarea
                                              className={styles.textarea}
                                              rows={10}
                                              value={sq.options}
                                              onChange={(e) => patchSubQuestion(ui, mod.id, sq.id, { options: e.target.value })}
                                              placeholder={"① …\n② …\n③ …\n④ …\n⑤ …"}
                                            />
                                          </>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div className={styles.sourceModuleActions}>
                      <button type="button" className={styles.btnSecondary} onClick={() => addSourceModule(ui)}>
                        모듈 추가
                      </button>
                    </div>
                    <label className={styles.field}>
                      <span className={styles.label}>파일 추가 (.txt · .pdf · .docx, 다중 선택 가능)</span>
                      <input
                        type="file"
                        multiple
                        accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        className={styles.file}
                        onChange={(e) => {
                          const files = e.target.files ? Array.from(e.target.files) : [];
                          addPendingFiles(ui, files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {unitState.pendingFiles.length > 0 ? (
                      <div className={styles.pendingList}>
                        <p className={styles.pendingHead}>추출 대기</p>
                        {unitState.pendingFiles.map((p) => {
                          const isPdf =
                            p.file.name.toLowerCase().endsWith(".pdf") ||
                            p.file.type.toLowerCase() === "application/pdf";
                          return (
                          <div key={p.id} className={styles.pendingRow}>
                            <span className={styles.pendingName} title={p.file.name}>
                              {p.file.name}
                            </span>
                            {isPdf ? (
                              <>
                            <select
                              className={styles.select}
                              value={p.mode}
                              onChange={(e) =>
                                patchPending(ui, p.id, { mode: e.target.value as TextbookSetupPendingMode })
                              }
                              aria-label="PDF 추출 방식"
                            >
                              <option value="all">PDF 전체</option>
                              <option value="range">PDF 구간 (시작–끝 페이지)</option>
                              <option value="pages">PDF 페이지 지정 (쉼표)</option>
                            </select>
                            {p.mode === "range" ? (
                              <span className={styles.pageInputs}>
                                <input
                                  className={styles.inputSmall}
                                  type="number"
                                  min={1}
                                  placeholder="시작"
                                  value={p.fromPage}
                                  onChange={(e) => patchPending(ui, p.id, { fromPage: e.target.value })}
                                />
                                <span className={styles.pageSep}>—</span>
                                <input
                                  className={styles.inputSmall}
                                  type="number"
                                  min={1}
                                  placeholder="끝"
                                  value={p.toPage}
                                  onChange={(e) => patchPending(ui, p.id, { toPage: e.target.value })}
                                />
                              </span>
                            ) : null}
                            {p.mode === "pages" ? (
                              <input
                                className={styles.inputPages}
                                placeholder="예: 1, 3, 5"
                                value={p.pagesRaw}
                                onChange={(e) => patchPending(ui, p.id, { pagesRaw: e.target.value })}
                              />
                            ) : null}
                              </>
                            ) : (
                              <span className={styles.nonPdfHint}>TXT/DOCX · 전체 추출</span>
                            )}
                            <button
                              type="button"
                              className={styles.btnMini}
                              disabled={extractBusyId === p.id}
                              onClick={() => void extractPending(ui, p.id)}
                            >
                              {extractBusyId === p.id ? "추출 중…" : "추출"}
                            </button>
                            <button type="button" className={styles.btnMiniGhost} onClick={() => removePending(ui, p.id)}>
                              제거
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {unitState.fileSegments.length > 0 ? (
                      <ul className={styles.segmentList}>
                        {unitState.fileSegments.map((s) => (
                          <li key={s.id} className={styles.segmentItem}>
                            <div className={styles.segmentHead}>
                              <span className={styles.segmentNote}>{s.extractNote}</span>
                              <button
                                type="button"
                                className={styles.btnMiniGhost}
                                onClick={() => removeFileSegment(ui, s.id)}
                              >
                                블록 제거
                              </button>
                            </div>
                            <p className={styles.segmentPreview}>
                              {s.text.length > 280 ? `${s.text.slice(0, 280)}…` : s.text}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className={styles.setupSectionBlock}>
                      <h3 className={styles.setupSectionTitle}>확인학습 (단원)</h3>
                      <p className={styles.hint}>
                        세션에 포함될 주관식 확인학습 문항 수·언어를 정한 뒤 본문을 씁니다. 문항 사이는 빈 줄 두 줄(<code>---</code> 구분선 사용 가능)로 나눌 수
                        있습니다.
                      </p>
                      <div className={styles.row}>
                        <label className={styles.field}>
                          <span className={styles.label}>문항 수</span>
                          <input
                            className={styles.input}
                            type="number"
                            min={1}
                            max={20}
                            value={unitState.reviewStudy.questionCount}
                            onChange={(e) =>
                              patchUnitReviewStudy(ui, { questionCount: Number(e.target.value) || 1 })
                            }
                          />
                        </label>
                        <label className={styles.field}>
                          <span className={styles.label}>언어</span>
                          <select
                            className={styles.select}
                            value={unitState.reviewStudy.lang}
                            onChange={(e) =>
                              patchUnitReviewStudy(ui, { lang: e.target.value as "ko" | "en" })
                            }
                          >
                            <option value="ko">한국어</option>
                            <option value="en">영어</option>
                          </select>
                        </label>
                      </div>
                      <div className={styles.fieldHeadRow}>
                        <span className={styles.fieldHeadLabel}>본문</span>
                        <div className={styles.fieldModeToggle} role="group" aria-label="확인학습 입력 방식">
                          <button
                            type="button"
                            className={`${styles.fieldModeBtn}${unitState.reviewStudy.fieldMode === "manual" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                            onClick={() => patchUnitReviewStudy(ui, { fieldMode: "manual" })}
                          >
                            직접 입력
                          </button>
                          <button
                            type="button"
                            className={`${styles.fieldModeBtn}${unitState.reviewStudy.fieldMode === "ai" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                            onClick={() => patchUnitReviewStudy(ui, { fieldMode: "ai" })}
                          >
                            AI 생성
                          </button>
                        </div>
                      </div>
                      {unitState.reviewStudy.fieldMode === "ai" ? (
                        <div className={styles.fieldAiRow}>
                          <button
                            type="button"
                            className={styles.btnMini}
                            disabled={sourceFieldAiBusyKey !== null}
                            onClick={() => void runReviewStudyAi(ui)}
                          >
                            {sourceFieldAiBusyKey === `rs|${ui}` ? "생성 중…" : "확인학습 AI"}
                          </button>
                        </div>
                      ) : null}
                      <textarea
                        className={styles.textarea}
                        rows={10}
                        value={unitState.reviewStudy.body}
                        onChange={(e) => patchUnitReviewStudy(ui, { body: e.target.value })}
                        placeholder={"1. …\n\n2. …"}
                      />
                    </div>

                    <div className={styles.setupSectionBlock}>
                      <h3 className={styles.setupSectionTitle}>단원평가</h3>
                      <p className={styles.hint}>객관식은 5지선다 보기를 줄바꿈으로 ①~⑤에 맞춰 입력합니다. 세션 시작 시 이 문항 수만큼 검증됩니다.</p>
                      <div className={styles.row}>
                        <label className={styles.field}>
                          <span className={styles.label}>객관식(5지) 문항 수</span>
                          <input
                            className={styles.input}
                            type="number"
                            min={0}
                            max={20}
                            value={unitState.unitEvaluation.mcqCount}
                            onChange={(e) => patchUnitEval(ui, { mcqCount: Number(e.target.value) })}
                          />
                        </label>
                        <label className={styles.field}>
                          <span className={styles.label}>주관식 문항 수</span>
                          <input
                            className={styles.input}
                            type="number"
                            min={0}
                            max={20}
                            value={unitState.unitEvaluation.shortCount}
                            onChange={(e) => patchUnitEval(ui, { shortCount: Number(e.target.value) })}
                          />
                        </label>
                      </div>
                      {unitState.unitEvaluation.questions.map((eq, ei) => {
                        const ord = ei + 1;
                        const kindLabel = eq.kind === "mcq" ? "객관식" : "주관식";
                        const stemBk = `evStem|${ui}|${eq.id}`;
                        const optBk = `evOpt|${ui}|${eq.id}`;
                        const evBlocked = sourceFieldAiBusyKey !== null;
                        return (
                          <div key={eq.id} className={styles.subQuestionCard}>
                            <div className={styles.subQuestionToolbar}>
                              <span className={styles.sourceModuleBadge}>
                                단원평가 {ord} · {kindLabel}
                              </span>
                              <select
                                className={styles.select}
                                value={eq.lang}
                                onChange={(e) =>
                                  patchEvalQuestion(ui, eq.id, { lang: e.target.value as "ko" | "en" })
                                }
                                aria-label="단원평가 언어"
                              >
                                <option value="ko">한국어</option>
                                <option value="en">영어</option>
                              </select>
                            </div>
                            <div className={styles.fieldHeadRow}>
                              <span className={styles.fieldHeadLabel}>발문</span>
                              <div className={styles.fieldModeToggle} role="group" aria-label="단원평가 발문 방식">
                                <button
                                  type="button"
                                  className={`${styles.fieldModeBtn}${eq.stemMode === "manual" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                  onClick={() => patchEvalQuestion(ui, eq.id, { stemMode: "manual" })}
                                >
                                  직접 입력
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.fieldModeBtn}${eq.stemMode === "ai" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                  onClick={() => patchEvalQuestion(ui, eq.id, { stemMode: "ai" })}
                                >
                                  AI 생성
                                </button>
                              </div>
                            </div>
                            {eq.stemMode === "ai" ? (
                              <div className={styles.fieldAiRow}>
                                <button
                                  type="button"
                                  className={styles.btnMini}
                                  disabled={evBlocked}
                                  onClick={() => void runUnitEvalStemAi(ui, eq, ord)}
                                >
                                  {sourceFieldAiBusyKey === stemBk ? "생성 중…" : "발문 AI"}
                                </button>
                              </div>
                            ) : null}
                            <textarea
                              className={styles.textarea}
                              rows={8}
                              value={eq.stem}
                              onChange={(e) => patchEvalQuestion(ui, eq.id, { stem: e.target.value })}
                              placeholder="발문"
                            />
                            {eq.kind === "mcq" ? (
                              <>
                                <div className={styles.fieldHeadRow}>
                                  <span className={styles.fieldHeadLabel}>선택지</span>
                                  <div className={styles.fieldModeToggle} role="group" aria-label="선택지 방식">
                                    <button
                                      type="button"
                                      className={`${styles.fieldModeBtn}${eq.optionsMode === "manual" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                      onClick={() => patchEvalQuestion(ui, eq.id, { optionsMode: "manual" })}
                                    >
                                      직접 입력
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.fieldModeBtn}${eq.optionsMode === "ai" ? ` ${styles.fieldModeBtnActive}` : ""}`}
                                      onClick={() => patchEvalQuestion(ui, eq.id, { optionsMode: "ai" })}
                                    >
                                      AI 생성
                                    </button>
                                  </div>
                                </div>
                                {eq.optionsMode === "ai" ? (
                                  <div className={styles.fieldAiRow}>
                                    <button
                                      type="button"
                                      className={styles.btnMini}
                                      disabled={evBlocked}
                                      onClick={() => void runUnitEvalOptionsAi(ui, eq, ord)}
                                    >
                                      {sourceFieldAiBusyKey === optBk ? "생성 중…" : "선택지 AI"}
                                    </button>
                                  </div>
                                ) : null}
                                <textarea
                                  className={styles.textarea}
                                  rows={10}
                                  value={eq.options}
                                  onChange={(e) => patchEvalQuestion(ui, eq.id, { options: e.target.value })}
                                  placeholder={"① …\n② …\n③ …\n④ …\n⑤ …"}
                                />
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <p className={styles.hint}>
                      합계 약 {combineUnitPassage(unitState).length.toLocaleString()}자 / 단원 상한{" "}
                      {MAX_UNIT_PASSAGE_CHARS.toLocaleString()}자
                    </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.setupCombineSection}>
                <h3 className={styles.unitCardTitle}>요약 및 교재 생성</h3>
                <p className={styles.p}>
                  <strong>{bookTitle.trim() || "(제목 없음)"}</strong> · 총 <strong>{setupUnitCount}</strong>단원
                </p>
                <ul className={styles.segmentList}>
                  {Array.from({ length: setupUnitCount }, (_, ui) => {
                    const st = normalizeUnitSetup(unitInputs[ui]);
                    const merged = combineUnitPassage(st).trim();
                    const len = merged.length;
                    const prev =
                      (merged.replace(/\s+/g, " ").slice(0, 120) + (merged.length > 120 ? "…" : "")) || "(비어 있음)";
                    return (
                      <li key={ui} className={styles.segmentItem}>
                        <div className={styles.segmentHead}>
                          <span className={styles.segmentNote}>
                            제 {ui + 1}단원 · 약 {len.toLocaleString()}자
                          </span>
                          <button
                            type="button"
                            className={styles.btnMiniGhost}
                            onClick={() => removeSetupUnit(ui)}
                            disabled={setupUnitCount <= 1}
                          >
                            단원 삭제
                          </button>
                        </div>
                        <p className={styles.segmentPreview}>{prev}</p>
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.hint}>
                  「교재 생성」으로 세션을 열면 1단계 원고 모듈이 그대로 확정 단원이 됩니다.
                </p>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={goSetupAddUnit}
                    disabled={setupUnitCount >= MAX_UNITS}
                  >
                    단원 추가
                  </button>
                  <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void startSession()}>
                    {busy ? "처리 중…" : "교재 생성 (세션 시작)"}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className={styles.card} aria-labelledby="session-h">
                <div className={styles.sessionTop}>
                  <h2 id="session-h" className={styles.cardTitle}>
                    세션 · 출력
                  </h2>
                  <div className={styles.sessionTopActions}>
                    <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void goBackToStepOne()}>
                      1단계로
                    </button>
                    <button type="button" className={styles.btnGhost} onClick={resetSession}>
                      새 세션
                    </button>
                  </div>
                </div>
                <p className={styles.mono}>session: {sessionId.slice(0, 8)}…</p>
                <p className={styles.p}>
                  {totalUnits}개 단원이 1단계 구성을 기준으로 확정되었습니다. 원고는 학습지 모듈 규칙으로 나뉜 그대로 저장되어 있습니다.
                </p>
                <div className={styles.step2BottomActions} aria-label="인쇄·동기화">
                  <p className={styles.step2BottomHint}>
                    아래에서 학생용 출력 순서·정답 배치를 바꾼 뒤, 정답·해설을 검수하고 클라우드·완성본을 진행하세요.
                  </p>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={confirmedUnits.length === 0}
                      onClick={() => printBook()}
                    >
                      학생용 PDF (인쇄)
                    </button>
                    <button type="button" className={styles.btnGhost} onClick={() => void refreshConfirmedForPrint()}>
                      확정 단원 새로고침
                    </button>
                  </div>
                </div>
              </section>

              {isComplete ? (
                <>
                <section className={styles.card} aria-labelledby="book-order-h">
                  <h2 id="book-order-h" className={styles.cardTitle}>
                    2. 최종 본문 순서 (학생용)
                  </h2>
                  <p className={styles.p}>
                    확정 단원이 학생용 PDF·Word·5단계 완성본에 나오는 순서입니다. 교사용 정답·해설은 원래 단원 번호(제 n단원)를 그대로 씁니다.
                  </p>
                  <div className={styles.field}>
                    <span className={styles.label}>학생용 — 정답·해설 위치</span>
                    <div className={styles.row} role="radiogroup" aria-label="정답 해설 배치">
                      <label className={styles.sectionCheck}>
                        <input
                          type="radio"
                          name="answerKeyLayout"
                          checked={answerKeyLayout === "appendix"}
                          onChange={() => void persistAnswerKeyLayout("appendix")}
                        />
                        말미 부록 (일반 교재)
                      </label>
                      <label className={styles.sectionCheck}>
                        <input
                          type="radio"
                          name="answerKeyLayout"
                          checked={answerKeyLayout === "inline"}
                          onChange={() => void persistAnswerKeyLayout("inline")}
                        />
                        문항 직후 (인라인)
                      </label>
                    </div>
                    <p className={styles.hint}>
                      부록은 본문에서 문제만 두고, 마지막에 정답·해설을 모읍니다. 인라인은 각 문항 아래에 바로 표시합니다. 3단계에서 편집하는 정답·해설과 연동됩니다.
                    </p>
                  </div>
                  <ul className={styles.segmentList}>
                    {(unitDisplayOrder ?? defaultUnitDisplayOrder(confirmedUnits.length)).map((ui, pos) => {
                      const row = confirmedUnits.find((u) => u.unitIndex === ui);
                      if (!row) return null;
                      return (
                        <li key={ui} className={styles.segmentItem}>
                          <div className={styles.segmentHead}>
                            <span className={styles.segmentNote}>
                              책에서 {pos + 1}번째 → 제 {ui + 1}단원 · {row.unit.unitTitle}
                            </span>
                            <span className={styles.row}>
                              <button
                                type="button"
                                className={styles.btnMiniGhost}
                                disabled={pos === 0}
                                onClick={() => void moveBookUnit(pos, -1)}
                              >
                                위로
                              </button>
                              <button
                                type="button"
                                className={styles.btnMiniGhost}
                                disabled={pos >= confirmedUnits.length - 1}
                                onClick={() => void moveBookUnit(pos, 1)}
                              >
                                아래로
                              </button>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className={styles.card} aria-labelledby="phase3-h">
                  <h2 id="phase3-h" className={styles.cardTitle}>
                    3. 정답·해설 · 내보내기
                  </h2>
                  <h3 className={styles.phase3Sub}>AI 재생성 (선택)</h3>
                  <p className={styles.p}>
                    세션 시작 시 자동으로 정답·해설 초안을 저장하고, 비어 있는 칸만 AI로 보완합니다. 내용을 크게 바꾼 뒤에는 아래에서 전체 또는 단원별로 다시 생성할 수 있습니다.
                    「전체 생성」은 저장된 정답·해설을 <strong>모두 삭제한 뒤</strong> 위 규칙으로 다시 채웁니다.
                  </p>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={busy || phase2UnitBusy !== null || confirmedUnits.length === 0}
                      onClick={() => void runPhase2All()}
                    >
                      {busy ? "처리 중…" : "정답·해설 전체 AI 생성"}
                    </button>
                  </div>
                  <div className={styles.unitPhase2Wrap}>
                    <p className={styles.hint}>단원별 생성 (해당 단원의 정답만 삭제 후 재생성)</p>
                    <div className={styles.unitPhase2Row}>
                      {[...confirmedUnits]
                        .sort((a, b) => a.unitIndex - b.unitIndex)
                        .map(({ unitIndex, unit }) => (
                          <button
                            key={unitIndex}
                            type="button"
                            className={styles.btnMini}
                            disabled={busy || phase2UnitBusy !== null}
                            onClick={() => void runPhase2ForUnit(unitIndex)}
                            title={unit.unitTitle}
                          >
                            {phase2UnitBusy === unitIndex ? "생성 중…" : `제 ${unitIndex + 1}단원만`}
                          </button>
                        ))}
                    </div>
                  </div>

                  {answerKeyItems.length > 0 ? (
                    <>
                      <h3 className={styles.phase3Sub}>검수·수정</h3>
                      <p className={styles.p}>문항별로 정답과 해설(줄바꿈 = 불릿)을 고친 뒤 저장할 수 있습니다.</p>
                      {answerKeysByUnit.map(({ unitIndex, items }) => {
                        const ut =
                          confirmedUnits.find((u) => u.unitIndex === unitIndex)?.unit.unitTitle ?? "";
                        return (
                          <div key={unitIndex} className={styles.answerUnitBlock}>
                            <h4 className={styles.answerUnitTitle}>
                              제 {unitIndex + 1}단원 · {ut || "(제목 없음)"}
                            </h4>
                            {items.map((it) => (
                              <AnswerKeyEditCard
                                key={it.id}
                                item={it}
                                saving={savingKeyId === it.id}
                                onSave={saveAnswerKeyEdit}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <p className={styles.hint}>아직 저장된 정답·해설이 없습니다. 2단계에서 단원을 확정했는지, 또는 위에서 AI 재생성을 실행해 보세요.</p>
                  )}

                  <h3 className={styles.phase3Sub}>인쇄 · Word</h3>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={answerKeyItems.length === 0}
                      onClick={() => printAnswerKey()}
                    >
                      교사용 PDF (정답·해설)
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={docxBusy !== null || confirmedUnits.length === 0}
                      onClick={() => void runDownloadStudentDocx()}
                    >
                      {docxBusy === "student" ? "만드는 중…" : "학생용 Word (.docx)"}
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={docxBusy !== null || answerKeyItems.length === 0}
                      onClick={() => void runDownloadTeacherDocx()}
                    >
                      {docxBusy === "teacher" ? "만드는 중…" : "교사용 Word (.docx)"}
                    </button>
                  </div>
                  {answerKeyItems.length > 0 ? (
                    <p className={styles.hint}>Firestore에 저장된 문항: {answerKeyItems.length}개</p>
                  ) : null}
                </section>

                <section className={styles.card} aria-labelledby="phase4-h">
                  <h2 id="phase4-h" className={styles.cardTitle}>
                    4. 클라우드 패키지 (Storage)
                  </h2>
                  <p className={styles.p}>
                    확정 단원·현재 정답·해설을 반영해 Word(.docx)를 만들어 <strong>본인 Storage</strong>에 저장합니다. 같은 세션에서 다시 누르면 파일을 덮어씁니다. 정답·해설이
                    없으면 학생용만 올리고 교사용은 생략합니다.
                  </p>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={packageBusy || confirmedUnits.length === 0}
                      onClick={() => void runPublishPackage()}
                    >
                      {packageBusy ? "업로드 중…" : "패키지 업로드·갱신"}
                    </button>
                  </div>
                  {exportPackage ? (
                    <div className={styles.packageMeta}>
                      <p className={styles.hint}>
                        학생용: <span className={styles.monoInline}>{exportPackage.studentStoragePath}</span>
                      </p>
                      {exportPackage.teacherStoragePath ? (
                        <p className={styles.hint}>
                          교사용: <span className={styles.monoInline}>{exportPackage.teacherStoragePath}</span>
                        </p>
                      ) : (
                        <p className={styles.hint}>교사용 파일은 정답·해설이 있을 때만 업로드됩니다.</p>
                      )}
                      <div className={styles.row}>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          disabled={!exportPackage.studentStoragePath}
                          onClick={() => void openCloudDownload(exportPackage.studentStoragePath)}
                        >
                          클라우드에서 학생용 받기
                        </button>
                        {exportPackage.teacherStoragePath ? (
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => void openCloudDownload(exportPackage.teacherStoragePath)}
                          >
                            클라우드에서 교사용 받기
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className={styles.hint}>아직 클라우드에 저장된 패키지가 없습니다.</p>
                  )}
                </section>

                <TextbookAutoMasterBookPanel
                  key={sessionId ?? "session"}
                  bookTitle={bookTitle}
                  confirmedUnits={displayOrderedUnits}
                  sessionUnitPassages={sessionUnitPassages}
                  uid={uid}
                  sessionId={sessionId}
                  answerKeyLayout={answerKeyLayout}
                  answerKeyItems={answerKeyItems}
                />
                </>
              ) : null}
            </>
          )}

          {workspaceTab === "unitBook" && msg ? <p className={styles.ok}>{msg}</p> : null}
          {workspaceTab === "unitBook" && err ? <p className={styles.bad}>{err}</p> : null}
        </div>

        <div className={styles.printPortal} aria-hidden={displayOrderedUnits.length ? undefined : true}>
          <div ref={printRef}>
            {displayOrderedUnits.length > 0 ? (
              <TextbookAutoPrintView
                bookTitle={bookTitle.trim() || "교재"}
                units={displayOrderedUnits}
                answerKeyLayout={answerKeyLayout}
                answerKeyItems={answerKeyItems}
              />
            ) : (
              <div className={styles.printEmpty} />
            )}
          </div>
        </div>
        <div className={styles.printPortal} aria-hidden={answerKeyItems.length ? undefined : true}>
          <div ref={answerKeyPrintRef}>
            {answerKeyItems.length > 0 ? (
              <TextbookAutoAnswerKeyPrintView
                bookTitle={bookTitle.trim() || "교재"}
                unitTitles={confirmedUnits.map(({ unitIndex, unit }) => ({
                  unitIndex,
                  unitTitle: unit.unitTitle,
                }))}
                items={answerKeyItems}
              />
            ) : (
              <div className={styles.printEmpty} />
            )}
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}

function AnswerKeyEditCard({
  item,
  saving,
  onSave,
}: {
  item: TextbookAnswerKeyItem;
  saving: boolean;
  onSave: (itemId: string, answer: string, explanationBullets: string[]) => Promise<void>;
}) {
  const [answer, setAnswer] = useState(item.answer);
  const [expLines, setExpLines] = useState(() => item.explanationBullets.join("\n"));
  const expJoin = item.explanationBullets.join("\n");
  useEffect(() => {
    setAnswer(item.answer);
    setExpLines(expJoin);
  }, [item.id, item.answer, expJoin]);

  const bucketLabel = item.bucket === "practice" ? "확인학습" : "단원평가";

  return (
    <div className={styles.answerKeyCard}>
      <p className={styles.answerKeyMeta}>
        {bucketLabel} · {item.id}
      </p>
      <p className={styles.answerKeyQ}>{item.question}</p>
      <label className={styles.field}>
        <span className={styles.label}>정답</span>
        <input className={styles.input} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={8000} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>해설 (줄마다 한 불릿)</span>
        <textarea className={styles.textarea} rows={4} value={expLines} onChange={(e) => setExpLines(e.target.value)} />
      </label>
      <button
        type="button"
        className={styles.btnMini}
        disabled={saving}
        onClick={() =>
          void onSave(
            item.id,
            answer,
            expLines
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 25),
          )
        }
      >
        {saving ? "저장 중…" : "이 문항 저장"}
      </button>
    </div>
  );
}
