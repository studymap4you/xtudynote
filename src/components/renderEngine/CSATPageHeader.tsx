import styles from "@/components/renderEngine/csatRender.module.css";

export function CSATPageHeader({ section }: { section: string }) {
  return (
    <header className={styles.pageHeader}>
      <span><b>XUniverse Learning</b><em>English CSAT</em></span>
      <small>{section}</small>
    </header>
  );
}
