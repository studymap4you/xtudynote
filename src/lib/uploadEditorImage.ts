import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase/config";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 120) || "img";
}

/** Uploads an image for rich-text fields; returns HTTPS download URL. */
export async function uploadEditorImage(userId: string, file: File): Promise<string> {
  const path = `editor_images/${userId}/${Date.now()}_${safeFileName(file.name)}`;
  const sref = ref(storage, path);
  await uploadBytes(sref, file);
  return getDownloadURL(sref);
}
