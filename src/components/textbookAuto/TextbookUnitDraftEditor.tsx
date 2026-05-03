import type {
  TextbookContentStudyBlock,
  TextbookKeyConceptItem,
  TextbookSectionInclusion,
  TextbookUnitContent,
  TextbookUnitTestItem,
} from "@/types/textbookAuto";
import styles from "@/components/textbookAuto/textbookUnitDraftEditor.module.css";

type Props = {
  unit: TextbookUnitContent;
  onChange: (next: TextbookUnitContent) => void;
  /** 체크된 섹션만 편집 UI 표시 (최종 교재·AI 생성과 동일) */
  sectionInclusion: TextbookSectionInclusion;
  disabled?: boolean;
};

function defaultMcq(): TextbookUnitTestItem {
  return { kind: "mcq", question: "", choices: ["", "", "", ""] };
}

function defaultShort(): TextbookUnitTestItem {
  return { kind: "short", question: "" };
}

export function TextbookUnitDraftEditor({ unit, onChange, sectionInclusion: inc, disabled }: Props) {
  const patch = (partial: Partial<TextbookUnitContent>) => onChange({ ...unit, ...partial });

  const setKeyConcepts = (next: TextbookKeyConceptItem[]) => patch({ keyConcepts: next });
  const setContentStudy = (next: TextbookContentStudyBlock[]) => patch({ contentStudy: next });
  const setPractice = (next: string[]) => patch({ practice: next });
  const setUnitTest = (next: TextbookUnitTestItem[]) => patch({ unitTest: next });

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
          <p className={styles.subtle}>각 항목: 개념(용어)과 설명을 나란히 유지합니다. 추가·삭제·수정할 수 있습니다.</p>
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
              <div className={styles.row2}>
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
                  <input
                    className={styles.input}
                    disabled={disabled}
                    value={row.explanation}
                    onChange={(e) => {
                      const next = [...unit.keyConcepts];
                      next[i] = { ...row, explanation: e.target.value };
                      setKeyConcepts(next);
                    }}
                  />
                </div>
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
            소제목(title)과 불릿 설명(bullets)으로 구성합니다. 줄바꿈으로 불릿을 나눕니다. 원문 정보가 빠지지 않도록 불릿을 충분히 나누세요.
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
