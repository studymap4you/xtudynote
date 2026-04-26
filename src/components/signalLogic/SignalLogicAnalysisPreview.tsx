import { forwardRef } from "react";
import type {
  SignalLogicAnalysisReportJson,
  SignalLogicCoreSignalWord,
} from "@/types/signalLogicAnalysisReport";
import styles from "@/components/signalLogic/signalLogicAnalysisPreview.module.css";

type Props = {
  passage: string;
  report: SignalLogicAnalysisReportJson;
  onExportPdf: () => void;
  pdfBusy: boolean;
  saveMessage: string | null;
};

function renderBoldMarkdown(text: string): React.ReactNode {
  const parts = text.split("**");
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i}>{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function RichParagraphs({ text }: { text: string }) {
  const t = text.trim();
  if (!t) return <p className={styles.proseMuted}>—</p>;
  const blocks = t.split(/\n\n+/);
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i} className={styles.proseBlock}>
          {renderBoldMarkdown(block)}
        </p>
      ))}
    </>
  );
}

function isRichSignal(s: SignalLogicCoreSignalWord): boolean {
  return !!(s.phenomenonKo || s.evidenceQuote || s.explanationKo || s.flowKo);
}

export const SignalLogicAnalysisPreview = forwardRef<HTMLDivElement, Props>(function SignalLogicAnalysisPreview(
  { passage, report, onExportPdf, pdfBusy, saveMessage },
  ref,
) {
  const oneShot = report.oneShotSignalWord?.trim() || report.coreSignalWords[0]?.word || "";

  return (
    <div ref={ref} className={styles.root}>
      <header className={styles.docHeader}>
        <span className={styles.brandMain}>
          Xtudy-Universe <span className={styles.brandAccent}>|</span> KSAT 영어 분석 리포트
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
          <div className={styles.analysisNarrative}>
            <RichParagraphs text={report.analysisNarrative || "—"} />
          </div>
        </section>

        <section className={styles.sectionBlock} aria-labelledby="sl-signals">
          <h3 id="sl-signals" className={styles.sectionTitle}>
            핵심 시그널
          </h3>
          {oneShot ? (
            <div className={styles.oneShotBanner} role="status">
              <span className={styles.oneShotLabel}>One-Shot Signal</span>
              <strong className={styles.oneShotWord} lang="en">
                {oneShot}
              </strong>
            </div>
          ) : null}
          {report.coreSignalWords.length === 0 ? (
            <p className={styles.proseMuted}>—</p>
          ) : (
            <div className={styles.signalCardList}>
              {report.coreSignalWords.map((s, i) => (
                <article key={`${s.word}-${i}`} className={styles.signalCard}>
                  <h4 className={styles.signalCardHead}>
                    <span className={styles.signalCardWord} lang="en">
                      {s.word}
                    </span>
                    {s.functionTag ? (
                      <span className={styles.signalCardTag}>{s.functionTag}</span>
                    ) : null}
                    <span className={styles.signalCardRole}>{s.role}</span>
                  </h4>
                  {isRichSignal(s) ? (
                    <div className={styles.signalCardBody}>
                      {s.phenomenonKo ? (
                        <div className={styles.signalStep}>
                          <span className={styles.stepLabel}>① 현상 제시</span>
                          <RichParagraphs text={s.phenomenonKo} />
                        </div>
                      ) : null}
                      {s.evidenceQuote ? (
                        <div className={styles.signalStep}>
                          <span className={styles.stepLabel}>② 근거 문장 (지문 인용)</span>
                          <blockquote className={styles.evidenceQuote} lang="en">
                            {s.evidenceQuote}
                          </blockquote>
                        </div>
                      ) : null}
                      {s.explanationKo ? (
                        <div className={styles.signalStep}>
                          <span className={styles.stepLabel}>③ 논리적 해설</span>
                          <RichParagraphs text={s.explanationKo} />
                        </div>
                      ) : null}
                      {s.flowKo ? (
                        <div className={styles.signalStep}>
                          <span className={styles.stepLabel}>④ 논지 흐름 (Flow)</span>
                          <RichParagraphs text={s.flowKo} />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.signalFallback}>
                      <strong>{s.word}</strong>
                      {s.functionTag ? ` · ${s.functionTag}` : ""} — {s.role}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.sectionBlock} aria-labelledby="sl-binary">
          <h3 id="sl-binary" className={styles.sectionTitle}>
            이분법 대립
          </h3>
          {report.binaryOppositions.length === 0 ? (
            <p className={styles.proseMuted}>—</p>
          ) : (
            <ul className={styles.binaryList}>
              {report.binaryOppositions.map((b, i) => (
                <li key={`${b.poleA}-${b.poleB}-${i}`} className={styles.binaryBlock}>
                  <div className={styles.binaryItem}>
                    <div className={styles.pole}>{b.poleA}</div>
                    <span className={styles.axisInline} aria-hidden>
                      ↔
                    </span>
                    <div className={styles.pole}>{b.poleB}</div>
                  </div>
                  <p className={styles.axisCaption}>{b.axisLabel}</p>
                  {b.keySentenceQuote ? (
                    <>
                      <span className={styles.stepLabel}>핵심 문장 (지문 인용)</span>
                      <blockquote className={styles.evidenceQuote} lang="en">
                        {b.keySentenceQuote}
                      </blockquote>
                    </>
                  ) : null}
                  {b.rationaleKo ? (
                    <div className={styles.binaryNarrative}>
                      <span className={styles.stepLabel}>키워드 선정·대조 근거</span>
                      <RichParagraphs text={b.rationaleKo} />
                    </div>
                  ) : null}
                  {b.relationKo ? (
                    <div className={styles.binaryNarrative}>
                      <span className={styles.stepLabel}>논리 관계 (A ↔ B)</span>
                      <RichParagraphs text={b.relationKo} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {report.signalOneShotNotes && report.signalOneShotNotes.length > 0 ? (
          <div className={styles.notes} role="note">
            <strong>원샷 시그널 노트</strong>
            <ul className={styles.signalList}>
              {report.signalOneShotNotes.map((n, i) => (
                <li key={`n-${i}`}>
                  <RichParagraphs text={n} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className={styles.sectionBlock} aria-labelledby="sl-vocab">
          <h3 id="sl-vocab" className={styles.sectionTitle}>
            어휘 정리
          </h3>
          {report.vocabularyItems.length === 0 ? (
            <p className={styles.proseMuted}>—</p>
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
                    <td>
                      <RichParagraphs text={v.gloss} />
                    </td>
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
        [Xtudy-Universe · 지식 큐레이터]
      </footer>
    </div>
  );
});
