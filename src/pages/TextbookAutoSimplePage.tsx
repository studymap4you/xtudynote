import { useCallback, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { TextbookAutoPrintView } from "@/components/textbookAuto/TextbookAutoPrintView";
import { BRAND_APP_NAME } from "@/lib/brand";
import { parseManuscriptToModules } from "@/lib/localDocumentAuto/manuscriptModules";
import { requestTextbookUnitGeneration } from "@/lib/textbookAuto/requestTextbookUnitGeneration";
import { DEFAULT_SECTION_INCLUSION, type TextbookAnswerKeyLayout, type TextbookUnitContent } from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoSimple.module.css";

type GenerationMode = "worksheet" | "workbook" | "premium";

type GenerationResult = {
  mode: GenerationMode;
  title: string;
  model: string;
  answerKeyLayout: TextbookAnswerKeyLayout;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
};

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

export function TextbookAutoSimplePage() {
  const [sourceText, setSourceText] = useState("");
  const [busyMode, setBusyMode] = useState<GenerationMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const generate = useCallback(
    async (mode: GenerationMode) => {
      const source = sourceText.trim();
      setError(null);
      if (!source) {
        setError("교재로 만들 텍스트를 먼저 입력해주세요.");
        return;
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
    [sourceText],
  );

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
              <span className={styles.label}>원문 입력</span>
              <textarea
                className={styles.textarea}
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder="여기에 교재로 만들 원문을 붙여넣으세요. 예: 영어 지문, 문법 설명, 수업 필기, 기사, 단어 목록 등"
              />
            </label>
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
          </section>

          <section className={styles.resultArea} aria-live="polite">
            <h2 className={styles.resultTitle}>생성 결과</h2>
            {busyMode ? (
              <div className={styles.statusCard}>
                <span className={styles.spinner} aria-hidden="true" />
                <p>교재를 생성하고 있습니다. 잠시만 기다려 주세요.</p>
              </div>
            ) : error ? (
              <div className={styles.errorCard}>{error}</div>
            ) : result ? (
              <article className={styles.documentCard}>
                <div className={styles.resultMeta}>
                  <strong>{result.title}</strong>
                  <span>
                    {modeLabel(result.mode)} · {result.model}
                  </span>
                </div>
                <TextbookAutoPrintView
                  bookTitle={result.title}
                  units={result.units}
                  answerKeyLayout={result.answerKeyLayout}
                  answerKeyItems={[]}
                />
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
