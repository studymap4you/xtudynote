import { useCallback, useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { downloadMasterBookDocx, folioBlocksToDocxParagraphs } from "@/lib/textbookAuto/buildMasterBookDocx";
import {
  assertMasterAppendixNoPending,
  buildMasterAppendixParagraphsForDocx,
  buildMasterBookBodyParagraphsForDocx,
  type MasterBookContentMode,
} from "@/lib/textbookAuto/masterBookBodyBuild";
import { exportMasterBookPdfFromElement } from "@/lib/textbookAuto/exportMasterBookPdf";
import {
  loadMasterBookLayoutDoc,
  masterFolioBlocksToPersisted,
  persistedFolioToMasterBlocks,
  saveMasterBookLayoutDoc,
  storagePathToDownloadUrl,
  uploadMasterLayoutImage,
} from "@/lib/textbookAuto/masterBookLayoutFirestore";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { TextbookAutoMasterBookPrintView } from "@/components/textbookAuto/TextbookAutoMasterBookPrintView";
import { extractTableOfContentsFromText } from "@/lib/textbookAuto/extractTocFromText";
import { extractUnitSourceFile } from "@/lib/textbookAuto/extractUnitSourceFile";
import { combineUnitPassage, emptyUnitSetup } from "@/lib/textbookAuto/combineUnitPassage";
import {
  newMasterBookImageBlock,
  newMasterBookTextBlock,
  type MasterBookFolioBlock,
} from "@/lib/textbookAuto/masterBookFolio";
import type {
  TextbookSetupPendingFile,
  TextbookSetupPendingMode,
  TextbookUnitContent,
  TextbookUnitSetupState,
} from "@/types/textbookAuto";
import styles from "@/pages/textbookAutoBuilder.module.css";

function FolioThumb({ file, remoteUrl }: { file: File | null; remoteUrl?: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const imgSrc = src ?? remoteUrl ?? null;
  if (!imgSrc) return null;
  return <img src={imgSrc} alt="" className={styles.coverThumb} />;
}

export type MasterContentMode = MasterBookContentMode;

type TocMode = "auto" | "file" | "manual";

type Props = {
  bookTitle: string;
  confirmedUnits: { unitIndex: number; unit: TextbookUnitContent }[];
  sessionUnitPassages: string[] | null;
  uid: string;
  sessionId: string | null;
};

const DEFAULT_FOREWORD_TEMPLATE =
  "이 교재는 제시된 지문과 문제를 통해 학습 목표를 달성하도록 구성되었습니다.\n\n학습에 참고하시기 바랍니다.";
const DEFAULT_AFTERWORD_TEMPLATE =
  "끝까지 마친 학습자 여러분, 수고하셨습니다.\n\n추가 문의는 담당 교사에게 연락해 주세요.";

export function TextbookAutoMasterBookPanel({
  bookTitle,
  confirmedUnits,
  sessionUnitPassages,
  uid,
  sessionId,
}: Props) {
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

  const [forewordBlocks, setForewordBlocks] = useState<MasterBookFolioBlock[]>([]);
  const [afterwordBlocks, setAfterwordBlocks] = useState<MasterBookFolioBlock[]>([]);
  const [unitCoverFiles, setUnitCoverFiles] = useState<Record<number, File | null>>({});
  const [unitCoverPaths, setUnitCoverPaths] = useState<Record<number, string>>({});
  const [unitCoverRemoteUrls, setUnitCoverRemoteUrls] = useState<Record<number, string>>({});

  const [masterBusy, setMasterBusy] = useState(false);
  const [layoutCloudBusy, setLayoutCloudBusy] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const masterPrintRef = useRef<HTMLDivElement>(null);

  const printMasterBook = useReactToPrint({
    contentRef: masterPrintRef,
    documentTitle: () =>
      bookTitle.trim() ? `Xtudy_Textbook_Master_${bookTitle.trim().slice(0, 24)}` : "Xtudy_Textbook_Master",
    pageStyle: REACT_TO_PRINT_A4_PAGE_STYLE,
  });

  /** 규칙 배포 후 세션별 저장분을 자동 반영 (수동 「불러오기」와 동일 데이터) */
  useEffect(() => {
    if (!uid || !sessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const doc = await loadMasterBookLayoutDoc(uid, sessionId);
        if (cancelled || !doc) return;
        const hasAny =
          doc.foreword.length > 0 ||
          doc.afterword.length > 0 ||
          Object.keys(doc.unitCovers).length > 0;
        if (!hasAny) return;
        setForewordBlocks(await persistedFolioToMasterBlocks(doc.foreword));
        setAfterwordBlocks(await persistedFolioToMasterBlocks(doc.afterword));
        const paths: Record<number, string> = {};
        const urls: Record<number, string> = {};
        for (const [k, path] of Object.entries(doc.unitCovers)) {
          const ui = Number(k);
          if (!Number.isFinite(ui)) continue;
          paths[ui] = path;
          urls[ui] = await storagePathToDownloadUrl(path);
        }
        if (cancelled) return;
        setUnitCoverPaths(paths);
        setUnitCoverRemoteUrls(urls);
        setUnitCoverFiles({});
        setLocalMsg("클라우드에서 완성본 레이아웃을 불러왔습니다.");
      } catch (e) {
        if (!cancelled) {
          setLocalErr(e instanceof Error ? e.message : "불러오기에 실패했습니다.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, sessionId]);

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
    const lines = confirmedUnits.map(
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
      assertMasterAppendixNoPending(appendixState);
      bodyParagraphs = await buildMasterBookBodyParagraphsForDocx({
        contentMode,
        confirmedUnits,
        sessionUnitPassages,
        contentState,
        unitCovers: unitCoverFiles,
        unitCoverUrls: unitCoverRemoteUrls,
      });
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "본문을 구성하지 못했습니다.");
      return;
    }

    const appendixParagraphs = buildMasterAppendixParagraphsForDocx(appendixState);

    const forewordParagraphs =
      forewordBlocks.length > 0 ? await folioBlocksToDocxParagraphs(forewordBlocks) : [];
    const afterwordParagraphs =
      afterwordBlocks.length > 0 ? await folioBlocksToDocxParagraphs(afterwordBlocks) : [];

    setMasterBusy(true);
    try {
      await downloadMasterBookDocx({
        bookTitle: title,
        frontCover,
        backCover,
        tocLines,
        ...(forewordParagraphs.length > 0 ? { forewordParagraphs } : {}),
        ...(afterwordParagraphs.length > 0 ? { afterwordParagraphs } : {}),
        bodyParagraphs,
        appendixParagraphs,
      });
      setLocalMsg(
        "완성본 Word(.docx)를 받았습니다. 아래 「완성본 PDF 저장」·「완성본 인쇄」로도 같은 구성을 내보낼 수 있습니다.",
      );
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
    forewordBlocks,
    afterwordBlocks,
    unitCoverFiles,
    unitCoverRemoteUrls,
  ]);

  const runDownloadMasterPdf = useCallback(async () => {
    setLocalErr(null);
    setLocalMsg(null);
    try {
      assertMasterAppendixNoPending(appendixState);
      await buildMasterBookBodyParagraphsForDocx({
        contentMode,
        confirmedUnits,
        sessionUnitPassages,
        contentState,
        unitCovers: unitCoverFiles,
        unitCoverUrls: unitCoverRemoteUrls,
      });
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "본문을 구성하지 못했습니다.");
      return;
    }
    const el = masterPrintRef.current;
    if (!el) {
      setLocalErr("인쇄 영역이 준비되지 않았습니다. 페이지를 새로고침한 뒤 다시 시도하세요.");
      return;
    }
    setMasterBusy(true);
    try {
      await exportMasterBookPdfFromElement(el, bookTitle.trim() || "교재");
      setLocalMsg("완성본 PDF를 저장했습니다.");
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "PDF 저장에 실패했습니다.");
    } finally {
      setMasterBusy(false);
    }
  }, [bookTitle, contentMode, confirmedUnits, sessionUnitPassages, contentState, appendixState, unitCoverFiles, unitCoverRemoteUrls]);

  const onPrintMasterBook = useCallback(async () => {
    setLocalErr(null);
    setLocalMsg(null);
    try {
      assertMasterAppendixNoPending(appendixState);
      await buildMasterBookBodyParagraphsForDocx({
        contentMode,
        confirmedUnits,
        sessionUnitPassages,
        contentState,
        unitCovers: unitCoverFiles,
        unitCoverUrls: unitCoverRemoteUrls,
      });
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "본문을 구성하지 못했습니다.");
      return;
    }
    printMasterBook();
  }, [
    appendixState,
    contentMode,
    confirmedUnits,
    sessionUnitPassages,
    contentState,
    unitCoverFiles,
    unitCoverRemoteUrls,
    printMasterBook,
  ]);

  const runLoadMasterLayoutFromCloud = useCallback(async () => {
    if (!uid || !sessionId) {
      setLocalErr("로그인·세션이 필요합니다.");
      return;
    }
    setLocalErr(null);
    setLayoutCloudBusy(true);
    try {
      const doc = await loadMasterBookLayoutDoc(uid, sessionId);
      if (!doc) {
        setLocalMsg("저장된 완성본 레이아웃이 없습니다.");
        return;
      }
      setForewordBlocks(await persistedFolioToMasterBlocks(doc.foreword));
      setAfterwordBlocks(await persistedFolioToMasterBlocks(doc.afterword));
      const paths: Record<number, string> = {};
      const urls: Record<number, string> = {};
      for (const [k, path] of Object.entries(doc.unitCovers)) {
        const ui = Number(k);
        if (!Number.isFinite(ui)) continue;
        paths[ui] = path;
        urls[ui] = await storagePathToDownloadUrl(path);
      }
      setUnitCoverPaths(paths);
      setUnitCoverRemoteUrls(urls);
      setUnitCoverFiles({});
      setLocalMsg("클라우드에서 완성본 레이아웃을 불러왔습니다.");
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "불러오기에 실패했습니다.");
    } finally {
      setLayoutCloudBusy(false);
    }
  }, [uid, sessionId]);

  const runSaveMasterLayoutToCloud = useCallback(async () => {
    if (!uid || !sessionId) {
      setLocalErr("로그인·세션이 필요합니다.");
      return;
    }
    setLocalErr(null);
    setLayoutCloudBusy(true);
    try {
      const foreword = await masterFolioBlocksToPersisted(uid, sessionId, "foreword", forewordBlocks);
      const afterword = await masterFolioBlocksToPersisted(uid, sessionId, "afterword", afterwordBlocks);
      const unitCoversOut: Record<string, string> = {};
      for (const { unitIndex } of confirmedUnits) {
        const f = unitCoverFiles[unitIndex];
        const existing = unitCoverPaths[unitIndex];
        if (f) {
          unitCoversOut[String(unitIndex)] = await uploadMasterLayoutImage(
            uid,
            sessionId,
            `unit_cover_${unitIndex}`,
            f,
          );
        } else if (existing) {
          unitCoversOut[String(unitIndex)] = existing;
        }
      }
      await saveMasterBookLayoutDoc(uid, sessionId, { foreword, afterword, unitCovers: unitCoversOut });
      const refreshed = await loadMasterBookLayoutDoc(uid, sessionId);
      if (refreshed) {
        setForewordBlocks(await persistedFolioToMasterBlocks(refreshed.foreword));
        setAfterwordBlocks(await persistedFolioToMasterBlocks(refreshed.afterword));
        const paths: Record<number, string> = {};
        const urls: Record<number, string> = {};
        for (const [k, path] of Object.entries(refreshed.unitCovers)) {
          const ui = Number(k);
          if (!Number.isFinite(ui)) continue;
          paths[ui] = path;
          urls[ui] = await storagePathToDownloadUrl(path);
        }
        setUnitCoverPaths(paths);
        setUnitCoverRemoteUrls(urls);
        setUnitCoverFiles({});
      }
      setLocalMsg("완성본 머리말·꼬리말·단원 커버를 클라우드에 저장했습니다.");
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "클라우드 저장에 실패했습니다.");
    } finally {
      setLayoutCloudBusy(false);
    }
  }, [
    uid,
    sessionId,
    forewordBlocks,
    afterwordBlocks,
    confirmedUnits,
    unitCoverFiles,
    unitCoverPaths,
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
        표지 이미지와 목차·본문 구성을 마친 뒤 Word(.docx)로 받거나, 아래 「완성본 PDF 저장」·「완성본 인쇄」로 같은 구성을 PDF·인쇄로 내보낼 수 있습니다.
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
              if (f) window.alert(`앞표지로 「${f.name}」을(를) 올렸습니다. 미리보기를 확인하세요.`);
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
              if (f) window.alert(`뒷표지로 「${f.name}」을(를) 올렸습니다. 미리보기를 확인하세요.`);
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

      <div className={styles.step5Grid}>
        <div className={styles.step5Col}>
          <h3 className={styles.phase3Sub}>머리말</h3>
          <p className={styles.hint}>문단·이미지 블록을 쌓아 넣습니다. 인쇄·Word·PDF에서 목차 앞에 붙습니다.</p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.btnMini}
              onClick={() => setForewordBlocks((p) => [...p, newMasterBookTextBlock()])}
            >
              문단 추가
            </button>
            <button
              type="button"
              className={styles.btnMini}
              onClick={() => setForewordBlocks((p) => [...p, newMasterBookImageBlock()])}
            >
              이미지 추가
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setForewordBlocks([newMasterBookTextBlock(DEFAULT_FOREWORD_TEMPLATE)])}
            >
              기본 문구 넣기
            </button>
            <button type="button" className={styles.btnMiniGhost} onClick={() => setForewordBlocks([])}>
              전부 제거
            </button>
          </div>
          {forewordBlocks.map((b) => (
            <div key={b.id} className={styles.segmentItem}>
              {b.kind === "text" ? (
                <label className={styles.field}>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={b.text}
                    onChange={(e) =>
                      setForewordBlocks((prev) =>
                        prev.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)),
                      )
                    }
                  />
                </label>
              ) : (
                <div className={styles.field}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className={styles.file}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) window.alert(`머리말에 「${f.name}」 이미지를 넣었습니다. 아래 미리보기를 확인하세요.`);
                      setForewordBlocks((prev) =>
                        prev.map((x) =>
                          x.id === b.id ?
                            { ...x, file: f, storagePath: null, remoteUrl: null }
                          : x,
                        ),
                      );
                      e.target.value = "";
                    }}
                  />
                  <FolioThumb file={b.file} remoteUrl={b.kind === "image" ? b.remoteUrl : null} />
                </div>
              )}
              <button
                type="button"
                className={styles.btnMiniGhost}
                onClick={() => setForewordBlocks((prev) => prev.filter((x) => x.id !== b.id))}
              >
                이 블록 제거
              </button>
            </div>
          ))}
        </div>
        <div className={styles.step5Col}>
          <h3 className={styles.phase3Sub}>꼬리말</h3>
          <p className={styles.hint}>추가 페이지 뒤·뒷표지 앞에 붙습니다.</p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.btnMini}
              onClick={() => setAfterwordBlocks((p) => [...p, newMasterBookTextBlock()])}
            >
              문단 추가
            </button>
            <button
              type="button"
              className={styles.btnMini}
              onClick={() => setAfterwordBlocks((p) => [...p, newMasterBookImageBlock()])}
            >
              이미지 추가
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setAfterwordBlocks([newMasterBookTextBlock(DEFAULT_AFTERWORD_TEMPLATE)])}
            >
              기본 문구 넣기
            </button>
            <button type="button" className={styles.btnMiniGhost} onClick={() => setAfterwordBlocks([])}>
              전부 제거
            </button>
          </div>
          {afterwordBlocks.map((b) => (
            <div key={b.id} className={styles.segmentItem}>
              {b.kind === "text" ? (
                <label className={styles.field}>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={b.text}
                    onChange={(e) =>
                      setAfterwordBlocks((prev) =>
                        prev.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)),
                      )
                    }
                  />
                </label>
              ) : (
                <div className={styles.field}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className={styles.file}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) window.alert(`꼬리말에 「${f.name}」 이미지를 넣었습니다. 아래 미리보기를 확인하세요.`);
                      setAfterwordBlocks((prev) =>
                        prev.map((x) =>
                          x.id === b.id ?
                            { ...x, file: f, storagePath: null, remoteUrl: null }
                          : x,
                        ),
                      );
                      e.target.value = "";
                    }}
                  />
                  <FolioThumb file={b.file} remoteUrl={b.kind === "image" ? b.remoteUrl : null} />
                </div>
              )}
              <button
                type="button"
                className={styles.btnMiniGhost}
                onClick={() => setAfterwordBlocks((prev) => prev.filter((x) => x.id !== b.id))}
              >
                이 블록 제거
              </button>
            </div>
          ))}
        </div>
      </div>

      {contentMode === "session_units" && confirmedUnits.length > 0 ? (
        <>
          <h3 className={styles.phase3Sub}>단원 시작 커버 (선택)</h3>
          <p className={styles.hint}>
            각 단원 제목 바로 위에 표시됩니다. 업로드가 끝나면 안내 팝업이 뜨고, 아래에서 미리보기를 볼 수 있습니다.
          </p>
          <ul className={styles.segmentList}>
            {confirmedUnits.map(({ unitIndex, unit }) => (
              <li key={unitIndex} className={styles.segmentItem}>
                <div className={styles.segmentHead}>
                  <span className={styles.segmentNote}>
                    제 {unitIndex + 1}단원 · {unit.unitTitle}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className={styles.file}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) window.alert(`제 ${unitIndex + 1}단원 커버로 「${f.name}」을(를) 올렸습니다.`);
                      setUnitCoverFiles((prev) => ({ ...prev, [unitIndex]: f }));
                      setUnitCoverPaths((prev) => {
                        const next = { ...prev };
                        delete next[unitIndex];
                        return next;
                      });
                      setUnitCoverRemoteUrls((prev) => {
                        const next = { ...prev };
                        delete next[unitIndex];
                        return next;
                      });
                      e.target.value = "";
                    }}
                  />
                  {unitCoverFiles[unitIndex] || unitCoverRemoteUrls[unitIndex] ? (
                    <button
                      type="button"
                      className={styles.btnMiniGhost}
                      onClick={() => {
                        setUnitCoverFiles((prev) => {
                          const next = { ...prev };
                          delete next[unitIndex];
                          return next;
                        });
                        setUnitCoverPaths((prev) => {
                          const next = { ...prev };
                          delete next[unitIndex];
                          return next;
                        });
                        setUnitCoverRemoteUrls((prev) => {
                          const next = { ...prev };
                          delete next[unitIndex];
                          return next;
                        });
                      }}
                    >
                      커버 제거
                    </button>
                  ) : null}
                </div>
                <FolioThumb
                  file={unitCoverFiles[unitIndex] ?? null}
                  remoteUrl={unitCoverRemoteUrls[unitIndex] ?? null}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

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
        <button
          type="button"
          className={styles.btnSecondary}
          disabled={masterBusy}
          onClick={() => void runDownloadMasterPdf()}
        >
          {masterBusy ? "처리 중…" : "완성본 PDF 저장"}
        </button>
        <button type="button" className={styles.btnGhost} disabled={masterBusy} onClick={() => void onPrintMasterBook()}>
          완성본 인쇄
        </button>
      </div>

      <div className={styles.row}>
        <button
          type="button"
          className={styles.btnSecondary}
          disabled={layoutCloudBusy || !uid || !sessionId}
          onClick={() => void runLoadMasterLayoutFromCloud()}
        >
          {layoutCloudBusy ? "처리 중…" : "클라우드에서 불러오기"}
        </button>
        <button
          type="button"
          className={styles.btnSecondary}
          disabled={layoutCloudBusy || !uid || !sessionId}
          onClick={() => void runSaveMasterLayoutToCloud()}
        >
          {layoutCloudBusy ? "저장 중…" : "클라우드에 저장 (머리말·꼬리말·단원 커버)"}
        </button>
      </div>
      <p className={styles.hint}>
        머리말·꼬리말·단원 시작 커버만 세션별 Firestore·Storage에 보관됩니다. 앞·뒷표지, 목차, 본문·추가 페이지 구성은 포함되지 않습니다.
      </p>

      {localMsg ? <p className={styles.ok}>{localMsg}</p> : null}
      {localErr ? <p className={styles.bad}>{localErr}</p> : null}

      <div ref={masterPrintRef} className={styles.masterBookPrintHost} aria-hidden>
        <TextbookAutoMasterBookPrintView
          bookTitle={bookTitle}
          frontCoverUrl={frontPreview}
          backCoverUrl={backPreview}
          tocLines={tocDraft
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)}
          contentMode={contentMode}
          confirmedUnits={confirmedUnits}
          sessionUnitPassages={sessionUnitPassages}
          contentFileSegments={contentState.fileSegments}
          appendixFileSegments={appendixState.fileSegments}
          forewordBlocks={forewordBlocks}
          afterwordBlocks={afterwordBlocks}
          unitCoverFiles={unitCoverFiles}
          unitCoverUrls={unitCoverRemoteUrls}
        />
      </div>
    </section>
  );
}
