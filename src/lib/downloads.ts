import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/firebase/config";

function safeFileNameFromPath(storagePath: string): string {
  const seg = storagePath.split("/").pop() || "download";
  return seg.replace(/^[^_]+_[^_]+_\d+_/, "") || "download";
}

/**
 * 스토리지 전체 경로(예: contents/uid/lm_...)에 대해 순차 다운로드.
 * 비회원일 때는 호출 전에 막아야 함.
 */
export async function downloadStoragePathsSequentially(
  paths: string[],
  options?: { delayMs?: number }
): Promise<void> {
  const delayMs = options?.delayMs ?? 400;
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const url = await getDownloadURL(ref(storage, p));
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFileNameFromPath(p);
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (i < paths.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
