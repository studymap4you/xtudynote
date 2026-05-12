import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { safeDocxFilenamePart } from "@/lib/docx/docxHelpers";

/** 완성본 인쇄용 DOM → A4 PDF 저장 (html2canvas + jsPDF, 긴 본문 여러 페이지) */
export async function exportMasterBookPdfFromElement(
  element: HTMLElement,
  bookTitle: string,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft >= 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  const base = safeDocxFilenamePart(bookTitle.trim(), "book");
  pdf.save(`Xtudy-Universe_Textbook_Master_${base}.pdf`);
}
