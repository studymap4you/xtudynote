import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Loader2 } from "lucide-react";

export type RichTextImageUploadUiState =
  | { kind: "closed" }
  | { kind: "uploading"; percent: number }
  | { kind: "error"; message: string };

type Props = {
  state: RichTextImageUploadUiState;
  onDismissError: () => void;
};

export function RichTextImageUploadStatusDialog({ state, onDismissError }: Props) {
  const open = state.kind !== "closed";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && state.kind === "error") onDismissError();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={
            state.kind === "uploading"
              ? "rich-img-upload-dlg__overlay rich-img-upload-dlg__overlay--blocking"
              : "rich-img-upload-dlg__overlay"
          }
        />
        <Dialog.Content
          className="rich-img-upload-dlg__content"
          onPointerDownOutside={(e) => {
            if (state.kind === "uploading") e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (state.kind === "uploading") e.preventDefault();
          }}
          aria-busy={state.kind === "uploading"}
        >
          {state.kind === "uploading" ? (
            <>
              <Dialog.Title className="rich-img-upload-dlg__title">
                <Loader2 className="rich-img-upload-dlg__spin" size={22} aria-hidden />
                이미지 업로드 중
              </Dialog.Title>
              <Dialog.Description className="rich-img-upload-dlg__desc">
                서버에 올리는 동안 잠시만 기다려 주세요. 창을 닫지 마세요.
              </Dialog.Description>
              <div className="rich-img-upload-dlg__progress-wrap" aria-hidden>
                <div className="rich-img-upload-dlg__progress-track">
                  <div
                    className="rich-img-upload-dlg__progress-fill"
                    style={{ width: `${Math.min(100, Math.max(0, state.percent))}%` }}
                  />
                </div>
                <span className="rich-img-upload-dlg__percent">{Math.round(state.percent)}%</span>
              </div>
            </>
          ) : null}

          {state.kind === "error" ? (
            <>
              <Dialog.Title className="rich-img-upload-dlg__title rich-img-upload-dlg__title--error">
                <AlertCircle size={22} aria-hidden />
                업로드 실패
              </Dialog.Title>
              <Dialog.Description className="rich-img-upload-dlg__desc rich-img-upload-dlg__error-msg">
                {state.message}
              </Dialog.Description>
              <button type="button" className="rich-img-upload-dlg__ok" onClick={onDismissError}>
                확인
              </button>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
