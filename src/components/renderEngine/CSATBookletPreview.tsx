import { Check, LoaderCircle, Printer, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, useEffect, type CSSProperties } from "react";
import { A4_WIDTH_PX } from "@/components/renderEngine/CSATPage";
import { CSATExplanationBlock } from "@/components/renderEngine/CSATExplanationBlock";
import { ConceptBlockRenderer } from "@/components/renderEngine/ConceptBlockRenderer";
import { CSATTemplateRenderUnit } from "@/components/renderEngine/templates/CSATTemplateBooklet";
import { paginateMeasuredConceptUnits } from "@/lib/conceptAssembly/buildConceptRenderUnits";
import { paginateMeasuredCSATExplanationUnits } from "@/lib/renderEngine/paginateExplanationUnits";
import { paginateMeasuredCSATUnits } from "@/lib/renderEngine/paginateQuestionUnits";
import { printQuestionBooklet } from "@/lib/renderEngine/printQuestionBooklet";
import { renderQuestionBooklet } from "@/lib/renderEngine/renderQuestionBooklet";
import { getRenderTemplate, renderTemplateList } from "@/lib/renderEngine/templateRegistry";
import { templateCssVariables } from "@/lib/renderEngine/templates/templateTokens";
import type { CSATExplanationRenderPage, CSATRenderInput, CSATRenderMode, CSATRenderPage, CSATRenderingStatus, CSATRenderTemplateId } from "@/lib/renderEngine/types";
import type { ConceptRenderPage } from "@/types/conceptAssembly";
import styles from "@/components/renderEngine/csatRender.module.css";
import "@/styles/csat-print.css";

export function CSATBookletPreview({
  input,
  onClose,
  onTemplateChange,
}: {
  input: CSATRenderInput;
  onClose: () => void;
  onTemplateChange?: (templateId: CSATRenderTemplateId) => void;
}) {
  const [mode, setMode] = useState<CSATRenderMode>(input.options?.mode || "student");
  const [status, setStatus] = useState<CSATRenderingStatus>("preparing");
  const [conceptPages, setConceptPages] = useState<ConceptRenderPage[]>([]);
  const [pages, setPages] = useState<CSATRenderPage[]>([]);
  const [explanationPages, setExplanationPages] = useState<CSATExplanationRenderPage[]>([]);
  const [scale, setScale] = useState(1);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const pageBodyRef = useRef<HTMLElement | null>(null);
  const conceptMeasurementListRef = useRef<HTMLDivElement | null>(null);
  const measurementListRef = useRef<HTMLDivElement | null>(null);
  const explanationMeasurementListRef = useRef<HTMLDivElement | null>(null);
  const conceptUnitRefs = useRef(new Map<string, HTMLDivElement>());
  const unitRefs = useRef(new Map<string, HTMLDivElement>());
  const explanationUnitRefs = useRef(new Map<string, HTMLDivElement>());
  const booklet = useMemo(() => renderQuestionBooklet({
    ...input,
    options: { ...input.options, mode, showAnswerKey: mode === "review" },
  }), [input, mode]);
  const template = getRenderTemplate(booklet.templateId);
  const Template = template.component;
  const templateStyle = templateCssVariables(template.tokens) as CSSProperties;
  const showSolutions = booklet.options.mode === "review" && booklet.options.showAnswerKey;

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
    setConceptPages([]);
    setPages([]);
    setExplanationPages([]);
    const frame = window.requestAnimationFrame(() => {
      const pageBody = pageBodyRef.current;
      const conceptList = conceptMeasurementListRef.current;
      const list = measurementListRef.current;
      const explanationList = explanationMeasurementListRef.current;
      const explanationUnits = showSolutions ? booklet.explanationUnits : [];
      if (
        !pageBody
        || !conceptList
        || !list
        || !explanationList
        || booklet.conceptUnits.some((unit) => !conceptUnitRefs.current.has(unit.id))
        || booklet.units.some((unit) => !unitRefs.current.has(unit.id))
        || explanationUnits.some((unit) => !explanationUnitRefs.current.has(unit.id))
      ) {
        setStatus("failed");
        return;
      }
      const conceptHeights = new Map(booklet.conceptUnits.map((unit) => [unit.id, conceptUnitRefs.current.get(unit.id)!.getBoundingClientRect().height]));
      const heights = new Map(booklet.units.map((unit) => [unit.id, unitRefs.current.get(unit.id)!.getBoundingClientRect().height]));
      const explanationHeights = new Map(explanationUnits.map((unit) => [unit.id, explanationUnitRefs.current.get(unit.id)!.getBoundingClientRect().height]));
      const bodyStyle = window.getComputedStyle(pageBody);
      const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 28;
      const conceptGap = Number.parseFloat(window.getComputedStyle(conceptList).rowGap) || gap;
      const explanationGap = Number.parseFloat(window.getComputedStyle(explanationList).rowGap) || gap;
      const verticalPadding = (Number.parseFloat(bodyStyle.paddingTop) || 0) + (Number.parseFloat(bodyStyle.paddingBottom) || 0);
      const pageCapacity = pageBody.clientHeight - verticalPadding;
      const nextConceptPages = paginateMeasuredConceptUnits(booklet.conceptUnits, conceptHeights, pageCapacity, conceptGap);
      const nextPages = paginateMeasuredCSATUnits(booklet.units, heights, pageCapacity, gap);
      const nextExplanationPages = paginateMeasuredCSATExplanationUnits(explanationUnits, explanationHeights, pageCapacity, explanationGap);
      setConceptPages(nextConceptPages);
      setPages(nextPages);
      setExplanationPages(nextExplanationPages);
      setStatus(nextPages.length > 0 ? "ready" : "failed");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [booklet, showSolutions]);

  return (
    <div className={`${styles.previewOverlay} csat-render-preview`} role="dialog" aria-modal="true" aria-label="수능 영어 문제집 미리보기">
      <header className={`${styles.previewToolbar} csat-no-print`}>
        <div>
          <small>Template</small>
          <strong>{template.name}</strong>
          <span>{booklet.conceptSection?.blocks.length || 0} Concepts · {booklet.questions.length} Questions · {conceptPages.length + pages.length + 1 + (showSolutions ? explanationPages.length + 1 : 0)} Pages</span>
        </div>
        {onTemplateChange ? (
          <label className={styles.templateControl}>
            <span>Design</span>
            <select value={booklet.templateId} onChange={(event) => onTemplateChange(event.target.value as CSATRenderTemplateId)} aria-label="교재 디자인 변경">
              {renderTemplateList.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}
            </select>
          </label>
        ) : null}
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
          {pages.length > 0 ? <Template booklet={booklet} conceptPages={conceptPages} pages={pages} explanationPages={explanationPages} scale={scale} /> : null}
        </div>
      </div>
      <div className={`${styles.measurementRoot} csat-measurement-root`} data-csat-template={booklet.templateId} style={templateStyle} aria-hidden="true">
        <article className={styles.page}>
          <div className={styles.measurementHeader} />
          <main ref={pageBodyRef} className={styles.pageBody}>
            <div ref={conceptMeasurementListRef} className={styles.measurementList}>
              {booklet.conceptUnits.map((unit) => (
                <div key={unit.id} ref={(node) => { if (node) conceptUnitRefs.current.set(unit.id, node); else conceptUnitRefs.current.delete(unit.id); }}>
                  <ConceptBlockRenderer unit={unit} />
                </div>
              ))}
            </div>
            <div ref={measurementListRef} className={styles.measurementList}>
              {booklet.units.map((unit) => (
                <div key={unit.id} ref={(node) => { if (node) unitRefs.current.set(unit.id, node); else unitRefs.current.delete(unit.id); }}>
                  <CSATTemplateRenderUnit unit={unit} booklet={booklet} />
                </div>
              ))}
            </div>
            <div ref={explanationMeasurementListRef} className={styles.measurementList}>
              {showSolutions ? booklet.explanationUnits.map((unit) => (
                <div key={unit.id} ref={(node) => { if (node) explanationUnitRefs.current.set(unit.id, node); else explanationUnitRefs.current.delete(unit.id); }}>
                  <CSATExplanationBlock unit={unit} />
                </div>
              )) : null}
            </div>
          </main>
          <div className={styles.measurementFooter} />
        </article>
      </div>
    </div>
  );
}
