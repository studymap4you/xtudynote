export type XUniversePremiumTemplateId =
  | "xuniverse-premium-basic"
  | "xuniverse-english-exam"
  | "xuniverse-korean-bridge"
  | "xuniverse-project-lab"
  | "xuniverse-academy-pro";

export type XUniversePremiumTemplate = {
  id: XUniversePremiumTemplateId;
  name: string;
  shortName: string;
  description: string;
  recommendedFor: string;
  sections: string[];
  designTone: string;
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
    designTone: "깔끔한 흰색 내지, XUniverse 브랜드 컬러 포인트, 카드형 개념 박스",
    accent: "#2563eb",
    promptInstruction:
      "XUniverse의 고급 학습 교재처럼 학습 목표, 핵심 개념, 대표 예제, 단계별 문제, 정답 및 해설을 포함하라. 설명은 명확하고 교재 내지에 바로 배치될 수 있도록 구조화하라.",
  },
  {
    id: "xuniverse-english-exam",
    name: "XUniverse English Exam",
    shortName: "영어 내신 대비형",
    description: "영어 지문, 단어, 문법, 해석, 변형 문제 중심의 내신 대비 교재 템플릿",
    recommendedFor: "중고등 영어 내신, 학원 수업, 시험 대비 자료",
    sections: ["단원 개요", "핵심 어휘", "본문 해석", "구문 분석", "문법 포인트", "내신 예상 문제", "고난도 변형 문제", "정답 및 해설"],
    designTone: "시험 대비 교재형 내지, 문제 번호 강조, 해설 박스, 난이도 표시",
    accent: "#4f46e5",
    promptInstruction:
      "영어 내신 대비 교재처럼 핵심 어휘, 본문 해석, 구문 분석, 문법 포인트, 내신 예상 문제, 고난도 변형 문제, 정답 및 해설을 포함하라. 문제 유형은 객관식, 빈칸, 어법, 순서, 삽입, 서술형을 적절히 섞어라.",
  },
  {
    id: "xuniverse-korean-bridge",
    name: "XUniverse Korean Bridge",
    shortName: "외국인 한국어 교재형",
    description: "외국인 학습자를 위한 한국어 표현, 대화문, 문법, 문화 설명 중심 교재 템플릿",
    recommendedFor: "외국인 한국어 학습, ULIM Korean LMS, 교환학생 한국어 수업",
    sections: ["오늘의 표현", "상황 대화문", "단어", "문법", "발음 팁", "문화 설명", "연습 문제", "말하기 과제"],
    designTone: "한국어와 영어가 함께 보이는 글로벌 교재형 내지, 쉬운 설명, 예문 강조",
    accent: "#0f766e",
    promptInstruction:
      "외국인을 위한 한국어 교재처럼 쉬운 영어 설명, 한국어 예문, 단어, 문법, 발음 팁, 문화 설명, 연습 문제, 말하기 과제를 포함하라. 한국어 초급자도 이해할 수 있도록 영어 설명을 함께 제공하라.",
  },
  {
    id: "xuniverse-project-lab",
    name: "XUniverse Project Lab",
    shortName: "프로젝트 수업 교재형",
    description: "프로젝트형 수업을 위한 주제 탐구, 활동지, 팀 과제, 발표 준비 중심 템플릿",
    recommendedFor: "K-culture 프로젝트, 대학 수업, 팀 발표, 탐구형 수업",
    sections: ["프로젝트 목표", "배경 지식", "탐구 질문", "활동 단계", "팀 과제", "발표 준비", "평가 기준"],
    designTone: "프로젝트 워크북 느낌, 체크리스트, 활동 카드, 발표 준비 페이지",
    accent: "#7c3aed",
    promptInstruction:
      "프로젝트형 수업 교재처럼 프로젝트 목표, 배경 지식, 탐구 질문, 활동 단계, 팀 과제, 발표 준비, 평가 기준을 포함하라. 학생들이 실제로 활동지를 작성할 수 있도록 구성하라.",
  },
  {
    id: "xuniverse-academy-pro",
    name: "XUniverse Academy Pro",
    shortName: "고급 학원 교재형",
    description: "상위권 학습자와 전문 강사용 고급 교재 템플릿",
    recommendedFor: "대치동식 고급 학원 수업, 심화 문제, 전문 강사용 교재",
    sections: ["개념 압축", "킬러 포인트", "대표 유형", "실전 적용", "고난도 문제", "오답 유도 포인트", "선생님 설명 노트", "정답 및 해설"],
    designTone: "프리미엄 학원 교재 느낌, 압축 개념 박스, 고난도 표시, 강사용 코멘트",
    accent: "#b45309",
    promptInstruction:
      "고급 학원 교재처럼 개념 압축, 킬러 포인트, 대표 유형, 실전 적용, 고난도 문제, 오답 유도 포인트, 선생님 설명 노트, 정답 및 해설을 포함하라. 설명은 강사가 수업에 바로 사용할 수 있을 정도로 구체적으로 작성하라.",
  },
];

export function getXUniversePremiumTemplate(id: string): XUniversePremiumTemplate | undefined {
  return xuniversePremiumTemplates.find((template) => template.id === id);
}
