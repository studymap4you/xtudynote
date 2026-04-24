import type { SignalLogicPassageAnalysis } from "@/types/signalLogicReading";

export const SIGNAL_LOGIC_SAMPLE_ANALYSES: SignalLogicPassageAnalysis[] = [
  {
    id: "sl-1",
    title: "인공지능 규제와 창의적 파괴의 경계",
    analyzedAt: "2026.04.22",
    originalText:
      "규제 당국은 ‘안전’을 이유로 모델 배포 전 검증을 강화하려 한다. 반면 산업계는 과도한 선행 규제가 혁신을 위축시킨다고 반박한다. 문제는 두 주장이 서로 다른 시간 축—단기 리스크와 장기 성장—을 전제로 한다는 점이다.",
    translation:
      "당국은 안전을 명분으로 사전 검증을 강화하려 하고, 업계는 그것이 혁신을 죽인다고 맞선다. 쟁점은 각자 단기 리스크와 장기 성장이라는 서로 다른 시간 프레임을 가정한다는 데 있다.",
    vocabulary: [
      { term: "선행 규제", gloss: "시장 출현 전에 적용되는 규범" },
      { term: "창의적 파괴", gloss: "기존 산업을 대체하는 혁신 과정" },
      { term: "전제", gloss: "논증이 의존하는 암묵적 가정" },
    ],
    binaryLogic: [
      { bucket: "A", keyword: "안전·사전 검증" },
      { bucket: "B", keyword: "혁신·위축" },
      { bucket: "A", keyword: "단기 리스크" },
      { bucket: "B", keyword: "장기 성장" },
    ],
    signals: [
      { word: "반면", logicRole: "대조·논지 전환" },
      { word: "문제는", logicRole: "핵심 쟁점 도출" },
    ],
    correctAnswer: {
      option: 3,
      explanation: "양측이 같은 지표가 아닌 ‘시간 축’에서 논증하므로, 충돌을 푸는 해법은 공통 척도를 제시하는 선택지가 된다.",
    },
  },
  {
    id: "sl-2",
    title: "기후 적응 전략: 비용·공정성 프레임",
    analyzedAt: "2026.04.18",
    originalText:
      "적응 비용을 누가 부담할 것인가는 분배 정의의 문제이자, 동시에 효율적 자원 배분의 문제다. 한 프레임만을 절대화하면 정책 설계는 반드시 맹점을 드러낸다.",
    translation:
      "적응 비용 부담은 공정성(누가 낼 것인가)이면서 효율(어떻게 쓸 것인가)의 문제이기도 하다. 한쪽 논리만 고집하면 설계에 구멍이 생긴다.",
    vocabulary: [
      { term: "분배 정의", gloss: "부담·혜택의 공정한 나눔" },
      { term: "프레임", gloss: "문제를 바라보는 인식 틀" },
    ],
    binaryLogic: [
      { bucket: "A", keyword: "분배·공정성" },
      { bucket: "B", keyword: "효율·자원 배분" },
    ],
    signals: [
      { word: "동시에", logicRole: "논지 병합" },
      { word: "반드시", logicRole: "조건적 필연" },
    ],
    correctAnswer: {
      option: 2,
      explanation: "저자는 두 프레임을 모두 인정하므로, 단일 프레임 고수를 경계하는 서술이 중심이다.",
    },
  },
  {
    id: "sl-3",
    title: "디지털 주권과 데이터 거버넌스",
    analyzedAt: "2026.04.10",
    originalText:
      "데이터 현지화 의무는 국가 주권을 강화하지만, 다자간 연구 협력에는 비용을 가중시킨다. 예외 조항이 있더라도 그 적용 범위가 모호하면 기업의 준법 전략은 불확실성에 노출된다.",
    translation:
      "현지화는 주권을 세우나 협력 비용을 올린다. 예외 규정이 있어도 범위가 불명확하면 준법 리스크가 커진다.",
    vocabulary: [
      { term: "현지화", gloss: "데이터를 국내에 저장·처리하게 하는 의무" },
      { term: "거버넌스", gloss: "규범·감독·운영의 총체적 구조" },
    ],
    binaryLogic: [
      { bucket: "A", keyword: "국가 주권" },
      { bucket: "B", keyword: "협력 비용" },
      { bucket: "A", keyword: "예외 조항" },
      { bucket: "B", keyword: "불확실성" },
    ],
    signals: [
      { word: "하지만", logicRole: "양면 평가" },
      { word: "더라도", logicRole: "양보·예외 조건 강조" },
    ],
    correctAnswer: {
      option: 4,
      explanation: "예외 규정의 모호성이 준법 불확실성으로 이어진다는 인과를 직접적으로 연결한다.",
    },
  },
];
