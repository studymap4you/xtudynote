import { useState } from "react";
import type {
  TextbookContentStudyBlock,
  TextbookKeyConceptItem,
  TextbookSectionInclusion,
  TextbookUnitContent,
  TextbookUnitTestItem,
} from "@/types/textbookAuto";
import {
  requestContentStudyBulletsForTitle,
  requestContentStudyFullBlock,
} from "@/lib/textbookAuto/requestContentStudyBlockAi";
import styles from "@/components/textbookAuto/textbookUnitDraftEditor.module.css";

/** 내용학습 AI — 이 단원 지문(세션 원문) */
export type ContentStudyAiContext = {
  bookTitle: string;
  unitSourceText: string;
};

type Props = {
  unit: TextbookUnitContent;
  onChange: (next: TextbookUnitContent) => void;
  /** 체크된 섹션만 편집 UI 표시 (최종 교재·AI 생성과 동일) */
  sectionInclusion: TextbookSectionInclusion;
  disabled?: boolean;
  contentStudyAiContext?: ContentStudyAiContext | null;
  onContentStudyAiNotice?: (message: string, variant: "ok" | "error") => void;
};

function defaultMcq(): TextbookUnitTestItem {
  return { kind: "mcq", question: "", choices: ["", "", "", ""] };
}

function defaultShort(): TextbookUnitTestItem {
  return { kind: "short", question: "" };
}

export function TextbookUnitDraftEditor({
  unit,
  onChange,
  sectionInclusion: inc,
  disabled,
  contentStudyAiContext,
  onContentStudyAiNotice,
}: Props) {
  const patch = (partial: Partial<TextbookUnitContent>) => onChange({ ...unit, ...partial });

  const setKeyConcepts = (next: TextbookKeyConceptItem[]) => patch({ keyConcepts: next });
  const setContentStudy = (next: TextbookContentStudyBlock[]) => patch({ contentStudy: next });
  const setPractice = (next: string[]) => patch({ practice: next });
  const setUnitTest = (next: TextbookUnitTestItem[]) => patch({ unitTest: next });

  const [csAiBlock, setCsAiBlock] = useState<{ bi: number; mode: "full" | "bullets" } | null>(null);
  const csAiBusy = csAiBlock !== null;
  const canCsAi = Boolean(contentStudyAiContext?.unitSourceText.trim());

  const runContentStudyFullAi = async (bi: number) => {
    if (!contentStudyAiContext?.unitSourceText.trim() || disabled) return;
    const unitTitle = unit.unitTitle.trim() || "(제목 없음)";
    const existingBlockTitles = unit.contentStudy
      .map((b, j) => (j !== bi ? b.title.trim() : ""))
      .filter(Boolean);
    setCsAiBlock({ bi, mode: "full" });
    try {
      const { title, bullets } = await requestContentStudyFullBlock({
        bookTitle: contentStudyAiContext.bookTitle,
        unitTitle,
        sourceText: contentStudyAiContext.unitSourceText,
        existingBlockTitles,
      });
      const next = [...unit.contentStudy];
      next[bi] = { title, bullets };
      setContentStudy(next);
      onContentStudyAiNotice?.("내용학습 블록을 AI로 채웠습니다.", "ok");
    } catch (e) {
      onContentStudyAiNotice?.(e instanceof Error ? e.message : "AI 생성에 실패했습니다.", "error");
    } finally {
      setCsAiBlock(null);
    }
  };

  const runContentStudyBulletsAi = async (bi: number) => {
    if (!contentStudyAiContext?.unitSourceText.trim() || disabled) return;
    const block = unit.contentStudy[bi];
    if (!block?.title.trim()) return;
    const unitTitle = unit.unitTitle.trim() || "(제목 없음)";
    setCsAiBlock({ bi, mode: "bullets" });
    try {
      const { bullets } = await requestContentStudyBulletsForTitle({
        bookTitle: contentStudyAiContext.bookTitle,
        unitTitle,
        sourceText: contentStudyAiContext.unitSourceText,
        blockTitle: block.title.trim(),
      });
      const next = [...unit.contentStudy];
      next[bi] = { ...block, bullets };
      setContentStudy(next);
      onContentStudyAiNotice?.("제목에 맞는 설명 불릿을 생성했습니다.", "ok");
    } catch (e) {
      onContentStudyAiNotice?.(e instanceof Error ? e.message : "AI 생성에 실패했습니다.", "error");
    } finally {
      setCsAiBlock(null);
    }
  };

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>단원 제목</h4>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="tu-title">
            unitTitle
          </label>
          <input
            id="tu-title"
            className={styles.input}
            disabled={disabled}
            value={unit.unitTitle}
            onChange={(e) => patch({ unitTitle: e.target.value })}
            maxLength={400}
          />
        </div>
      </section>

      {inc.keyConcepts ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>핵심개념</h4>
          <p className={styles.subtle}>개념은 한 줄, 설명은 여러 줄로 입력·확인할 수 있습니다.</p>
          {unit.keyConcepts.map((row, i) => (
            <div key={i} className={styles.itemCard}>
              <div className={styles.itemHead}>
                <span className={styles.badge}>#{i + 1}</span>
                <button
                  type="button"
                  className={styles.btnTinyGhost}
                  disabled={disabled}
                  onClick={() => setKeyConcepts(unit.keyConcepts.filter((_, j) => j !== i))}
                >
                  제거
                </button>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>개념</span>
                <input
                  className={styles.input}
                  disabled={disabled}
                  value={row.concept}
                  onChange={(e) => {
                    const next = [...unit.keyConcepts];
                    next[i] = { ...row, concept: e.target.value };
                    setKeyConcepts(next);
                  }}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>설명</span>
                <textarea
                  className={`${styles.textarea} ${styles.keyConceptExplanation}`}
                  disabled={disabled}
                  rows={5}
                  value={row.explanation}
                  onChange={(e) => {
                    const next = [...unit.keyConcepts];
                    next[i] = { ...row, explanation: e.target.value };
                    setKeyConcepts(next);
                  }}
                />
              </div>
            </div>
          ))}
          <div className={styles.toolRow}>
            <button
              type="button"
              className={styles.btnTiny}
              disabled={disabled}
              onClick={() => setKeyConcepts([...unit.keyConcepts, { concept: "", explanation: "" }])}
            >
              항목 추가
            </button>
          </div>
        </section>
      ) : null}

      {inc.contentStudy ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>내용학습</h4>
          <p className={styles.subtle}>
            소제목(title)과 불릿 설명(bullets)으로 구성합니다. 「AI로 블록 채우기」는 제목·설명을 함께 쓰고, 「제목 기반 설명 생성」은 제목을 먼저 넣은 뒤 설명만
            채웁니다. (이 단원 세션 지문 필요)
          </p>
          {unit.contentStudy.map((block, bi) => (
            <div key={bi} className={styles.itemCard}>
              <div className={styles.itemHead}>
                <span className={styles.badge}>블록 {bi + 1}</span>
                <button
                  type="button"
                  className={styles.btnTinyGhost}
                  disabled={disabled}
                  onClick={() => setContentStudy(unit.contentStudy.filter((_, j) => j !== bi))}
                >
                  블록 제거
                </button>
              </div>
              {canCsAi ? (
                <div className={styles.csAiRow}>
                  <button
                    type="button"
                    className={styles.btnTiny}
                    disabled={disabled || csAiBusy}
                    onClick={() => void runContentStudyFullAi(bi)}
                  >
                    {csAiBlock?.bi === bi && csAiBlock.mode === "full" ? "블록 생성 중…" : "AI로 블록 채우기"}
                  </button>
                  <button
                    type="button"
                    className={styles.btnTinyGhost}
                    disabled={disabled || csAiBusy || !block.title.trim()}
                    onClick={() => void runContentStudyBulletsAi(bi)}
                    title={!block.title.trim() ? "먼저 제목을 입력하세요" : undefined}
                  >
                    {csAiBlock?.bi === bi && csAiBlock.mode === "bullets" ? "설명 생성 중…" : "제목 기반 설명 생성"}
                  </button>
                </div>
              ) : null}
              <div className={styles.field}>
                <span className={styles.label}>제목</span>
                <input
                  className={styles.input}
                  disabled={disabled}
                  value={block.title}
                  onChange={(e) => {
                    const next = [...unit.contentStudy];
                    next[bi] = { ...block, title: e.target.value };
                    setContentStudy(next);
                  }}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>설명 (줄마다 하나의 불릿)</span>
                <textarea
                  className={styles.textarea}
                  disabled={disabled}
                  rows={8}
                  value={block.bullets.join("\n")}
                  onChange={(e) => {
                    const lines = e.target.value.split(/\r?\n/).map((s) => s.trimEnd());
                    const next = [...unit.contentStudy];
                    next[bi] = { ...block, bullets: lines.length ? lines : [""] };
                    setContentStudy(next);
                  }}
                />
              </div>
            </div>
          ))}
          <div className={styles.toolRow}>
            <button
              type="button"
              className={styles.btnTiny}
              disabled={disabled}
              onClick={() => setContentStudy([...unit.contentStudy, { title: "", bullets: [""] }])}
            >
              블록 추가
            </button>
          </div>
        </section>
      ) : null}

      {inc.coreSummary ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>핵심요약</h4>
          <p className={styles.subtle}>줄바꿈마다 한 불릿 문장으로 저장됩니다.</p>
          <div className={styles.field}>
            <textarea
              className={styles.textarea}
              disabled={disabled}
              rows={5}
              value={unit.coreSummary.join("\n")}
              onChange={(e) => {
                const lines = e.target.value
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                patch({ coreSummary: lines });
              }}
            />
          </div>
        </section>
      ) : null}

      {inc.practice ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>확인학습 (주관식 단답)</h4>
          <p className={styles.subtle}>질문만 입력합니다. 정답은 3단계에서 생성합니다.</p>
          {unit.practice.map((q, i) => (
            <div key={i} className={styles.itemCard}>
              <div className={styles.itemHead}>
                <span className={styles.badge}>Q{i + 1}</span>
                <button
                  type="button"
                  className={styles.btnTinyGhost}
                  disabled={disabled}
                  onClick={() => setPractice(unit.practice.filter((_, j) => j !== i))}
                >
                  제거
                </button>
              </div>
              <input
                className={styles.input}
                disabled={disabled}
                value={q}
                onChange={(e) => {
                  const next = [...unit.practice];
                  next[i] = e.target.value;
                  setPractice(next);
                }}
              />
            </div>
          ))}
          <div className={styles.toolRow}>
            <button
              type="button"
              className={styles.btnTiny}
              disabled={disabled}
              onClick={() => setPractice([...unit.practice, ""])}
            >
              문항 추가
            </button>
          </div>
        </section>
      ) : null}

      {inc.unitTest ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>단원평가</h4>
          <p className={styles.subtle}>객관식과 주관식 단답을 섞어 둘 수 있습니다. 문항·보기는 자유롭게 수정하세요.</p>

          {unit.unitTest.map((item, i) => (
            <div key={i} className={styles.itemCard}>
              <div className={styles.itemHead}>
                <span className={styles.badge}>{item.kind === "mcq" ? "객관식" : "주관식"}</span>
                <button
                  type="button"
                  className={styles.btnTinyGhost}
                  disabled={disabled}
                  onClick={() => setUnitTest(unit.unitTest.filter((_, j) => j !== i))}
                >
                  문항 제거
                </button>
                <button
                  type="button"
                  className={styles.btnTinyGhost}
                  disabled={disabled}
                  onClick={() => {
                    const next = [...unit.unitTest];
                    next[i] = item.kind === "mcq" ? defaultShort() : defaultMcq();
                    setUnitTest(next);
                  }}
                >
                  유형 전환
                </button>
              </div>

              {item.kind === "short" ? (
                <div className={styles.field}>
                  <span className={styles.label}>질문</span>
                  <textarea
                    className={styles.textarea}
                    disabled={disabled}
                    rows={2}
                    value={item.question}
                    onChange={(e) => {
                      const next = [...unit.unitTest];
                      next[i] = { kind: "short", question: e.target.value };
                      setUnitTest(next);
                    }}
                  />
                </div>
              ) : (
                <>
                  <div className={styles.field}>
                    <span className={styles.label}>질문</span>
                    <textarea
                      className={styles.textarea}
                      disabled={disabled}
                      rows={2}
                      value={item.question}
                      onChange={(e) => {
                        const next = [...unit.unitTest];
                        const cur = next[i];
                        if (cur?.kind === "mcq") {
                          next[i] = { ...cur, question: e.target.value };
                          setUnitTest(next);
                        }
                      }}
                    />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.label}>선택지</span>
                    {item.choices.map((c, ci) => (
                      <div key={ci} className={styles.choiceRow}>
                        <span className={styles.choiceNum}>{ci + 1}</span>
                        <input
                          className={styles.choiceInput}
                          disabled={disabled}
                          value={c}
                          onChange={(e) => {
                            const next = [...unit.unitTest];
                            const cur = next[i];
                            if (cur?.kind !== "mcq") return;
                            const ch = [...cur.choices];
                            ch[ci] = e.target.value;
                            next[i] = { ...cur, choices: ch };
                            setUnitTest(next);
                          }}
                        />
                        <button
                          type="button"
                          className={styles.btnTinyGhost}
                          disabled={disabled || item.choices.length <= 2}
                          onClick={() => {
                            const next = [...unit.unitTest];
                            const cur = next[i];
                            if (cur?.kind !== "mcq" || cur.choices.length <= 2) return;
                            next[i] = { ...cur, choices: cur.choices.filter((_, j) => j !== ci) };
                            setUnitTest(next);
                          }}
                        >
                          −
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.btnTinyGhost}
                      disabled={disabled || item.choices.length >= 8}
                      onClick={() => {
                        const next = [...unit.unitTest];
                        const cur = next[i];
                        if (cur?.kind !== "mcq") return;
                        next[i] = { ...cur, choices: [...cur.choices, ""] };
                        setUnitTest(next);
                      }}
                    >
                      보기 추가
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          <div className={styles.toolRow}>
            <button
              type="button"
              className={styles.btnTiny}
              disabled={disabled}
              onClick={() => setUnitTest([...unit.unitTest, defaultMcq()])}
            >
              객관식 추가
            </button>
            <button
              type="button"
              className={styles.btnTiny}
              disabled={disabled}
              onClick={() => setUnitTest([...unit.unitTest, defaultShort()])}
            >
              주관식 단답 추가
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
