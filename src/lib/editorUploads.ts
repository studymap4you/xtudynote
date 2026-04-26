import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/firebase/config";
import { uploadBytesResumableWithProgress } from "@/lib/storageUploadProgress";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 120) || "file";
}

export async function uploadEditorImageWithProgress(
  userId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const path = `editor_images/${userId}/${Date.now()}_${safeFileName(file.name)}`;
  const sref = ref(storage, path);
  await uploadBytesResumableWithProgress(storage, path, file, (pct) => onProgress?.(pct));
  return getDownloadURL(sref);
}

/** 이미지 외 첨부(링크 삽입용) */
export async function uploadEditorAttachmentWithProgress(
  userId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const path = `editor_attachments/${userId}/${Date.now()}_${safeFileName(file.name)}`;
  const sref = ref(storage, path);
  await uploadBytesResumableWithProgress(storage, path, file, (pct) => onProgress?.(pct));
  return getDownloadURL(sref);
}
