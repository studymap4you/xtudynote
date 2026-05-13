import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { safeDocxFilenamePart } from "@/lib/docx/docxHelpers";

/** html2canvas 결과를 세로로 길 때 A4 여러 장에 나눠 붙입니다. */
function addCanvasAsPdfPages(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  margin: number,
  pageWidth: number,
  pageHeight: number,
  startWithNewPage: boolean,
): void {
  const imgData = canvas.toDataURL("image/png");
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;
  if (startWithNewPage) pdf.addPage();
  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft >= 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }
}

/**
 * 완성본 인쇄용 DOM → A4 PDF.
 * `.textbook-master-book-print-root`의 직계 자식마다 html2canvas를 돌려 블록 단위로 나눕니다.
 */
export async function exportMasterBookPdfFromElement(
  element: HTMLElement,
  bookTitle: string,
): Promise<void> {
  const root = element.querySelector(".textbook-master-book-print-root") as HTMLElement | null;
  const childNodes = root
    ? Array.from(root.children).filter((n): n is HTMLElement => n instanceof HTMLElement)
    : [];

  const chunks = childNodes.length > 0 ? childNodes : [element];

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;

  let firstChunk = true;
  for (const node of chunks) {
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: node.scrollWidth,
    });
    addCanvasAsPdfPages(pdf, canvas, margin, pageWidth, pageHeight, !firstChunk);
    firstChunk = false;
  }

  const base = safeDocxFilenamePart(bookTitle.trim(), "book");
  pdf.save(`Xtudy-Universe_Textbook_Master_${base}.pdf`);
}
