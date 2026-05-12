import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { DashboardShell } from "@/components/DashboardShell";
import { LocalDocumentAutomationPanel } from "@/components/localDocumentAuto/LocalDocumentAutomationPanel";
import { TextbookAutoAnswerKeyPrintView } from "@/components/textbookAuto/TextbookAutoAnswerKeyPrintView";
import { TextbookAutoMasterBookPanel } from "@/components/textbookAuto/TextbookAutoMasterBookPanel";
import { PassageClassificationPanel } from "@/components/passageClassification/PassageClassificationPanel";
import { TextbookAutoPrintView } from "@/components/textbookAuto/TextbookAutoPrintView";
import { TextbookUnitDraftEditor } from "@/components/textbookAuto/TextbookUnitDraftEditor";
import { LocalDocModulesEditor } from "@/components/localDocumentAuto/LocalDocModulesEditor";
import { useAuth } from "@/contexts/AuthContext";
import { storage } from "@/firebase/config";
import { BRAND_APP_NAME } from "@/lib/brand";
import { combineUnitPassage, emptyUnitSetup } from "@/lib/textbookAuto/combineUnitPassage";
import { parseManuscriptToModules } from "@/lib/localDocumentAuto/manuscriptModules";
import { extractUnitSourceFile } from "@/lib/textbookAuto/extractUnitSourceFile";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { requestTextbookUnitGeneration } from "@/lib/textbookAuto/requestTextbookUnitGeneration";
import { buildAnswerKeyStubs } from "@/lib/textbookAuto/buildAnswerKeyStubs";
import { validateDraftUnit } from "@/lib/textbookAuto/validateDraftUnit";
import {
  anySectionInclusionEnabled,
  applySectionInclusionToUnit,
  getSectionInclusion,
  unitForStudentOutput,
} from "@/lib/textbookAuto/sectionInclusion";
import { requestTextbookAnswerKeyForUnit } from "@/lib/textbookAuto/requestTextbookAnswerKey";
import { downloadTextbookAutoStudentDocx, downloadTextbookAutoTeacherDocx } from "@/lib/textbookAuto/downloadTextbookAutoDocx";
import { publishTextbookAutoPackage } from "@/lib/textbookAuto/publishTextbookAutoPackage";
import {
  createTextbookAutoSession,
  deleteAllAnswerKeysForSession,
  deleteAnswerKeysForUnit,
  loadAnswerKeyItems,
  loadConfirmedUnits,
  loadTextbookExportPackage,
  loadUnitDraft,
  setSessionCurrentUnit,
  updateAnswerKeyItem,
  writeAnswerKeyItems,
  writeUnitConfirmed,
  writeUnitDraft,
  type TextbookAutoExportPackageDoc,
} from "@/lib/textbookAuto/textbookAutoFirestore";
import type {
  TextbookAnswerKeyItem,
  TextbookSectionInclusion,
  TextbookSetupPendingFile,
  TextbookSetupPendingMode,
  TextbookUnitContent,
  TextbookUnitSetupState,
} from "@/types/textbookAuto";
import { DEFAULT_SECTION_INCLUSION } from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoBuilder.module.css";

type BuilderWorkspaceTab = "unitBook" | "worksheet" | "evaluation" | "passageClassify";

const DEFAULT_TOTAL_UNITS = 3;
const MAX_UNITS = 30;
const MIN_PRACTICE_QUESTIONS = 10;
const MIN_UNIT_TEST_TOTAL = 20;
const DEFAULT_UNIT_TEST_MCQ = 12;
const DEFAULT_UNIT_TEST_SHORT = 8;
/** Firestore·AI 안정용 단원당 상한 */
const MAX_UNIT_PASSAGE_CHARS = 38_000;
const AI_SOURCE_SLICE = 24_000;

function sliceForAi(full: string): string {
  if (full.length <= AI_SOURCE_SLICE) return full;
  return full.slice(0, AI_SOURCE_SLICE);
}

export function TextbookAutoBuilderPage() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const [workspaceTab, setWorkspaceTab] = useState<BuilderWorkspaceTab>("unitBook");
  const printRef = useRef<HTMLDivElement>(null);
  const answerKeyPrintRef = useRef<HTMLDivElement>(null);
  /** loadUnitDraft 완료가 AI 생성보다 늦게 도착해 초안을 덮어쓰지 않도록 */
  const draftLoadSeqRef = useRef(0);

  const [bookTitle, setBookTitle] = useState("");
  const [totalUnits, setTotalUnits] = useState(DEFAULT_TOTAL_UNITS);
  const [unitInputs, setUnitInputs] = useState<TextbookUnitSetupState[]>(() =>
    Array.from({ length: DEFAULT_TOTAL_UNITS }, () => emptyUnitSetup()),
  );
  /** 세션 시작 시 고정된 단원별 지문 (생성 단계에서만 사용) */
  const [sessionUnitPassages, setSessionUnitPassages] = useState<string[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [draftUnit, setDraftUnit] = useState<TextbookUnitContent | null>(null);
  const [confirmedUnits, setConfirmedUnits] = useState<{ unitIndex: number; unit: TextbookUnitContent }[]>([]);
  const [draftModel, setDraftModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [extractBusyId, setExtractBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answerKeyItems, setAnswerKeyItems] = useState<TextbookAnswerKeyItem[]>([]);
  const [docxBusy, setDocxBusy] = useState<"student" | "teacher" | null>(null);
  const [phase2UnitBusy, setPhase2UnitBusy] = useState<number | null>(null);
  const [exportPackage, setExportPackage] = useState<TextbookAutoExportPackageDoc | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  /** 단원평가 문항 수 (AI 생성·확정 검증에 사용) */
  const [unitTestMcqCount, setUnitTestMcqCount] = useState(DEFAULT_UNIT_TEST_MCQ);
  const [unitTestShortCount, setUnitTestShortCount] = useState(DEFAULT_UNIT_TEST_SHORT);
  const [sectionInclusion, setSectionInclusion] = useState<TextbookSectionInclusion>(DEFAULT_SECTION_INCLUSION);

  const isComplete = sessionId !== null && currentUnitIndex >= totalUnits;
  const unitTestTotalOk =
    !sectionInclusion.unitTest || unitTestMcqCount + unitTestShortCount >= MIN_UNIT_TEST_TOTAL;

  const contentStudyAiContext = useMemo(() => {
    if (!sessionId || !sessionUnitPassages) return null;
    const raw = sessionUnitPassages[currentUnitIndex] ?? "";
    const text = sliceForAi(raw);
    if (!text.trim()) return null;
    return { bookTitle: bookTitle.trim() || "교재", unitSourceText: text };
  }, [sessionId, sessionUnitPassages, currentUnitIndex, bookTitle]);

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
    setDraftUnit(null);
    setDraftModel("");
    setSectionInclusion(DEFAULT_SECTION_INCLUSION);
    setConfirmedUnits([]);
    setAnswerKeyItems([]);
    setExportPackage(null);
    setMsg(null);
    setErr(null);
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

  const patchSectionInclusion = useCallback((patch: Partial<TextbookSectionInclusion>) => {
    setSectionInclusion((prev) => {
      const next = { ...prev, ...patch };
      setDraftUnit((d) => (d ? applySectionInclusionToUnit(d, next) : d));
      return next;
    });
  }, []);

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

  /** 재방문 시 Firestore 임시저장 초안 불러오기 */
  useEffect(() => {
    if (!uid || !sessionId || isComplete) return;
    const token = ++draftLoadSeqRef.current;
    let cancelled = false;
    void loadUnitDraft(uid, sessionId, currentUnitIndex).then((row) => {
      if (cancelled || token !== draftLoadSeqRef.current) return;
      if (!row) {
        setSectionInclusion(DEFAULT_SECTION_INCLUSION);
        return;
      }
      setDraftUnit(row.unit);
      setDraftModel(row.model || "manual");
      setSectionInclusion(getSectionInclusion(row.unit));
    });
    return () => {
      cancelled = true;
    };
  }, [uid, sessionId, currentUnitIndex, isComplete]);

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
    const slice = unitInputs.slice(0, n);
    for (let i = 0; i < n; i++) {
      const u = slice[i] ?? emptyUnitSetup();
      if (u.pendingFiles.length > 0) {
        setErr(`제 ${i + 1}단원: 추출하지 않은 파일이 있습니다. 먼저 「추출」을 누르거나 대기 목록에서 제거하세요.`);
        return;
      }
    }
    const passages = slice.map((u) => combineUnitPassage(u));
    for (let i = 0; i < n; i++) {
      const t = passages[i]?.trim() ?? "";
      if (!t) {
        setErr(`제 ${i + 1}단원 지문이 비었습니다. 직접 입력하거나 파일을 추출해 주세요.`);
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
      setSessionId(sid);
      setTotalUnits(n);
      setSessionUnitPassages(passages);
      setCurrentUnitIndex(0);
      setDraftUnit(null);
      setDraftModel("");
      setSectionInclusion(DEFAULT_SECTION_INCLUSION);
      setConfirmedUnits([]);
      setMsg("세션이 시작되었습니다. 아래에서 단원별 생성을 진행하세요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "세션을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [uid, bookTitle, unitInputs, totalUnits]);

  const runGenerate = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!uid || !sessionId || !sessionUnitPassages) return;
    const title = bookTitle.trim();
    if (!title) {
      setErr("제목이 필요합니다.");
      return;
    }
    if (currentUnitIndex >= totalUnits) return;
    const src = sessionUnitPassages[currentUnitIndex] ?? "";
    if (!src.trim()) {
      setErr("이 단원 지문이 비었습니다.");
      return;
    }
    if (!anySectionInclusionEnabled(sectionInclusion)) {
      setErr("AI 생성에 포함할 섹션을 한 개 이상 선택하세요.");
      return;
    }
    if (sectionInclusion.unitTest && !unitTestTotalOk) {
      setErr(`단원평가 문항 합계는 ${MIN_UNIT_TEST_TOTAL}개 이상이어야 합니다. (객관식+주관식 단답)`);
      return;
    }
    draftLoadSeqRef.current += 1;
    setBusy(true);
    try {
      const passage = sliceForAi(src);
      const { unit, meta } = await requestTextbookUnitGeneration({
        bookTitle: title,
        sourceText: passage,
        unitIndex: currentUnitIndex,
        totalUnits,
        practiceMin: sectionInclusion.practice ? MIN_PRACTICE_QUESTIONS : 0,
        unitTestMcq: sectionInclusion.unitTest ? unitTestMcqCount : 0,
        unitTestShort: sectionInclusion.unitTest ? unitTestShortCount : 0,
        sectionInclusion,
      });
      const passageMods = parseManuscriptToModules(sliceForAi(src));
      const unitWithMods: TextbookUnitContent = {
        ...unit,
        manuscriptModules: passageMods.length > 0 ? passageMods : [],
      };
      setDraftUnit(unitWithMods);
      setDraftModel(meta.model);
      await writeUnitDraft(uid, sessionId, currentUnitIndex, unitWithMods, meta.model);
      setMsg(
        src.length > AI_SOURCE_SLICE
          ? `생성했습니다. (이 단원 지문 ${AI_SOURCE_SLICE.toLocaleString()}자까지 AI에 전달됨)`
          : "생성했습니다. 내용을 확인한 뒤 확정하세요.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [
    uid,
    sessionId,
    sessionUnitPassages,
    bookTitle,
    currentUnitIndex,
    totalUnits,
    unitTestMcqCount,
    unitTestShortCount,
    unitTestTotalOk,
    sectionInclusion,
  ]);

  const saveDraftOnly = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!uid || !sessionId || !draftUnit) {
      setErr("저장할 초안이 없습니다. AI 생성으로 초안을 만들거나 불러온 내용을 확인하세요.");
      return;
    }
    setBusy(true);
    try {
      const model = draftModel.trim() || "manual";
      const u = applySectionInclusionToUnit(draftUnit, sectionInclusion);
      await writeUnitDraft(uid, sessionId, currentUnitIndex, u, model);
      setDraftModel(model);
      setMsg("임시 저장했습니다. 같은 단원에서 계속 편집한 뒤, 확정 시 다음 단원으로 이동합니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "임시 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [uid, sessionId, draftUnit, draftModel, currentUnitIndex, sectionInclusion]);

  const confirmUnit = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!uid || !sessionId || !draftUnit) {
      setErr("먼저 이 단원 초안을 준비하세요.");
      return;
    }
    const model = draftModel.trim() || "manual";
    const toSave = applySectionInclusionToUnit(
      { ...draftUnit, unitTitle: draftUnit.unitTitle.trim() },
      sectionInclusion,
    );
    const v = validateDraftUnit(toSave, {
      practiceMin: MIN_PRACTICE_QUESTIONS,
      unitTestMcq: unitTestMcqCount,
      unitTestShort: unitTestShortCount,
      sectionInclusion,
    });
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    try {
      await writeUnitConfirmed(uid, sessionId, currentUnitIndex, toSave, model);
      const next = currentUnitIndex + 1;
      await setSessionCurrentUnit(uid, sessionId, next);
      setConfirmedUnits((prev) =>
        [...prev, { unitIndex: currentUnitIndex, unit: toSave }].sort((a, b) => a.unitIndex - b.unitIndex),
      );
      setCurrentUnitIndex(next);
      setDraftUnit(null);
      setDraftModel("");
      setSectionInclusion(DEFAULT_SECTION_INCLUSION);
      setMsg(
        next >= totalUnits
          ? "모든 단원이 확정되었습니다. 3–5단계에서 정답·해설·클라우드 패키지·완성본을 진행할 수 있습니다."
          : "다음 단원으로 넘어갔습니다.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [
    uid,
    sessionId,
    draftUnit,
    draftModel,
    currentUnitIndex,
    totalUnits,
    unitTestMcqCount,
    unitTestShortCount,
    sectionInclusion,
  ]);

  const refreshConfirmedForPrint = useCallback(async () => {
    if (!uid || !sessionId) return;
    const rows = await loadConfirmedUnits(uid, sessionId);
    setConfirmedUnits(rows);
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
        const stubs = buildAnswerKeyStubs(unitIndex, unitForStudentOutput(unit));
        if (stubs.length === 0) continue;
        const { items, meta } = await requestTextbookAnswerKeyForUnit({
          bookTitle: title,
          unitTitle: unit.unitTitle,
          unitIndex,
          stubs,
        });
        await writeAnswerKeyItems(uid, sessionId, items, meta.model);
        totalWritten += items.length;
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
  }, [uid, sessionId, confirmedUnits, bookTitle]);

  const setManual = useCallback((unitIndex: number, text: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = { ...(next[unitIndex] ?? emptyUnitSetup()) };
      row.manualText = text;
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const addPendingFiles = useCallback((unitIndex: number, files: File[]) => {
    if (!files.length) return;
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = { ...(next[unitIndex] ?? emptyUnitSetup()) };
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
      const row = { ...(next[unitIndex] ?? emptyUnitSetup()) };
      row.pendingFiles = row.pendingFiles.map((p) => (p.id === pendingId ? { ...p, ...patch } : p));
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const removePending = useCallback((unitIndex: number, pendingId: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = { ...(next[unitIndex] ?? emptyUnitSetup()) };
      row.pendingFiles = row.pendingFiles.filter((p) => p.id !== pendingId);
      next[unitIndex] = row;
      return next;
    });
  }, []);

  const removeFileSegment = useCallback((unitIndex: number, segmentId: string) => {
    setUnitInputs((prev) => {
      const next = [...prev];
      const row = { ...(next[unitIndex] ?? emptyUnitSetup()) };
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
          const u = { ...(next[unitIndex] ?? emptyUnitSetup()) };
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
        const stubs = buildAnswerKeyStubs(unitIndex, unitForStudentOutput(row.unit));
        if (stubs.length === 0) {
          setMsg(`제 ${unitIndex + 1}단원: 확인학습·단원평가 문항이 없어 건너뜁니다.`);
          const rows = await loadAnswerKeyItems(uid, sessionId);
          setAnswerKeyItems(rows);
          return;
        }
        const { items, meta } = await requestTextbookAnswerKeyForUnit({
          bookTitle: title,
          unitTitle: row.unit.unitTitle,
          unitIndex,
          stubs,
        });
        await writeAnswerKeyItems(uid, sessionId, items, meta.model);
        const rows = await loadAnswerKeyItems(uid, sessionId);
        setAnswerKeyItems(rows);
        setMsg(`제 ${unitIndex + 1}단원: 정답·해설 ${items.length}개를 저장했습니다.`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "단원 정답·해설 생성에 실패했습니다.");
      } finally {
        setPhase2UnitBusy(null);
      }
    },
    [uid, sessionId, confirmedUnits, bookTitle],
  );

  const runDownloadStudentDocx = useCallback(async () => {
    if (confirmedUnits.length === 0) return;
    setDocxBusy("student");
    setErr(null);
    try {
      await downloadTextbookAutoStudentDocx({
        bookTitle: bookTitle.trim() || "교재",
        units: confirmedUnits,
      });
      setMsg("학생용 Word(.docx)를 받았습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Word 내보내기에 실패했습니다.");
    } finally {
      setDocxBusy(null);
    }
  }, [confirmedUnits, bookTitle]);

  const runDownloadTeacherDocx = useCallback(async () => {
    if (answerKeyItems.length === 0) return;
    setDocxBusy("teacher");
    setErr(null);
    try {
      await downloadTextbookAutoTeacherDocx({
        bookTitle: bookTitle.trim() || "교재",
        unitTitles: confirmedUnits.map(({ unitIndex, unit }) => ({ unitIndex, unitTitle: unit.unitTitle })),
        items: answerKeyItems,
      });
      setMsg("교사용 정답·해설 Word(.docx)를 받았습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Word 내보내기에 실패했습니다.");
    } finally {
      setDocxBusy(null);
    }
  }, [answerKeyItems, confirmedUnits, bookTitle]);

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
        units: confirmedUnits,
        answerKeyItems,
      });
      const pkg = await loadTextbookExportPackage(uid, sessionId);
      setExportPackage(pkg);
      setMsg("클라우드에 Word 패키지를 저장했습니다. 아래에서 다시 받을 수 있습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "패키지 업로드에 실패했습니다.");
    } finally {
      setPackageBusy(false);
    }
  }, [uid, sessionId, confirmedUnits, bookTitle, answerKeyItems]);

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

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>{BRAND_APP_NAME}</p>
            <h1 className={styles.title}>교재 자동 생성 · 통합 작업실</h1>
            {workspaceTab === "unitBook" ? (
              <p className={styles.lead}>
                단원 수만큼 지문 칸이 열립니다. 각 단원에 직접 붙여넣거나 파일을 여러 개 올린 뒤 PDF는 페이지 범위·개별 페이지를 지정해 추출할 수 있습니다. 세션을 시작한 뒤 단원별 AI
                초안을 확정하고, 3–4단계에서 정답·해설·클라우드를 다룬 뒤, 5단계에서 표지·목차·본문·추가 페이지를 합친 완성본 Word를 내려받을 수 있습니다.
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
                1. 세션 시작 — 단원별 지문
              </h2>
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

              <div className={styles.unitGrid}>
                {unitInputs.slice(0, totalUnits).map((unitState, ui) => (
                  <div key={ui} className={styles.unitCard}>
                    <h3 className={styles.unitCardTitle}>제 {ui + 1}단원 지문</h3>
                    <label className={styles.field}>
                      <span className={styles.label}>직접 입력</span>
                      <textarea
                        className={styles.textarea}
                        rows={6}
                        value={unitState.manualText}
                        onChange={(e) => setManual(ui, e.target.value)}
                        placeholder="이 단원에 해당하는 지문을 붙여넣으세요."
                        maxLength={MAX_UNIT_PASSAGE_CHARS}
                      />
                    </label>
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
                    <p className={styles.hint}>
                      합계 약 {combineUnitPassage(unitState).length.toLocaleString()}자 / 단원 상한{" "}
                      {MAX_UNIT_PASSAGE_CHARS.toLocaleString()}자
                    </p>
                  </div>
                ))}
              </div>

              <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void startSession()}>
                {busy ? "처리 중…" : "세션 시작"}
              </button>
            </section>
          ) : (
            <>
              <section className={styles.card} aria-labelledby="session-h">
                <div className={styles.sessionTop}>
                  <h2 id="session-h" className={styles.cardTitle}>
                    2. 단원별 생성 ({isComplete ? "완료" : `진행 ${Math.min(currentUnitIndex + 1, totalUnits)} / ${totalUnits}`})
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

                {!isComplete ? (
                  <>
                    <p className={styles.p}>
                      <strong>제 {currentUnitIndex + 1}단원</strong>: 위에서 섹션·문항 수를 고른 뒤 「이 단원 AI 생성」으로 초안을 만듭니다. 편집이 끝나면{" "}
                      <strong>화면 맨 아래</strong>에서 임시 저장·확정·PDF를 진행하세요.
                    </p>
                    <div className={styles.field}>
                      <span className={styles.label}>AI 생성·교재에 포함할 섹션</span>
                      <div className={styles.sectionCheckGrid}>
                        {(
                          [
                            ["keyConcepts", "핵심개념"],
                            ["contentStudy", "내용학습"],
                            ["coreSummary", "핵심요약"],
                            ["practice", "확인학습"],
                            ["unitTest", "단원평가"],
                          ] as const
                        ).map(([k, label]) => (
                          <label key={k} className={styles.sectionCheck}>
                            <input
                              type="checkbox"
                              checked={sectionInclusion[k]}
                              onChange={(e) => patchSectionInclusion({ [k]: e.target.checked })}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      <p className={styles.hint}>체크한 섹션만 AI가 채우며, 학생용 PDF·Word·클라우드 본문에도 반영됩니다.</p>
                    </div>
                    {sectionInclusion.unitTest ? (
                    <div className={styles.field}>
                      <span className={styles.label}>
                        단원평가 문항 수 (AI 생성·확정 기준) — 객관식 + 주관식 단답 합계 {MIN_UNIT_TEST_TOTAL}개 이상
                      </span>
                      <div className={styles.countRow}>
                        <label className={styles.countLabel}>
                          객관식
                          <input
                            className={styles.inputSmall}
                            type="number"
                            min={0}
                            max={50}
                            value={unitTestMcqCount}
                            onChange={(e) =>
                              setUnitTestMcqCount(Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0))))
                            }
                          />
                        </label>
                        <label className={styles.countLabel}>
                          주관식 단답
                          <input
                            className={styles.inputSmall}
                            type="number"
                            min={0}
                            max={50}
                            value={unitTestShortCount}
                            onChange={(e) =>
                              setUnitTestShortCount(Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0))))
                            }
                          />
                        </label>
                        <span className={unitTestTotalOk ? styles.hint : styles.countWarn}>
                          합계 {unitTestMcqCount + unitTestShortCount}개
                          {sectionInclusion.practice
                            ? ` · 확인학습 선택 시 AI가 ${MIN_PRACTICE_QUESTIONS}문항(주관식 단답)을 만듭니다`
                            : ""}
                        </span>
                      </div>
                    </div>
                    ) : (
                      <p className={styles.hint}>
                        단원평가를 끄면 문항 수 설정 없이 생성할 수 있습니다.
                        {sectionInclusion.practice
                          ? ` 확인학습만 켠 경우 AI가 주관식 단답 ${MIN_PRACTICE_QUESTIONS}문항을 만듭니다.`
                          : ""}
                      </p>
                    )}
                    <div className={styles.row}>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={
                          busy ||
                          !anySectionInclusionEnabled(sectionInclusion) ||
                          (sectionInclusion.unitTest && !unitTestTotalOk)
                        }
                        onClick={() => void runGenerate()}
                      >
                        {busy ? "생성 중…" : "이 단원 AI 생성"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.p}>모든 단원이 확정되었습니다.</p>
                )}

                {draftUnit ? (
                  <div className={styles.preview}>
                    <h3 className={styles.previewTitle}>
                      편집 — 제 {currentUnitIndex + 1}단원 · {draftUnit.unitTitle}
                    </h3>
                    <TextbookUnitDraftEditor
                      unit={draftUnit}
                      onChange={setDraftUnit}
                      sectionInclusion={sectionInclusion}
                      disabled={busy}
                      contentStudyAiContext={contentStudyAiContext}
                      onContentStudyAiNotice={(message, variant) => {
                        if (variant === "ok") {
                          setErr(null);
                          setMsg(message);
                        } else {
                          setMsg(null);
                          setErr(message);
                        }
                      }}
                    />
                    <div className={styles.preview}>
                      <h3 className={styles.previewTitle}>원고 모듈 (학습지 제작과 동일)</h3>
                      <p className={styles.hint}>
                        단원별로 블록을 나누어 순서·내용을 조정합니다. AI 생성 직후에는 이 단원 지문이 모듈로 채워지며, 확정된 모든 단원의 모듈이 3·5단계 학생용 Word·PDF·완성본 본문에 단원 순으로
                        이어집니다.
                      </p>
                      <LocalDocModulesEditor
                        modules={draftUnit.manuscriptModules ?? []}
                        onChange={(mm) => setDraftUnit({ ...draftUnit, manuscriptModules: mm })}
                        disabled={busy}
                        kind="worksheet"
                        analyzeSeedText={sessionUnitPassages?.[currentUnitIndex] ?? ""}
                      />
                    </div>
                  </div>
                ) : null}

                <div className={styles.step2BottomActions} aria-label="저장·확정·인쇄">
                  <p className={styles.step2BottomHint}>
                    {isComplete
                      ? "확정된 단원으로 학생용 PDF를 만들거나 Firestore에서 최신 정보를 다시 불러올 수 있습니다."
                      : "편집을 마친 뒤 임시 저장(초안만) 또는 확정(다음 단원으로)을 누르세요."}
                  </p>
                  <div className={styles.row}>
                    {!isComplete ? (
                      <>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          disabled={busy || !draftUnit}
                          onClick={() => void saveDraftOnly()}
                        >
                          임시 저장
                        </button>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          disabled={busy || !draftUnit}
                          onClick={() => void confirmUnit()}
                        >
                          확정하고 다음 단원
                        </button>
                      </>
                    ) : null}
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
                <section className={styles.card} aria-labelledby="phase3-h">
                  <h2 id="phase3-h" className={styles.cardTitle}>
                    3. 정답·해설 · 내보내기
                  </h2>
                  <h3 className={styles.phase3Sub}>AI 생성</h3>
                  <p className={styles.p}>
                    「전체 생성」은 이 세션의 저장된 정답·해설을 <strong>모두 삭제한 뒤</strong> 모든 단원을 다시 씁니다. 특정 단원만 갱신하려면 「단원별 생성」 버튼을
                    사용하세요.
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
                    <p className={styles.hint}>아직 저장된 정답·해설이 없습니다. 위에서 AI 생성을 실행하세요.</p>
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
                  confirmedUnits={confirmedUnits}
                  sessionUnitPassages={sessionUnitPassages}
                />
                </>
              ) : null}
            </>
          )}

          {workspaceTab === "unitBook" && msg ? <p className={styles.ok}>{msg}</p> : null}
          {workspaceTab === "unitBook" && err ? <p className={styles.bad}>{err}</p> : null}
        </div>

        <div className={styles.printPortal} aria-hidden={confirmedUnits.length ? undefined : true}>
          <div ref={printRef}>
            {confirmedUnits.length > 0 ? (
              <TextbookAutoPrintView bookTitle={bookTitle.trim() || "교재"} units={confirmedUnits} />
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
