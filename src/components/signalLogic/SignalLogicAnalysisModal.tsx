import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDriveReadonlyAccessToken } from "@/lib/google/driveAccessToken";
import { fetchDriveFilePlainText } from "@/lib/google/fetchDriveFilePlainText";
import { readGoogleOAuthClientId, readGooglePickerDeveloperKey } from "@/lib/google/googlePickerEnv";
import { openDriveFilePicker } from "@/lib/google/openDriveFilePicker";
import styles from "@/components/signalLogic/signalLogicAnalysisModal.module.css";

type TabId = "passage" | "drive";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SignalLogicAnalysisModal({ open, onClose }: Props) {
  const titleId = useId();
  const [tab, setTab] = useState<TabId>("passage");
  const [passage, setPassage] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const onPickFromDrive = useCallback(async () => {
    setError(null);
    const clientId = readGoogleOAuthClientId();
    const apiKey = readGooglePickerDeveloperKey();
    if (!clientId) {
      setError(
        ".env.local에 NEXT_PUBLIC_GOOGLE_CLIENT_ID(또는 VITE_GOOGLE_CLIENT_ID)를 넣고, 개발 서버는 http://localhost:3000 으로 실행해 주세요.",
      );
      return;
    }
    if (!apiKey) {
      setError(
        "Picker에 필요한 브라우저 API 키가 없습니다. Google Cloud Console → 사용자 인증 정보 → API 키(애플리케이션 제한: HTTP 리퍼러)를 만든 뒤 .env.local에 VITE_GOOGLE_API_KEY=... 를 추가하고 개발 서버를 다시 실행하세요.",
      );
      return;
    }
    setDriveBusy(true);
    try {
      const token = await getDriveReadonlyAccessToken(clientId, false);
      const picked = await openDriveFilePicker(token, apiKey);
      if (!picked) {
        return;
      }
      const text = await fetchDriveFilePlainText(picked.id, picked.mimeType, token);
      const header = picked.name ? `【${picked.name}】\n\n` : "";
      setPassage((prev) => {
        const body = (text || "").trim();
        if (!body) return prev;
        if (!prev.trim()) return `${header}${body}`;
        return `${prev.trim()}\n\n---\n\n${header}${body}`;
      });
      setTab("passage");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setDriveBusy(false);
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
            <p className={styles.sub}>지문을 입력하거나 Google Drive에서 가져옵니다.</p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="입력 방식">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "passage"}
            className={`${styles.tab} ${tab === "passage" ? styles.tabActive : ""}`}
            onClick={() => setTab("passage")}
          >
            지문 직접 입력
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "drive"}
            className={`${styles.tab} ${tab === "drive" ? styles.tabActive : ""}`}
            onClick={() => setTab("drive")}
          >
            Google Drive
          </button>
        </div>

        <div className={styles.body}>
          {tab === "passage" && (
            <div className={styles.panel}>
              <label className={styles.label} htmlFor="sl-passage-textarea">
                지문
              </label>
              <textarea
                id="sl-passage-textarea"
                ref={textareaRef}
                className={styles.textarea}
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                placeholder="지문 원문을 붙여 넣거나, Drive 탭에서 문서를 불러오세요."
              />
            </div>
          )}

          {tab === "drive" && (
            <div className={styles.panel}>
              <p className={styles.hint}>
                버튼을 누르면 Google 로그인·권한 창이 열리고, 이어서 Drive에서 <strong>Google 문서</strong> 또는{" "}
                <strong>PDF</strong>를 고를 수 있는 Picker가 표시됩니다. 선택한 파일의 본문이{" "}
                <strong>「지문 직접 입력」</strong> 탭의 지문란에 자동으로 들어갑니다.
              </p>
              <button type="button" className={styles.driveBtn} disabled={driveBusy} onClick={() => void onPickFromDrive()}>
                {driveBusy ? "연결 중…" : "구글 드라이브에서 파일 선택"}
              </button>
              {error ? <p className={styles.error}>{error}</p> : null}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            닫기
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setTab("passage")}>
            지문 입력으로 이동
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
