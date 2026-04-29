import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NewsletterAiResult, NewsletterSection } from "@/types/newsletter";
import styles from "./NewsletterEditModal.module.css";

const MAX_IMAGE_BYTES = 2_400_000;

function cloneNewsletter(data: NewsletterAiResult): NewsletterAiResult {
  return structuredClone(data);
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("이미지 파일만 사용할 수 있습니다."));
      return;
    }
    if (!/png|jpe?g/i.test(file.type)) {
      reject(new Error("PNG 또는 JPEG만 사용해 주세요."));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error("이미지는 약 2.3MB 이하로 올려 주세요."));
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result ?? "");
      if (!/^data:image\/(png|jpeg|jpg);base64,/i.test(url)) {
        reject(new Error("이미지 형식을 읽지 못했습니다."));
        return;
      }
      resolve(url);
    };
    r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
}

export type NewsletterEditModalProps = {
  open: boolean;
  initial: NewsletterAiResult;
  onCancel: () => void;
  onComplete: (next: NewsletterAiResult) => void;
};

export function NewsletterEditModal({ open, initial, onCancel, onComplete }: NewsletterEditModalProps) {
  const uid = useId();
  const [draft, setDraft] = useState<NewsletterAiResult>(() => cloneNewsletter(initial));
  const [imageMenu, setImageMenu] = useState<{ sectionId: string; left: number; top: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(cloneNewsletter(initial));
      setImageMenu(null);
      setErr(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!imageMenu) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      setImageMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [imageMenu]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const setSection = useCallback((id: string, patch: Partial<NewsletterSection>) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const onReplacePick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const sid = replaceTargetRef.current;
      replaceTargetRef.current = null;
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f || !sid) return;
      setErr(null);
      try {
        const url = await readImageFileAsDataUrl(f);
        setSection(sid, { imageDataUrl: url, imageWidthPercent: 100 });
      } catch (er) {
        setErr(er instanceof Error ? er.message : "이미지를 불러오지 못했습니다.");
      }
    },
    [setSection],
  );

  const openReplace = (sectionId: string) => {
    replaceTargetRef.current = sectionId;
    fileRef.current?.click();
    setImageMenu(null);
  };

  const removeImage = (sectionId: string) => {
    setSection(sectionId, { imageDataUrl: null, imageWidthPercent: undefined });
    setImageMenu(null);
  };

  const startResize = useCallback(
    (sectionId: string, e: React.MouseEvent, wrapEl: HTMLDivElement | null, startPct: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (!wrapEl) return;
      const baseW = wrapEl.getBoundingClientRect().width;
      const startX = e.clientX;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const deltaPct = (dx / baseW) * 100;
        const next = Math.round(Math.min(100, Math.max(25, startPct + deltaPct)));
        setSection(sectionId, { imageWidthPercent: next });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setSection],
  );

  if (!open) return null;

  const modal = (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby={`${uid}-modal-h`}>
      <div className={styles.panel}>
        <h2 id={`${uid}-modal-h`} className={styles.modalTitle}>
          뉴스레터 수정
        </h2>
        <p className={styles.modalLead}>
          제목·본문을 고치고, 섹션에 이미지를 넣을 수 있습니다. 이미지를 누르면 교체·삭제 메뉴가 열리고, 오른쪽 아래 핸들을
          드래그해 크기를 조절합니다.
        </p>

        <div className={styles.scroll}>
          <div className={styles.field}>
            <label htmlFor={`${uid}-title-ko`}>뉴스레터 제목</label>
            <input
              id={`${uid}-title-ko`}
              type="text"
              value={draft.titleKo}
              onChange={(e) => setDraft((d) => ({ ...d, titleKo: e.target.value }))}
            />
          </div>

          {draft.sections.map((s) => (
            <section key={s.id} className={styles.block}>
              <div className={styles.blockHead}>
                <span className={styles.blockTag}>{s.id}</span>
                {s.id === "binaryLogic" ? <span className={styles.mainPill}>Main · Binary Logic</span> : null}
              </div>
              <label className={styles.srOnly} htmlFor={`${uid}-h-${s.id}`}>
                섹션 제목
              </label>
              <input
                id={`${uid}-h-${s.id}`}
                className={styles.sectionHeadingInput}
                type="text"
                value={s.headingKo}
                onChange={(e) => setSection(s.id, { headingKo: e.target.value })}
              />

              <div className={styles.imageBlock}>
                {s.imageDataUrl ? (
                  <SectionImage
                    src={s.imageDataUrl}
                    widthPercent={s.imageWidthPercent ?? 100}
                    onImageClick={(ev) => {
                      ev.stopPropagation();
                      const el = ev.currentTarget;
                      const r = el.getBoundingClientRect();
                      setImageMenu({ sectionId: s.id, left: r.left, top: r.bottom + 6 });
                    }}
                    onResizeStart={(ev, wrap, pct) => startResize(s.id, ev, wrap, pct)}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.addImageBtn}
                    onClick={() => {
                      replaceTargetRef.current = s.id;
                      fileRef.current?.click();
                    }}
                  >
                    + 이미지 추가 (PNG / JPEG)
                  </button>
                )}
              </div>

              <label className={styles.bodyLabel} htmlFor={`${uid}-b-${s.id}`}>
                본문
              </label>
              <textarea
                id={`${uid}-b-${s.id}`}
                className={styles.bodyArea}
                value={s.bodyKo}
                onChange={(e) => setSection(s.id, { bodyKo: e.target.value })}
                rows={8}
              />
            </section>
          ))}
        </div>

        {imageMenu ? (
          <div
            ref={menuRef}
            className={styles.imageMenu}
            style={{ left: imageMenu.left, top: imageMenu.top }}
            role="menu"
          >
            <button type="button" className={styles.imageMenuBtn} onClick={() => openReplace(imageMenu.sectionId)}>
              이미지 교체
            </button>
            <button type="button" className={styles.imageMenuBtnDanger} onClick={() => removeImage(imageMenu.sectionId)}>
              삭제
            </button>
          </div>
        ) : null}

        {err ? (
          <div className={styles.error} role="alert">
            {err}
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className={styles.hiddenFile}
          onChange={onReplacePick}
          tabIndex={-1}
        />

        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className={styles.btnDone}
            onClick={() => {
              if (!draft.titleKo.trim()) {
                setErr("제목을 입력해 주세요.");
                return;
              }
              const bad = draft.sections.find((x) => !x.headingKo.trim() || !x.bodyKo.trim());
              if (bad) {
                setErr(`모든 섹션에 제목·본문이 필요합니다. (${bad.id})`);
                return;
              }
              onComplete(cloneNewsletter(draft));
            }}
          >
            수정완료
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

type SectionImageProps = {
  src: string;
  widthPercent: number;
  onImageClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  onResizeStart: (e: React.MouseEvent, wrap: HTMLDivElement | null, widthPercent: number) => void;
};

function SectionImage({ src, widthPercent, onImageClick, onResizeStart }: SectionImageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapRef} className={styles.imgWrap}>
      <img
        src={src}
        alt=""
        className={styles.editImg}
        style={{ width: `${widthPercent}%`, maxWidth: "100%" }}
        onClick={onImageClick}
      />
      <button
        type="button"
        className={styles.resizeHandle}
        aria-label="이미지 크기 조절"
        onMouseDown={(e) => onResizeStart(e, wrapRef.current, widthPercent)}
      />
    </div>
  );
}
