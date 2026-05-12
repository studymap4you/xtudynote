import { Fragment, useCallback, useRef, useState } from "react";
import {
  ALL_LOCAL_DOC_MODULE_FIELDS,
  buildAiContextFromModules,
  emptyLocalDocModule,
  fillMissingProblemNumbersOnly,
  LOCAL_DOC_FIELD_LABEL,
  modulesToManuscriptText,
  parseManuscriptToModules,
  reassignAllProblemNumbers,
  type LocalDocModule,
  type LocalDocModuleField,
  type ModuleInputMode,
} from "@/lib/localDocumentAuto/manuscriptModules";
import { requestLiteralTranslationModuleAi, requestTopicGistModuleAi } from "@/lib/localDocumentAuto/localDocModuleAi";
import styles from "@/pages/textbookAutoBuilder.module.css";

function modulePreviewLine(m: LocalDocModule): string {
  const t = (m.body ?? "").trim();
  if (!t) return "(비어 있음)";
  return t.replace(/\s+/g, " ").slice(0, 72) + (t.length > 72 ? "…" : "");
}

export type LocalDocModulesEditorProps = {
  modules: LocalDocModule[];
  onChange: (next: LocalDocModule[]) => void;
  disabled?: boolean;
  /** 기본 학습지형(평가문제 PDF 열은 참고용). */
  kind?: "worksheet" | "evaluation";
  /** 비어 있지 않으면 「이 텍스트로 모듈 분석」 버튼 표시 */
  analyzeSeedText?: string;
};

export function LocalDocModulesEditor({
  modules,
  onChange,
  disabled = false,
  kind = "worksheet",
  analyzeSeedText,
}: LocalDocModulesEditorProps) {
  const dragSourceRef = useRef<number | null>(null);
  const [dragRowIndex, setDragRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);
  const [editRowIndex, setEditRowIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<LocalDocModule | null>(null);
  const [aiBusyRow, setAiBusyRow] = useState<number | null>(null);
  const [insertField, setInsertField] = useState<LocalDocModuleField>("problem");
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const closeEditor = useCallback(() => {
    setEditRowIndex(null);
    setDraft(null);
  }, []);

  const openEditor = useCallback(
    (rowIndex: number) => {
      const m = modules[rowIndex];
      if (!m) return;
      const clone = structuredClone(m);
      if ((clone.field === "topic_gist" || clone.field === "literal_translation") && !clone.inputMode) {
        clone.inputMode = "manual";
      }
      setEditRowIndex(rowIndex);
      setDraft(clone);
    },
    [modules],
  );

  const saveEditor = useCallback(() => {
    if (editRowIndex === null || !draft) return;
    const toSave = structuredClone(draft);
    if (toSave.field === "topic_gist" || toSave.field === "literal_translation") {
      if (!toSave.inputMode) toSave.inputMode = "manual";
    } else {
      delete toSave.inputMode;
    }
    if (toSave.field !== "problem") {
      delete toSave.questionNumber;
    } else {
      const q = (toSave.questionNumber ?? "").trim();
      if (q) toSave.questionNumber = q;
      else delete toSave.questionNumber;
    }
    const next = [...modules];
    next[editRowIndex] = toSave;
    onChange(next);
    closeEditor();
    setLocalMsg("모듈을 저장했습니다.");
  }, [editRowIndex, draft, modules, onChange, closeEditor]);

  const runAiForDraft = useCallback(async () => {
    if (editRowIndex === null || !draft) return;
    if (draft.field !== "topic_gist" && draft.field !== "literal_translation") return;
    const ctx = buildAiContextFromModules(modules, editRowIndex);
    setAiBusyRow(editRowIndex);
    setLocalMsg(null);
    try {
      const text =
        draft.field === "topic_gist"
          ? await requestTopicGistModuleAi(ctx)
          : await requestLiteralTranslationModuleAi(ctx);
      setDraft({ ...draft, body: text, inputMode: "ai" });
      setLocalMsg("AI가 본문을 채웠습니다. 확인 후 저장하세요.");
    } catch (e) {
      setLocalMsg(e instanceof Error ? e.message : "AI 요청에 실패했습니다.");
    } finally {
      setAiBusyRow(null);
    }
  }, [editRowIndex, draft, modules]);

  const insertModuleAt = useCallback(
    (at: number, field: LocalDocModuleField) => {
      const row = [...modules];
      const insertedIdx = Math.max(0, Math.min(at, row.length));
      row.splice(insertedIdx, 0, emptyLocalDocModule(field));
      onChange(row);
      closeEditor();
      setLocalMsg(`「${LOCAL_DOC_FIELD_LABEL[field]}」모듈을 ${insertedIdx + 1}번 위치에 넣었습니다.`);
    },
    [modules, onChange, closeEditor],
  );

  const addRow = useCallback(() => {
    const field: LocalDocModuleField = kind === "evaluation" ? "evaluation" : "problem";
    onChange([...modules, emptyLocalDocModule(field)]);
    setLocalMsg("빈 모듈을 맨 끝에 추가했습니다.");
  }, [modules, onChange, kind]);

  const deleteRow = useCallback(
    (rowIndex: number) => {
      onChange(modules.filter((_, i) => i !== rowIndex));
      closeEditor();
    },
    [modules, onChange, closeEditor],
  );

  const moveRow = useCallback(
    (rowIndex: number, delta: number) => {
      const j = rowIndex + delta;
      if (j < 0 || j >= modules.length) return;
      const next = [...modules];
      const t = next[rowIndex]!;
      next[rowIndex] = next[j]!;
      next[j] = t;
      onChange(next);
      closeEditor();
    },
    [modules, onChange, closeEditor],
  );

  const reorderDrag = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const row = [...modules];
      const [item] = row.splice(from, 1);
      row.splice(to, 0, item);
      onChange(row);
      closeEditor();
    },
    [modules, onChange, closeEditor],
  );

  const runAnalyzeFromSeed = useCallback(() => {
    const raw = (analyzeSeedText ?? "").trim();
    if (!raw) {
      setLocalMsg("분석할 원문이 없습니다.");
      return;
    }
    const next = parseManuscriptToModules(raw);
    if (!next.length) {
      setLocalMsg("분석 결과 모듈이 없습니다. 마커·통합 원고 형식을 확인해 주세요.");
      return;
    }
    onChange(next);
    setLocalMsg(`모듈 ${next.length}개로 나눴습니다. 순서·내용을 조정하세요.`);
  }, [analyzeSeedText, onChange]);

  return (
    <div style={{ marginTop: "1rem" }}>
      {localMsg ? (
        <p className={styles.ok} role="status">
          {localMsg}
        </p>
      ) : null}

      <div className={styles.passageModuleToolbar} style={{ flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
        {analyzeSeedText?.trim() ? (
          <button type="button" className={styles.btnPrimary} disabled={disabled} onClick={runAnalyzeFromSeed}>
            이 단원 지문으로 모듈 분석
          </button>
        ) : null}
        <button type="button" className={styles.btnSecondary} disabled={disabled} onClick={addRow}>
          + 맨 끝에 모듈 추가
        </button>
        <label className={styles.field} style={{ marginBottom: 0, minWidth: "200px" }}>
          <span className={styles.label}>행 삽입 시 구역</span>
          <select
            className={styles.select}
            value={insertField}
            disabled={disabled}
            onChange={(e) => setInsertField(e.target.value as LocalDocModuleField)}
          >
            {ALL_LOCAL_DOC_MODULE_FIELDS.map((k) => (
              <option key={k} value={k}>
                {LOCAL_DOC_FIELD_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={disabled || !modules.some((m) => m.field === "problem")}
            onClick={() => {
              onChange(fillMissingProblemNumbersOnly(modules));
              setLocalMsg("비어 있는 문제 모듈만 01, 02… 순서로 채웠습니다.");
            }}
          >
            문제 번호: 빈 칸만
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={disabled || !modules.some((m) => m.field === "problem")}
            onClick={() => {
              onChange(reassignAllProblemNumbers(modules));
              setLocalMsg("모든 문제 모듈에 01, 02…를 다시 넣었습니다.");
            }}
          >
            문제 번호: 전체 01부터
          </button>
        </div>
      </div>

      {modules.length === 0 ? (
        <p className={styles.hint}>모듈이 없습니다. 「이 단원 지문으로 모듈 분석」또는 「맨 끝에 모듈 추가」로 시작하세요.</p>
      ) : (
        <table className={styles.passageTable}>
          <thead>
            <tr>
              <th scope="col" style={{ width: "2rem" }} aria-label="이동" />
              <th scope="col">#</th>
              <th scope="col">구역</th>
              <th scope="col">문항 표시</th>
              <th scope="col">입력</th>
              <th scope="col">미리보기</th>
              <th scope="col">PDF</th>
              <th scope="col">조작</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m, rowIndex) => (
              <Fragment key={m.id}>
                <tr
                  draggable={!disabled}
                  className={[
                    dragRowIndex === rowIndex ? styles.passageRowDragging : "",
                    dragOverRowIndex === rowIndex ? styles.passageRowDrop : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onDragStart={() => {
                    if (disabled) return;
                    dragSourceRef.current = rowIndex;
                    setDragRowIndex(rowIndex);
                  }}
                  onDragEnd={() => {
                    dragSourceRef.current = null;
                    setDragRowIndex(null);
                    setDragOverRowIndex(null);
                  }}
                  onDragOver={(e) => {
                    if (disabled) return;
                    e.preventDefault();
                    setDragOverRowIndex(rowIndex);
                  }}
                  onDragLeave={() => setDragOverRowIndex((cur) => (cur === rowIndex ? null : cur))}
                  onDrop={(e) => {
                    if (disabled) return;
                    e.preventDefault();
                    const from = dragSourceRef.current;
                    if (from !== null && from !== rowIndex) reorderDrag(from, rowIndex);
                    dragSourceRef.current = null;
                    setDragRowIndex(null);
                    setDragOverRowIndex(null);
                  }}
                >
                  <td>
                    <span className={styles.passageRowGrip} title="드래그하여 순서 변경">
                      ⋮⋮
                    </span>
                  </td>
                  <td>{rowIndex + 1}</td>
                  <td>{LOCAL_DOC_FIELD_LABEL[m.field]}</td>
                  <td>{m.field === "problem" ? ((m.questionNumber ?? "").trim() || "자동") : "—"}</td>
                  <td>
                    {m.field === "topic_gist" || m.field === "literal_translation"
                      ? m.inputMode === "ai"
                        ? "AI"
                        : "직접"
                      : "—"}
                  </td>
                  <td>{modulePreviewLine(m)}</td>
                  <td>
                    {kind === "worksheet"
                      ? m.field === "evaluation"
                        ? "—"
                        : "✓"
                      : m.field === "evaluation"
                        ? "✓"
                        : "—"}
                  </td>
                  <td className={styles.passageRowActions}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className={styles.btnMini}
                        disabled={disabled}
                        onClick={() => insertModuleAt(rowIndex, insertField)}
                      >
                        위에
                      </button>
                      <button
                        type="button"
                        className={styles.btnMini}
                        disabled={disabled}
                        onClick={() => insertModuleAt(rowIndex + 1, insertField)}
                      >
                        아래에
                      </button>
                      <button
                        type="button"
                        className={styles.btnMini}
                        disabled={disabled || rowIndex === 0}
                        onClick={() => moveRow(rowIndex, -1)}
                        aria-label="한 칸 위로"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.btnMini}
                        disabled={disabled || rowIndex === modules.length - 1}
                        onClick={() => moveRow(rowIndex, 1)}
                        aria-label="한 칸 아래로"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={styles.btnMiniGhost}
                        disabled={disabled}
                        onClick={() => openEditor(rowIndex)}
                      >
                        편집
                      </button>
                      <button type="button" className={styles.btnMiniGhost} disabled={disabled} onClick={() => deleteRow(rowIndex)}>
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
                {editRowIndex === rowIndex && draft ? (
                  <tr>
                    <td colSpan={8}>
                      <label className={styles.field}>
                        <span className={styles.label}>구역 종류</span>
                        <select
                          className={styles.select}
                          value={draft.field}
                          disabled={disabled}
                          onChange={(e) => {
                            const f = e.target.value as LocalDocModuleField;
                            const next: LocalDocModule = { ...draft, field: f };
                            if (f === "topic_gist" || f === "literal_translation") {
                              next.inputMode = next.inputMode ?? "manual";
                            } else {
                              delete next.inputMode;
                            }
                            if (f !== "problem") {
                              delete next.questionNumber;
                            }
                            setDraft(next);
                          }}
                        >
                          {ALL_LOCAL_DOC_MODULE_FIELDS.map((k) => (
                            <option key={k} value={k}>
                              {LOCAL_DOC_FIELD_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {draft.field === "problem" ? (
                        <label className={styles.field}>
                          <span className={styles.label}>문항 표시 (인쇄·Word 제목)</span>
                          <input
                            className={styles.input}
                            value={draft.questionNumber ?? ""}
                            disabled={disabled}
                            onChange={(e) => setDraft({ ...draft, questionNumber: e.target.value })}
                            placeholder="비우면 01, 02… 순서"
                            spellCheck={false}
                          />
                        </label>
                      ) : null}
                      {draft.field === "topic_gist" || draft.field === "literal_translation" ? (
                        <div className={styles.field}>
                          <span className={styles.label}>입력 방식</span>
                          <div className={styles.row} style={{ gap: "1rem", flexWrap: "wrap" }}>
                            <label className={styles.radioLabel}>
                              <input
                                type="radio"
                                name={`tu-mod-${draft.id}`}
                                checked={(draft.inputMode ?? "manual") === "manual"}
                                disabled={disabled}
                                onChange={() => setDraft({ ...draft, inputMode: "manual" as ModuleInputMode })}
                              />
                              직접 입력
                            </label>
                            <label className={styles.radioLabel}>
                              <input
                                type="radio"
                                name={`tu-mod-${draft.id}`}
                                checked={(draft.inputMode ?? "manual") === "ai"}
                                disabled={disabled}
                                onChange={() => setDraft({ ...draft, inputMode: "ai" as ModuleInputMode })}
                              />
                              AI
                            </label>
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              disabled={disabled || aiBusyRow !== null}
                              onClick={() => void runAiForDraft()}
                            >
                              {aiBusyRow === editRowIndex
                                ? "AI 생성 중…"
                                : draft.field === "topic_gist"
                                  ? "AI로 주제·요지"
                                  : "AI로 직독직해"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <label className={styles.field}>
                        <span className={styles.label}>본문</span>
                        <textarea
                          className={styles.textarea}
                          rows={8}
                          disabled={disabled}
                          value={draft.body}
                          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                          spellCheck={false}
                        />
                      </label>
                      <div className={styles.passageEditActions}>
                        <button type="button" className={styles.btnPrimary} disabled={disabled} onClick={saveEditor}>
                          저장
                        </button>
                        <button type="button" className={styles.btnGhost} onClick={closeEditor}>
                          취소
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {modules.length > 0 ? (
        <div className={styles.localActionRow}>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={disabled}
            onClick={() => {
              const t = modulesToManuscriptText(modules);
              void navigator.clipboard.writeText(t);
              setLocalMsg("통합 원고 마커 텍스트를 클립보드에 복사했습니다.");
            }}
          >
            통합 원고 복사
          </button>
        </div>
      ) : null}
    </div>
  );
}
