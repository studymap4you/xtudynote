/**
 * 손글씨 data URL을 가로 최대 픽셀·JPEG 품질로 줄여 Firestore 용량을 절약합니다.
 */
export async function compressInkDataUrl(
  dataUrl: string,
  maxWidth = 480,
  quality = 0.72,
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    img.src = dataUrl;
  });
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w <= 0 || h <= 0) return dataUrl;
  const scale = Math.min(1, maxWidth / w);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(img, 0, 0, tw, th);
  return canvas.toDataURL("image/jpeg", quality);
}

/** 답안 맵에서 이미지 필드만 압축 */
export async function compressHandwritingAnswers(answers: Record<string, string>): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...answers };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v === "string" && v.startsWith("data:image")) {
      try {
        out[key] = await compressInkDataUrl(v);
      } catch {
        /* keep original */
      }
    }
  }
  return out;
}
