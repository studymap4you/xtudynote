import type { CSSProperties } from "react";
import { CSATPage, A4_HEIGHT_PX, A4_WIDTH_PX } from "@/components/renderEngine/CSATPage";
import { CSATPageFooter } from "@/components/renderEngine/CSATPageFooter";
import { CSATExplanationSectionRenderer } from "@/components/renderEngine/CSATExplanationSectionRenderer";
import { CSATQuestionBlock } from "@/components/renderEngine/CSATQuestionBlock";
import { ConceptSectionRenderer } from "@/components/renderEngine/ConceptSectionRenderer";
import { getCSATTemplateTokens, templateCssVariables } from "@/lib/renderEngine/templates/templateTokens";
import type { CSATRenderTemplateId } from "@/lib/renderEngine/templateIds";
import type { CSATRenderUnit, CSATTemplateProps, PreparedCSATBooklet } from "@/lib/renderEngine/types";
import styles from "@/components/renderEngine/csatRender.module.css";

export function CSATTemplateRenderUnit({ unit, booklet, previousUnit, nextUnit }: {
  unit: CSATRenderUnit;
  booklet: PreparedCSATBooklet;
  previousUnit?: CSATRenderUnit;
  nextUnit?: CSATRenderUnit;
}) {
  if (unit.kind === "question") {
    const sameQuestionAsPrevious = previousUnit?.kind === "question" && previousUnit.question.id === unit.question.id;
    const sameQuestionAsNext = nextUnit?.kind === "question" && nextUnit.question.id === unit.question.id;
    return <CSATQuestionBlock unit={unit} options={booklet.options} sameQuestionAsPrevious={sameQuestionAsPrevious} sameQuestionAsNext={sameQuestionAsNext} />;
  }
  const sameGroupAsPrevious = previousUnit?.kind === "shared-passage" && previousUnit.groupId === unit.groupId;
  const sameGroupAsNext = nextUnit?.kind === "shared-passage" && nextUnit.groupId === unit.groupId;
  return (
    <section className={`${styles.sharedPassage}${unit.continuation ? ` ${styles.continuationBlock}` : ""}${sameGroupAsPrevious ? ` ${styles.samePageContinuation}` : ""}${sameGroupAsNext ? ` ${styles.samePageBeforeContinuation}` : ""}`}>
      {!sameGroupAsPrevious ? (
        <header>
          <b>{unit.continuation ? "SHARED READING · CONTINUED" : "SHARED READING"}</b>
          <span>QUESTIONS {String(unit.startNumber).padStart(2, "0")}–{String(unit.endNumber).padStart(2, "0")}</span>
        </header>
      ) : null}
      <p className={styles.passage}>{unit.passage}</p>
    </section>
  );
}

function CoverPage({ booklet, scale, templateId }: { booklet: PreparedCSATBooklet; scale: number; templateId: CSATRenderTemplateId }) {
  const tokens = getCSATTemplateTokens(templateId);
  return (
    <div className={`${styles.pageViewport} csat-page-viewport`} style={{ width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` }}>
      <article className={`${styles.page} ${styles.coverPage} csat-page`} style={{ transform: `scale(${scale})` }}>
        <div className={styles.coverTopline}><b>XUniverse Learning</b><span>{tokens.cover.edition}</span></div>
        <div className={styles.coverSquares} aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
        <div className={styles.coverHero}>
          <small>{tokens.cover.eyebrow}</small>
          <h1>English<br />CSAT</h1>
          <p>{booklet.title}</p>
        </div>
        <div className={styles.coverDetails}>
          <section><b>CONTENTS</b><strong>{booklet.conceptSection?.blocks.length || 0} Concepts · {booklet.questions.length} Questions</strong><span>{booklet.target || "CSAT Reading Practice"}</span></section>
          <section><b>FOCUS</b><strong>{booklet.subtitle || tokens.cover.focus}</strong><span>Validated question set</span></section>
          <section><b>EDITION</b><strong>{booklet.options.mode === "student" ? "Student Book" : "Review Book"}</strong><span>XUniverse deterministic layout</span></section>
          {booklet.options.showMotivationalCopy ? <section className={styles.coverMicrocopy}><b>STUDY NOTE</b><strong>{tokens.cover.motivationalCopy}</strong><span>Keep going.</span></section> : null}
        </div>
        <div className={styles.coverFooterBand}><span>XUNIVERSE LEARNING</span><b>{tokens.cover.footer}</b></div>
        <CSATPageFooter pageNumber={1} />
      </article>
    </div>
  );
}

function AnswerKeyPage({ booklet, scale, pageNumber }: { booklet: PreparedCSATBooklet; scale: number; pageNumber: number }) {
  return (
    <CSATPage pageNumber={pageNumber} section="PART 03 · ANSWERS & EXPLANATIONS" scale={scale}>
      <section className={styles.answerKey}>
        <small>REVIEW EDITION</small>
        <h2>Answer Key</h2>
        <div>{booklet.questions.map((question) => <span key={question.id}><b>{String(question.studentNumber).padStart(2, "0")}</b><em>{question.answer}</em></span>)}</div>
      </section>
    </CSATPage>
  );
}

export function CSATTemplateBooklet({ booklet, conceptPages, pages, explanationPages, scale, templateId }: CSATTemplateProps & { templateId: CSATRenderTemplateId }) {
  const showAnswerKey = booklet.options.mode === "review" && booklet.options.showAnswerKey;
  const answerKeyPageNumber = conceptPages.length + pages.length + 2;
  const tokens = getCSATTemplateTokens(templateId);
  return (
    <div className={`${styles.pageStack} csat-page-stack`} data-csat-template={templateId} style={templateCssVariables(tokens) as CSSProperties}>
      <CoverPage booklet={booklet} scale={scale} templateId={templateId} />
      {conceptPages.map((page, index) => (
        <ConceptSectionRenderer key={page.id} page={page} pageNumber={index + 2} scale={scale} />
      ))}
      {pages.map((page, index) => (
        <CSATPage key={page.id} pageNumber={conceptPages.length + index + 2} section={`PART 02 · PRACTICE · ${booklet.questions.length} QUESTIONS`} scale={scale}>
          {page.units.map((unit, unitIndex) => (
            <CSATTemplateRenderUnit key={unit.id} unit={unit} booklet={booklet} previousUnit={page.units[unitIndex - 1]} nextUnit={page.units[unitIndex + 1]} />
          ))}
        </CSATPage>
      ))}
      {showAnswerKey ? <AnswerKeyPage booklet={booklet} scale={scale} pageNumber={answerKeyPageNumber} /> : null}
      {showAnswerKey ? explanationPages.map((page, index) => (
        <CSATExplanationSectionRenderer key={page.id} page={page} pageNumber={answerKeyPageNumber + index + 1} scale={scale} />
      )) : null}
    </div>
  );
}
