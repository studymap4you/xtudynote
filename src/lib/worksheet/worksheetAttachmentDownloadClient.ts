import { getAuth } from "firebase/auth";
import { firebaseApp } from "@/firebase/config";

function worksheetAttachmentDownloadEndpoint(): string {
  const explicit = import.meta.env.VITE_WORKSHEET_ATTACHMENT_DOWNLOAD_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION?.trim() || "asia-northeast3";
  const pid =
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    import.meta.env.VITE_FIREBASE_PROJECTID?.trim() ||
    "xtudynote";
  return `https://${region}-${pid}.cloudfunctions.net/downloadWorksheetAttachment`;
}

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/"/g, ""));
    } catch {
      return star[1];
    }
  }
  const q = /filename="([^"]+)"/i.exec(header);
  return q?.[1] ?? null;
}

/** 외부 outreach 페이지용 — 토큰만으로 GET (추가 헤더 불필요) */
export function buildWorksheetOutreachAttachmentUrl(outreachToken: string): string {
  const base = worksheetAttachmentDownloadEndpoint();
  return `${base}?outreachToken=${encodeURIComponent(outreachToken.trim())}`;
}

/** 로그인 학생/선생 — ID 토큰으로 스트리밍 다운로드 */
export async function downloadWorksheetAttachmentAuthenticated(assignmentId: string): Promise<void> {
  const auth = getAuth(firebaseApp);
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const idToken = await user.getIdToken();
  const base = worksheetAttachmentDownloadEndpoint();
  const url = `${base}?assignmentId=${encodeURIComponent(assignmentId.trim())}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `다운로드 실패 (${res.status})`);
  }
  const cd = res.headers.get("Content-Disposition");
  let filename = parseFilenameFromDisposition(cd) || "attachment";
  filename = filename.replace(/[/\\?%*:|"<>]/g, "_");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
