import { forwardRef } from "react";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import styles from "@/components/signalLogic/signalLogicAnalysisPreview.module.css";

type Props = {
  passage: string;
  report: SignalLogicAnalysisReportJson;
  onExportPdf: () => void;
  pdfBusy: boolean;
  saveMessage: string | null;
};

export const SignalLogicAnalysisPreview = forwardRef<HTMLDivElement, Props>(function SignalLogicAnalysisPreview(
  { passage, report, onExportPdf, pdfBusy, saveMessage },
  ref,
) {
  return (
    <div ref={ref} className={styles.root}>
      <header className={styles.docHeader}>
        <span className={styles.brandMain}>
          XtudyNote <span className={styles.brandAccent}>|</span> KSAT 영어 분석 리포트
        </span>
        <span className={styles.brandSub}>Binary Logic · One-shot Signals</span>
      </header>

      <div className={styles.docStack}>
        <section className={styles.sectionBlock} aria-labelledby="sl-passage">
          <h3 id="sl-passage" className={styles.sectionTitle}>
            원본 지문
          </h3>
          <p className={styles.passageBody}>{passage.trim() || "—"}</p>
        </section>

        <section className={styles.sectionBlock} aria-labelledby="sl-analysis">
          <h3 id="sl-analysis" className={styles.sectionTitle}>
            분석 결과
          </h3>
          <p className={styles.topicLine}>주제문: {report.topicThesis}</p>
          <div className={styles.analysisNarrative}>{report.analysisNarrative || "—"}</div>
        </section>

        <section className={styles.sectionBlock} aria-labelledby="sl-signals">
          <h3 id="sl-signals" className={styles.sectionTitle}>
            핵심 시그널
          </h3>
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
        </section>

        <section className={styles.sectionBlock} aria-labelledby="sl-binary">
          <h3 id="sl-binary" className={styles.sectionTitle}>
            이분법 대립
          </h3>
          <ul className={styles.binaryList}>
            {report.binaryOppositions.length === 0 ? (
              <li className={styles.binaryBlock}>
                <div className={styles.binaryItem}>—</div>
              </li>
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
        </section>

        {report.signalOneShotNotes && report.signalOneShotNotes.length > 0 ? (
          <div className={styles.notes} role="note">
            <strong>원샷 시그널 노트</strong>
            <ul className={styles.signalList}>
              {report.signalOneShotNotes.map((n, i) => (
                <li key={`n-${i}`}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className={styles.sectionBlock} aria-labelledby="sl-vocab">
          <h3 id="sl-vocab" className={styles.sectionTitle}>
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

      <p className={styles.printHint}>
        화면에는 A4 한 면 높이(본문 영역)마다 옅은 가이드선이 표시됩니다. 인쇄·PDF 저장 시에는 제거됩니다.
      </p>

      <div className={`${styles.pdfRow} ${styles.noPrint}`}>
        <button type="button" className={styles.pdfBtn} disabled={pdfBusy} onClick={onExportPdf}>
          {pdfBusy ? "PDF 준비 중…" : "PDF로 저장 (인쇄)"}
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

      <footer
        className={styles.printRunningFooter}
        title="Chromium·Edge 등에서는 인쇄 대화상자의「머리글 및 바닥글」에서도 페이지 번호를 켤 수 있습니다."
      >
        [XtudyNote - 지식 큐레이터 엑스플로어]
      </footer>
    </div>
  );
});
