import {
  getBytes,
  getDownloadURL,
  ref,
  uploadBytes,
  type StorageReference,
} from "firebase/storage";
import { auth, storage } from "@/firebase/config";

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

/** XMLHttpRequest로 ArrayBuffer 수신 (fetch Failed to fetch 대안) */
function downloadUrlToArrayBuffer(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as ArrayBuffer);
      } else {
        reject(new Error(`XHR HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("XHR network error"));
    xhr.ontimeout = () => reject(new Error("XHR timeout"));
    xhr.timeout = 300_000;
    xhr.send();
  });
}

/**
 * Vercel `api/copy-storage-objects` — Admin SDK로 버킷 내 복사(다운로드 없음).
 * 환경 변수 미설정 시 500 → 클라이언트 방식으로 폴백.
 */
async function copyViaServerApi(
  pairs: { sourcePath: string; destPath: string }[]
): Promise<string[] | null> {
  if (pairs.length === 0) return [];
  try {
    const user = auth.currentUser;
    if (!user) return null;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/copy-storage-objects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ copies: pairs }),
    });
    const j = (await res.json().catch(() => ({}))) as { destPaths?: string[]; error?: string };
    if (!res.ok) {
      console.warn("[copyViaServerApi]", res.status, j.error ?? res.statusText);
      return null;
    }
    if (!Array.isArray(j.destPaths) || j.destPaths.length !== pairs.length) return null;
    return j.destPaths;
  } catch (e) {
    console.warn("[copyViaServerApi]", e);
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * 브라우저 전용 폴백: 다운로드 URL + XHR / fetch / getBytes.
 */
async function readObjectBytes(srcRef: StorageReference): Promise<ArrayBuffer> {
  let lastFetchErr: unknown;

  try {
    const url = await getDownloadURL(srcRef);
    try {
      return await downloadUrlToArrayBuffer(url);
    } catch (xhrErr) {
      lastFetchErr = xhrErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(800 * attempt);
        try {
          const res = await fetch(url, {
            cache: "no-store",
            credentials: "omit",
            mode: "cors",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.arrayBuffer();
        } catch (e) {
          lastFetchErr = e;
        }
      }
    }
  } catch (e) {
    lastFetchErr = e;
  }

  let lastBytesErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(600 * attempt);
    try {
      return await getBytes(srcRef);
    } catch (e) {
      lastBytesErr = e;
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (code !== "storage/retry-limit-exceeded" && code !== "storage/unknown") {
        break;
      }
    }
  }

  const a = lastFetchErr instanceof Error ? lastFetchErr.message : String(lastFetchErr);
  const b = lastBytesErr instanceof Error ? lastBytesErr.message : String(lastBytesErr);
  throw new Error(
    `파일 읽기 실패(HTTP·SDK 모두 시도).\n다운로드 URL 방식: ${a}\ngetBytes: ${b}`
  );
}

/**
 * 검수 승인 시 pending_materials 경로를 contents/{authorId}/ 로 복사합니다.
 * 1) Vercel API(서버 복사) 우선 2) 브라우저에서 읽기+업로드 폴백
 */
export async function copyPendingPathsToAuthorContents(
  fullPaths: string[],
  authorId: string,
  seed: number,
  kindPrefix: "lm" | "ref" | "thumb"
): Promise<string[]> {
  const pairs: { sourcePath: string; destPath: string }[] = [];
  for (let i = 0; i < fullPaths.length; i++) {
    const p = normalizeStorageObjectPath(String(fullPaths[i] ?? ""));
    if (!p) continue;
    const base = p.split("/").pop() || `file_${i}`;
    const destPath = `contents/${authorId}/${kindPrefix}_${Math.floor(seed)}_${i}_${safeFileName(base)}`;
    pairs.push({ sourcePath: p, destPath });
  }

  const serverOut = await copyViaServerApi(pairs);
  if (serverOut !== null) {
    return serverOut;
  }

  const out: string[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const { sourcePath: p, destPath } = pairs[i];
    const srcRef = ref(storage, p);
    let bytes: ArrayBuffer;
    try {
      bytes = await readObjectBytes(srcRef);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Storage에서 원본 파일을 읽지 못했습니다.\n경로: ${p}\n(${msg})\n제출자 폴더 권한·파일 존재 여부를 확인해 주세요.\n\n서버 복사(API)를 쓰려면 Vercel에 FIREBASE_SERVICE_ACCOUNT_JSON 을 설정하세요.`
      );
    }
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
