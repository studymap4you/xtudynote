import { useCallback, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { PremiumTemplateSelector } from "@/components/premium/PremiumTemplateSelector";
import { PremiumTextbookPreview } from "@/components/premium/PremiumTextbookPreview";
import { TextbookAutoPrintView } from "@/components/textbookAuto/TextbookAutoPrintView";
import { UniversalFileAttachmentPanel, type UniversalAttachmentItem } from "@/components/UniversalFileAttachmentPanel";
import {
  getXUniversePremiumTemplate,
  xuniversePremiumTemplates,
  type XUniversePremiumTemplateId,
} from "@/data/xuniversePremiumTemplates";
import { BRAND_APP_NAME } from "@/lib/brand";
import { extractPlainTextFromLocalFile } from "@/lib/localFile/extractLocalFileText";
import { parseManuscriptToModules } from "@/lib/localDocumentAuto/manuscriptModules";
import {
  generatePremiumTextbook,
  toPremiumUploadedFileMetadata,
  type GeneratePremiumTextbookResult,
} from "@/lib/premiumTextbookGenerator";
import { requestTextbookUnitGeneration } from "@/lib/textbookAuto/requestTextbookUnitGeneration";
import type { PremiumUploadedFileMetadata } from "@/types/premiumTextbook";
import { DEFAULT_SECTION_INCLUSION, type TextbookAnswerKeyLayout, type TextbookUnitContent } from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoSimple.module.css";

type GenerationMode = "worksheet" | "workbook" | "premium";

type StandardGenerationResult = {
  mode: Exclude<GenerationMode, "premium">;
  title: string;
  model: string;
  answerKeyLayout: TextbookAnswerKeyLayout;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
};

type PremiumGenerationResult = {
  mode: "premium";
  title: string;
  model: string;
  source: GeneratePremiumTextbookResult["meta"]["source"];
  templateId: XUniversePremiumTemplateId;
  uploadedFiles: PremiumUploadedFileMetadata[];
  textbook: GeneratePremiumTextbookResult["textbook"];
};

type GenerationResult = StandardGenerationResult | PremiumGenerationResult;

const AI_SOURCE_SLICE = 24_000;

function sliceForAi(source: string): string {
  return source.length <= AI_SOURCE_SLICE ? source : source.slice(0, AI_SOURCE_SLICE);
}

function inferTitle(source: string, mode: GenerationMode): string {
  const fallback = mode === "worksheet" ? "AI 학습지" : mode === "workbook" ? "AI 워크북" : "프리미엄 AI 교재";
  const firstLine = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return fallback;
  return firstLine.replace(/^#{1,6}\s*/, "").slice(0, 64) || fallback;
}

function buildWorksheetUnit(source: string, title: string): TextbookUnitContent {
  const modules = parseManuscriptToModules(source);
  return {
    unitTitle: title,
    keyConcepts: [],
    contentStudy: [],
    coreSummary: [],
    practice: [],
    unitTest: [],
    manuscriptModules:
      modules.length > 0
        ? modules
        : [
            {
              id: "simple-worksheet-source",
              field: "problem",
              body: source,
            },
          ],
    sectionInclusion: {
      keyConcepts: false,
      contentStudy: false,
      coreSummary: false,
      practice: false,
      unitTest: false,
    },
  };
}

function modeLabel(mode: GenerationMode): string {
  if (mode === "worksheet") return "학습지 자동생성";
  if (mode === "workbook") return "워크북";
  return "프리미엄 교재";
}

function canExtractText(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    name.endsWith(".txt") ||
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    type === "text/plain" ||
    type === "application/pdf" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export function TextbookAutoSimplePage() {
  const [sourceText, setSourceText] = useState("");
  const [attachments, setAttachments] = useState<UniversalAttachmentItem[]>([]);
  const [userInstruction, setUserInstruction] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<XUniversePremiumTemplateId>("xuniverse-premium-basic");
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [busyMode, setBusyMode] = useState<GenerationMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const appendAttachmentText = useCallback(async (item: UniversalAttachmentItem) => {
    if (!canExtractText(item.file)) {
      setAttachmentNotice("텍스트 추출은 TXT, PDF, DOCX 파일만 지원합니다. 다른 파일도 첨부 목록에는 추가할 수 있습니다.");
      return;
    }

    setExtractingId(item.id);
    setAttachmentNotice(null);
    try {
      const extracted = (await extractPlainTextFromLocalFile(item.file)).trim();
      if (!extracted) {
        setAttachmentNotice(`${item.file.name}에서 추출할 텍스트를 찾지 못했습니다.`);
        return;
      }
      setSourceText((current) => {
        const prefix = current.trim() ? `${current.trim()}\n\n` : "";
        return `${prefix}[첨부 파일: ${item.file.name}]\n${extracted}`;
      });
      setAttachmentNotice(`${item.file.name}의 텍스트를 원문 입력창에 추가했습니다.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "파일 텍스트 추출에 실패했습니다.";
      setAttachmentNotice(message);
    } finally {
      setExtractingId(null);
    }
  }, []);

  const generate = useCallback(
    async (mode: GenerationMode) => {
      const source = sourceText.trim();
      const instruction = userInstruction.trim();
      const uploadedFiles = attachments.map((item) => toPremiumUploadedFileMetadata(item.file));
      setError(null);

      if (mode !== "premium" && !source) {
        setError("교재로 만들 텍스트를 먼저 입력해주세요.");
        return;
      }

      if (mode === "premium") {
        if (!instruction) {
          setError("어떤 교재를 만들지 주문을 입력해주세요.");
          return;
        }
        if (!selectedTemplateId) {
          setError("프리미엄 교재 템플릿을 선택해주세요.");
          return;
        }
        if (!source && uploadedFiles.length === 0) {
          setError("교재 제작에 사용할 원문을 붙여넣거나 파일을 업로드해주세요.");
          return;
        }
      }

      const title = inferTitle(source, mode);
      setBusyMode(mode);
      try {
        if (mode === "worksheet") {
          setResult({
            mode,
            title,
            model: "module-rule",
            answerKeyLayout: "appendix",
            units: [{ unitIndex: 0, unit: buildWorksheetUnit(source, title) }],
          });
          return;
        }

        if (mode === "premium") {
          const premiumResult = await generatePremiumTextbook({
            templateId: selectedTemplateId,
            userInstruction: instruction,
            pastedText: sliceForAi(source),
            uploadedFiles,
          });
          setResult({
            mode,
            title: premiumResult.textbook.title || title,
            model: premiumResult.meta.model,
            source: premiumResult.meta.source,
            templateId: selectedTemplateId,
            uploadedFiles,
            textbook: premiumResult.textbook,
          });
          return;
        }

        const { unit, meta } = await requestTextbookUnitGeneration({
          bookTitle: title,
          sourceText: sliceForAi(source),
          unitIndex: 0,
          totalUnits: 1,
          practiceMin: mode === "workbook" ? 4 : 6,
          unitTestMcq: mode === "workbook" ? 3 : 5,
          unitTestShort: mode === "workbook" ? 2 : 3,
          sectionInclusion: DEFAULT_SECTION_INCLUSION,
        });

        setResult({
          mode,
          title,
          model: meta.model,
          answerKeyLayout: mode === "workbook" ? "inline" : "appendix",
          units: [{ unitIndex: 0, unit }],
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
        setError(
          message.includes("API 키")
            ? "AI 생성 설정이 아직 연결되지 않았습니다. OpenAI API 키 설정을 확인해주세요."
            : `교재 생성에 실패했습니다. ${message}`,
        );
      } finally {
        setBusyMode(null);
      }
    },
    [attachments, selectedTemplateId, sourceText, userInstruction],
  );

  const selectedTemplate = getXUniversePremiumTemplate(selectedTemplateId) ?? xuniversePremiumTemplates[0];

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>{BRAND_APP_NAME}</p>
            <h1 className={styles.title}>AI 교재 자동 생성</h1>
            <p className={styles.lead}>
              수업 원문, 교재 내용, 기사, 지문 등을 붙여넣으면 AI가 학습지·워크북·프리미엄 교재 형태로 자동 변환합니다.
            </p>
          </header>

          <section className={styles.composer} aria-label="AI 교재 자동 생성">
            <label className={styles.field}>
              <span className={styles.label}>원문/수업자료 텍스트 붙여넣기</span>
              <textarea
                className={styles.textarea}
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder="여기에 교재로 만들 원문을 붙여넣으세요. 예: 영어 지문, 문법 설명, 수업 필기, 기사, 단어 목록 등"
              />
            </label>
            <div className={styles.attachmentBlock}>
              <UniversalFileAttachmentPanel
                title="파일/소스 업로드"
                description="교재 제작에 사용할 수업자료, 원문, 문제, 단어장, PDF, DOCX, PPTX, TXT, 이미지 등을 업로드하세요. TXT/PDF/DOCX는 원문 입력창으로 텍스트 추출이 가능합니다."
                items={attachments}
                onChange={(next) => {
                  setAttachments(next);
                  setAttachmentNotice(null);
                }}
                disabled={busyMode !== null || extractingId !== null}
                emptyLabel="교재 생성에 참고할 파일을 추가해 주세요."
                renderItemAction={(item) => (
                  <button
                    type="button"
                    className={styles.extractButton}
                    disabled={!canExtractText(item.file) || extractingId !== null || busyMode !== null}
                    onClick={() => void appendAttachmentText(item)}
                  >
                    {extractingId === item.id ? "추출 중..." : "텍스트 추출"}
                  </button>
                )}
              />
              {attachmentNotice ? <p className={styles.attachmentNotice}>{attachmentNotice}</p> : null}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={busyMode !== null} onClick={() => void generate("worksheet")}>
                {busyMode === "worksheet" ? "생성 중..." : "학습지 자동생성"}
              </button>
              <button type="button" className={styles.button} disabled={busyMode !== null} onClick={() => void generate("workbook")}>
                {busyMode === "workbook" ? "생성 중..." : "워크북 생성"}
              </button>
              <button type="button" className={styles.button} disabled={busyMode !== null} onClick={() => void generate("premium")}>
                {busyMode === "premium" ? "생성 중..." : "프리미엄 교재 생성"}
              </button>
            </div>

            <section className={styles.premiumPanel} aria-label="프리미엄 교재 생성">
              <div className={styles.premiumHeader}>
                <div>
                  <p className={styles.eyebrow}>XUniverse Premium Textbook</p>
                  <h2>프리미엄 교재 생성</h2>
                  <p>
                    파일/소스 업로드 → 사용자 주문 입력 → XUniverse 프리미엄 템플릿 선택 → 교재 내지 미리보기 → PDF 저장 /
                    인쇄 흐름으로 완성형 교재를 만듭니다.
                  </p>
                </div>
                <span className={styles.premiumBadge}>표지 · 단원 · 문제 · 정답 · 해설</span>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>사용자 주문 입력</span>
                <textarea
                  className={styles.instructionTextarea}
                  value={userInstruction}
                  onChange={(event) => setUserInstruction(event.target.value)}
                  placeholder="예: 영어 1단원, 2단원, 3단원의 핵심 개념을 설명하고 객관식 30문제, 빈칸 15문제, 서술형 15문제를 만들어줘. 정답과 해설도 포함해줘."
                />
              </label>

              <div className={styles.premiumUploadSummary}>
                <strong>업로드된 자료</strong>
                {attachments.length > 0 ? (
                  <ul>
                    {attachments.map((item) => (
                      <li key={item.id}>
                        {item.file.name} <span>{item.file.type || "unknown"} · {item.file.size.toLocaleString()} bytes</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>아직 업로드된 파일이 없습니다. 붙여넣은 원문만으로도 생성할 수 있습니다.</p>
                )}
                <small>
                  TODO: PDF/DOCX/PPTX 파일 본문 전체 추출은 서버 측 파싱으로 확장 예정입니다. 현재 프리미엄 생성에는 파일명,
                  타입, 크기 메타데이터와 붙여넣은 원문이 포함됩니다.
                </small>
              </div>

              <div className={styles.templateBlock}>
                <div className={styles.templateTitleRow}>
                  <div>
                    <span className={styles.label}>XUniverse 프리미엄 템플릿 선택</span>
                    <p>{selectedTemplate.name} · {selectedTemplate.designTone}</p>
                  </div>
                </div>
                <PremiumTemplateSelector
                  templates={xuniversePremiumTemplates}
                  selectedId={selectedTemplateId}
                  onSelect={setSelectedTemplateId}
                  disabled={busyMode !== null}
                />
              </div>

              <button type="button" className={styles.premiumButton} disabled={busyMode !== null} onClick={() => void generate("premium")}>
                {busyMode === "premium" ? "XUniverse 프리미엄 교재를 생성하는 중입니다..." : "프리미엄 교재 생성"}
              </button>
            </section>
          </section>

          <section className={styles.resultArea} aria-live="polite">
            <h2 className={styles.resultTitle}>생성 결과</h2>
            {busyMode ? (
              <div className={styles.statusCard}>
                <span className={styles.spinner} aria-hidden="true" />
                <p>
                  {busyMode === "premium"
                    ? "XUniverse 프리미엄 교재를 생성하는 중입니다. 문항을 10개 단위로 나누어 생성하고, 중복과 누락을 검토한 뒤 교재 내지에 배치합니다."
                    : "교재를 생성하고 있습니다. 잠시만 기다려 주세요."}
                </p>
              </div>
            ) : error ? (
              <div className={styles.errorCard}>{error}</div>
            ) : result ? (
              <article className={styles.documentCard}>
                <div className={styles.resultMeta}>
                  <strong>{result.title}</strong>
                  <span>
                    {modeLabel(result.mode)} · {result.model}
                    {result.mode === "premium" ? ` · ${result.source}` : ""}
                  </span>
                </div>
                {result.mode === "premium" ? (
                  <PremiumTextbookPreview
                    textbook={result.textbook}
                    template={getXUniversePremiumTemplate(result.templateId) ?? selectedTemplate}
                    uploadedFiles={result.uploadedFiles}
                  />
                ) : (
                  <TextbookAutoPrintView
                    bookTitle={result.title}
                    units={result.units}
                    answerKeyLayout={result.answerKeyLayout}
                    answerKeyItems={[]}
                  />
                )}
              </article>
            ) : (
              <div className={styles.emptyCard}>원문을 입력한 뒤 원하는 생성 버튼을 눌러주세요.</div>
            )}
          </section>
        </div>
      </main>
    </DashboardShell>
  );
}
