function stylesheetTags(): string {
  return Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
}

function safeTitle(title: string): string {
  return title.replace(/[<>&"]/g, (char) => {
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "&") return "&amp;";
    return "&quot;";
  });
}

export function printPremiumTextbookElement(element: HTMLElement, title: string): void {
  const printWindow = window.open("", "_blank", "width=980,height=1200");

  if (!printWindow) {
    window.print();
    return;
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".no-print").forEach((node) => node.remove());

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="${window.location.origin}/" />
    <title>${safeTitle(title)} - XUniverse Premium Textbook</title>
    ${stylesheetTags()}
    <style>
      @page { size: A4; margin: 0; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .premium-print-document {
        background: #ffffff !important;
      }
      .premium-print-document .print-area {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .premium-print-document .no-print {
        display: none !important;
      }
    </style>
  </head>
  <body class="premium-print-document">
    ${clone.outerHTML}
  </body>
</html>`);
  printWindow.document.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 500);
}
