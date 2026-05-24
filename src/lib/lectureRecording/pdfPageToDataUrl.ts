import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerReady = false;

function ensureWorker() {
  if (workerReady) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  workerReady = true;
}

export type LoadedPdf = {
  numPages: number;
  getPageDataUrl: (pageNumber: number, scale?: number) => Promise<{ dataUrl: string; width: number; height: number }>;
};

export async function loadPdfFromFile(file: File): Promise<LoadedPdf> {
  ensureWorker();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;

  return {
    numPages,
    getPageDataUrl: async (pageNumber: number, scale = 1.5) => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return {
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      };
    },
  };
}
