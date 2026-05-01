import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  NewsletterAiResult,
  NewsletterImageLayout,
  NewsletterSection,
} from "@/types/newsletter";
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

  const onReplacePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const sid = replaceTargetRef.current;
    replaceTargetRef.current = null;
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !sid) return;
    setErr(null);
    try {
      const url = await readImageFileAsDataUrl(f);
      setDraft((d) => ({
        ...d,
        sections: d.sections.map((s) => {
          if (s.id !== sid) return s;
          const layout: NewsletterImageLayout =
            s.imageLayout === "left" || s.imageLayout === "right" || s.imageLayout === "block"
              ? s.imageLayout
              : "block";
          const imageWidthPercent =
            layout === "block"
              ? Math.max(s.imageWidthPercent ?? 100, 85)
              : (s.imageWidthPercent ?? 40);
          return { ...s, imageDataUrl: url, imageLayout: layout, imageWidthPercent };
        }),
      }));
    } catch (er) {
      setErr(er instanceof Error ? er.message : "이미지를 불러오지 못했습니다.");
    }
  }, []);

  const openReplace = (sectionId: string) => {
    replaceTargetRef.current = sectionId;
    fileRef.current?.click();
    setImageMenu(null);
  };

  const removeImage = (sectionId: string) => {
    setSection(sectionId, {
      imageDataUrl: null,
      imageWidthPercent: undefined,
      imageLayout: "block",
    });
    setImageMenu(null);
  };

  const setSectionLayout = useCallback((id: string, next: NewsletterImageLayout) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s) => {
        if (s.id !== id) return s;
        if (next === "block") {
          return {
            ...s,
            imageLayout: "block",
            imageWidthPercent: s.imageWidthPercent && s.imageWidthPercent < 70 ? s.imageWidthPercent : 100,
          };
        }
        const sidePct = s.imageWidthPercent && s.imageWidthPercent < 85 ? s.imageWidthPercent : 40;
        return { ...s, imageLayout: next, imageWidthPercent: sidePct };
      }),
    }));
  }, []);

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
          제목·본문을 고치고, 이미지를 눌러 교체·삭제하세요. 이미지를 본문 왼쪽·오른쪽에 두면 한 줄 레이아웃으로 미리보기·인쇄·Word에
          반영됩니다. 오른쪽 아래 핸들로 가로 비율을 조절합니다.
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

          {draft.sections.map((s) => {
            const layout: NewsletterImageLayout =
              s.imageLayout === "left" || s.imageLayout === "right" || s.imageLayout === "block"
                ? s.imageLayout
                : "block";
            const sidePct = s.imageWidthPercent ?? (layout === "block" ? 100 : 40);
            const isPair = /^pair_\d+$/.test(s.id);
            return (
              <section key={s.id} className={styles.block}>
                <div className={styles.blockHead}>
                  <span className={styles.blockTag}>{s.id}</span>
                  {s.id === "binaryLogic" ? <span className={styles.mainPill}>Main · Binary Logic</span> : null}
                  {isPair ? <span className={styles.pairPill}>이미지·텍스트</span> : null}
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

                <div className={styles.layoutPick} role="radiogroup" aria-label="이미지·본문 배치">
                  <span className={styles.layoutPickCap}>배치</span>
                  <label className={styles.layoutOpt}>
                    <input
                      type="radio"
                      name={`${uid}-lay-${s.id}`}
                      checked={layout === "block"}
                      onChange={() => setSectionLayout(s.id, "block")}
                    />
                    이미지 위·본문 아래
                  </label>
                  <label className={styles.layoutOpt}>
                    <input
                      type="radio"
                      name={`${uid}-lay-${s.id}`}
                      checked={layout === "left"}
                      onChange={() => setSectionLayout(s.id, "left")}
                    />
                    본문 옆(이미지 왼쪽)
                  </label>
                  <label className={styles.layoutOpt}>
                    <input
                      type="radio"
                      name={`${uid}-lay-${s.id}`}
                      checked={layout === "right"}
                      onChange={() => setSectionLayout(s.id, "right")}
                    />
                    본문 옆(이미지 오른쪽)
                  </label>
                </div>

                {layout === "block" ? (
                  <>
                    <div className={styles.imageBlock}>
                      {s.imageDataUrl ? (
                        <SectionImage
                          src={s.imageDataUrl}
                          widthPercent={sidePct}
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
                  </>
                ) : (
                  <div
                    className={
                      layout === "right"
                        ? `${styles.splitEditor} ${styles.splitEditorRev}`
                        : styles.splitEditor
                    }
                  >
                    <div
                      className={styles.splitImageCol}
                      style={{ flex: `0 1 ${sidePct}%`, minWidth: "min(140px, 100%)" }}
                    >
                      {s.imageDataUrl ? (
                        <SectionImage
                          src={s.imageDataUrl}
                          widthPercent={100}
                          dragBasePercent={sidePct}
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
                          + 이미지
                        </button>
                      )}
                    </div>
                    <div className={styles.splitTextCol}>
                      <label className={styles.bodyLabel} htmlFor={`${uid}-b-${s.id}`}>
                        본문
                      </label>
                      <textarea
                        id={`${uid}-b-${s.id}`}
                        className={styles.bodyArea}
                        value={s.bodyKo}
                        onChange={(e) => setSection(s.id, { bodyKo: e.target.value })}
                        rows={10}
                      />
                    </div>
                  </div>
                )}
              </section>
            );
          })}
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
  /** 드래그 리사이즈 시 기준이 되는 % (옆 배치일 때 열 너비). 생략 시 widthPercent */
  dragBasePercent?: number;
  onImageClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  onResizeStart: (e: React.MouseEvent, wrap: HTMLDivElement | null, widthPercent: number) => void;
};

function SectionImage({
  src,
  widthPercent,
  dragBasePercent,
  onImageClick,
  onResizeStart,
}: SectionImageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragFrom = dragBasePercent ?? widthPercent;
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
        onMouseDown={(e) => onResizeStart(e, wrapRef.current, dragFrom)}
      />
    </div>
  );
}
