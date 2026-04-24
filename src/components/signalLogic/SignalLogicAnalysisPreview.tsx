import { forwardRef } from "react";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import styles from "@/components/signalLogic/signalLogicAnalysisPreview.module.css";

type Props = {
  passage: string;
  report: SignalLogicAnalysisReportJson;
  onExportPdf: () => void;
  pdfBusy: boolean;
  saveMessage: string | null;
  /** PDF 캡처 시 고정 폭 */
  captureMode?: boolean;
};

export const SignalLogicAnalysisPreview = forwardRef<HTMLDivElement, Props>(function SignalLogicAnalysisPreview(
  { passage, report, onExportPdf, pdfBusy, saveMessage, captureMode },
  ref,
) {
  return (
    <div ref={ref} className={`${styles.root} ${captureMode ? styles.rootCapture : ""}`}>
      <header className={styles.brandBar}>
        <div>
          <span className={styles.brandMain}>
            XtudyNote <span className={styles.brandAccent}>|</span> KSAT 영어 분석 리포트
          </span>
        </div>
        <span className={styles.brandSub}>Binary Logic · One-shot Signals</span>
      </header>

      <div className={styles.grid3}>
        <section className={styles.col} aria-labelledby="sl-col-passage">
          <h3 id="sl-col-passage" className={styles.colTitle}>
            원본 지문
          </h3>
          <p className={styles.passageBody}>{passage.trim() || "—"}</p>
        </section>

        <section className={styles.col} aria-labelledby="sl-col-analysis">
          <h3 id="sl-col-analysis" className={styles.colTitle}>
            분석 결과
          </h3>
          <p className={styles.topicLine}>주제문: {report.topicThesis}</p>
          <div className={styles.analysisNarrative}>{report.analysisNarrative || "—"}</div>

          <h4 className={styles.colTitle} style={{ marginTop: "0.5rem" }}>
            핵심 시그널
          </h4>
          <ul className={styles.signalList}>
            {report.coreSignalWords.length === 0 ? (
              <li>—</li>
            ) : (
              report.coreSignalWords.map((s, i) => (
                <li key={`${s.word}-${i}`}>
                  <strong>{s.word}</strong>
                  {s.functionTag ? ` · ${s.functionTag}` : ""} — {s.role}
                </li>
              ))
            )}
          </ul>

          <h4 className={styles.colTitle} style={{ marginTop: "0.5rem" }}>
            이분법 대립
          </h4>
          <ul className={styles.binaryList}>
            {report.binaryOppositions.length === 0 ? (
              <li className={styles.binaryItem}>—</li>
            ) : (
              report.binaryOppositions.map((b, i) => (
                <li key={`${b.poleA}-${b.poleB}-${i}`} className={styles.binaryBlock}>
                  <div className={styles.binaryItem}>
                    <div className={styles.pole}>{b.poleA}</div>
                    <span className={styles.axisInline} aria-hidden>
                      ↔
                    </span>
                    <div className={styles.pole}>{b.poleB}</div>
                  </div>
                  <p className={styles.axisCaption}>{b.axisLabel}</p>
                </li>
              ))
            )}
          </ul>

          {report.signalOneShotNotes && report.signalOneShotNotes.length > 0 && (
            <div className={styles.notes} role="note">
              <strong>원샷 시그널 노트</strong>
              <ul className={styles.signalList}>
                {report.signalOneShotNotes.map((n, i) => (
                  <li key={`n-${i}`}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className={styles.col} aria-labelledby="sl-col-vocab">
          <h3 id="sl-col-vocab" className={styles.colTitle}>
            어휘 정리
          </h3>
          {report.vocabularyItems.length === 0 ? (
            <p className={styles.analysisNarrative}>—</p>
          ) : (
            <table className={styles.vocabTable}>
              <thead>
                <tr>
                  <th>표기</th>
                  <th>의미·용법</th>
                </tr>
              </thead>
              <tbody>
                {report.vocabularyItems.map((v, i) => (
                  <tr key={`${v.term}-${i}`}>
                    <td>
                      <strong>{v.term}</strong>
                    </td>
                    <td>{v.gloss}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className={styles.pdfRow}>
        <div>
          <button type="button" className={styles.pdfBtn} disabled={pdfBusy} onClick={onExportPdf}>
            {pdfBusy ? "PDF 생성 중…" : "PDF로 저장"}
          </button>
          {saveMessage ? (
            <p
              className={`${styles.saveHint} ${
                saveMessage.includes("저장됨")
                  ? styles.saveOk
                  : saveMessage.includes("저장 실패")
                    ? styles.saveErr
                    : ""
              }`}
            >
              {saveMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
});
