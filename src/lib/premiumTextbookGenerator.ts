import type { PremiumTextbook, PremiumUploadedFileMetadata } from "@/types/premiumTextbook";
import type { XUniversePremiumTemplateId } from "@/data/xuniversePremiumTemplates";

export type GeneratePremiumTextbookParams = {
  templateId: XUniversePremiumTemplateId;
  userInstruction: string;
  pastedText: string;
  uploadedFiles: PremiumUploadedFileMetadata[];
};

export type GeneratePremiumTextbookResult = {
  textbook: PremiumTextbook;
  meta: {
    model: string;
    source: "openai" | "mock";
  };
};

export function toPremiumUploadedFileMetadata(file: File): PremiumUploadedFileMetadata {
  return {
    name: file.name,
    type: file.type || "unknown",
    size: file.size,
    lastModified: file.lastModified,
  };
}

export async function generatePremiumTextbook({
  templateId,
  userInstruction,
  pastedText,
  uploadedFiles,
}: GeneratePremiumTextbookParams): Promise<GeneratePremiumTextbookResult> {
  const response = await fetch("/api/generate-premium-textbook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      generationType: "premium",
      templateId,
      userInstruction,
      pastedText,
      uploadedFiles,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<GeneratePremiumTextbookResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "프리미엄 교재 생성 요청에 실패했습니다.");
  }

  if (!payload.textbook || !payload.meta) {
    throw new Error("프리미엄 교재 생성 응답 형식이 올바르지 않습니다.");
  }

  return {
    textbook: payload.textbook,
    meta: payload.meta,
  };
}
