import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { DashboardShell } from "@/components/DashboardShell";
import { REACT_TO_PRINT_A4_PAGE_STYLE } from "@/lib/print/reactToPrintPageStyle";
import { getExternalWorksheetByToken } from "@/lib/worksheet/worksheetOutreachCalls";
import type { WorksheetItem, WorksheetItemKind } from "@/types/worksheetAssignment";
import styles from "@/pages/assignments/assignmentPages.module.css";

function coerceKind(k: string): WorksheetItemKind {
  if (k === "blank" || k === "short" || k === "handwriting") return k;
  return "short";
}

export function ExternalWorksheetOutreachPage() {
  const [params] = useSearchParams();
  const token = params.get("t")?.trim() ?? "";
  const captureRef = useRef<HTMLDivElement>(null);

  const [payload, setPayload] = useState<Awaited<ReturnType<typeof getExternalWorksheetByToken>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const printWorksheet = useReactToPrint({
    contentRef: captureRef,
    documentTitle: () => "XtudyNote_Worksheet",
    pageStyle: REACT_TO_PRINT_A4_PAGE_STYLE,
    onBeforePrint: async () => setPdfBusy(true),
    onAfterPrint: () => setPdfBusy(false),
    onPrintError: (_loc, e) => {
      setErr(e.message);
      setPdfBusy(false);
    },
  });

  useEffect(() => {
    if (!token) {
      setErr("링크에 토큰이 없습니다.");
      return;
    }
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const p = await getExternalWorksheetByToken(token);
        if (!cancelled) setPayload(p);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const items = useMemo(() => {
    if (!payload) return [];
    return payload.worksheetItems.map((w) => ({ ...w, kind: coerceKind(w.kind) })) as WorksheetItem[];
  }, [payload]);

  const downloadPdf = useCallback(() => {
    printWorksheet();
  }, [printWorksheet]);

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <h1 className={styles.title} style={{ marginTop: "0.35rem" }}>
          XtudyNote 학습지
        </h1>
        <p className={styles.meta}>
          선생님이 보내신 분석 자료입니다. 아래 내용을 확인한 뒤 PDF로 저장하거나 인쇄할 수 있습니다. (읽기 전용)
        </p>
        {err ? (
          <p className={styles.err}>{err}</p>
        ) : !payload ? (
          <p>불러오는 중…</p>
        ) : (
          <>
            <h2 className={styles.captureTitle} style={{ marginTop: "0.75rem" }}>
              {payload.title}
            </h2>
            <p className={styles.meta}>배포 {payload.distributedAtLabel}</p>

            <div ref={captureRef} className={`${styles.capture} ${styles.captureA4}`}>
              <header className={styles.captureBrand}>
                <span className={styles.captureBrandMain}>
                  XtudyNote <span className={styles.captureBrandAccent}>|</span> 학습지
                </span>
                <span className={styles.captureBrandSub}>엑스터디노트 · 외부 수신용 (정답 미포함)</span>
              </header>
              <div className={`${styles.passage} ${styles.captureSection}`}>{payload.passage}</div>

              {items.map((item) => (
                <div key={item.id} className={`${styles.item} ${styles.captureItem}`}>
                  <div className={styles.itemLabel}>
                    {item.kind === "blank" ? "빈칸" : item.kind === "short" ? "주관식" : "손글씨·도식"}
                  </div>
                  <p className={styles.prompt}>{item.prompt}</p>
                  {item.kind === "handwriting" ? (
                    <div
                      style={{
                        minHeight: "6rem",
                        borderRadius: 8,
                        border: "1px dashed rgba(148, 163, 184, 0.9)",
                        background: "rgba(248, 250, 252, 0.8)",
                        fontSize: "0.82rem",
                        color: "#64748b",
                        padding: "0.75rem",
                      }}
                    >
                      인쇄 후 이 영역에 필기하거나, XtudyNote에 가입하면 앱에서 손글씨로 작성할 수 있습니다.
                    </div>
                  ) : (
                    <div
                      style={{
                        minHeight: "2.5rem",
                        borderRadius: 8,
                        border: "1px dashed rgba(148, 163, 184, 0.9)",
                        background: "#fff",
                      }}
                    />
                  )}
                </div>
              ))}
              <p className={styles.captureScreenHint}>
                PDF·인쇄 시 가이드선은 사라집니다. 계속 학습하려면 XtudyNote에 가입해 주세요.
              </p>
              <footer className={styles.capturePrintFooter}>[XtudyNote - 지식 큐레이터 엑스플로어]</footer>
            </div>

            <div className={styles.actions}>
              <button type="button" className="btn btn--ghost btn--stack" disabled={pdfBusy} onClick={downloadPdf}>
                {pdfBusy ? "PDF 준비 중…" : "과제 PDF(인쇄)"}
              </button>
              <Link to="/" className="btn btn--ghost btn--stack">
                XtudyNote 홈
              </Link>
            </div>
          </>
        )}
      </main>
    </DashboardShell>
  );
}
