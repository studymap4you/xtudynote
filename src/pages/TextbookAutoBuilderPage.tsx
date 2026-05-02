import { useCallback, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { DashboardShell } from "@/components/DashboardShell";
import { TextbookAutoPrintView } from "@/components/textbookAuto/TextbookAutoPrintView";
import { useAuth } from "@/contexts/AuthContext";
import { BRAND_APP_NAME } from "@/lib/brand";
import { extractPlainTextFromLocalFile } from "@/lib/localFile/extractLocalFileText";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { requestTextbookUnitGeneration } from "@/lib/textbookAuto/requestTextbookUnitGeneration";
import {
  createTextbookAutoSession,
  loadConfirmedUnits,
  setSessionCurrentUnit,
  writeUnitConfirmed,
  writeUnitDraft,
} from "@/lib/textbookAuto/textbookAutoFirestore";
import type { TextbookUnitContent } from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoBuilder.module.css";

const MAX_SOURCE_CHARS = 100_000;
const AI_SOURCE_SLICE = 24_000;

function sliceForAi(full: string): string {
  if (full.length <= AI_SOURCE_SLICE) return full;
  return full.slice(0, AI_SOURCE_SLICE);
}

export function TextbookAutoBuilderPage() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const printRef = useRef<HTMLDivElement>(null);

  const [bookTitle, setBookTitle] = useState("");
  const [totalUnits, setTotalUnits] = useState(3);
  const [sourceText, setSourceText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** Firestore `currentUnitIndex`: 다음에 생성·확정할 단원 (0-based) */
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [draftUnit, setDraftUnit] = useState<TextbookUnitContent | null>(null);
  const [confirmedUnits, setConfirmedUnits] = useState<{ unitIndex: number; unit: TextbookUnitContent }[]>([]);
  const [draftModel, setDraftModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isComplete = sessionId !== null && currentUnitIndex >= totalUnits;

  const printBook = useReactToPrint({
    contentRef: printRef,
    documentTitle: () =>
      bookTitle.trim() ? `Xtudy_Textbook_${bookTitle.trim().slice(0, 24)}` : "Xtudy_Textbook",
    pageStyle: REACT_TO_PRINT_A4_PAGE_STYLE,
  });

  const resetSession = useCallback(() => {
    setSessionId(null);
    setCurrentUnitIndex(0);
    setDraftUnit(null);
    setDraftModel("");
    setConfirmedUnits([]);
    setMsg(null);
    setErr(null);
  }, []);

  const startSession = useCallback(async () => {
    setErr(null);
    setMsg(null);
    const title = bookTitle.trim();
    const src = sourceText.trim();
    const n = Math.min(30, Math.max(1, Math.floor(totalUnits)));
    if (!uid) {
      setErr("로그인 정보가 없습니다.");
      return;
    }
    if (!title) {
      setErr("교재 제목을 입력하세요.");
      return;
    }
    if (!src) {
      setErr("원문 텍스트를 붙여넣거나 파일을 업로드하세요.");
      return;
    }
    if (src.length > MAX_SOURCE_CHARS) {
      setErr(`원문은 약 ${MAX_SOURCE_CHARS.toLocaleString()}자 이내로 준비해 주세요.`);
      return;
    }
    setBusy(true);
    try {
      const sid = await createTextbookAutoSession(uid, { title, sourceText: src, totalUnits: n });
      setSessionId(sid);
      setTotalUnits(n);
      setCurrentUnitIndex(0);
      setDraftUnit(null);
      setConfirmedUnits([]);
      setMsg("세션이 시작되었습니다. 아래에서 단원별 생성을 진행하세요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "세션을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [uid, bookTitle, sourceText, totalUnits]);

  const runGenerate = useCallback(async () => {
    setErr(null);
    setMsg(null);
    if (!uid || !sessionId) return;
    const title = bookTitle.trim();
    const src = sourceText.trim();
    if (!title || !src) {
      setErr("제목과 원문이 필요합니다.");
      return;
    }
    if (currentUnitIndex >= totalUnits) return;
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
          ? `생성했습니다. (원문 ${AI_SOURCE_SLICE.toLocaleString()}자까지 AI에 전달됨)`
          : "생성했습니다. 내용을 확인한 뒤 확정하세요.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [uid, sessionId, bookTitle, sourceText, currentUnitIndex, totalUnits]);

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
      setConfirmedUnits((prev) => [...prev, { unitIndex: currentUnitIndex, unit: draftUnit }].sort((a, b) => a.unitIndex - b.unitIndex));
      setCurrentUnitIndex(next);
      setDraftUnit(null);
      setDraftModel("");
      setMsg(next >= totalUnits ? "모든 단원이 확정되었습니다. PDF(인쇄)로 저장할 수 있습니다." : "다음 단원으로 넘어갔습니다.");
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
    setMsg("확정된 단원을 Firestore에서 다시 불러왔습니다.");
  }, [uid, sessionId]);

  const onFile = useCallback(async (f: File | null) => {
    if (!f) return;
    setErr(null);
    setFileBusy(true);
    try {
      const t = await extractPlainTextFromLocalFile(f);
      setSourceText(t);
      setMsg(`「${f.name}」에서 텍스트를 추출했습니다.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    } finally {
      setFileBusy(false);
    }
  }, []);

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>{BRAND_APP_NAME}</p>
            <h1 className={styles.title}>교재 자동 생성 · 1단계</h1>
            <p className={styles.lead}>
              로그인한 사용자만 이용할 수 있습니다. 단원 수를 정한 뒤 단원마다 AI 초안을 만들고 확정하면 Firestore에 저장됩니다. PDF는 브라우저 인쇄로 저장하세요.
            </p>
          </header>

          {!sessionId ? (
            <section className={styles.card} aria-labelledby="setup-h">
              <h2 id="setup-h" className={styles.cardTitle}>
                1. 세션 시작
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
                <span className={styles.label}>총 단원 수 (1–30)</span>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={30}
                  value={totalUnits}
                  onChange={(e) => setTotalUnits(Number(e.target.value) || 1)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>원문 (.txt · .pdf · .docx 업로드 또는 직접 입력)</span>
                <input
                  type="file"
                  accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className={styles.file}
                  disabled={fileBusy}
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    void onFile(files[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <textarea
                className={styles.textarea}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="원문 전체 또는 일부를 붙여넣으세요."
                rows={14}
                maxLength={MAX_SOURCE_CHARS}
              />
              <p className={styles.hint}>
                {sourceText.length.toLocaleString()} / {MAX_SOURCE_CHARS.toLocaleString()}자
                {sourceText.length > AI_SOURCE_SLICE ? ` · AI 전달 상한 약 ${AI_SOURCE_SLICE.toLocaleString()}자` : ""}
              </p>
              <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void startSession()}>
                {busy ? "처리 중…" : "세션 시작"}
              </button>
            </section>
          ) : (
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
                  PDF로 저장 (인쇄)
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
