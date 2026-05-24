import { useCallback, useMemo, useRef, useState } from "react";
import {
  AssetRecordType,
  Editor,
  Tldraw,
  createShapeId,
  type TLAssetId,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import { lectureLocalAssetStore } from "@/lib/lectureRecording/localAssetStore";
import { loadPdfFromFile, type LoadedPdf } from "@/lib/lectureRecording/pdfPageToDataUrl";
import { useLectureRecorder } from "@/lib/lectureRecording/useLectureRecorder";
import "@/pages/lectureRecording.css";

const MAX_BOARD_IMAGE_W = 960;

function fitSize(w: number, h: number, maxW: number) {
  if (w <= maxW) return { w, h };
  const scale = maxW / w;
  return { w: maxW, h: Math.round(h * scale) };
}

export function LectureRecordingStudio() {
  const stageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const pdfPageShapeRef = useRef<TLShapeId | null>(null);
  const pdfAssetRef = useRef<TLAssetId | null>(null);

  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const recorder = useLectureRecorder(stageRef);

  const assetStore = useMemo(() => lectureLocalAssetStore, []);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.updateInstanceState({ isGridMode: false });
  }, []);

  const onImageFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setImportMsg(null);
      const editor = editorRef.current;
      if (!editor) return;
      for (const file of Array.from(files)) {
        const type = file.type.toLowerCase();
        if (!type.startsWith("image/")) continue;
        try {
          const center = editor.getViewportScreenCenter();
          const point = editor.screenToPage(center);
          await editor.putExternalContent({ type: "files", files: [file], point });
        } catch (err) {
          setImportMsg(err instanceof Error ? err.message : "이미지를 올리지 못했습니다.");
        }
      }
    },
    [],
  );

  const onPdfFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setPdfBusy(true);
    setImportMsg(null);
    try {
      const loaded = await loadPdfFromFile(file);
      setPdf(loaded);
      setPdfPage(1);
      setImportMsg(`PDF ${loaded.numPages}페이지를 불러왔습니다. 페이지를 올린 뒤 판서하세요.`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "PDF를 불러오지 못했습니다.");
      setPdf(null);
    } finally {
      setPdfBusy(false);
    }
  }, []);

  const placeCurrentPdfPage = useCallback(async () => {
    if (!pdf) return;
    setPdfBusy(true);
    setImportMsg(null);
    try {
      const { dataUrl, width, height } = await pdf.getPageDataUrl(pdfPage);
      const editor = editorRef.current;
      if (!editor) return;

      if (pdfPageShapeRef.current && pdfAssetRef.current) {
        try {
          editor.deleteShapes([pdfPageShapeRef.current]);
          editor.deleteAssets([pdfAssetRef.current]);
        } catch {
          /* */
        }
      }

      const { w, h } = fitSize(width, height, MAX_BOARD_IMAGE_W);
      const vp = editor.getViewportPageBounds();
      const x = vp.x + Math.max(0, (vp.width - w) / 2);
      const y = vp.y + Math.max(0, (vp.height - h) / 2);

      const assetId = AssetRecordType.createId();
      pdfAssetRef.current = assetId;
      await editor.createAssets([
        {
          id: assetId,
          type: "image",
          typeName: "asset",
          props: {
            name: `pdf-page-${pdfPage}.png`,
            src: dataUrl,
            w: width,
            h: height,
            mimeType: "image/png",
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      const shapeId = createShapeId();
      pdfPageShapeRef.current = shapeId;
      editor.createShape({
        id: shapeId,
        type: "image",
        x,
        y,
        props: { assetId, w, h },
      });
      editor.sendToBack([shapeId]);
      setImportMsg(`${pdfPage} / ${pdf.numPages} 페이지를 보드에 올렸습니다.`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "PDF 페이지를 올리지 못했습니다.");
    } finally {
      setPdfBusy(false);
    }
  }, [pdf, pdfPage]);

  const recDisabled = recorder.status !== "idle" && recorder.status !== "paused";

  return (
    <div className="lecture-rec">
      <header className="lecture-rec__toolbar">
        <div className="lecture-rec__toolbar-left">
          <h1 className="lecture-rec__title">강의녹화</h1>
          <span className="lecture-rec__timer" aria-live="polite">
            {recorder.elapsedLabel}
          </span>
        </div>
        <div className="lecture-rec__toolbar-rec">
          {recorder.status === "idle" ? (
            <button type="button" className="lecture-rec__btn lecture-rec__btn--record" onClick={() => void recorder.start()}>
              녹화 시작
            </button>
          ) : null}
          {recorder.status === "recording" ? (
            <>
              <button type="button" className="lecture-rec__btn lecture-rec__btn--pause" onClick={recorder.pause}>
                일시정지
              </button>
              <button type="button" className="lecture-rec__btn lecture-rec__btn--stop" onClick={recorder.stop}>
                녹화 종료
              </button>
            </>
          ) : null}
          {recorder.status === "paused" ? (
            <>
              <button type="button" className="lecture-rec__btn lecture-rec__btn--record" onClick={recorder.resume}>
                녹화 재개
              </button>
              <button type="button" className="lecture-rec__btn lecture-rec__btn--stop" onClick={recorder.stop}>
                녹화 종료
              </button>
            </>
          ) : null}
        </div>
        <div className="lecture-rec__toolbar-files">
          <label className="lecture-rec__file-btn">
            이미지 (JPG·PNG)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              hidden
              disabled={recDisabled}
              onChange={(e) => {
                void onImageFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className="lecture-rec__file-btn">
            PDF 문서
            <input
              type="file"
              accept="application/pdf"
              hidden
              disabled={recDisabled || pdfBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                void onPdfFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </header>

      {pdf ? (
        <div className="lecture-rec__pdf-bar">
          <span className="lecture-rec__pdf-label">
            PDF · {pdfPage} / {pdf.numPages} 페이지
          </span>
          <button
            type="button"
            className="lecture-rec__btn lecture-rec__btn--ghost"
            disabled={pdfPage <= 1 || pdfBusy || recDisabled}
            onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
          >
            이전 페이지
          </button>
          <button
            type="button"
            className="lecture-rec__btn lecture-rec__btn--ghost"
            disabled={pdfPage >= pdf.numPages || pdfBusy || recDisabled}
            onClick={() => setPdfPage((p) => Math.min(pdf.numPages, p + 1))}
          >
            다음 페이지
          </button>
          <button
            type="button"
            className="lecture-rec__btn lecture-rec__btn--primary"
            disabled={pdfBusy || recDisabled}
            onClick={() => void placeCurrentPdfPage()}
          >
            현재 페이지를 보드에 올리기
          </button>
          <button
            type="button"
            className="lecture-rec__btn lecture-rec__btn--ghost"
            disabled={pdfBusy}
            onClick={() => {
              setPdf(null);
              setPdfPage(1);
              pdfPageShapeRef.current = null;
              pdfAssetRef.current = null;
            }}
          >
            PDF 닫기
          </button>
        </div>
      ) : null}

      {(recorder.error || importMsg) && (
        <p className={`lecture-rec__msg${recorder.error ? " lecture-rec__msg--err" : ""}`} role="status">
          {recorder.error ?? importMsg}
        </p>
      )}

      <div className="lecture-rec__stage-wrap">
        <div ref={stageRef} className="lecture-rec__stage">
          <Tldraw onMount={handleMount} assets={assetStore} />
        </div>
      </div>

      <p className="lecture-rec__foot">
        화이트보드·마이크만 녹화되며, 종료 시 <strong>WebM</strong> 파일이 PC에 바로 저장됩니다. 외부 API 키는 사용하지
        않습니다.
      </p>
    </div>
  );
}
