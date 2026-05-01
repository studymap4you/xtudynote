import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useReactToPrint } from "react-to-print";
import { useAuth } from "@/contexts/AuthContext";
import { PassageDeepAnalysisPreview } from "@/components/signalLogic/PassageDeepAnalysisPreview";
import { parseCommaSeparatedPdfPages } from "@/lib/pdf/parseCommaSeparatedPdfPages";
import {
  extractWorksheetPassageFromUpload,
  isWorksheetPdfUpload,
  type WorksheetExtractOptions,
} from "@/lib/worksheet/extractWorksheetPassageFromUpload";
import { requestPassageDeepAnalysis } from "@/lib/passageDeep/requestPassageDeepAnalysis";
import { savePassageDeepReport } from "@/lib/passageDeep/savePassageDeepReport";
import { downloadPassageDeepReportDocx } from "@/lib/passageDeep/downloadPassageDeepReportDocx";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import type { PassageDeepAnalysisReportJson } from "@/types/passageDeepAnalysisReport";
import styles from "@/components/signalLogic/signalLogicAnalysisModal.module.css";

const LOCAL_ACCEPT =
  ".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Phase = "input" | "running" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PassageDeepAnalysisModal({ open, onClose }: Props) {
  const titleId = useId();
  const { firebaseUser } = useAuth();
  const [phase, setPhase] = useState<Phase>("input");
  const [passage, setPassage] = useState("");
  const [report, setReport] = useState<PassageDeepAnalysisReportJson | null>(null);
  const [analysisModel, setAnalysisModel] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [uploadAnalysisMode, setUploadAnalysisMode] = useState<"full" | "range" | "pick">("full");
  const [pdfPageFromInput, setPdfPageFromInput] = useState("1");
  const [pdfPageToInput, setPdfPageToInput] = useState("");
  const [pdfPageListInput, setPdfPageListInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const printReport = useReactToPrint({
    contentRef: previewRef,
    documentTitle: "Xtudy-Universe_Passage_Deep_Analysis",
    pageStyle: REACT_TO_PRINT_A4_PAGE_STYLE,
    onBeforePrint: async () => {
      setPdfBusy(true);
    },
    onAfterPrint: () => {
      setPdfBusy(false);
    },
    onPrintError: (_loc, err) => {
      setError(err.message);
      setPdfBusy(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaveNote(null);
    setPhase("input");
    setReport(null);
    setAnalysisModel("");
    setUploadAnalysisMode("full");
    setPdfPageFromInput("1");
    setPdfPageToInput("");
    setPdfPageListInput("");
    const t = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const onLocalFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const ta = textareaRef.current;
    const start = ta ? ta.selectionStart : 0;
    const end = ta ? ta.selectionEnd : 0;

    setError(null);
    setFileBusy(true);
    try {
      const ext = file.name.toLowerCase();
      const isTxt = ext.endsWith(".txt") || (file.type || "").toLowerCase() === "text/plain";

      let body: string;
      if (isTxt) {
        body = (await file.text()).replace(/^\uFEFF/, "");
      } else {
        let extractOpts: WorksheetExtractOptions | undefined;
        if (isWorksheetPdfUpload(file)) {
          if (uploadAnalysisMode === "range") {
            const fromPage = Math.max(1, parseInt(pdfPageFromInput.trim(), 10) || 1);
            const toTrim = pdfPageToInput.trim();
            if (toTrim !== "") {
              const toNum = parseInt(toTrim, 10);
              if (!Number.isFinite(toNum) || toNum < fromPage) {
                setError("PDF 끝 페이지는 시작 페이지 이상의 숫자로 입력하거나 비워 두세요.");
                return;
              }
              extractOpts = { pdfPageFrom: fromPage, pdfPageTo: toNum };
            } else {
              extractOpts = { pdfPageFrom: fromPage };
            }
          } else if (uploadAnalysisMode === "pick") {
            const parsed = parseCommaSeparatedPdfPages(pdfPageListInput);
            if (parsed === "invalid") {
              setError("PDF 페이지는 1 이상의 정수를 쉼표로 구분해 입력하세요. 예: 4, 5, 9");
              return;
            }
            if (parsed === "empty") {
              setError("추출할 페이지 번호를 입력하세요. 예: 4, 5, 9");
              return;
            }
            extractOpts = { pdfPageList: parsed };
          }
        }
        body = await extractWorksheetPassageFromUpload(file, extractOpts);
      }

      const insert = `${file.name ? `【${file.name}】\n\n` : ""}${body.trim()}`.trim();
      if (!insert) {
        setError("파일에서 읽을 텍스트가 없습니다.");
        return;
      }

      let caret = 0;
      flushSync(() => {
        setPassage((prev) => {
          const prefix = prev.slice(0, start);
          const suffix = prev.slice(end);
          const sep = prefix.length > 0 && !/\n$/.test(prefix) ? "\n\n" : "";
          const next = `${prefix}${sep}${insert}${suffix}`;
          caret = prefix.length + sep.length + insert.length;
          return next;
        });
      });

      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = Math.min(caret, el.value.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFileBusy(false);
    }
  }, [pdfPageFromInput, pdfPageListInput, pdfPageToInput, uploadAnalysisMode]);

  const runAnalysis = useCallback(async () => {
    const text = passage.trim();
    if (!text) {
      setError("지문을 입력한 뒤 분석을 실행해 주세요.");
      return;
    }
    setError(null);
    setSaveNote(null);
    setRunBusy(true);
    setPhase("running");
    try {
      const { report: r, meta } = await requestPassageDeepAnalysis(text);
      setReport(r);
      setAnalysisModel(meta.model);
      setPhase("done");

      if (firebaseUser?.uid) {
        try {
          await savePassageDeepReport(firebaseUser.uid, text, r, meta.model);
          setSaveNote("저장됨 · Firestore 지문 심층 분석에 기록되었습니다.");
        } catch (se) {
          setSaveNote(`저장 실패: ${se instanceof Error ? se.message : String(se)}`);
        }
      } else {
        setSaveNote("로그인하면 같은 결과가 Firestore에 자동 저장됩니다.");
      }
    } catch (err) {
      setPhase("input");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunBusy(false);
    }
  }, [passage, firebaseUser?.uid]);

  const onExportPdf = useCallback(() => {
    if (!report) return;
    printReport();
  }, [report, printReport]);

  const onExportWord = useCallback(async () => {
    if (!report) return;
    setWordBusy(true);
    setError(null);
    try {
      await downloadPassageDeepReportDocx({ passage, report });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Word 저장에 실패했습니다.");
    } finally {
      setWordBusy(false);
    }
  }, [passage, report]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.title}>
              지문 <span className={styles.titleAccent}>심층 분석</span>
            </h2>
            <p className={styles.sub}>
              문장 단위 · 의미 단위(/) · 직독직해·전문해석·어휘·문법 — PDF(인쇄) 및 Word(.docx) 내보내기
            </p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.panel}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="pd-passage-textarea">
                지문
              </label>
              <button
                type="button"
                className={styles.fileBtn}
                disabled={fileBusy || runBusy || phase === "running"}
                onClick={() => fileInputRef.current?.click()}
              >
                {fileBusy ? "불러오는 중…" : "파일 불러오기"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={LOCAL_ACCEPT}
              className={styles.visuallyHidden}
              aria-label="텍스트, PDF, Word 파일 선택"
              onChange={(ev) => void onLocalFileChange(ev)}
            />
            <div className={styles.uploadScope}>
              <span className={styles.uploadScopeLabel}>파일 분석 범위 (PDF)</span>
              <div className={styles.segmentRow} role="radiogroup" aria-label="PDF 업로드 분석 범위">
                <label className={styles.segmentItem}>
                  <input
                    type="radio"
                    name="pd-upload-scope"
                    checked={uploadAnalysisMode === "full"}
                    onChange={() => setUploadAnalysisMode("full")}
                    disabled={fileBusy || runBusy || phase === "running"}
                  />
                  <span>전체</span>
                </label>
                <label className={styles.segmentItem}>
                  <input
                    type="radio"
                    name="pd-upload-scope"
                    checked={uploadAnalysisMode === "range"}
                    onChange={() => setUploadAnalysisMode("range")}
                    disabled={fileBusy || runBusy || phase === "running"}
                  />
                  <span>
                    페이지 구간 <span className={styles.segmentNote}>(PDF)</span>
                  </span>
                </label>
                <label className={styles.segmentItem}>
                  <input
                    type="radio"
                    name="pd-upload-scope"
                    checked={uploadAnalysisMode === "pick"}
                    onChange={() => setUploadAnalysisMode("pick")}
                    disabled={fileBusy || runBusy || phase === "running"}
                  />
                  <span>
                    특정 페이지 <span className={styles.segmentNote}>(PDF)</span>
                  </span>
                </label>
              </div>
              {uploadAnalysisMode === "range" ? (
                <div className={styles.pageRangeGrid}>
                  <label className={styles.pageField}>
                    <span className={styles.pageFieldLabel}>시작</span>
                    <input
                      className={styles.pageNumInput}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={pdfPageFromInput}
                      onChange={(e) => setPdfPageFromInput(e.target.value)}
                      disabled={fileBusy || runBusy || phase === "running"}
                      aria-label="PDF 시작 페이지"
                    />
                  </label>
                  <label className={styles.pageField}>
                    <span className={styles.pageFieldLabel}>끝 (비우면 끝까지)</span>
                    <input
                      className={styles.pageNumInput}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={pdfPageToInput}
                      onChange={(e) => setPdfPageToInput(e.target.value)}
                      disabled={fileBusy || runBusy || phase === "running"}
                      placeholder="—"
                      aria-label="PDF 끝 페이지"
                    />
                  </label>
                  <p className={styles.scopeHint}>.txt · .docx 는 전체 내용만 불러옵니다.</p>
                </div>
              ) : null}
              {uploadAnalysisMode === "pick" ? (
                <div className={styles.pageRangeGrid}>
                  <label className={styles.pageFieldWide}>
                    <span className={styles.pageFieldLabel}>페이지 번호</span>
                    <input
                      className={styles.pageListInput}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pdfPageListInput}
                      onChange={(e) => setPdfPageListInput(e.target.value)}
                      disabled={fileBusy || runBusy || phase === "running"}
                      placeholder="예: 4, 5, 9"
                      aria-label="PDF 특정 페이지"
                    />
                  </label>
                  <p className={styles.scopeHint}>.txt · .docx 는 구간 없이 전체입니다.</p>
                </div>
              ) : null}
            </div>
            <textarea
              id="pd-passage-textarea"
              ref={textareaRef}
              className={styles.textarea}
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              disabled={phase === "running"}
              placeholder=".txt · .pdf · .docx 파일을 불러오거나, 지문 전체를 붙여 넣으세요."
            />

            <div className={styles.analyzeRow}>
              <button
                type="button"
                className={styles.analyzeBtn}
                disabled={runBusy || !passage.trim()}
                onClick={() => void runAnalysis()}
              >
                {runBusy ? "분석 중…" : "심층 분석 실행"}
              </button>
              {analysisModel ? <span className={styles.modelTag}>모델: {analysisModel}</span> : null}
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}
          </div>

          {phase === "done" && report ? (
            <div className={styles.previewWrap}>
              <PassageDeepAnalysisPreview
                ref={previewRef}
                passage={passage}
                report={report}
                onExportPdf={onExportPdf}
                pdfBusy={pdfBusy}
                onExportWord={() => void onExportWord()}
                wordBusy={wordBusy}
                saveMessage={saveNote}
              />
            </div>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
