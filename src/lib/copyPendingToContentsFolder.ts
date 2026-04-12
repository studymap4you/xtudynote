import { getBytes, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase/config";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

/** ref()에 넘기기 위한 객체 경로 (gs://, 앞뒤 공백 등 정규화) */
export function normalizeStorageObjectPath(input: string): string {
  let s = input.trim();
  if (!s) return s;
  const gs = /^gs:\/\/[^/]+\/(.+)$/i.exec(s);
  if (gs) return gs[1];
  if (s.startsWith("/")) s = s.slice(1);
  return s;
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
    const p = normalizeStorageObjectPath(String(fullPaths[i] ?? ""));
    if (!p) continue;
    const srcRef = ref(storage, p);
    let bytes: ArrayBuffer;
    try {
      bytes = await getBytes(srcRef);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Storage에서 원본 파일을 읽지 못했습니다.\n경로: ${p}\n(${msg})\n제출자 폴더 권한·파일 존재 여부를 확인해 주세요.`
      );
    }
    const base = p.split("/").pop() || `file_${i}`;
    const destPath = `contents/${authorId}/${kindPrefix}_${Math.floor(seed)}_${i}_${safeFileName(base)}`;
    const destRef = ref(storage, destPath);
    try {
      await uploadBytes(destRef, bytes);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`승인 복사본 업로드에 실패했습니다.\n대상: ${destPath}\n(${msg})`);
    }
    out.push(destRef.fullPath);
  }
  return out;
}
