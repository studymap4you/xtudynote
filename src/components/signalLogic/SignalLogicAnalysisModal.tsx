import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { extractPlainTextFromLocalFile } from "@/lib/localFile/extractLocalFileText";
import styles from "@/components/signalLogic/signalLogicAnalysisModal.module.css";

const LOCAL_ACCEPT =
  ".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SignalLogicAnalysisModal({ open, onClose }: Props) {
  const titleId = useId();
  const [passage, setPassage] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const onLocalFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const ta = textareaRef.current;
    const start = ta ? ta.selectionStart : 0;
    const end = ta ? ta.selectionEnd : 0;

    setError(null);
    setFileBusy(true);
    try {
      const body = (await extractPlainTextFromLocalFile(file)).trim();
      const insert = `${file.name ? `【${file.name}】\n\n` : ""}${body}`.trim();
      if (!insert) {
        setError("파일에서 읽을 텍스트가 없습니다.");
        return;
      }

      let caret = 0;
      flushSync(() => {
        setPassage((prev) => {
          const prefix = prev.slice(0, start);
          const suffix = prev.slice(end);
          const sep = prefix.length > 0 && !/\n$/.test(prefix) ? "\n\n" : "";
          const next = `${prefix}${sep}${insert}${suffix}`;
          caret = prefix.length + sep.length + insert.length;
          return next;
        });
      });

      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = Math.min(caret, el.value.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFileBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.title}>
              Signal Logic <span className={styles.titleAccent}>분석</span>
            </h2>
            <p className={styles.sub}>지문을 직접 입력하거나, 컴퓨터의 파일에서 텍스트를 불러옵니다.</p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.panel}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="sl-passage-textarea">
                지문
              </label>
              <button
                type="button"
                className={styles.fileBtn}
                disabled={fileBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {fileBusy ? "불러오는 중…" : "파일 불러오기"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={LOCAL_ACCEPT}
              className={styles.visuallyHidden}
              aria-label="텍스트, PDF, Word 파일 선택"
              onChange={(ev) => void onLocalFileChange(ev)}
            />
            <textarea
              id="sl-passage-textarea"
              ref={textareaRef}
              className={styles.textarea}
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              placeholder=".txt · .pdf · .docx 파일을 불러오거나, 지문을 직접 붙여 넣으세요."
            />
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
