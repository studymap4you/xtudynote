function cropCanvas(source: HTMLCanvasElement, srcY: number, srcH: number): HTMLCanvasElement {
  const w = source.width;
  const y = Math.max(0, Math.floor(srcY));
  const h = Math.max(1, Math.ceil(Math.min(srcH, source.height - y)));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(source, 0, y, w, h, 0, 0, w, h);
  return out;
}

/** @public 모듈 PDF와 동일한 논리 폭(px), buildPrintDom ROOT_W 과 맞출 것 */
export const LOCAL_DOC_PDF_CHUNK_WIDTH_PX = 794;

/**
 * 여러 HTML 조각을 순서대로 PDF에 올립니다.
 * 한 조각이 한 페이지 본문 높이 이하면, 현재 페이지에 남는 세로 공간이 부족할 때만 다음 페이지에서 시작합니다(조각이 페이지 경계에 걸쳐 잘리지 않도록).
 * 한 조각이 더 길면 세로로 잘라 여러 페이지에 배치합니다.
 */
export async function renderHtmlChunksToA4PdfBlob(chunks: HTMLElement[]): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");

  const gapMm = 2.5;

  type Prepared = { canvas: HTMLCanvasElement; hMm: number };
  const prepared: Prepared[] = [];

  const pdfProbe = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageW0 = pdfProbe.internal.pageSize.getWidth();
  const mX0 = 12;
  const contentWForMeasure = pageW0 - 2 * mX0;

  for (const chunk of chunks) {
    chunk.style.position = "fixed";
    chunk.style.left = "-12000px";
    chunk.style.top = "0";
    chunk.style.zIndex = "-1";
    chunk.style.width = `${LOCAL_DOC_PDF_CHUNK_WIDTH_PX}px`;
    chunk.style.boxSizing = "border-box";
    document.body.appendChild(chunk);
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const canvas = await html2canvas(chunk, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: chunk.scrollWidth,
      });
      const hMm = (canvas.height / canvas.width) * contentWForMeasure;
      prepared.push({ canvas, hMm });
    } finally {
      chunk.remove();
    }
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const mTop = 14;
  const mBot = 14;
  const mX = 12;
  const contentW = pageW - 2 * mX;
  const contentH = pageH - mTop - mBot;

  let yCursor = mTop;

  for (const { canvas, hMm } of prepared) {
    if (hMm <= contentH + 1e-3) {
      if (yCursor + hMm > pageH - mBot && yCursor > mTop) {
        pdf.addPage();
        yCursor = mTop;
      }
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", mX, yCursor, contentW, hMm);
      yCursor += hMm + gapMm;
      if (yCursor > pageH - mBot) {
        pdf.addPage();
        yCursor = mTop;
      }
    } else {
      if (yCursor > mTop) {
        pdf.addPage();
        yCursor = mTop;
      }
      let yOffMm = 0;
      let lastSlice = 0;
      while (yOffMm < hMm - 1e-6) {
        const sliceMm = Math.min(contentH, hMm - yOffMm);
        lastSlice = sliceMm;
        const srcY = (yOffMm / hMm) * canvas.height;
        const srcH = (sliceMm / hMm) * canvas.height;
        const slice = cropCanvas(canvas, srcY, srcH);
        pdf.addImage(slice.toDataURL("image/png"), "PNG", mX, mTop, contentW, sliceMm);
        yOffMm += sliceMm;
        if (yOffMm < hMm - 1e-6) {
          pdf.addPage();
        }
      }
      yCursor = mTop + lastSlice + gapMm;
      if (yCursor > pageH - mBot) {
        pdf.addPage();
        yCursor = mTop;
      }
    }
  }

  const totalPages = pdf.getNumberOfPages();
  for (let pi = 1; pi <= totalPages; pi++) {
    pdf.setPage(pi);
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${pi} / ${totalPages}`, pageW / 2, pageH - 5, { align: "center" });
  }

  return pdf.output("blob");
}

export async function renderHtmlToA4PdfBlob(root: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");

  root.style.position = "fixed";
  root.style.left = "-12000px";
  root.style.top = "0";
  root.style.zIndex = "-1";
  document.body.appendChild(root);

  try {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: root.scrollWidth,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const mTop = 14;
    const mBot = 14;
    const mX = 12;
    const contentW = pageW - 2 * mX;
    const contentH = pageH - mTop - mBot;

    const imgTotalH_mm = (canvas.height / canvas.width) * contentW;
    const totalPages = Math.max(1, Math.ceil((imgTotalH_mm - 1e-6) / contentH));

    let yOff = 0;
    for (let pageIdx = 1; pageIdx <= totalPages; pageIdx++) {
      const sliceMm = Math.min(contentH, imgTotalH_mm - yOff);
      const srcY = (yOff / imgTotalH_mm) * canvas.height;
      const srcH = (sliceMm / imgTotalH_mm) * canvas.height;

      const slice = cropCanvas(canvas, srcY, srcH);
      const data = slice.toDataURL("image/png");

      if (pageIdx > 1) pdf.addPage();

      pdf.addImage(data, "PNG", mX, mTop, contentW, sliceMm);

      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139);
      const foot = `${pageIdx} / ${totalPages}`;
      pdf.text(foot, pageW / 2, pageH - 5, { align: "center" });

      yOff += sliceMm;
    }

    return pdf.output("blob");
  } finally {
    root.remove();
  }
}
