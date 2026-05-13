/** 완성본 머리말·꼬리말 — 문단 또는 이미지 블록 */

export type MasterBookFolioBlock =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "image"; file: File | null };

export function newMasterBookTextBlock(text = ""): MasterBookFolioBlock {
  return { id: crypto.randomUUID(), kind: "text", text };
}

export function newMasterBookImageBlock(): MasterBookFolioBlock {
  return { id: crypto.randomUUID(), kind: "image", file: null };
}
