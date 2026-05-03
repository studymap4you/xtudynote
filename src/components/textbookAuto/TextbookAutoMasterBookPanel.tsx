import { useCallback, useEffect, useState } from "react";
import {
  buildSegmentBlocksParagraphs,
  downloadMasterBookDocx,
} from "@/lib/textbookAuto/buildMasterBookDocx";
import {
  buildTextbookBodyParagraphsFromPassages,
  buildTextbookBodyParagraphsFromUnits,
} from "@/lib/textbookAuto/downloadTextbookAutoDocx";
import { extractTableOfContentsFromText } from "@/lib/textbookAuto/extractTocFromText";
import { extractUnitSourceFile } from "@/lib/textbookAuto/extractUnitSourceFile";
import { combineUnitPassage, emptyUnitSetup } from "@/lib/textbookAuto/combineUnitPassage";
import type {
  TextbookSetupPendingFile,
  TextbookSetupPendingMode,
  TextbookUnitContent,
  TextbookUnitSetupState,
} from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoBuilder.module.css";

export type MasterContentMode = "session_units" | "session_passages" | "upload";

type TocMode = "auto" | "file" | "manual";

type Props = {
  bookTitle: string;
  confirmedUnits: { unitIndex: number; unit: TextbookUnitContent }[];
  sessionUnitPassages: string[] | null;
};

export function TextbookAutoMasterBookPanel({ bookTitle, confirmedUnits, sessionUnitPassages }: Props) {
  const [frontCover, setFrontCover] = useState<File | null>(null);
  const [backCover, setBackCover] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);

  const [tocMode, setTocMode] = useState<TocMode>("auto");
  const [tocDraft, setTocDraft] = useState("");
  const [tocScanBusy, setTocScanBusy] = useState(false);
  const [tocSourceFull, setTocSourceFull] = useState("");

  const [contentMode, setContentMode] = useState<MasterContentMode>("session_units");
  const [contentState, setContentState] = useState<TextbookUnitSetupState>(() => emptyUnitSetup());
  const [appendixState, setAppendixState] = useState<TextbookUnitSetupState>(() => emptyUnitSetup());
  const [contentExtractBusy, setContentExtractBusy] = useState<string | null>(null);
  const [appendixExtractBusy, setAppendixExtractBusy] = useState<string | null>(null);

  const [masterBusy, setMasterBusy] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    if (frontCover) {
      const u = URL.createObjectURL(frontCover);
      setFrontPreview(u);
      return () => URL.revokeObjectURL(u);
    }
    setFrontPreview(null);
    return undefined;
  }, [frontCover]);

  useEffect(() => {
    if (backCover) {
      const u = URL.createObjectURL(backCover);
      setBackPreview(u);
      return () => URL.revokeObjectURL(u);
    }
    setBackPreview(null);
    return undefined;
  }, [backCover]);

  const fillTocFromUnits = useCallback(() => {
    const sorted = [...confirmedUnits].sort((a, b) => a.unitIndex - b.unitIndex);
    const lines = sorted.map(
      ({ unitIndex, unit }) => `제 ${unitIndex + 1}단원 · ${unit.unitTitle}`,
    );
    setTocDraft(lines.join("\n"));
    setLocalMsg("확정 단원 제목으로 목차를 채웠습니다.");
    setLocalErr(null);
  }, [confirmedUnits]);

  useEffect(() => {
    if (tocMode === "auto" && tocDraft.trim() === "" && confirmedUnits.length > 0) {
      fillTocFromUnits();
    }
  }, [tocMode, confirmedUnits, fillTocFromUnits, tocDraft]);

  const onTocFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setLocalErr(null);
    setTocScanBusy(true);
    try {
      const { text } = await extractUnitSourceFile(file, { mode: "all" });
      setTocSourceFull(text);
      const inferred = extractTableOfContentsFromText(text);
      if (inferred.length > 0) {
        setTocDraft(inferred.join("\n"));
        setLocalMsg(`「${file.name}」에서 목차 후보 ${inferred.length}줄을 추출했습니다. 필요하면 수정하세요.`);
      } else {
        setTocDraft("");
        setLocalMsg(`「${file.name}」에서 목차 패턴을 찾지 못했습니다. 아래에 직접 붙여 넣거나 수동 모드를 쓰세요.`);
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "목차용 파일을 읽지 못했습니다.");
    } finally {
      setTocScanBusy(false);
    }
  }, []);

  const addContentPending = useCallback((files: File[]) => {
    if (!files.length) return;
    setContentState((prev) => {
      const batch: TextbookSetupPendingFile[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        mode: "all" as TextbookSetupPendingMode,
        fromPage: "",
        toPage: "",
        pagesRaw: "",
      }));
      return { ...prev, pendingFiles: [...prev.pendingFiles, ...batch] };
    });
  }, []);

  const addAppendixPending = useCallback((files: File[]) => {
    if (!files.length) return;
    setAppendixState((prev) => {
      const batch: TextbookSetupPendingFile[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        mode: "all" as TextbookSetupPendingMode,
        fromPage: "",
        toPage: "",
        pagesRaw: "",
      }));
      return { ...prev, pendingFiles: [...prev.pendingFiles, ...batch] };
    });
  }, []);

  const patchContentPending = useCallback((id: string, patch: Partial<TextbookSetupPendingFile>) => {
    setContentState((prev) => ({
      ...prev,
      pendingFiles: prev.pendingFiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const patchAppendixPending = useCallback((id: string, patch: Partial<TextbookSetupPendingFile>) => {
    setAppendixState((prev) => ({
      ...prev,
      pendingFiles: prev.pendingFiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const removeContentPending = useCallback((id: string) => {
    setContentState((prev) => ({
      ...prev,
      pendingFiles: prev.pendingFiles.filter((p) => p.id !== id),
    }));
  }, []);

  const removeAppendixPending = useCallback((id: string) => {
    setAppendixState((prev) => ({
      ...prev,
      pendingFiles: prev.pendingFiles.filter((p) => p.id !== id),
    }));
  }, []);

  const removeContentSegment = useCallback((id: string) => {
    setContentState((prev) => ({
      ...prev,
      fileSegments: prev.fileSegments.filter((s) => s.id !== id),
    }));
  }, []);

  const removeAppendixSegment = useCallback((id: string) => {
    setAppendixState((prev) => ({
      ...prev,
      fileSegments: prev.fileSegments.filter((s) => s.id !== id),
    }));
  }, []);

  const extractContentPending = useCallback(
    async (pendingId: string) => {
      const pending = contentState.pendingFiles.find((p) => p.id === pendingId);
      if (!pending) return;
      setLocalErr(null);
      setContentExtractBusy(pendingId);
      try {
        const fromRaw = pending.fromPage.trim();
        const toRaw = pending.toPage.trim();
        const fromNum = fromRaw === "" ? undefined : Number(fromRaw);
        const toNum = toRaw === "" ? undefined : Number(toRaw);
        const { text, extractNote } = await extractUnitSourceFile(pending.file, {
          mode: pending.mode,
          fromPage: fromNum !== undefined && Number.isFinite(fromNum) ? Math.max(1, Math.floor(fromNum)) : undefined,
          toPage: toNum !== undefined && Number.isFinite(toNum) ? Math.max(1, Math.floor(toNum)) : undefined,
          pagesRaw: pending.pagesRaw,
        });
        if (!text.trim()) {
          setLocalErr(`「${pending.file.name}」에서 본문을 추출하지 못했습니다.`);
          return;
        }
        const segId = crypto.randomUUID();
        setContentState((prev) => ({
          ...prev,
          fileSegments: [
            ...prev.fileSegments,
            { id: segId, fileName: pending.file.name, extractNote, text },
          ],
          pendingFiles: prev.pendingFiles.filter((p) => p.id !== pendingId),
        }));
        setLocalMsg(`본문에 「${pending.file.name}」 블록을 추가했습니다.`);
      } catch (e) {
        setLocalErr(e instanceof Error ? e.message : "추출에 실패했습니다.");
      } finally {
        setContentExtractBusy(null);
      }
    },
    [contentState.pendingFiles],
  );

  const extractAppendixPending = useCallback(
    async (pendingId: string) => {
      const pending = appendixState.pendingFiles.find((p) => p.id === pendingId);
      if (!pending) return;
      setLocalErr(null);
      setAppendixExtractBusy(pendingId);
      try {
        const fromRaw = pending.fromPage.trim();
        const toRaw = pending.toPage.trim();
        const fromNum = fromRaw === "" ? undefined : Number(fromRaw);
        const toNum = toRaw === "" ? undefined : Number(toRaw);
        const { text, extractNote } = await extractUnitSourceFile(pending.file, {
          mode: pending.mode,
          fromPage: fromNum !== undefined && Number.isFinite(fromNum) ? Math.max(1, Math.floor(fromNum)) : undefined,
          toPage: toNum !== undefined && Number.isFinite(toNum) ? Math.max(1, Math.floor(toNum)) : undefined,
          pagesRaw: pending.pagesRaw,
        });
        if (!text.trim()) {
          setLocalErr(`「${pending.file.name}」에서 추가 페이지를 추출하지 못했습니다.`);
          return;
        }
        const segId = crypto.randomUUID();
        setAppendixState((prev) => ({
          ...prev,
          fileSegments: [
            ...prev.fileSegments,
            { id: segId, fileName: pending.file.name, extractNote, text },
          ],
          pendingFiles: prev.pendingFiles.filter((p) => p.id !== pendingId),
        }));
        setLocalMsg(`추가 페이지에 「${pending.file.name}」 블록을 넣었습니다.`);
      } catch (e) {
        setLocalErr(e instanceof Error ? e.message : "추출에 실패했습니다.");
      } finally {
        setAppendixExtractBusy(null);
      }
    },
    [appendixState.pendingFiles],
  );

  const runDownloadMaster = useCallback(async () => {
    setLocalErr(null);
    setLocalMsg(null);
    const title = bookTitle.trim() || "교재";
    const tocLines = tocDraft.split("\n").map((l) => l.trim()).filter(Boolean);

    let bodyParagraphs;
    try {
      if (contentMode === "session_units") {
        if (confirmedUnits.length === 0) {
          throw new Error("확정된 단원이 없습니다.");
        }
        bodyParagraphs = buildTextbookBodyParagraphsFromUnits(confirmedUnits);
      } else if (contentMode === "session_passages") {
        if (!sessionUnitPassages || sessionUnitPassages.length === 0) {
          throw new Error("세션 원문(지문)이 없습니다. 1단계 세션을 다시 시작해야 할 수 있습니다.");
        }
        bodyParagraphs = buildTextbookBodyParagraphsFromPassages(sessionUnitPassages);
      } else {
        if (contentState.pendingFiles.length > 0) {
          throw new Error("본문: 추출 대기 중인 파일이 있습니다. 먼저 추출하거나 제거하세요.");
        }
        if (contentState.fileSegments.length === 0) {
          throw new Error("본문 업로드 모드에서는 추출된 파일 블록이 하나 이상 필요합니다.");
        }
        bodyParagraphs = buildSegmentBlocksParagraphs(
          contentState.fileSegments.map((s) => ({
            fileName: `${s.fileName} · ${s.extractNote}`,
            text: s.text,
          })),
        );
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "본문을 구성하지 못했습니다.");
      return;
    }

    if (appendixState.pendingFiles.length > 0) {
      setLocalErr("추가 페이지: 추출 대기 중인 파일이 있습니다.");
      return;
    }
    const appendixParagraphs =
      appendixState.fileSegments.length === 0
        ? []
        : buildSegmentBlocksParagraphs(
            appendixState.fileSegments.map((s) => ({
              fileName: `${s.fileName} · ${s.extractNote}`,
              text: s.text,
            })),
          );

    setMasterBusy(true);
    try {
      await downloadMasterBookDocx({
        bookTitle: title,
        frontCover,
        backCover,
        tocLines,
        bodyParagraphs,
        appendixParagraphs,
      });
      setLocalMsg("완성본 Word(.docx)를 받았습니다. Word에서 PDF로 내보내 전자책 형태로 쓸 수 있습니다.");
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "완성본 생성에 실패했습니다.");
    } finally {
      setMasterBusy(false);
    }
  }, [
    bookTitle,
    tocDraft,
    contentMode,
    confirmedUnits,
    sessionUnitPassages,
    contentState,
    appendixState,
    frontCover,
    backCover,
  ]);

  const pendingRow = (
    kind: "content" | "appendix",
    p: TextbookSetupPendingFile,
  ) => {
    const isPdf =
      p.file.name.toLowerCase().endsWith(".pdf") || p.file.type.toLowerCase() === "application/pdf";
    const busyId = kind === "content" ? contentExtractBusy : appendixExtractBusy;
    const patch = kind === "content" ? patchContentPending : patchAppendixPending;
    const remove = kind === "content" ? removeContentPending : removeAppendixPending;
    const extract = kind === "content" ? extractContentPending : extractAppendixPending;

    return (
      <div key={p.id} className={styles.pendingRow}>
        <span className={styles.pendingName} title={p.file.name}>
          {p.file.name}
        </span>
        {isPdf ? (
          <>
            <select
              className={styles.select}
              value={p.mode}
              onChange={(e) => patch(p.id, { mode: e.target.value as TextbookSetupPendingMode })}
              aria-label="PDF 추출 방식"
            >
              <option value="all">PDF 전체</option>
              <option value="range">PDF 구간</option>
              <option value="pages">PDF 페이지 목록</option>
            </select>
            {p.mode === "range" ? (
              <span className={styles.pageInputs}>
                <input
                  className={styles.inputSmall}
                  type="number"
                  min={1}
                  placeholder="시작"
                  value={p.fromPage}
                  onChange={(e) => patch(p.id, { fromPage: e.target.value })}
                />
                <span className={styles.pageSep}>—</span>
                <input
                  className={styles.inputSmall}
                  type="number"
                  min={1}
                  placeholder="끝"
                  value={p.toPage}
                  onChange={(e) => patch(p.id, { toPage: e.target.value })}
                />
              </span>
            ) : null}
            {p.mode === "pages" ? (
              <input
                className={styles.inputPages}
                placeholder="예: 1, 3, 5"
                value={p.pagesRaw}
                onChange={(e) => patch(p.id, { pagesRaw: e.target.value })}
              />
            ) : null}
          </>
        ) : (
          <span className={styles.nonPdfHint}>TXT/DOCX · 전체</span>
        )}
        <button
          type="button"
          className={styles.btnMini}
          disabled={busyId === p.id}
          onClick={() => void extract(p.id)}
        >
          {busyId === p.id ? "추출 중…" : "추출"}
        </button>
        <button type="button" className={styles.btnMiniGhost} onClick={() => remove(p.id)}>
          제거
        </button>
      </div>
    );
  };

  return (
    <section className={styles.card} aria-labelledby="phase5-h">
      <h2 id="phase5-h" className={styles.cardTitle}>
        5. 완성본 (앞표지 · 목차 · 본문 · 추가 · 뒷표지)
      </h2>
      <p className={styles.p}>
        표지 이미지와 목차·본문 구성을 마친 뒤 하나의 Word(.docx)로 받습니다. 전자책 PDF는 Word에서 「다른 이름으로 저장 → PDF」로 만드시면 됩니다.
      </p>

      <div className={styles.step5Grid}>
        <div className={styles.step5Col}>
          <h3 className={styles.phase3Sub}>앞표지</h3>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className={styles.file}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFrontCover(f);
              e.target.value = "";
            }}
          />
          {frontPreview ? (
            <img src={frontPreview} alt="" className={styles.coverThumb} />
          ) : (
            <p className={styles.hint}>PNG · JPEG · WebP</p>
          )}
          {frontCover ? (
            <button type="button" className={styles.btnMiniGhost} onClick={() => setFrontCover(null)}>
              표지 제거
            </button>
          ) : null}
        </div>

        <div className={styles.step5Col}>
          <h3 className={styles.phase3Sub}>뒷표지</h3>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className={styles.file}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setBackCover(f);
              e.target.value = "";
            }}
          />
          {backPreview ? <img src={backPreview} alt="" className={styles.coverThumb} /> : <p className={styles.hint}>PNG · JPEG · WebP</p>}
          {backCover ? (
            <button type="button" className={styles.btnMiniGhost} onClick={() => setBackCover(null)}>
              표지 제거
            </button>
          ) : null}
        </div>
      </div>

      <h3 className={styles.phase3Sub}>목차</h3>
      <div className={styles.row}>
        <label className={styles.radioLabel}>
          <input type="radio" name="tocmode" checked={tocMode === "auto"} onChange={() => setTocMode("auto")} /> 자동(확정 단원
          제목)
        </label>
        <label className={styles.radioLabel}>
          <input type="radio" name="tocmode" checked={tocMode === "file"} onChange={() => setTocMode("file")} /> 파일에서 추출
        </label>
        <label className={styles.radioLabel}>
          <input type="radio" name="tocmode" checked={tocMode === "manual"} onChange={() => setTocMode("manual")} /> 직접 입력
        </label>
      </div>
      {tocMode === "auto" ? (
        <div className={styles.row}>
          <button type="button" className={styles.btnSecondary} onClick={fillTocFromUnits}>
            단원 제목으로 목차 채우기
          </button>
        </div>
      ) : null}
      {tocMode === "file" ? (
        <div className={styles.field}>
          <input
            type="file"
            accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className={styles.file}
            disabled={tocScanBusy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void onTocFile(f);
              e.target.value = "";
            }}
          />
          {tocSourceFull ? (
            <p className={styles.hint}>원문 앞부분 미리보기: {tocSourceFull.slice(0, 200)}…</p>
          ) : null}
        </div>
      ) : null}
      <label className={styles.field}>
        <span className={styles.label}>목차 줄 (한 줄에 한 항목)</span>
        <textarea
          className={styles.textarea}
          rows={8}
          value={tocDraft}
          onChange={(e) => setTocDraft(e.target.value)}
          placeholder="제 1단원 · …"
        />
      </label>

      <h3 className={styles.phase3Sub}>본문</h3>
      <div className={styles.row}>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="contentmode"
            checked={contentMode === "session_units"}
            onChange={() => setContentMode("session_units")}
          />
          세션 · AI 확정 단원
        </label>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="contentmode"
            checked={contentMode === "session_passages"}
            onChange={() => setContentMode("session_passages")}
            disabled={!sessionUnitPassages || sessionUnitPassages.length === 0}
          />
          세션 · 1단계 원문 지문
        </label>
        <label className={styles.radioLabel}>
          <input type="radio" name="contentmode" checked={contentMode === "upload"} onChange={() => setContentMode("upload")} />
          파일 업로드 합산
        </label>
      </div>
      {contentMode === "upload" ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>본문 파일 (.txt · .pdf · .docx, 다중)</span>
            <input
              type="file"
              multiple
              accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className={styles.file}
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                addContentPending(files);
                e.target.value = "";
              }}
            />
          </label>
          {contentState.pendingFiles.length > 0 ? (
            <div className={styles.pendingList}>
              <p className={styles.pendingHead}>본문 추출 대기</p>
              {contentState.pendingFiles.map((p) => pendingRow("content", p))}
            </div>
          ) : null}
          {contentState.fileSegments.length > 0 ? (
            <ul className={styles.segmentList}>
              {contentState.fileSegments.map((s) => (
                <li key={s.id} className={styles.segmentItem}>
                  <div className={styles.segmentHead}>
                    <span className={styles.segmentNote}>{s.extractNote}</span>
                    <button type="button" className={styles.btnMiniGhost} onClick={() => removeContentSegment(s.id)}>
                      블록 제거
                    </button>
                  </div>
                  <p className={styles.segmentPreview}>
                    {s.text.length > 200 ? `${s.text.slice(0, 200)}…` : s.text}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.hint}>합산 약 {combineUnitPassage(contentState).length.toLocaleString()}자 (미리보기)</p>
        </>
      ) : (
        <p className={styles.hint}>
          {contentMode === "session_units"
            ? `확정 단원 ${confirmedUnits.length}개를 그대로 본문에 넣습니다.`
            : `저장된 단원별 원문 ${sessionUnitPassages?.length ?? 0}개를 순서대로 넣습니다.`}
        </p>
      )}

      <h3 className={styles.phase3Sub}>추가 페이지</h3>
      <p className={styles.hint}>부록·안내 등 본문 뒤에 붙일 내용을 파일로 올립니다.</p>
      <label className={styles.field}>
        <span className={styles.label}>추가 파일 (.txt · .pdf · .docx, 다중)</span>
        <input
          type="file"
          multiple
          accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className={styles.file}
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            addAppendixPending(files);
            e.target.value = "";
          }}
        />
      </label>
      {appendixState.pendingFiles.length > 0 ? (
        <div className={styles.pendingList}>
          <p className={styles.pendingHead}>추가 추출 대기</p>
          {appendixState.pendingFiles.map((p) => pendingRow("appendix", p))}
        </div>
      ) : null}
      {appendixState.fileSegments.length > 0 ? (
        <ul className={styles.segmentList}>
          {appendixState.fileSegments.map((s) => (
            <li key={s.id} className={styles.segmentItem}>
              <div className={styles.segmentHead}>
                <span className={styles.segmentNote}>{s.extractNote}</span>
                <button type="button" className={styles.btnMiniGhost} onClick={() => removeAppendixSegment(s.id)}>
                  블록 제거
                </button>
              </div>
              <p className={styles.segmentPreview}>{s.text.length > 200 ? `${s.text.slice(0, 200)}…` : s.text}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.row}>
        <button type="button" className={styles.btnPrimary} disabled={masterBusy} onClick={() => void runDownloadMaster()}>
          {masterBusy ? "만드는 중…" : "완성본 Word 다운로드"}
        </button>
      </div>

      {localMsg ? <p className={styles.ok}>{localMsg}</p> : null}
      {localErr ? <p className={styles.bad}>{localErr}</p> : null}
    </section>
  );
}
