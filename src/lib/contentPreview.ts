import { plainTextFromHtml } from "@/lib/richTextUtils";

/** 유료·공유 자료 소개글 미리보기: 원문 길이의 약 20% (최소 1자) */
export function introductionPreview20(introduction: string): string {
  const t = plainTextFromHtml(introduction).trim() || introduction.trim();
  if (!t) return "";
  const n = Math.max(1, Math.ceil(t.length * 0.2));
  return t.slice(0, n);
}
