import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import type { WorksheetItem } from "@/types/worksheetAssignment";

/** 분석 리포트로부터 학습지 문항 자동 생성 */
export function buildWorksheetItemsFromAnalysis(report: SignalLogicAnalysisReportJson): WorksheetItem[] {
  const items: WorksheetItem[] = [];

  report.vocabularyItems.forEach((v, i) => {
    items.push({
      id: `vocab-${i}`,
      kind: "short",
      prompt: `「${v.term}」의 의미·용법을 자신의 말로 쓰세요.`,
      answerKey: v.gloss,
    });
  });

  items.push({
    id: "thesis-short",
    kind: "short",
    prompt: "본 글의 주제·핵심 논지를 한두 문장으로 정리하세요.",
    answerKey: report.topicThesis,
  });

  const firstBin = report.binaryOppositions[0];
  if (firstBin) {
    items.push({
      id: "binary-blank",
      kind: "blank",
      prompt: `다음 이분법의 대립 축을 한 줄로 쓰세요.\n「${firstBin.poleA}」 ↔ 「${firstBin.poleB}」`,
      answerKey: firstBin.axisLabel,
    });
  }

  items.push({
    id: "hand-free",
    kind: "handwriting",
    prompt:
      "논지 구조·이분법·시그널을 도식·화살표·키워드로 자유롭게 그려 보세요. (태블릿·스타일러스·손가띘 입력 가능)",
  });

  return items;
}

/** 분석 데이터 없이 지문만 있을 때 기본 문항 */
export function buildDefaultWorksheetItems(): WorksheetItem[] {
  return [
    {
      id: "read-short",
      kind: "short",
      prompt: "지문의 핵심 내용을 3~5문장으로 요약하세요.",
    },
    {
      id: "read-hand",
      kind: "handwriting",
      prompt: "구조·키워드를 손글씨·도식으로 정리해 보세요. (태블릿·펜 입력 가능)",
    },
  ];
}
