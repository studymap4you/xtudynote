import { PublicShell } from "@/components/PublicShell";
import styles from "@/pages/koreanEducation.module.css";
import "@/pages/pages.css";

export function KoreanEducationPage() {
  return (
    <PublicShell light={true}>
      <main className={styles.page} aria-labelledby="korean-education-title">
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Korean Education</p>
          <h1 id="korean-education-title" className={styles.title}>
            Korean teaching hub for global instructors
          </h1>
          <p className={styles.lede}>
            A clean workspace for Korean-language teachers working abroad. Lectures and resources will be organized in English first so non-native instructors can prepare classes with less friction.
          </p>
        </section>

        <section className={styles.grid} aria-label="Korean education sections">
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.badge}>Lectures</span>
              <h2 className={styles.panelTitle}>Courses</h2>
            </div>
            <p className={styles.panelText}>
              No lectures are published yet. Recorded courses will appear here after they are ready.
            </p>
            <div className={styles.emptyState}>No lecture content</div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.badge}>Resources</span>
              <h2 className={styles.panelTitle}>Teaching materials</h2>
            </div>
            <p className={styles.panelText}>
              Teaching resources for Korean instructors will be collected here in an English-first format.
            </p>
            <div className={styles.emptyState}>No resources published</div>
          </article>
        </section>
      </main>
    </PublicShell>
  );
}
