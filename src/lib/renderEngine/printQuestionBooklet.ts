const PRINT_CLASS = "csat-print-active";

export function printQuestionBooklet(): void {
  // This trigger is the replaceable boundary for a future server-side Playwright/Puppeteer PDF adapter.
  const cleanup = () => document.body.classList.remove(PRINT_CLASS);
  document.body.classList.add(PRINT_CLASS);
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 2_000);
}
