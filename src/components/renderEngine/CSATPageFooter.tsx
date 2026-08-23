import styles from "@/components/renderEngine/csatRender.module.css";

export function CSATPageFooter({ pageNumber }: { pageNumber: number }) {
  return (
    <footer className={styles.pageFooter}>
      <span>XUniverse Learning · English CSAT</span>
      <b>{String(pageNumber).padStart(2, "0")}</b>
    </footer>
  );
}
