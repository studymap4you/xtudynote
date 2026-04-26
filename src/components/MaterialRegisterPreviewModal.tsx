import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ImageSlider } from "@/components/ImageSlider";
import { RichHtmlView } from "@/components/RichHtmlView";
import { LEARNING_THEME_OPTIONS } from "@/types/learningTheme";
import type { ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import "@/components/material-register-preview-modal.css";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function materialTypeLabel(t: ContentType): string {
  if (t === "share") return "공유";
  if (t === "paid") return "유료";
  return "과제";
}

function themeLabels(ids: LearningThemeId[]): string {
  if (!ids.length) return "—";
  const map = new Map(LEARNING_THEME_OPTIONS.map((o) => [o.id, o.titleKo]));
  return ids.map((id) => map.get(id) ?? id).join(", ");
}

export type MaterialPreviewFileRow = { name: string; size: number };

export type MaterialRegisterPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject: string;
  audienceGrade: string;
  materialType: ContentType;
  themes: LearningThemeId[];
  desiredPrice: string | null;
  thumbnailUrl: string | null;
  descriptionHtml: string;
  descImageSrcs: string[];
  homeworkInstruction: string | null;
  previewSampleName: string | null;
  learningFiles: MaterialPreviewFileRow[];
  referenceFiles: MaterialPreviewFileRow[];
};

export function MaterialRegisterPreviewModal({
  open,
  onOpenChange,
  title,
  subject,
  audienceGrade,
  materialType,
  themes,
  desiredPrice,
  thumbnailUrl,
  descriptionHtml,
  descImageSrcs,
  homeworkInstruction,
  previewSampleName,
  learningFiles,
  referenceFiles,
}: MaterialRegisterPreviewModalProps) {
  const displayTitle = title.trim() || "(제목 없음)";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="mat-preview-modal__overlay" />
        <Dialog.Content className="mat-preview-modal__content">
          <Dialog.Description className="mat-preview-modal__sr-only">
            제출 전 입력 내용을 학습자 화면과 유사하게 확인합니다.
          </Dialog.Description>
          <div className="mat-preview-modal__header">
            <Dialog.Title className="mat-preview-modal__title">미리보기</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="mat-preview-modal__close" aria-label="닫기">
                <X size={22} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>
          <p className="mat-preview-modal__lede">학습자에게 보이는 형태와 동일하게 HTML을 정제해 렌더링합니다.</p>

          <article className="mat-preview-modal__card mat-preview-modal__card--hero">
            {thumbnailUrl ? (
              <div className="mat-preview-modal__thumb">
                <img src={thumbnailUrl} alt="" />
              </div>
            ) : (
              <div className="mat-preview-modal__thumb mat-preview-modal__thumb--empty">썸네일 없음</div>
            )}
            <div className="mat-preview-modal__hero-text">
              <h2 className="mat-preview-modal__topic">{displayTitle}</h2>
              <p className="mat-preview-modal__meta-line">
                <span>{subject.trim() || "—"}</span>
                <span className="mat-preview-modal__dot">·</span>
                <span>{audienceGrade.trim() || "—"}</span>
                <span className="mat-preview-modal__dot">·</span>
                <span className="mat-preview-modal__badge">{materialTypeLabel(materialType)}</span>
              </p>
              {materialType === "paid" && desiredPrice ? (
                <p className="mat-preview-modal__price">희망 가격: {desiredPrice}원</p>
              ) : null}
            </div>
          </article>

          <section className="mat-preview-modal__card">
            <h3 className="mat-preview-modal__h">테마 분류</h3>
            <p className="mat-preview-modal__p">{themeLabels(themes)}</p>
          </section>

          {materialType === "homework" && homeworkInstruction?.trim() ? (
            <section className="mat-preview-modal__card">
              <h3 className="mat-preview-modal__h">과제 안내</h3>
              <p className="mat-preview-modal__p mat-preview-modal__pre-wrap">{homeworkInstruction.trim()}</p>
            </section>
          ) : null}

          <section className="mat-preview-modal__card">
            <h3 className="mat-preview-modal__h">상세 설명</h3>
            <div className="mat-preview-modal__rich">
              {descriptionHtml.trim() ? (
                <RichHtmlView html={descriptionHtml} />
              ) : (
                <p className="mat-preview-modal__muted">작성된 설명이 없습니다.</p>
              )}
            </div>
            {descImageSrcs.length > 0 ? (
              <div className="mat-preview-modal__slider-wrap">
                <ImageSlider urls={descImageSrcs} />
              </div>
            ) : null}
          </section>

          {previewSampleName ? (
            <section className="mat-preview-modal__card">
              <h3 className="mat-preview-modal__h">샘플 미리보기 파일</h3>
              <p className="mat-preview-modal__p">{previewSampleName}</p>
            </section>
          ) : null}

          <section className="mat-preview-modal__card">
            <h3 className="mat-preview-modal__h">학습용 주 자료</h3>
            {learningFiles.length === 0 ? (
              <p className="mat-preview-modal__muted">선택된 파일 없음</p>
            ) : (
              <ul className="mat-preview-modal__file-ul">
                {learningFiles.map((f, i) => (
                  <li key={`lm-${i}-${f.name}`}>
                    {f.name} <span className="mat-preview-modal__size">({formatBytes(f.size)})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mat-preview-modal__card mat-preview-modal__card--last">
            <h3 className="mat-preview-modal__h">해설·참고 자료</h3>
            {referenceFiles.length === 0 ? (
              <p className="mat-preview-modal__muted">선택된 파일 없음</p>
            ) : (
              <ul className="mat-preview-modal__file-ul">
                {referenceFiles.map((f, i) => (
                  <li key={`ref-${i}-${f.name}`}>
                    {f.name} <span className="mat-preview-modal__size">({formatBytes(f.size)})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
