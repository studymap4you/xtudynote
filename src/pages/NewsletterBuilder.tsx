import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { DashboardShell } from "@/components/DashboardShell";
import { NewsletterEditModal } from "@/components/newsletter/NewsletterEditModal";
import { NewsletterPrintView } from "@/components/newsletter/NewsletterPrintView";
import { NEWSLETTER_PRINT_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { downloadNewsletterDocx } from "@/lib/newsletter/downloadNewsletterDocx";
import { requestNewsletterFromMaterials } from "@/lib/newsletter/requestNewsletterFromImage";
import { parseCommaSeparatedPdfPages } from "@/lib/pdf/parseCommaSeparatedPdfPages";
import {
  extractWorksheetPassageFromUpload,
  type WorksheetExtractOptions,
} from "@/lib/worksheet/extractWorksheetPassageFromUpload";
import type { NewsletterAiResult, NewsletterPurpose, NewsletterSection } from "@/types/newsletter";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./newsletter-builder.module.css";

const MAX_SOURCE_FILES = 24;

function isNewsletterImageFile(f: File): boolean {
  return f.type.startsWith("image/");
}

function isNewsletterPdfFile(f: File): boolean {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

type PdfExtractMode = "full" | "range" | "pick";

function isPdfExtractPlaceholder(text: string): boolean {
  return text.includes("PDF에서 본문 텍스트를 찾지 못했습니다");
}

function buildPdfExtractOptionsForNewsletter(
  mode: PdfExtractMode,
  fromStr: string,
  toStr: string,
  listStr: string,
): { opts?: WorksheetExtractOptions; error?: string } {
  if (mode === "full") return { opts: undefined };
  if (mode === "range") {
    const fromPage = Math.max(1, parseInt(fromStr.trim(), 10) || 1);
    const toTrim = toStr.trim();
    if (toTrim !== "") {
      const toNum = parseInt(toTrim, 10);
      if (!Number.isFinite(toNum) || toNum < fromPage) {
        return {
          error: "PDF 끝 페이지는 시작 페이지 이상의 숫자로 입력하거나 비워 두세요.",
        };
      }
      return { opts: { pdfPageFrom: fromPage, pdfPageTo: toNum } };
    }
    return { opts: { pdfPageFrom: fromPage } };
  }
  const parsed = parseCommaSeparatedPdfPages(listStr);
  if (parsed === "invalid") {
    return {
      error: "PDF 페이지는 1 이상의 정수를 쉼표로 구분해 입력하세요. 예: 4, 5, 9",
    };
  }
  if (parsed === "empty") {
    return { error: "추출할 페이지 번호를 입력하세요. 예: 4, 5, 9" };
  }
  return { opts: { pdfPageList: parsed } };
}

function displayBody(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\*\*/g, "");
}

function PreviewSectionBody({ s }: { s: NewsletterSection }) {
  const layout =
    s.imageLayout === "left" || s.imageLayout === "right" ? s.imageLayout : "block";
  const pct = s.imageWidthPercent ?? (layout === "block" ? 100 : 40);

  if (s.imageDataUrl && (layout === "left" || layout === "right")) {
    return (
      <div
        className={
          layout === "left" ? styles.sidePreviewRow : `${styles.sidePreviewRow} ${styles.sidePreviewRowRev}`
        }
      >
        <figure
          className={styles.sidePreviewFig}
          style={{ width: `${Math.min(52, Math.max(24, pct))}%` }}
        >
          <img src={s.imageDataUrl} alt="" className={styles.sidePreviewImg} />
        </figure>
        <div className={styles.sidePreviewText}>{displayBody(s.bodyKo)}</div>
      </div>
    );
  }

  return (
    <>
      {s.imageDataUrl ? (
        <div className={styles.previewImageWrap}>
          <img
            src={s.imageDataUrl}
            alt=""
            className={styles.previewImage}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className={styles.body}>{displayBody(s.bodyKo)}</p>
    </>
  );
}

const PURPOSES: { value: NewsletterPurpose; labelKo: string }[] = [
  { value: "parent_monthly", labelKo: "월간 학부모 소식" },
  { value: "teacher_tip", labelKo: "교사·튜터 팁" },
  { value: "student_motivation", labelKo: "학습자 동기·루틴" },
  { value: "brand_story", labelKo: "브랜드·서비스 소개" },
];

export function NewsletterBuilderPage() {
  const { profile } = useAuth();
  const uid = useId();
  const fileInputId = `${uid}-newsletter-sources`;
  const printRef = useRef<HTMLDivElement>(null);

  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [previewEntries, setPreviewEntries] = useState<
    Array<{ name: string; url?: string; isPdf: boolean }>
  >([]);
  const [purpose, setPurpose] = useState<NewsletterPurpose>("parent_monthly");
  const [keywords, setKeywords] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [published, setPublished] = useState<NewsletterAiResult | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [finalizedForPdf, setFinalizedForPdf] = useState(false);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfExtractMode, setPdfExtractMode] = useState<PdfExtractMode>("full");
  const [pdfPageFromInput, setPdfPageFromInput] = useState("1");
  const [pdfPageToInput, setPdfPageToInput] = useState("");
  const [pdfPageListInput, setPdfPageListInput] = useState("");

  const teacherName =
    profile?.displayName?.trim() ||
    profile?.email?.split("@")[0]?.trim() ||
    "Xtudy 마스터";

  useEffect(() => {
    const urls: string[] = [];
    const entries = sourceFiles.map((f) => {
      if (isNewsletterImageFile(f)) {
        const url = URL.createObjectURL(f);
        urls.push(url);
        return { name: f.name, url, isPdf: false };
      }
      return { name: f.name, isPdf: true };
    });
    setPreviewEntries(entries);
    return () => {
      urls.forEach(URL.revokeObjectURL);
    };
  }, [sourceFiles]);

  const onPickSources = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    // FileList는 입력 값을 비우면 즉시 비워지는(live) 참조라, 먼저 복사해야 합니다.
    const arr = files && files.length > 0 ? Array.from(files) : [];
    e.target.value = "";
    if (!arr.length) {
      setSourceFiles([]);
      return;
    }
    if (arr.length > MAX_SOURCE_FILES) {
      setError(`한 번에 최대 ${MAX_SOURCE_FILES}개까지 선택할 수 있습니다.`);
      return;
    }
    const bad = arr.find((f) => !isNewsletterImageFile(f) && !isNewsletterPdfFile(f));
    if (bad) {
      setError(`지원하지 않는 형식입니다: ${bad.name} (이미지 또는 PDF만)`);
      return;
    }
    setSourceFiles(arr);
  }, []);

  const clearSources = useCallback(() => {
    setSourceFiles([]);
    setError(null);
  }, []);

  const removeSourceAt = useCallback((index: number) => {
    setSourceFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  const runGenerate = useCallback(async () => {
    const imageFiles = sourceFiles.filter(isNewsletterImageFile);
    const pdfFiles = sourceFiles.filter(isNewsletterPdfFile);
    if (imageFiles.length === 0 && pdfFiles.length === 0) {
      setError("이미지 또는 PDF를 하나 이상 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let pdfOpts: WorksheetExtractOptions | undefined;
      if (pdfFiles.length > 0) {
        const built = buildPdfExtractOptionsForNewsletter(
          pdfExtractMode,
          pdfPageFromInput,
          pdfPageToInput,
          pdfPageListInput,
        );
        if (built.error) {
          setError(built.error);
          return;
        }
        pdfOpts = built.opts;
      }

      const pdfDocuments: { fileName: string; text: string }[] = [];
      for (const f of pdfFiles) {
        const text = (await extractWorksheetPassageFromUpload(f, pdfOpts)).trim();
        if (text && !isPdfExtractPlaceholder(text)) pdfDocuments.push({ fileName: f.name, text });
      }
      if (imageFiles.length === 0 && pdfDocuments.length === 0) {
        setError("PDF에서 읽을 텍스트가 없습니다. 다른 파일을 선택해 주세요.");
        return;
      }
      const { data, model } = await requestNewsletterFromMaterials({
        imageFiles,
        pdfDocuments,
        purpose,
        keywords,
        newsletterTitle: titleOverride || undefined,
      });
      setPublished(data);
      setFinalizedForPdf(false);
      setModelLabel(model);
    } catch (err: unknown) {
      setPublished(null);
      setFinalizedForPdf(false);
      setModelLabel(null);
      setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [
    sourceFiles,
    purpose,
    keywords,
    titleOverride,
    pdfExtractMode,
    pdfPageFromInput,
    pdfPageToInput,
    pdfPageListInput,
  ]);

  const printNewsletter = useReactToPrint({
    contentRef: printRef,
    documentTitle: () => {
      const raw = published?.titleKo?.slice(0, 72) ?? "newsletter";
      const safe = raw.replace(/[/\\?%*:|"<>]/g, "_").trim() || "newsletter";
      return `Xtudy-Universe_Newsletter_${safe}`;
    },
    pageStyle: NEWSLETTER_PRINT_PAGE_STYLE,
    onBeforePrint: async () => {
      setPdfBusy(true);
      /* 수정 완료 직후 인쇄 시 printRef 자식이 아직 커밋 안 된 프레임이 있을 수 있음 */
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    },
    onAfterPrint: () => {
      setPdfBusy(false);
    },
    onPrintError: (_loc, err) => {
      setError(err.message);
      setPdfBusy(false);
    },
  });

  const runPrint = useCallback(() => {
    if (!published || !finalizedForPdf) return;
    setError(null);
    printNewsletter();
  }, [published, finalizedForPdf, printNewsletter]);

  const runExportDocx = useCallback(async () => {
    if (!published || !finalizedForPdf) return;
    setExportBusy(true);
    setError(null);
    try {
      await downloadNewsletterDocx({
        data: published,
        teacherName,
        issueLabel: new Date().toLocaleDateString("ko-KR", { dateStyle: "medium" }),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Word 파일 저장에 실패했습니다.");
    } finally {
      setExportBusy(false);
    }
  }, [published, finalizedForPdf, teacherName]);

  return (
    <DashboardShell light>
      <div className={styles.root}>
        <Link to="/dashboard" className={styles.back}>
          ← 대시보드
        </Link>
        <header className={styles.head}>
          <h1>Newsletter Builder</h1>
          <p className={styles.headLead}>
            <span className="ui-en">
              Upload images/PDFs (multi-select) → Vision + PDF text → preview → finalize edits → export Word (.docx) for Google Docs, or print to PDF.
            </span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
              이미지와 PDF를 <strong>여러 개 한꺼번에</strong> 올릴 수 있습니다. GPT-4o Vision이 이미지의 지문·필기를 읽고, PDF는 본문 텍스트를 추출해 함께 분석합니다.{" "}
              <strong>학습법 분석(Binary Logic / 시그널 로직)</strong>이 메인 섹션에 들어간 뉴스레터 초안이 만들어집니다.
              확정 후 <strong>Word(.docx) 내보내기</strong>로 구글 독스 등에서 열어 수정하거나, 브라우저{" "}
              <strong>인쇄</strong>에서 <strong>PDF로 저장</strong>할 수 있습니다.
            </span>
          </p>
        </header>

        <div className={styles.grid}>
          <section className={styles.panel} aria-label="입력">
            <h2 className={styles.panelTitle}>Editor</h2>

            <div className={styles.field}>
              <div className={styles.uploadRow}>
                <label htmlFor={fileInputId}>이미지·PDF 업로드 (다중 선택)</label>
                {sourceFiles.length > 0 ? (
                  <button
                    type="button"
                    className={styles.btnLink}
                    onClick={clearSources}
                    disabled={busy}
                  >
                    선택 초기화
                  </button>
                ) : null}
              </div>
              <p className={styles.uploadHint}>
                한 파일 선택 대화상자에서 Ctrl/Shift로 여러 장을 고를 수 있습니다. PDF는 텍스트 추출 후 AI에 전달되고, 이미지는 비전으로 함께 분석됩니다.
              </p>
              <input
                id={fileInputId}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                onChange={onPickSources}
              />
              {sourceFiles.length > 0 ? (
                <p className={styles.fileCount} aria-live="polite">
                  {sourceFiles.length}개 파일 선택됨 (개별 제거는 썸네일의 ×를 누르세요)
                </p>
              ) : null}
              {previewEntries.length > 0 ? (
                <div className={styles.sourcePreviews} aria-label="선택한 파일 미리보기">
                  {previewEntries.map((e, i) =>
                    e.isPdf ? (
                      <div key={`pdf-${e.name}-${i}`} className={styles.sourceTile}>
                        <button
                          type="button"
                          className={styles.removeSource}
                          onClick={() => removeSourceAt(i)}
                          disabled={busy}
                          aria-label={`${e.name} 목록에서 제거`}
                        >
                          ×
                        </button>
                        <div className={styles.pdfChip} title={e.name}>
                          <span className={styles.pdfIcon} aria-hidden>
                            PDF
                          </span>
                          <span className={styles.pdfName}>{e.name}</span>
                        </div>
                      </div>
                    ) : (
                      <div key={e.url ?? `img-${e.name}-${i}`} className={styles.sourceTile}>
                        <button
                          type="button"
                          className={styles.removeSource}
                          onClick={() => removeSourceAt(i)}
                          disabled={busy}
                          aria-label={`${e.name} 목록에서 제거`}
                        >
                          ×
                        </button>
                        <div className={styles.thumb}>
                          <img src={e.url} alt="" />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </div>

            {sourceFiles.some(isNewsletterPdfFile) ? (
              <div className={styles.pdfScope}>
                <p className={styles.pdfScopeTitle}>PDF 텍스트 추출 범위</p>
                <p className={styles.pdfScopeHint}>
                  모든 업로드한 PDF에 동일하게 적용됩니다. 이미지는 비전으로 전체를 봅니다.
                </p>
                <div className={styles.segmentRow} role="radiogroup" aria-label="PDF 추출 범위">
                  <label className={styles.segmentLabel}>
                    <input
                      type="radio"
                      name={`${uid}-pdf-extract`}
                      checked={pdfExtractMode === "full"}
                      onChange={() => setPdfExtractMode("full")}
                      disabled={busy}
                    />
                    전체
                  </label>
                  <label className={styles.segmentLabel}>
                    <input
                      type="radio"
                      name={`${uid}-pdf-extract`}
                      checked={pdfExtractMode === "range"}
                      onChange={() => setPdfExtractMode("range")}
                      disabled={busy}
                    />
                    페이지 구간
                  </label>
                  <label className={styles.segmentLabel}>
                    <input
                      type="radio"
                      name={`${uid}-pdf-extract`}
                      checked={pdfExtractMode === "pick"}
                      onChange={() => setPdfExtractMode("pick")}
                      disabled={busy}
                    />
                    특정 페이지
                  </label>
                </div>
                {pdfExtractMode === "range" ? (
                  <div className={styles.pageRangeRow}>
                    <label className={styles.pageField}>
                      <span className={styles.pageFieldCap}>시작</span>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={pdfPageFromInput}
                        onChange={(e) => setPdfPageFromInput(e.target.value)}
                        disabled={busy}
                        aria-label="PDF 시작 페이지"
                      />
                    </label>
                    <label className={styles.pageField}>
                      <span className={styles.pageFieldCap}>끝</span>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={pdfPageToInput}
                        onChange={(e) => setPdfPageToInput(e.target.value)}
                        disabled={busy}
                        placeholder="마지막까지"
                        aria-label="PDF 끝 페이지"
                      />
                    </label>
                  </div>
                ) : null}
                {pdfExtractMode === "pick" ? (
                  <label className={styles.pageListField}>
                    <span className={styles.pageFieldCap}>페이지</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pdfPageListInput}
                      onChange={(e) => setPdfPageListInput(e.target.value)}
                      disabled={busy}
                      placeholder="예: 4, 5, 9"
                      aria-label="PDF 특정 페이지, 쉼표 구분"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <div className={styles.field}>
              <label htmlFor={`${uid}-purpose`}>뉴스레터 목적</label>
              <select
                id={`${uid}-purpose`}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as NewsletterPurpose)}
              >
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.labelKo}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-kw`}>키워드 (쉼표로 구분)</label>
              <textarea
                id={`${uid}-kw`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="예: 수능 영어, 직독직해, 시그널, 오답 노트"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-title`}>뉴스레터 제목 힌트 (선택)</label>
              <input
                id={`${uid}-title`}
                type="text"
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder="비우면 AI가 제목을 제안합니다"
              />
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy || sourceFiles.length === 0}
                onClick={() => void runGenerate()}
              >
                {busy ? "생성 중…" : "뉴스레터 생성"}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={exportBusy || !published || !finalizedForPdf}
                onClick={() => void runExportDocx()}
                title={!published ? undefined : !finalizedForPdf ? "미리보기에서 「수정」 후 「수정완료」를 누른 뒤 사용할 수 있습니다." : undefined}
              >
                {exportBusy ? "Word 만드는 중…" : "Word(.docx) 내보내기"}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={pdfBusy || !published || !finalizedForPdf}
                onClick={runPrint}
                title={!published ? undefined : !finalizedForPdf ? "미리보기에서 「수정」 후 「수정완료」를 누른 뒤 사용할 수 있습니다." : undefined}
              >
                {pdfBusy ? "인쇄 준비 중…" : "인쇄 / PDF 저장"}
              </button>
            </div>
            {published && !finalizedForPdf ? (
              <p className={styles.pdfHint}>
                내용 확인·편집 후 미리보기 아래 「수정」을 열고 「수정완료」로 확정한 뒤, Word 파일로 내보내거나 인쇄로 PDF를 저장하세요.
              </p>
            ) : null}

            {modelLabel ? <p className={styles.meta}>모델: {modelLabel}</p> : null}
            {error ? (
              <div className={styles.error} role="alert">
                {error}
              </div>
            ) : null}
          </section>

          <section className={styles.panel} aria-label="미리보기">
            <h2 className={styles.panelTitle}>Preview</h2>
            <div className={styles.preview}>
              {!published ? (
                <p className={styles.previewEmpty}>
                  이미지·PDF와 옵션을 채운 뒤 「뉴스레터 생성」을 누르면 이 영역에 결과가 표시됩니다. 메인 섹션은 항상{" "}
                  <strong>Binary Logic · 시그널 로직</strong> 기반 학습법 분석입니다.
                </p>
              ) : (
                <>
                  <h3 className={styles.previewTitle}>{published.titleKo}</h3>
                  {published.sections.map((s) => (
                    <article key={s.id} className={styles.section}>
                      <div className={styles.sectionHead}>
                        <h2>{s.headingKo}</h2>
                        {s.id === "binaryLogic" ? (
                          <span className={styles.mainBadge}>Main · Binary Logic</span>
                        ) : null}
                        {/^pair_\d+$/.test(s.id) ? (
                          <span className={styles.pairBadge}>이미지·텍스트</span>
                        ) : null}
                      </div>
                      <PreviewSectionBody s={s} />
                    </article>
                  ))}
                </>
              )}
            </div>
            {published ? (
              <div className={styles.previewActions}>
                <button type="button" className={styles.btnSilver} onClick={() => setEditOpen(true)}>
                  수정
                </button>
                {finalizedForPdf ? (
                  <span className={styles.finalizedTag}>수정 확정됨 — Word 내보내기·인쇄(PDF) 가능</span>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {published ? (
        <NewsletterEditModal
          open={editOpen}
          initial={published}
          onCancel={() => setEditOpen(false)}
          onComplete={(next) => {
            setPublished(next);
            setFinalizedForPdf(true);
            setEditOpen(false);
          }}
        />
      ) : null}

      <div ref={printRef} className={styles.printSink}>
        {published ? (
          <NewsletterPrintView
            data={published}
            teacherName={teacherName}
            issueLabel={new Date().toLocaleDateString("ko-KR", { dateStyle: "medium" })}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
