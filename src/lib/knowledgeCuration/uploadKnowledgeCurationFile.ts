import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase/config";

export function sanitizeCurationFileName(name: string): string {
  const t = name.trim().replace(/[^\w.\-가-힣 ()\[\]]+/g, "_");
  return (t || "file").slice(0, 180);
}

/**
 * 마스터 지식 큐레이션 전용 Storage 경로: `knowledge_curation_uploads/{uid}/{curationId}/{timestamp}_{name}`
 */
export async function uploadKnowledgeCurationFile(
  uid: string,
  curationId: string,
  file: File,
): Promise<{ downloadUrl: string; storagePath: string }> {
  const safe = `${Date.now()}_${sanitizeCurationFileName(file.name)}`;
  const storagePath = `knowledge_curation_uploads/${uid}/${curationId}/${safe}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, {
    contentType: file.type && file.type.length > 0 ? file.type : "application/octet-stream",
  });
  const downloadUrl = await getDownloadURL(storageRef);
  return { downloadUrl, storagePath };
}
