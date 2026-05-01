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
  onExportWord: () => void;
  wordBusy: boolean;
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

function PairLineRow({ item }: { item: PassageDeepBilingualBlock }) {
  return (
    <li className={styles.exprItem}>
      <div className={styles.pairRow}>
        <span className={styles.pairEn} lang="en">
          {item.english}
        </span>
        <span className={styles.pairSep} aria-hidden>
          :
        </span>
        <span className={styles.pairKo} lang="ko">
          {item.koreanExplanation}
        </span>
      </div>
    </li>
  );
}

export const PassageDeepAnalysisPreview = forwardRef<HTMLDivElement, Props>(function PassageDeepAnalysisPreview(
  { passage, report, onExportPdf, pdfBusy, onExportWord, wordBusy, saveMessage },
  ref,
) {
  return (
    <div ref={ref} className={`passage-deep-print ${styles.root}`}>
      <header className={styles.docHeader}>
        <span className={styles.brandMain}>
          Xtudy-Universe <span className={styles.brandAccent}>|</span> 지문 심층 분석
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

        <section
          className={`${styles.sectionBlock} ${styles.sectionBlockKeep}`}
          aria-labelledby="pd-theme-title"
        >
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
                <div className={styles.subBlock}>
                  <div className={styles.subLabel}>의미 단위 (영문)</div>
                  <div className={styles.meaningSlash} aria-label="의미 단위 영문">
                    {s.meaningUnits.length > 0 ? s.meaningUnits.join(" / ") : "—"}
                  </div>
                </div>
                <div className={styles.subBlock}>
                  <div className={styles.subLabel}>직독직해 (한국어, 위와 동일 순서·구획)</div>
                  <div className={`${styles.meaningSlash} ${styles.literalSlash}`} aria-label="직독직해 한국어">
                    {s.literalTranslationUnits.length > 0 ? s.literalTranslationUnits.join(" / ") : "—"}
                  </div>
                </div>
                <div className={styles.subBlock}>
                  <div className={styles.subLabel}>전문 해석 (한국어)</div>
                  <p className={styles.subText} lang="ko">
                    {s.professionalInterpretation}
                  </p>
                </div>
                <div className={styles.printCategory}>
                  <div className={styles.subLabel}>주요 어휘·표현</div>
                  <ul className={styles.exprList}>
                    {s.keyVocabItems.map((item, j) => (
                      <PairLineRow key={`${s.sentenceIndex}-v-${j}`} item={item} />
                    ))}
                  </ul>
                </div>
              </article>
            ))
          )}
        </section>

        <section className={`${styles.sectionBlock} ${styles.sectionBlockKeep}`} aria-labelledby="pd-expr">
          <h3 id="pd-expr" className={styles.sectionTitle}>
            4. 핵심 표현 정리
          </h3>
          <ul className={styles.exprList}>
            {report.keyExpressionsList.map((item, j) => (
              <PairLineRow key={`expr-${j}`} item={item} />
            ))}
          </ul>
        </section>

        <section className={`${styles.sectionBlock} ${styles.sectionBlockKeep}`} aria-labelledby="pd-grm">
          <h3 id="pd-grm" className={styles.sectionTitle}>
            5. 핵심 문법·구문
          </h3>
          <ul className={styles.exprList}>
            {report.keyGrammarSyntaxList.map((item, j) => (
              <PairLineRow key={`grm-${j}`} item={item} />
            ))}
          </ul>
        </section>
      </div>

      <p className={styles.printHint}>
        화면에는 A4 본문 영역 높이마다 옅은 가이드선이 표시됩니다. 인쇄·PDF 저장 시에는 제거됩니다.
      </p>

      <div className={`${styles.pdfRow} ${styles.noPrint}`}>
        <div className={styles.exportBtnRow}>
          <button
            type="button"
            className={styles.pdfBtn}
            disabled={pdfBusy || wordBusy}
            onClick={onExportPdf}
          >
            {pdfBusy ? "PDF 준비 중…" : "PDF로 저장 (인쇄)"}
          </button>
          <button
            type="button"
            className={styles.wordBtn}
            disabled={pdfBusy || wordBusy}
            onClick={onExportWord}
          >
            {wordBusy ? "Word 만드는 중…" : "Word(.docx) 내보내기"}
          </button>
        </div>
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
