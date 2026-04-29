import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { useAuth } from "@/contexts/AuthContext";
import { SignalLogicAnalysisPreview } from "@/components/signalLogic/SignalLogicAnalysisPreview";
import { extractPlainTextFromLocalFile } from "@/lib/localFile/extractLocalFileText";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { requestSignalLogicAnalysis } from "@/lib/signalLogic/requestSignalLogicAnalysis";
import { downloadSignalLogicReportDocx } from "@/lib/signalLogic/downloadSignalLogicReportDocx";
import { saveSignalLogicReport } from "@/lib/signalLogic/saveSignalLogicReport";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import styles from "@/components/signalLogic/signalLogicAnalysisModal.module.css";

const LOCAL_ACCEPT =
  ".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Phase = "input" | "running" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SignalLogicAnalysisModal({ open, onClose }: Props) {
  const titleId = useId();
  const { firebaseUser, canManageMaterials } = useAuth();
  const [phase, setPhase] = useState<Phase>("input");
  const [passage, setPassage] = useState("");
  const [report, setReport] = useState<SignalLogicAnalysisReportJson | null>(null);
  const [analysisModel, setAnalysisModel] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [signalReportFirestoreId, setSignalReportFirestoreId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const printAnalysis = useReactToPrint({
    contentRef: previewRef,
    documentTitle: "Xtudy-Universe_KSAT_Analysis_Report",
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
    setSignalReportFirestoreId(null);
    setPhase("input");
    setReport(null);
    setAnalysisModel("");
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
      const body = (await extractPlainTextFromLocalFile(file)).trim();
      const insert = `${file.name ? `【${file.name}】\n\n` : ""}${body}`.trim();
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
  }, []);

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
      const { report: r, meta } = await requestSignalLogicAnalysis(text);
      setReport(r);
      setAnalysisModel(meta.model);
      setPhase("done");

      if (firebaseUser?.uid) {
        try {
          const { id } = await saveSignalLogicReport(firebaseUser.uid, text, r, meta.model);
          setSignalReportFirestoreId(id);
          setSaveNote("저장됨 · Firestore 분석 리포트에 기록되었습니다.");
        } catch (se) {
          setSignalReportFirestoreId(null);
          setSaveNote(`저장 실패: ${se instanceof Error ? se.message : String(se)}`);
        }
      } else {
        setSignalReportFirestoreId(null);
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
    printAnalysis();
  }, [report, printAnalysis]);

  const onExportWord = useCallback(async () => {
    if (!report) return;
    setWordBusy(true);
    setError(null);
    try {
      await downloadSignalLogicReportDocx({ passage, report });
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
              Signal Logic <span className={styles.titleAccent}>분석</span>
            </h2>
            <p className={styles.sub}>지문 입력 → AI 분석 및 문서 생성 · Xtudy-Universe KSAT 리포트 규격</p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.panel}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="sl-passage-textarea">
                지문
              </label>
              <button
                type="button"
                className={styles.fileBtn}
                disabled={fileBusy || runBusy}
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
            <textarea
              id="sl-passage-textarea"
              ref={textareaRef}
              className={styles.textarea}
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              disabled={phase === "running"}
              placeholder=".txt · .pdf · .docx 파일을 불러오거나, 지문을 직접 붙여 넣으세요."
            />

            <div className={styles.analyzeRow}>
              <button
                type="button"
                className={styles.analyzeBtn}
                disabled={runBusy || !passage.trim()}
                onClick={() => void runAnalysis()}
              >
                {runBusy ? "분석 중…" : "분석 및 문서 생성"}
              </button>
              {analysisModel ? (
                <span className={styles.modelTag}>모델: {analysisModel}</span>
              ) : null}
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}
          </div>

          {phase === "done" && report ? (
            <div className={styles.previewWrap}>
              <SignalLogicAnalysisPreview
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
          {phase === "done" && report && canManageMaterials && signalReportFirestoreId ? (
            <Link
              to={`/teacher/assignments/new?signalReportId=${signalReportFirestoreId}`}
              className={styles.analyzeBtn}
              style={{ textDecoration: "none", textAlign: "center" }}
              onClick={() => onClose()}
            >
              학습지로 배포
            </Link>
          ) : null}
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
