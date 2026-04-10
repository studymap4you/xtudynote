import { getBytes, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase/config";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

/**
 * 검수 승인 시 pending_materials 경로를 contents/{authorId}/ 로 복사합니다.
 * 마스터 계정이 Storage 규칙상 제출자 폴더에 쓸 수 있어야 합니다.
 */
export async function copyPendingPathsToAuthorContents(
  fullPaths: string[],
  authorId: string,
  seed: number,
  kindPrefix: "lm" | "ref"
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < fullPaths.length; i++) {
    const p = fullPaths[i]?.trim();
    if (!p) continue;
    const srcRef = ref(storage, p);
    const bytes = await getBytes(srcRef);
    const base = p.split("/").pop() || `file_${i}`;
    const destPath = `contents/${authorId}/${kindPrefix}_${Math.floor(seed)}_${i}_${safeFileName(base)}`;
    const destRef = ref(storage, destPath);
    await uploadBytes(destRef, bytes);
    out.push(destRef.fullPath);
  }
  return out;
}
