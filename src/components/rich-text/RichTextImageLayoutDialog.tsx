import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export type RichTextImageLayoutChoice = "sequential" | "slider";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageCount: number;
  onChoose: (layout: RichTextImageLayoutChoice) => void;
};

export function RichTextImageLayoutDialog({
  open,
  onOpenChange,
  imageCount,
  onChoose,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="rich-img-layout-dlg__overlay" />
        <Dialog.Content className="rich-img-layout-dlg__content">
          <Dialog.Title className="rich-img-layout-dlg__title">이미지 삽입 방식</Dialog.Title>
          <Dialog.Description className="rich-img-layout-dlg__desc">
            선택한 {imageCount}장을 본문에 어떻게 넣을지 고르세요.
          </Dialog.Description>
          <div className="rich-img-layout-dlg__actions">
            <button
              type="button"
              className="rich-img-layout-dlg__btn rich-img-layout-dlg__btn--primary"
              onClick={() => {
                onChoose("sequential");
                onOpenChange(false);
              }}
            >
              <span className="rich-img-layout-dlg__btn-en">One after another</span>
              <span className="rich-img-layout-dlg__btn-ko">개별 사진으로 세로로 이어 붙이기</span>
            </button>
            <button
              type="button"
              className="rich-img-layout-dlg__btn rich-img-layout-dlg__btn--primary"
              onClick={() => {
                onChoose("slider");
                onOpenChange(false);
              }}
            >
              <span className="rich-img-layout-dlg__btn-en">Slide strip</span>
              <span className="rich-img-layout-dlg__btn-ko">슬라이드형(가로 넘기기)</span>
            </button>
            <Dialog.Close asChild>
              <button type="button" className="rich-img-layout-dlg__btn rich-img-layout-dlg__btn--ghost">
                취소
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="rich-img-layout-dlg__close" aria-label="닫기">
              <X size={20} strokeWidth={2} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
