export type XUniversePremiumTemplateId =
  | "xuniverse-premium-basic"
  | "xuniverse-academy-pro";

export type XUniversePremiumTemplate = {
  id: XUniversePremiumTemplateId;
  name: string;
  shortName: string;
  description: string;
  recommendedFor: string;
    sections: string[];
    designTone: string;
  layoutStyle: "logic-code" | "academy-pro";
  accent: string;
  promptInstruction: string;
};

export const xuniversePremiumTemplates: XUniversePremiumTemplate[] = [
  {
    id: "xuniverse-premium-basic",
    name: "XUniverse Premium Basic",
    shortName: "기본 프리미엄 교재형",
    description: "개념 설명, 예제, 문제, 해설을 균형 있게 담는 XUniverse 기본 고급 교재 템플릿",
    recommendedFor: "일반 수업자료, 학원 교재, 복습 자료, 단원 정리",
    sections: ["표지", "학습 목표", "핵심 개념", "대표 예제", "연습 문제", "정답 및 해설"],
    designTone: "진한 네이비 그라데이션, 형광 포인트, 사고 지도형 표지, 선형 그래픽 내지",
    layoutStyle: "logic-code",
    accent: "#b9f45f",
    promptInstruction:
      "XUniverse의 고급 학습 교재처럼 학습 목표, 핵심 개념, 대표 예제, 단계별 문제, 정답 및 해설을 포함하라. 설명은 명확하고 교재 내지에 바로 배치될 수 있도록 구조화하라.",
  },
  {
    id: "xuniverse-academy-pro",
    name: "XUniverse Academy Pro",
    shortName: "고급 학원 교재형",
    description: "상위권 학습자와 전문 강사용 고급 교재 템플릿",
    recommendedFor: "대치동식 고급 학원 수업, 심화 문제, 전문 강사용 교재",
    sections: ["개념 압축", "킬러 포인트", "대표 유형", "실전 적용", "고난도 문제", "오답 유도 포인트", "선생님 설명 노트", "정답 및 해설"],
    designTone: "흰 내지, 네이비 상·하단 바, 굵은 챕터 제목, 실전 해설형 문제 페이지",
    layoutStyle: "academy-pro",
    accent: "#1d1b68",
    promptInstruction:
      "고급 학원 교재처럼 개념 압축, 킬러 포인트, 대표 유형, 실전 적용, 고난도 문제, 오답 유도 포인트, 선생님 설명 노트, 정답 및 해설을 포함하라. 설명은 강사가 수업에 바로 사용할 수 있을 정도로 구체적으로 작성하라.",
  },
];

export function getXUniversePremiumTemplate(id: string): XUniversePremiumTemplate | undefined {
  return xuniversePremiumTemplates.find((template) => template.id === id);
}
