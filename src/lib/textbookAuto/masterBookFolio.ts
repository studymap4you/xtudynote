/** 완성본 머리말·꼬리말 — 문단 또는 이미지 블록 */

export type MasterBookFolioBlock =
  | { id: string; kind: "text"; text: string }
  | {
      id: string;
      kind: "image";
      file: File | null;
      /** Firestore·Storage에 저장된 경로 (불러오기 후 유지) */
      storagePath?: string | null;
      /** 프리뷰/인쇄용 다운로드 URL */
      remoteUrl?: string | null;
    };

export function newMasterBookTextBlock(text = ""): MasterBookFolioBlock {
  return { id: crypto.randomUUID(), kind: "text", text };
}

export function newMasterBookImageBlock(): MasterBookFolioBlock {
  return { id: crypto.randomUUID(), kind: "image", file: null };
}
