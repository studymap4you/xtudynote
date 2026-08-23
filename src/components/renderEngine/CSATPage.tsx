import type { ReactNode } from "react";
import { CSATPageFooter } from "@/components/renderEngine/CSATPageFooter";
import { CSATPageHeader } from "@/components/renderEngine/CSATPageHeader";
import styles from "@/components/renderEngine/csatRender.module.css";

export const A4_WIDTH_PX = 793.7008;
export const A4_HEIGHT_PX = 1122.5197;

export function CSATPage({
  children,
  pageNumber,
  section,
  scale,
}: {
  children: ReactNode;
  pageNumber: number;
  section: string;
  scale: number;
}) {
  return (
    <div
      className={`${styles.pageViewport} csat-page-viewport`}
      style={{ width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` }}
    >
      <article className={`${styles.page} csat-page`} style={{ transform: `scale(${scale})` }}>
        <CSATPageHeader section={section} />
        <main className={styles.pageBody}>{children}</main>
        <CSATPageFooter pageNumber={pageNumber} />
      </article>
    </div>
  );
}
