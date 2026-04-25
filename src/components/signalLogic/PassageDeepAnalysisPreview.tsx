import { forwardRef } from "react";
import type {
  PassageDeepAnalysisReportJson,
  PassageDeepBilingualBlock,
} from "@/types/passageDeepAnalysisReport";
import styles from "@/components/signalLogic/passageDeepAnalysisPreview.module.css";

type Props = {
  passage: string;
  report: PassageDeepAnalysisReportJson;
  onExportPdf: () => void;
  pdfBusy: boolean;
  saveMessage: string | null;
};

function BilingualBlockView({ block }: { block: PassageDeepBilingualBlock }) {
  return (
    <div className={styles.bilingual}>
      <p className={styles.bEn} lang="en">
        {block.english}
      </p>
      <p className={styles.bKo} lang="ko">
        {block.koreanExplanation}
      </p>
    </div>
  );
}

export const PassageDeepAnalysisPreview = forwardRef<HTMLDivElement, Props>(function PassageDeepAnalysisPreview(
  { passage, report, onExportPdf, pdfBusy, saveMessage },
  ref,
) {
  return (
    <div ref={ref} className={styles.root}>
      <header className={styles.docHeader}>
        <span className={styles.brandMain}>
          XtudyNote <span className={styles.brandAccent}>|</span> 지문 심층 분석
        </span>
        <span className={styles.brandSub}>문장 단위 · 의미 단위(/) · 직독·해석·어휘·문법</span>
      </header>

      <div className={styles.docStack}>
        <section className={styles.sectionBlock} aria-labelledby="pd-passage">
          <h3 id="pd-passage" className={styles.sectionTitle}>
            원본 지문
          </h3>
          <p className={styles.passageBody}>{passage.trim() || "—"}</p>
        </section>

        <section className={styles.sectionBlock} aria-labelledby="pd-theme-title">
          <h3 id="pd-theme-title" className={styles.sectionTitle}>
            주제 · 제목
          </h3>
          <div className={styles.metaBlock}>
            <span className={styles.metaLabel}>1. 주제</span>
            <BilingualBlockView block={report.theme} />
          </div>
          <div className={styles.metaBlock}>
            <span className={styles.metaLabel}>2. 제목</span>
            <BilingualBlockView block={report.passageTitle} />
          </div>
        </section>

        <section className={styles.sectionBlock} aria-labelledby="pd-deep">
          <h3 id="pd-deep" className={styles.sectionTitle}>
            3. 지문 심층 분석 (문장별)
          </h3>
          {report.sentences.length === 0 ? (
            <p className={styles.subText}>문장 분석이 없습니다.</p>
          ) : (
            report.sentences.map((s) => (
              <article key={s.sentenceIndex} className={styles.sentenceCard}>
                <div className={styles.sentenceHead}>문장 {s.sentenceIndex}</div>
                <p className={styles.sentenceEn}>{s.sentenceEnglish}</p>
                <div className={styles.meaningSlash} aria-label="의미 단위">
                  {s.meaningUnits.length > 0 ? s.meaningUnits.join(" / ") : "—"}
                </div>
                <div className={styles.subBlock}>
                  <div className={styles.subLabel}>직독직해</div>
                  <p className={styles.subText}>{s.literalTranslation}</p>
                </div>
                <div className={styles.subBlock}>
                  <div className={styles.subLabel}>전문 해석</div>
                  <p className={styles.subText}>{s.professionalInterpretation}</p>
                </div>
                <div className={styles.subBlock}>
                  <div className={styles.subLabel}>주요 어휘·표현 (영문 + 한국어 해설)</div>
                  <ul className={styles.vocabList}>
                    {s.keyVocabItems.map((item, j) => (
                      <li key={`${s.sentenceIndex}-v-${j}`} className={styles.vocabItem}>
                        <BilingualBlockView block={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))
          )}
        </section>

        <section className={styles.sectionBlock} aria-labelledby="pd-summary">
          <h3 id="pd-summary" className={styles.sectionTitle}>
            4. 핵심 표현 정리 · 5. 핵심 문법·구문
          </h3>
          <div className={styles.subBlock}>
            <div className={styles.subLabel}>4. 핵심 표현 정리 (영문 + 한국어 해설)</div>
            <BilingualBlockView block={report.keyExpressionsSummary} />
          </div>
          <div className={styles.subBlock}>
            <div className={styles.subLabel}>5. 핵심 문법·구문 (영문 + 한국어 해설)</div>
            <BilingualBlockView block={report.keyGrammarSyntax} />
          </div>
        </section>
      </div>

      <p className={styles.printHint}>
        화면에는 A4 본문 영역 높이마다 옅은 가이드선이 표시됩니다. 인쇄·PDF 저장 시에는 제거됩니다.
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
