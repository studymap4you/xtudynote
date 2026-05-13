import type { Paragraph } from "docx";
import { buildSegmentBlocksParagraphs } from "@/lib/textbookAuto/buildMasterBookDocx";
import {
  buildTextbookBodyParagraphsFromUnits,
  buildTextbookBodyParagraphsFromUnitsWithCovers,
} from "@/lib/textbookAuto/downloadTextbookAutoDocx";
import type {
  TextbookAnswerKeyItem,
  TextbookAnswerKeyLayout,
  TextbookUnitContent,
  TextbookUnitSetupState,
} from "@/types/textbookAuto";

export async function buildMasterBookBodyParagraphsForDocx(params: {
  bodyUnits: { unitIndex: number; unit: TextbookUnitContent }[];
  unitCovers?: Record<number, File | null>;
  /** Storage 등에서 불러온 단원 커버 이미지 URL (File이 없을 때 사용) */
  unitCoverUrls?: Record<number, string>;
  answerKeyLayout?: TextbookAnswerKeyLayout;
  answerKeyItems?: TextbookAnswerKeyItem[];
}): Promise<Paragraph[]> {
  const { bodyUnits, unitCovers, unitCoverUrls, answerKeyLayout, answerKeyItems } = params;
  if (bodyUnits.length === 0) {
    throw new Error("완성본 본문에 넣을 단원을 하나 이상 선택하세요.");
  }
  const hasFileCover = unitCovers && Object.values(unitCovers).some(Boolean);
  const hasUrlCover = unitCoverUrls && Object.values(unitCoverUrls).some(Boolean);
  const docOpts = { answerKeyLayout, answerKeyItems };
  if (hasFileCover || hasUrlCover) {
    return buildTextbookBodyParagraphsFromUnitsWithCovers(bodyUnits, unitCovers, unitCoverUrls, docOpts);
  }
  return buildTextbookBodyParagraphsFromUnits(bodyUnits, docOpts);
}

export function buildMasterAppendixParagraphsForDocx(appendixState: TextbookUnitSetupState): Paragraph[] {
  if (appendixState.fileSegments.length === 0) return [];
  return buildSegmentBlocksParagraphs(
    appendixState.fileSegments.map((s) => ({
      fileName: `${s.fileName} · ${s.extractNote}`,
      text: s.text,
    })),
  );
}

export function assertMasterAppendixNoPending(appendixState: TextbookUnitSetupState): void {
  if (appendixState.pendingFiles.length > 0) {
    throw new Error("추가 페이지: 추출 대기 중인 파일이 있습니다.");
  }
}
