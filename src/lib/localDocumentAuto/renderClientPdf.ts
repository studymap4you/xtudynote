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
