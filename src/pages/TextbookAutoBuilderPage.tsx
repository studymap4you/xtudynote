import { useCallback, useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { DashboardShell } from "@/components/DashboardShell";
import { TextbookAutoAnswerKeyPrintView } from "@/components/textbookAuto/TextbookAutoAnswerKeyPrintView";
import { TextbookAutoPrintView } from "@/components/textbookAuto/TextbookAutoPrintView";
import { useAuth } from "@/contexts/AuthContext";
import { BRAND_APP_NAME } from "@/lib/brand";
import { combineUnitPassage, emptyUnitSetup } from "@/lib/textbookAuto/combineUnitPassage";
import { extractUnitSourceFile } from "@/lib/textbookAuto/extractUnitSourceFile";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { requestTextbookUnitGeneration } from "@/lib/textbookAuto/requestTextbookUnitGeneration";
import { buildAnswerKeyStubs } from "@/lib/textbookAuto/buildAnswerKeyStubs";
import { requestTextbookAnswerKeyForUnit } from "@/lib/textbookAuto/requestTextbookAnswerKey";
import {
  createTextbookAutoSession,
  deleteAllAnswerKeysForSession,
  loadAnswerKeyItems,
  loadConfirmedUnits,
  setSessionCurrentUnit,
  writeAnswerKeyItems,
  writeUnitConfirmed,
  writeUnitDraft,
} from "@/lib/textbookAuto/textbookAutoFirestore";
import type {
  TextbookAnswerKeyItem,
  TextbookSetupPendingFile,
  TextbookSetupPendingMode,
  TextbookUnitContent,
  TextbookUnitSetupState,
} from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoBuilder.module.css";

const DEFAULT_TOTAL_UNITS = 3;
const MAX_UNITS = 30;
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
  const [draftUnit, setDraftUnit] = useState<TextbookUnitContent | null>(null);
  const [confirmedUnits, setConfirmedUnits] = useState<{ unitIndex: number; unit: TextbookUnitContent }[]>([]);
  const [draftModel, setDraftModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [extractBusyId, setExtractBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answerKeyItems, setAnswerKeyItems] = useState<TextbookAnswerKeyItem[]>([]);

  const isComplete = sessionId !== null && currentUnitIndex >= totalUnits;

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
    setConfirmedUnits([]);
    setAnswerKeyItems([]);
    setMsg(null);
    setErr(null);
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
    setBusy(true);
    try {
      const passage = sliceForAi(src);
      const { unit, meta } = await requestTextbookUnitGeneration({
        bookTitle: title,
        sourceText: passage,
        unitIndex: currentUnitIndex,
        totalUnits,
      });
      setDraftUnit(unit);
      setDraftModel(meta.model);
      await writeUnitDraft(uid, sessionId, currentUnitIndex, unit, meta.model);
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
  }, [uid, sessionId, sessionUnitPassages, bookTitle, currentUnitIndex, totalUnits]);

  const confirmUnit = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!uid || !sessionId || !draftUnit || !draftModel) {
      setErr("먼저 이 단원을 생성하세요.");
      return;
    }
    setBusy(true);
    try {
      await writeUnitConfirmed(uid, sessionId, currentUnitIndex, draftUnit, draftModel);
      const next = currentUnitIndex + 1;
      await setSessionCurrentUnit(uid, sessionId, next);
      setConfirmedUnits((prev) =>
        [...prev, { unitIndex: currentUnitIndex, unit: draftUnit }].sort((a, b) => a.unitIndex - b.unitIndex),
      );
      setCurrentUnitIndex(next);
      setDraftUnit(null);
      setDraftModel("");
      setMsg(
        next >= totalUnits
          ? "모든 단원이 확정되었습니다. 아래에서 2단계(정답·해설)를 진행할 수 있습니다."
          : "다음 단원으로 넘어갔습니다.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [uid, sessionId, draftUnit, draftModel, currentUnitIndex, totalUnits]);

  const refreshConfirmedForPrint = useCallback(async () => {
    if (!uid || !sessionId) return;
    const rows = await loadConfirmedUnits(uid, sessionId);
    setConfirmedUnits(rows);
    const ak = await loadAnswerKeyItems(uid, sessionId);
    setAnswerKeyItems(ak);
    setMsg("단원·정답 데이터를 Firestore에서 다시 불러왔습니다.");
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
        const stubs = buildAnswerKeyStubs(unitIndex, unit);
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
          ? `2단계 완료: ${totalWritten}개 문항의 정답·해설을 저장했습니다.`
          : "확인학습·단원평가 문항이 없어 저장할 항목이 없습니다.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "2단계 생성에 실패했습니다.");
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

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>{BRAND_APP_NAME}</p>
            <h1 className={styles.title}>교재 자동 생성 · 1–2단계</h1>
            <p className={styles.lead}>
              단원 수만큼 지문 칸이 열립니다. 각 단원에 직접 붙여넣거나 파일을 여러 개 올린 뒤 PDF는 페이지 범위·개별 페이지를 지정해 추출할 수 있습니다. 세션을 시작한 뒤 단원별 AI
              생성과 2단계 정답·해설을 진행합니다.
            </p>
          </header>

          {!sessionId ? (
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
                  <button type="button" className={styles.btnGhost} onClick={resetSession}>
                    새 세션
                  </button>
                </div>
                <p className={styles.mono}>session: {sessionId.slice(0, 8)}…</p>

                {!isComplete ? (
                  <>
                    <p className={styles.p}>
                      <strong>제 {currentUnitIndex + 1}단원</strong>을 생성한 뒤 내용을 확인하고 확정하세요. 확정 시 다음 단원으로 넘어갑니다.
                    </p>
                    <div className={styles.row}>
                      <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void runGenerate()}>
                        {busy ? "생성 중…" : "이 단원 AI 생성"}
                      </button>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        disabled={busy || !draftUnit}
                        onClick={() => void confirmUnit()}
                      >
                        확정하고 다음 단원
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.p}>모든 단원이 확정되었습니다.</p>
                )}

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

                {draftUnit ? (
                  <div className={styles.preview}>
                    <h3 className={styles.previewTitle}>미리보기 — 제 {currentUnitIndex + 1}단원 · {draftUnit.unitTitle}</h3>
                    <PreviewUnit unit={draftUnit} />
                  </div>
                ) : null}
              </section>

              {isComplete ? (
                <section className={styles.card} aria-labelledby="phase2-h">
                  <h2 id="phase2-h" className={styles.cardTitle}>
                    3. 정답·해설 (2단계)
                  </h2>
                  <p className={styles.p}>
                    문항 id(예: u0-p-0)로 확인학습·단원평가를 묶고, AI가 정답과 불릿 해설을 붙입니다. 실행하면 이 세션의 기존 2단계 저장분은 모두 삭제 후 다시 씁니다.
                  </p>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={busy || confirmedUnits.length === 0}
                      onClick={() => void runPhase2All()}
                    >
                      {busy ? "처리 중…" : "정답·해설 AI 생성"}
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={answerKeyItems.length === 0}
                      onClick={() => printAnswerKey()}
                    >
                      교사용 PDF (정답·해설)
                    </button>
                  </div>
                  {answerKeyItems.length > 0 ? (
                    <p className={styles.hint}>Firestore에 저장된 문항: {answerKeyItems.length}개</p>
                  ) : (
                    <p className={styles.hint}>아직 2단계 데이터가 없습니다.</p>
                  )}
                </section>
              ) : null}
            </>
          )}

          {msg ? <p className={styles.ok}>{msg}</p> : null}
          {err ? <p className={styles.bad}>{err}</p> : null}
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

function PreviewUnit({ unit }: { unit: TextbookUnitContent }) {
  return (
    <div className={styles.draft}>
      <Section title="핵심개념" items={unit.keyConcepts} />
      <Section title="내용학습" items={unit.contentStudy} />
      <Section title="핵심요약" items={unit.coreSummary} />
      <Section title="확인학습" items={unit.practice} />
      <Section title="단원평가" items={unit.unitTest} />
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className={styles.draftSec}>
      <h4 className={styles.draftH}>{title}</h4>
      <ul className={styles.draftUl}>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
