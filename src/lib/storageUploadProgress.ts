import { ref, uploadBytesResumable, type UploadTaskSnapshot } from "firebase/storage";
import type { FirebaseStorage } from "firebase/storage";

/** Resumable 업로드 + 진행률(0–100). */
export function uploadBytesResumableWithProgress(
  storage: FirebaseStorage,
  path: string,
  data: Blob | Uint8Array | ArrayBuffer,
  onProgress?: (percent: number, snapshot: UploadTaskSnapshot) => void
): Promise<{ fullPath: string }> {
  return new Promise((resolve, reject) => {
    const r = ref(storage, path);
    const task = uploadBytesResumable(r, data);
    task.on(
      "state_changed",
      (snap) => {
        if (snap.totalBytes > 0 && onProgress) {
          onProgress(Math.min(100, Math.round((100 * snap.bytesTransferred) / snap.totalBytes)), snap);
        }
      },
      (err) => reject(err),
      () => {
        onProgress?.(100, task.snapshot);
        resolve({ fullPath: task.snapshot.ref.fullPath });
      }
    );
  });
}
