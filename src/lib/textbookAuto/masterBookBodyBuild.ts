import type { Paragraph } from "docx";
import { buildSegmentBlocksParagraphs } from "@/lib/textbookAuto/buildMasterBookDocx";
import {
  buildTextbookBodyParagraphsFromPassages,
  buildTextbookBodyParagraphsFromUnits,
  buildTextbookBodyParagraphsFromUnitsWithCovers,
} from "@/lib/textbookAuto/downloadTextbookAutoDocx";
import type { TextbookUnitContent, TextbookUnitSetupState } from "@/types/textbookAuto";

export type MasterBookContentMode = "session_units" | "session_passages" | "upload";

export async function buildMasterBookBodyParagraphsForDocx(params: {
  contentMode: MasterBookContentMode;
  confirmedUnits: { unitIndex: number; unit: TextbookUnitContent }[];
  sessionUnitPassages: string[] | null;
  contentState: TextbookUnitSetupState;
  unitCovers?: Record<number, File | null>;
  /** Storage 등에서 불러온 단원 커버 이미지 URL (File이 없을 때 사용) */
  unitCoverUrls?: Record<number, string>;
}): Promise<Paragraph[]> {
  const { contentMode, confirmedUnits, sessionUnitPassages, contentState, unitCovers, unitCoverUrls } =
    params;
  if (contentMode === "session_units") {
    if (confirmedUnits.length === 0) throw new Error("확정된 단원이 없습니다.");
    const hasFileCover = unitCovers && Object.values(unitCovers).some(Boolean);
    const hasUrlCover = unitCoverUrls && Object.values(unitCoverUrls).some(Boolean);
    if (hasFileCover || hasUrlCover) {
      return buildTextbookBodyParagraphsFromUnitsWithCovers(confirmedUnits, unitCovers, unitCoverUrls);
    }
    return buildTextbookBodyParagraphsFromUnits(confirmedUnits);
  }
  if (contentMode === "session_passages") {
    if (!sessionUnitPassages || sessionUnitPassages.length === 0) {
      throw new Error("세션 원문(지문)이 없습니다. 1단계 세션을 다시 시작해야 할 수 있습니다.");
    }
    return buildTextbookBodyParagraphsFromPassages(sessionUnitPassages);
  }
  if (contentState.pendingFiles.length > 0) {
    throw new Error("본문: 추출 대기 중인 파일이 있습니다. 먼저 추출하거나 제거하세요.");
  }
  if (contentState.fileSegments.length === 0) {
    throw new Error("본문 업로드 모드에서는 추출된 파일 블록이 하나 이상 필요합니다.");
  }
  return buildSegmentBlocksParagraphs(
    contentState.fileSegments.map((s) => ({
      fileName: `${s.fileName} · ${s.extractNote}`,
      text: s.text,
    })),
  );
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
