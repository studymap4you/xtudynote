import { uploadEditorImageWithProgress } from "@/lib/editorUploads";

/** Uploads an image for rich-text fields; returns HTTPS download URL. */
export async function uploadEditorImage(userId: string, file: File): Promise<string> {
  return uploadEditorImageWithProgress(userId, file);
}

export { uploadEditorImageWithProgress } from "@/lib/editorUploads";
