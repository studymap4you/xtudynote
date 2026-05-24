import type { TLAssetStore } from "tldraw";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/** 외부 서버 없이 data URL로만 자산을 보관합니다. */
export const lectureLocalAssetStore: TLAssetStore = {
  async upload(_asset, file) {
    const src = await fileToDataUrl(file);
    return { src };
  },
  resolve(asset) {
    return asset.props.src;
  },
};
