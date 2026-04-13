import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/firebase/config";

function extOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

type Props = {
  /** Storage 전체 경로 */
  storagePaths: string[];
};

/**
 * 첫 학습 자료 파일 — 상단 약 20%만 선명, 이하는 블러·반투명 마스크 (원본 미리보기)
 */
export function FileSamplePreview({ storagePaths }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const firstPath = storagePaths[0]?.trim() ?? "";
  const ext = extOf(firstPath);
  const isImage = IMAGE_EXT.has(ext);
  const isPdf = ext === "pdf";

  useEffect(() => {
    if (!firstPath) {
      setUrl(null);
      setLoading(false);
      setLoadErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    void (async () => {
      try {
        const u = await getDownloadURL(ref(storage, firstPath));
        if (!cancelled) setUrl(u);
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : "파일 URL을 가져오지 못했습니다.");
          setUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstPath]);

  if (!firstPath) {
    return (
      <p className="file-sample-preview__empty">
        등록된 학습 파일이 없어 원본 미리보기를 표시할 수 없습니다.
      </p>
    );
  }

  if (loading) {
    return <p className="file-sample-preview__empty">미리보기를 불러오는 중…</p>;
  }

  if (loadErr || !url) {
    return <p className="file-sample-preview__empty">{loadErr ?? "미리보기를 준비하지 못했습니다."}</p>;
  }

  return (
    <div className="file-sample-preview">
      <div className="file-sample-preview__frame">
        {isImage ? (
          <div className="file-sample-preview__inner">
            <img src={url} alt="" className="file-sample-preview__media" loading="lazy" />
            <div className="file-sample-preview__obscure" aria-hidden />
          </div>
        ) : isPdf ? (
          <div className="file-sample-preview__inner file-sample-preview__inner--pdf">
            <iframe
              title="PDF 미리보기"
              src={`${url}#toolbar=0&navpanes=0`}
              className="file-sample-preview__iframe"
            />
            <div className="file-sample-preview__obscure" aria-hidden />
          </div>
        ) : (
          <p className="file-sample-preview__empty">
            이 파일 형식({ext || "알 수 없음"})은 브라우저에서 바로 미리보기할 수 없습니다. 상세 보기에서 전체
            자료를 확인해 주세요.
          </p>
        )}
      </div>
      {(isImage || isPdf) && (
        <p className="file-sample-preview__hint">
          원본 기준 <strong>약 20%</strong>만 선명하게 보이며, 나머지는 흐림 처리됩니다. 전체는 구매·다운로드 후
          이용해 주세요.
        </p>
      )}
    </div>
  );
}
