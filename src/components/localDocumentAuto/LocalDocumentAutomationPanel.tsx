import { Fragment, useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/contexts/ToastContext";
import { buildLocalDocPrintRootFromModules } from "@/lib/localDocumentAuto/buildPrintDom";
import {
  ALL_LOCAL_DOC_MODULE_FIELDS,
  buildAiContextFromModules,
  emptyLocalDocModule,
  LOCAL_DOC_FIELD_LABEL,
  modulesToManuscriptText,
  parseManuscriptToModules,
  type LocalDocModule,
  type LocalDocModuleField,
  type ModuleInputMode,
} from "@/lib/localDocumentAuto/manuscriptModules";
import { requestLiteralTranslationModuleAi, requestTopicGistModuleAi } from "@/lib/localDocumentAuto/localDocModuleAi";
import { renderHtmlToA4PdfBlob } from "@/lib/localDocumentAuto/renderClientPdf";
import styles from "@/pages/textbookAutoBuilder.module.css";

const LOCAL_DOC_SAMPLE_MANUSCRIPT = `[문제+지문]
지문과 함께 붙어 있는 발문…

[정답+해설]
1) …

[주제+요지]
핵심 논지 요약…

[직독직해]
단락 단위 해석…

[평가문제]
객관식 / 서술형 문항만 모음…`;


function localDocSafeBasename(name: string): string {
  const t = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 96);
  return t || "manuscript";
}

function localDocYamlDoubleQuoted(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r\n/g, "\n").replace(/\n/g, "\\n").replace(/\r/g, "\\n")}"`;
}

function localDocBuildConfigYaml(params: {
  headerTitle: string;
  footerLeft: string;
  footerRight: string;
  koreanFont: string;
  englishFont: string;
}): string {
  const { headerTitle, footerLeft, footerRight, koreanFont, englishFont } = params;
  return `# Xtudy 웹에서 내보냄 — document-automation/config.yaml 에 덮어쓰거나 document 블록만 복사하세요.
paths:
  input: input
  output: output
  templates: templates
  assets: assets

document:
  header_title: ${localDocYamlDoubleQuoted(headerTitle)}
  footer_left: ${localDocYamlDoubleQuoted(footerLeft)}
  footer_right: ${localDocYamlDoubleQuoted(footerRight)}

fonts:
  korean_ttf: ${localDocYamlDoubleQuoted(koreanFont)}
  english_ttf: ${localDocYamlDoubleQuoted(englishFont)}
`;
}

function localDocDownloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function modulePreviewLine(m: LocalDocModule): string {
  const t = (m.body ?? "").trim();
  if (!t) return "(비어 있음)";
  return t.replace(/\s+/g, " ").slice(0, 72) + (t.length > 72 ? "…" : "");
}

export function LocalDocumentAutomationPanel({ kind }: { kind: "worksheet" | "evaluation" }) {
  const { showToast } = useToast();
  const title = kind === "worksheet" ? "학습지 (로컬 PDF)" : "평가문제지 (로컬 PDF)";
  const outName =
    kind === "worksheet"
      ? "«이름_worksheet.pdf»"
      : "«이름_evaluation.pdf» (평가문제 블록·2단)";

  const [step, setStep] = useState(1);
  const [headerTitle, setHeaderTitle] = useState("Xtudy · 학습 자료");
  const [footerLeft, setFooterLeft] = useState("Xtudy-Universe");
  const [footerRight, setFooterRight] = useState("내부용");
  const [koreanFont, setKoreanFont] = useState("assets/fonts/NotoSansKR-Regular.ttf");
  const [englishFont, setEnglishFont] = useState("assets/fonts/NotoSans-Regular.ttf");
  const [docStem, setDocStem] = useState(kind === "worksheet" ? "worksheet_manuscript" : "evaluation_manuscript");
  const [pastedManuscript, setPastedManuscript] = useState("");
  const [modules, setModules] = useState<LocalDocModule[] | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragSourceRef = useRef<number | null>(null);
  const [dragRowIndex, setDragRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);
  const [editRowIndex, setEditRowIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<LocalDocModule | null>(null);
  const [aiBusyRow, setAiBusyRow] = useState<number | null>(null);

  const defaultAddField = useCallback((): LocalDocModuleField => {
    return kind === "evaluation" ? "evaluation" : "problem";
  }, [kind]);

  const runAnalyze = useCallback(() => {
    setLocalMsg(null);
    const raw = pastedManuscript.trim();
    if (!raw) {
      setLocalMsg("원고를 입력하거나 파일을 올려 주세요.");
      return;
    }
    const next = parseManuscriptToModules(raw);
    if (!next.length) {
      setLocalMsg("분석 결과 모듈이 없습니다. 내용을 확인해 주세요.");
      return;
    }
    setModules(next);
    setPastedManuscript(modulesToManuscriptText(next));
    setStep(2);
    setLocalMsg("모듈로 분리했습니다. 순서·내용을 조정한 뒤 다음 단계로 진행하세요.");
  }, [pastedManuscript]);

  const resetAll = useCallback(() => {
    setStep(1);
    setModules(null);
    setEditRowIndex(null);
    setDraft(null);
    setDragRowIndex(null);
    setDragOverRowIndex(null);
    setLocalMsg(null);
    setPastedManuscript("");
    setDocStem(kind === "worksheet" ? "worksheet_manuscript" : "evaluation_manuscript");
  }, [kind]);

  const openEditor = useCallback(
    (rowIndex: number) => {
      if (!modules) return;
      setEditRowIndex(rowIndex);
      const m = structuredClone(modules[rowIndex]!);
      if ((m.field === "topic_gist" || m.field === "literal_translation") && !m.inputMode) {
        m.inputMode = "manual";
      }
      setDraft(m);
    },
    [modules],
  );

  const closeEditor = useCallback(() => {
    setEditRowIndex(null);
    setDraft(null);
  }, []);

  const saveEditor = useCallback(() => {
    if (editRowIndex === null || !draft || !modules) return;
    const toSave = structuredClone(draft);
    if (toSave.field === "topic_gist" || toSave.field === "literal_translation") {
      if (!toSave.inputMode) toSave.inputMode = "manual";
    } else {
      delete toSave.inputMode;
    }
    setModules((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[editRowIndex] = toSave;
      return next;
    });
    closeEditor();
    setLocalMsg("모듈을 저장했습니다.");
  }, [editRowIndex, draft, modules, closeEditor]);

  const runAiForDraft = useCallback(async () => {
    if (editRowIndex === null || !draft || !modules) return;
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

  const addRow = useCallback(() => {
    setModules((prev) => [...(prev ?? []), emptyLocalDocModule(defaultAddField())]);
    setLocalMsg("빈 모듈을 추가했습니다. 구역 종류·본문을 편집하세요.");
  }, [defaultAddField]);

  const deleteRow = useCallback((rowIndex: number) => {
    setModules((prev) => {
      if (!prev || prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== rowIndex);
    });
    setEditRowIndex((cur) => (cur === rowIndex ? null : cur));
    setLocalMsg(null);
  }, []);

  const moveRow = useCallback((rowIndex: number, delta: number) => {
    setModules((prev) => {
      if (!prev) return prev;
      const j = rowIndex + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const t = next[rowIndex]!;
      next[rowIndex] = next[j]!;
      next[j] = t;
      return next;
    });
    closeEditor();
  }, [closeEditor]);

  const reorderDrag = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      setModules((prev) => {
        if (!prev || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
        const row = [...prev];
        const [item] = row.splice(from, 1);
        row.splice(to, 0, item);
        return row;
      });
      closeEditor();
    },
    [closeEditor],
  );

  const onUploadTxt = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      setPastedManuscript(text);
      const base = f.name.replace(/\.txt$/i, "").trim();
      if (base) setDocStem(localDocSafeBasename(base));
      setLocalMsg(`「${f.name}」을(를) 불러왔습니다. 「모듈로 분석」을 누르세요.`);
    } catch {
      setLocalMsg("파일을 읽지 못했습니다.");
    }
  }, []);

  const downloadManuscript = useCallback(() => {
    const stem = localDocSafeBasename(docStem);
    if (!modules?.length) {
      setLocalMsg("먼저 원고를 모듈로 분석해 주세요.");
      return;
    }
    const text = modulesToManuscriptText(modules);
    if (!text.trim()) {
      setLocalMsg("내보낼 내용이 없습니다.");
      return;
    }
    localDocDownloadTextFile(`${stem}.txt`, text, "text/plain;charset=utf-8");
    setLocalMsg(`「${stem}.txt」를 내려받았습니다. document-automation/input/ 에 넣은 뒤 main.py 를 실행하세요.`);
  }, [docStem, modules]);

  const downloadConfig = useCallback(() => {
    const yaml = localDocBuildConfigYaml({
      headerTitle,
      footerLeft,
      footerRight,
      koreanFont,
      englishFont,
    });
    localDocDownloadTextFile("xtudy-doc-config.yaml", yaml, "text/yaml;charset=utf-8");
    setLocalMsg(
      "「xtudy-doc-config.yaml」를 내려받았습니다. document-automation/config.yaml 과 비교해 병합하거나 교체하세요.",
    );
  }, [headerTitle, footerLeft, footerRight, koreanFont, englishFont]);

  const canAutoGenerate = useMemo(() => {
    if (generating) return false;
    if (!modules?.length) return false;
    if (!headerTitle.trim() || !footerLeft.trim() || !footerRight.trim()) return false;
    if (!koreanFont.trim() || !englishFont.trim()) return false;
    const stem = localDocSafeBasename(docStem);
    if (!stem) return false;
    if (kind === "evaluation") {
      return modules.some((m) => m.field === "evaluation" && (m.body ?? "").trim());
    }
    return modules.some((m) => m.field !== "evaluation" && (m.body ?? "").trim());
  }, [generating, modules, headerTitle, footerLeft, footerRight, koreanFont, englishFont, docStem, kind]);

  const previewHtml = useMemo(() => {
    if (!modules?.length) return "";
    const stem = localDocSafeBasename(docStem);
    try {
      const root = buildLocalDocPrintRootFromModules({
        kind,
        headerTitle: headerTitle.trim(),
        footerLeft: footerLeft.trim(),
        footerRight: footerRight.trim(),
        docTitle: stem,
        modules,
      });
      return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${stem}</title></head><body style="margin:0;background:#f1f5f9;">${root.outerHTML}</body></html>`;
    } catch {
      return "";
    }
  }, [modules, kind, docStem, headerTitle, footerLeft, footerRight]);

  const onAutoGeneratePdf = useCallback(async () => {
    if (!canAutoGenerate || !modules?.length) {
      showToast(
        "warn",
        kind === "evaluation"
          ? "[평가문제] 모듈에 본문이 있고, 모든 입력 칸을 채워 주세요."
          : "학습지에 포함될 모듈(평가문제 제외)과 모든 입력 칸을 채워 주세요.",
      );
      return;
    }
    const stem = localDocSafeBasename(docStem);
    setGenerating(true);
    try {
      const root = buildLocalDocPrintRootFromModules({
        kind,
        headerTitle: headerTitle.trim(),
        footerLeft: footerLeft.trim(),
        footerRight: footerRight.trim(),
        docTitle: stem,
        modules,
      });
      const blob = await renderHtmlToA4PdfBlob(root);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem}_${kind === "worksheet" ? "worksheet" : "evaluation"}_web.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("ok", "PDF 생성이 완료되어 다운로드를 시작했습니다.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "PDF 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }, [canAutoGenerate, docStem, modules, kind, headerTitle, footerLeft, footerRight, showToast]);

  const overlay =
    generating &&
    createPortal(
      <div className={styles.localPdfOverlay} role="status" aria-live="polite" aria-busy="true">
        <div className={styles.localPdfOverlayCard}>
          <div className={styles.localPdfSpinner} aria-hidden />
          <p className={styles.localPdfOverlayTitle}>PDF 생성 중…</p>
          <p className={styles.localPdfOverlayHint}>잠시만 기다려 주세요. 완료되면 PDF 다운로드가 시작됩니다.</p>
        </div>
      </div>,
      document.body,
    );

  const stepBar = (
    <div className={styles.passageStepBar} role="list" aria-label="진행 단계">
      {(["원고 업로드", "모듈 구성", "디자인 프리뷰", "생성 · 내보내기"] as const).map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        const cls = [styles.passageStepCell];
        if (done) cls.push(styles.passageStepDone);
        if (active) cls.push(styles.passageStepActive);
        return (
          <div key={label} className={cls.join(" ")} role="listitem">
            {n}. {label}
          </div>
        );
      })}
    </div>
  );

  return (
    <section className={`${styles.card} ${styles.localPanel}`} aria-labelledby="local-doc-h">
      {overlay}
      <h2 id="local-doc-h" className={styles.cardTitle}>
        {title}
      </h2>
      <p className={styles.localPanelLead}>
        원고를 <strong>모듈 단위</strong>로 나눈 뒤 순서 변경·편집·추가·삭제할 수 있습니다. 완성 단계에서 PDF·원고·YAML을 내려받을 수 있으며, 동일 서식은{" "}
        <span className={styles.pathChip}>document-automation/src/main.py</span> 로 로컬 생성 시{" "}
        <span className={styles.pathChip}>output/</span>에 {outName} 가 만들어집니다.
      </p>

      {stepBar}

      {localMsg ? (
        <p className={styles.ok} role="status">
          {localMsg}
        </p>
      ) : null}

      {step === 1 ? (
        <>
          <h3 className={styles.localSectionTitle}>1. 원고 업로드</h3>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className={styles.visuallyHidden}
            onChange={onUploadTxt}
            aria-label="원고 txt 선택"
          />
          <label className={styles.field}>
            <span className={styles.label}>원고 직접 입력 (마커 줄은 저장소 예시와 동일해야 합니다)</span>
            <textarea
              className={`${styles.textarea} ${styles.localManuscript}`}
              rows={12}
              value={pastedManuscript}
              onChange={(e) => setPastedManuscript(e.target.value)}
              placeholder="여기에 붙여넣거나, 아래에서 .txt를 업로드하세요."
              spellCheck={false}
            />
          </label>
          <div className={styles.localActionRow}>
            <button type="button" className={styles.btnPrimary} disabled={!pastedManuscript.trim()} onClick={runAnalyze}>
              모듈로 분석
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setPastedManuscript(LOCAL_DOC_SAMPLE_MANUSCRIPT);
                setLocalMsg("예시 원고를 넣었습니다. 「모듈로 분석」을 누르세요.");
              }}
            >
              예시 원고 넣기
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => fileRef.current?.click()}>
              .txt 파일 열기
            </button>
          </div>
          <div className={styles.localActionRow}>
            <button type="button" className={styles.btnGhost} onClick={resetAll}>
              처음부터
            </button>
          </div>
          <p className={styles.label}>마커 예시</p>
          <pre className={styles.samplePre}>{LOCAL_DOC_SAMPLE_MANUSCRIPT}</pre>
        </>
      ) : null}

      {step >= 2 && modules?.length ? (
        <>
          {step === 2 ? (
            <>
              <h3 className={styles.localSectionTitle}>2. 모듈 구성</h3>
              <p className={styles.hint}>
                {kind === "worksheet"
                  ? "학습지 PDF에는 [평가문제] 모듈이 포함되지 않습니다(목록에는 그대로 둘 수 있습니다)."
                  : "평가 PDF에는 [평가문제] 모듈만 2단으로 묶여 들어갑니다. 다른 구역은 참고용으로만 표시됩니다."}
              </p>
              <div className={styles.passageModuleToolbar}>
                <button type="button" className={styles.btnSecondary} onClick={addRow}>
                  + 모듈 추가
                </button>
              </div>
              <table className={styles.passageTable}>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "2rem" }} aria-label="이동" />
                    <th scope="col">#</th>
                    <th scope="col">구역</th>
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
                        draggable
                        className={[
                          dragRowIndex === rowIndex ? styles.passageRowDragging : "",
                          dragOverRowIndex === rowIndex ? styles.passageRowDrop : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onDragStart={() => {
                          dragSourceRef.current = rowIndex;
                          setDragRowIndex(rowIndex);
                        }}
                        onDragEnd={() => {
                          dragSourceRef.current = null;
                          setDragRowIndex(null);
                          setDragOverRowIndex(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverRowIndex(rowIndex);
                        }}
                        onDragLeave={() => setDragOverRowIndex((cur) => (cur === rowIndex ? null : cur))}
                        onDrop={(e) => {
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
                          <button
                            type="button"
                            className={styles.btnMini}
                            onClick={() => moveRow(rowIndex, -1)}
                            disabled={rowIndex === 0}
                            aria-label="한 칸 위로"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className={styles.btnMini}
                            onClick={() => moveRow(rowIndex, 1)}
                            disabled={rowIndex === modules.length - 1}
                            aria-label="한 칸 아래로"
                          >
                            ↓
                          </button>
                          <button type="button" className={styles.btnMiniGhost} onClick={() => openEditor(rowIndex)}>
                            편집
                          </button>
                          <button
                            type="button"
                            className={styles.btnMiniGhost}
                            onClick={() => deleteRow(rowIndex)}
                            disabled={modules.length <= 1}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                      {editRowIndex === rowIndex && draft ? (
                        <tr>
                          <td colSpan={7}>
                            <label className={styles.field}>
                              <span className={styles.label}>구역 종류</span>
                              <select
                                className={styles.select}
                                value={draft.field}
                                onChange={(e) => {
                                  const f = e.target.value as LocalDocModuleField;
                                  const next: LocalDocModule = { ...draft, field: f };
                                  if (f === "topic_gist" || f === "literal_translation") {
                                    next.inputMode = next.inputMode ?? "manual";
                                  } else {
                                    delete next.inputMode;
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
                            {draft.field === "topic_gist" || draft.field === "literal_translation" ? (
                              <div className={styles.field}>
                                <span className={styles.label}>입력 방식</span>
                                <div className={styles.row} style={{ gap: "1rem", flexWrap: "wrap" }}>
                                  <label className={styles.radioLabel}>
                                    <input
                                      type="radio"
                                      name={`inp-${draft.id}`}
                                      checked={(draft.inputMode ?? "manual") === "manual"}
                                      onChange={() => setDraft({ ...draft, inputMode: "manual" as ModuleInputMode })}
                                    />
                                    직접 입력
                                  </label>
                                  <label className={styles.radioLabel}>
                                    <input
                                      type="radio"
                                      name={`inp-${draft.id}`}
                                      checked={(draft.inputMode ?? "manual") === "ai"}
                                      onChange={() => setDraft({ ...draft, inputMode: "ai" as ModuleInputMode })}
                                    />
                                    AI 자동분석
                                  </label>
                                  <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    disabled={aiBusyRow !== null}
                                    onClick={() => void runAiForDraft()}
                                  >
                                    {aiBusyRow === editRowIndex
                                      ? "AI 생성 중…"
                                      : draft.field === "topic_gist"
                                        ? "AI로 주제·제목·요지 채우기"
                                        : "AI로 직독직해 채우기"}
                                  </button>
                                </div>
                                <p className={styles.hint}>
                                  AI는 위쪽에 있는 「문제 · 정답 · 해설」 모듈 본문을 참고합니다. 키가 없으면 .env.local의 VITE_OPENAI_API_KEY를 설정하세요.
                                </p>
                              </div>
                            ) : null}
                            <label className={styles.field}>
                              <span className={styles.label}>본문</span>
                              <textarea
                                className={styles.textarea}
                                rows={8}
                                value={draft.body}
                                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                                spellCheck={false}
                              />
                            </label>
                            <div className={styles.passageEditActions}>
                              <button type="button" className={styles.btnPrimary} onClick={saveEditor}>
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
              <div className={styles.localActionRow}>
                <button type="button" className={styles.btnPrimary} onClick={() => setPastedManuscript(modulesToManuscriptText(modules))}>
                  원고 텍스트에 반영
                </button>
                <button type="button" className={styles.btnPrimary} onClick={() => setStep(3)}>
                  다음: 프리뷰
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setStep(1)}>
                  ← 원고
                </button>
                <button type="button" className={styles.btnGhost} onClick={resetAll}>
                  처음부터
                </button>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h3 className={styles.localSectionTitle}>3. 디자인 프리뷰</h3>
              <p className={styles.hint}>PDF와 동일한 흐름으로 브라우저에서 미리 봅니다. 내용을 바꿨다면 2단계에서 저장 후 다시 오세요.</p>
              <div className={styles.passagePreviewBox}>
                <iframe title="학습지·평가 미리보기" className={styles.passagePreviewIframe} srcDoc={previewHtml} sandbox="allow-same-origin" />
              </div>
              <div className={styles.localActionRow}>
                <button type="button" className={styles.btnGhost} onClick={() => setStep(2)}>
                  ← 모듈 구성
                </button>
                <button type="button" className={styles.btnPrimary} onClick={() => setStep(4)}>
                  다음: 생성
                </button>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h3 className={styles.localSectionTitle}>4. 생성 · 내보내기</h3>
              <p className={styles.localPanelLead}>머릿말·꼬리말을 확인한 뒤 PDF를 받거나, 로컬 파이프라인용 파일을 저장하세요.</p>

              <h4 className={styles.phase3Sub}>머릿말 · 꼬리말 · 폰트 경로</h4>
              <p className={`${styles.hint} ${styles.localHintTight}`}>
                웹 PDF에는 폰트 경로가 쓰이지 않습니다. 값은 <strong>config.yaml 내려받기</strong>·로컬{" "}
                <span className={styles.pathChip}>document-automation/assets/fonts/</span> 용입니다.
              </p>
              <label className={styles.field}>
                <span className={styles.label}>머릿말 (PDF 상단 러닝 헤더)</span>
                <input
                  className={styles.input}
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  maxLength={300}
                  placeholder="예: 독해 워크시트 3강"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>꼬리말 왼쪽</span>
                <input className={styles.input} value={footerLeft} onChange={(e) => setFooterLeft(e.target.value)} maxLength={200} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>꼬리말 오른쪽</span>
                <input className={styles.input} value={footerRight} onChange={(e) => setFooterRight(e.target.value)} maxLength={200} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>한글 폰트 (.ttf 상대 경로, document-automation 기준)</span>
                <input className={styles.input} value={koreanFont} onChange={(e) => setKoreanFont(e.target.value)} maxLength={400} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>영문 폰트 (.ttf 상대 경로)</span>
                <input className={styles.input} value={englishFont} onChange={(e) => setEnglishFont(e.target.value)} maxLength={400} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>저장 파일 이름 (확장자 제외 · 자동 제작 PDF 파일명에 사용)</span>
                <input className={styles.input} value={docStem} onChange={(e) => setDocStem(e.target.value)} maxLength={96} placeholder="예: unit3_worksheet" />
              </label>

              <div className={styles.localActionRow}>
                <button type="button" className={styles.btnPrimary} disabled={!canAutoGenerate} onClick={() => void onAutoGeneratePdf()}>
                  PDF 자동 제작 · 다운로드
                </button>
              </div>
              {!canAutoGenerate && !generating ? (
                <p className={styles.hint}>
                  자동 제작을 쓰려면 머릿말·양쪽 꼬리말·폰트 경로·파일 이름을 채우고,{" "}
                  {kind === "evaluation" ? "[평가문제] 모듈 본문" : "학습지에 쓸 모듈(내용 있음)"}이 있어야 합니다.
                </p>
              ) : null}

              <div className={styles.localActionRow}>
                <button type="button" className={styles.btnSecondary} onClick={downloadManuscript}>
                  원고 .txt 내려받기
                </button>
                <button type="button" className={styles.btnSecondary} onClick={downloadConfig}>
                  config.yaml 내려받기
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setStep(3)}>
                  ← 프리뷰
                </button>
                <button type="button" className={styles.btnGhost} onClick={resetAll}>
                  처음부터
                </button>
              </div>

              <hr className={styles.localDivider} />

              <ol className={styles.localPanelSteps}>
                <li>
                  (선택) <strong>.txt</strong>를 <span className={styles.pathChip}>document-automation/input/</span>에 넣습니다.
                </li>
                <li>
                  (선택) <strong>config.yaml</strong>을 내보낸 파일로 맞춥니다.
                </li>
                <li>
                  저장소 루트에서 <span className={styles.pathChip}>python document-automation/src/main.py</span> 실행 → {outName}
                </li>
              </ol>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
