const MAX_COVER_DIM = 520;

export type DocxRasterImage = {
  type: "png" | "jpg";
  data: Uint8Array;
  width: number;
  height: number;
};

function loadImageDimensionsFromUrl(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    img.src = url;
  });
}

/** 표지용 — WebP 등은 PNG로 변환 */
export async function rasterImageFileToDocxRaster(file: File): Promise<DocxRasterImage> {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (mime === "image/png" || name.endsWith(".png")) {
    const data = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(file);
    try {
      const { w, h } = await loadImageDimensionsFromUrl(url);
      return { type: "png", data, width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (mime === "image/jpeg" || mime === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    const data = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(file);
    try {
      const { w, h } = await loadImageDimensionsFromUrl(url);
      return { type: "jpg", data, width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 사용할 수 없습니다.");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/png");
    });
    const data = new Uint8Array(await blob.arrayBuffer());
    return { type: "png", data, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function scaleCoverToMaxWidth(img: DocxRasterImage): { width: number; height: number } {
  const maxW = MAX_COVER_DIM;
  const scale = maxW / Math.max(img.width, 1);
  return {
    width: Math.max(1, Math.round(img.width * scale)),
    height: Math.max(1, Math.round(img.height * scale)),
  };
}

/** Cloud 스토리지 URL 등 — docx용 래스터로 변환 */
export async function fetchUrlToRasterImageDocx(url: string): Promise<DocxRasterImage> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("이미지를 불러오지 못했습니다.");
  const blob = await res.blob();
  const file = new File([blob], "remote.png", { type: blob.type || "image/png" });
  return rasterImageFileToDocxRaster(file);
}
