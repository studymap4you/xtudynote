import type { ConceptRenderUnit } from "@/types/conceptAssembly";
import styles from "@/components/renderEngine/csatRender.module.css";

function sourceLabel(unit: ConceptRenderUnit): string {
  const source = unit.block.source;
  return [
    source.sourceTitle,
    source.publicationYear || null,
    source.chapter,
    source.section,
    source.page ? `p. ${source.page}` : null,
  ].filter(Boolean).join(" · ");
}

export function ConceptBlockRenderer({ unit }: { unit: ConceptRenderUnit }) {
  return (
    <section className={`${styles.conceptBlock}${unit.continuation ? ` ${styles.conceptContinuation}` : ""}`}>
      {unit.showTitle ? (
        <header className={styles.conceptHeader}>
          <span>CONCEPT</span>
          <div>
            <small>{unit.block.conceptKey.replaceAll("_", " ")}</small>
            <h2>{unit.block.title}</h2>
          </div>
        </header>
      ) : (
        <p className={styles.conceptContinuedLabel}>CONTINUED · {unit.block.title}</p>
      )}
      <div className={styles.conceptContent}>{unit.content}</div>
      {unit.showTitle ? <footer className={styles.conceptSource}>{sourceLabel(unit)}</footer> : null}
    </section>
  );
}

