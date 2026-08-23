import { Check, LoaderCircle, Printer, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { A4_WIDTH_PX } from "@/components/renderEngine/CSATPage";
import { XUniverseCSATRenderUnit } from "@/components/renderEngine/templates/XUniverseCSATStudygramTemplate";
import { paginateMeasuredCSATUnits } from "@/lib/renderEngine/paginateQuestionUnits";
import { printQuestionBooklet } from "@/lib/renderEngine/printQuestionBooklet";
import { renderQuestionBooklet } from "@/lib/renderEngine/renderQuestionBooklet";
import { renderTemplates } from "@/lib/renderEngine/templateRegistry";
import type { CSATRenderInput, CSATRenderMode, CSATRenderPage, CSATRenderingStatus } from "@/lib/renderEngine/types";
import styles from "@/components/renderEngine/csatRender.module.css";
import "@/styles/csat-print.css";

export function CSATBookletPreview({ input, onClose }: { input: CSATRenderInput; onClose: () => void }) {
  const [mode, setMode] = useState<CSATRenderMode>(input.options?.mode || "student");
  const [status, setStatus] = useState<CSATRenderingStatus>("preparing");
  const [pages, setPages] = useState<CSATRenderPage[]>([]);
  const [scale, setScale] = useState(1);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const pageBodyRef = useRef<HTMLElement | null>(null);
  const measurementListRef = useRef<HTMLDivElement | null>(null);
  const unitRefs = useRef(new Map<string, HTMLDivElement>());
  const booklet = useMemo(() => renderQuestionBooklet({
    ...input,
    options: { ...input.options, mode, showAnswerKey: mode === "review" },
  }), [input, mode]);
  const template = renderTemplates[booklet.templateId];
  const Template = template.component;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const updateScale = () => {
      const available = Math.max(280, preview.clientWidth - 32);
      setScale(Math.min(1, available / A4_WIDTH_PX));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    setStatus("rendering");
    const frame = window.requestAnimationFrame(() => {
      const pageBody = pageBodyRef.current;
      const list = measurementListRef.current;
      if (!pageBody || !list || booklet.units.some((unit) => !unitRefs.current.has(unit.id))) {
        setStatus("failed");
        return;
      }
      const heights = new Map(booklet.units.map((unit) => [unit.id, unitRefs.current.get(unit.id)!.getBoundingClientRect().height]));
      const bodyStyle = window.getComputedStyle(pageBody);
      const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 28;
      const verticalPadding = (Number.parseFloat(bodyStyle.paddingTop) || 0) + (Number.parseFloat(bodyStyle.paddingBottom) || 0);
      const pageCapacity = pageBody.clientHeight - verticalPadding;
      const nextPages = paginateMeasuredCSATUnits(booklet.units, heights, pageCapacity, gap);
      setPages(nextPages);
      setStatus(nextPages.length > 0 ? "ready" : "failed");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [booklet]);

  return (
    <div className={`${styles.previewOverlay} csat-render-preview`} role="dialog" aria-modal="true" aria-label="수능 영어 문제집 미리보기">
      <header className={`${styles.previewToolbar} csat-no-print`}>
        <div>
          <small>Template</small>
          <strong>{template.name}</strong>
          <span>{booklet.questions.length} Questions · {pages.length + 1} Pages</span>
        </div>
        <div className={styles.modeControl} aria-label="미리보기 모드">
          <button type="button" data-active={mode === "student" || undefined} onClick={() => setMode("student")}>Student</button>
          <button type="button" data-active={mode === "review" || undefined} onClick={() => setMode("review")}>Review</button>
        </div>
        <div className={styles.toolbarActions}>
          <span>{status === "ready" ? <><Check size={15} /> Ready</> : <><LoaderCircle className={styles.spinner} size={15} /> Preparing</>}</span>
          <button type="button" className={styles.printButton} onClick={printQuestionBooklet} disabled={status !== "ready"}><Printer size={17} /> PDF로 저장 / 인쇄</button>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="미리보기 닫기" title="닫기"><X size={20} /></button>
        </div>
      </header>
      {booklet.issues.length > 0 ? <p className={`${styles.issueNotice} csat-no-print`}>유효하지 않은 문항 {booklet.issues.length}개는 출력에서 제외되었습니다.</p> : null}
      <div ref={previewRef} className={`${styles.previewScroll} csat-preview-scroll`}>
        <div data-csat-print-root className="csat-print-root">
          {status === "failed" ? <p className={`${styles.renderError} csat-no-print`}>문제집 페이지를 구성하지 못했습니다. 문항 데이터를 확인해주세요.</p> : null}
          {pages.length > 0 ? <Template booklet={booklet} pages={pages} scale={scale} /> : null}
        </div>
      </div>
      <div className={`${styles.measurementRoot} csat-measurement-root`} aria-hidden="true">
        <article className={styles.page}>
          <div className={styles.measurementHeader} />
          <main ref={pageBodyRef} className={styles.pageBody}>
            <div ref={measurementListRef} className={styles.measurementList}>
              {booklet.units.map((unit) => (
                <div key={unit.id} ref={(node) => { if (node) unitRefs.current.set(unit.id, node); else unitRefs.current.delete(unit.id); }}>
                  <XUniverseCSATRenderUnit unit={unit} booklet={booklet} />
                </div>
              ))}
            </div>
          </main>
          <div className={styles.measurementFooter} />
        </article>
      </div>
    </div>
  );
}
