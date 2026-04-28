import { useEffect, useMemo, useState } from "react";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function useMarketImagePreviewSrc(imageFile: File | null, imageUrlInput: string): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setBlobUrl(null);
      return;
    }
    const u = URL.createObjectURL(imageFile);
    setBlobUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [imageFile]);

  const remote = useMemo(() => {
    const t = imageUrlInput.trim();
    if (!t || !isHttpUrl(t)) return null;
    return t;
  }, [imageUrlInput]);

  if (imageFile) return blobUrl;
  return remote;
}

type Props = {
  imageFile: File | null;
  imageUrlInput: string;
  purchaseUrl: string;
};

export function MarketRegisterImagePreview({ imageFile, imageUrlInput, purchaseUrl }: Props) {
  const previewSrc = useMarketImagePreviewSrc(imageFile, imageUrlInput);
  const linkHref = purchaseUrl.trim();
  const canOpenPurchase = isHttpUrl(linkHref);

  const img =
    previewSrc != null ? (
      <img src={previewSrc} alt="" className="market-register-preview__img" decoding="async" />
    ) : null;

  return (
    <aside className="market-register-preview" aria-label="대표 이미지 미리보기">
      {previewSrc != null ? (
        canOpenPurchase ? (
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className="market-register-preview__frame market-register-preview__frame--link"
            title="구매·신청 페이지 새 탭에서 열기"
          >
            {img}
          </a>
        ) : (
          <div
            className="market-register-preview__frame"
            title="구매·신청 링크를 올바르게 입력하면 미리보기를 눌러 이동할 수 있습니다"
          >
            {img}
          </div>
        )
      ) : (
        <div className="market-register-preview__frame market-register-preview__frame--empty">
          <span className="market-register-preview__placeholder">미리보기</span>
        </div>
      )}
      <p className="market-register-preview__hint">
        {canOpenPurchase && previewSrc != null ? (
          <span className="ui-ko">이미지를 누르면 구매·신청 링크로 이동합니다.</span>
        ) : previewSrc != null ? (
          <span className="ui-ko">구매·신청 링크를 입력하면 미리보기로 이동할 수 있습니다.</span>
        ) : (
          <span className="ui-ko">파일 또는 이미지 URL을 넣으면 여기에 표시됩니다.</span>
        )}
      </p>
    </aside>
  );
}
