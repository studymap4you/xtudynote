import type { CSATExplanationRenderUnit } from "@/lib/renderEngine/types";
import styles from "@/components/renderEngine/csatRender.module.css";

export function CSATExplanationBlock({ unit }: { unit: CSATExplanationRenderUnit }) {
  const { question } = unit;
  const distractors = question.choices
    .filter((choice) => !choice.isCorrect)
    .map((choice) => choice.distractorPattern)
    .filter(Boolean)
    .join(" · ");

  return (
    <section className={`${styles.reviewPanel} ${styles.explanationBlock}`}>
      <header>
        <b>QUESTION {String(question.studentNumber).padStart(2, "0")}</b>
        <span>ANSWER {question.answer}</span>
      </header>
      <p>{question.explanation}</p>
      <dl>
        <div><dt>Source</dt><dd>{question.sourceId}</dd></div>
        {distractors ? <div><dt>Distractors</dt><dd>{distractors}</dd></div> : null}
      </dl>
    </section>
  );
}
