import type { TextbookSectionInclusion } from "@/types/textbookAuto";

export const TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK = "gpt-4o-mini";

export const TEXTBOOK_AUTO_SYSTEM_PROMPT = `당신은 한국어 교육용 교재 편집자입니다. 사용자가 제공한 원문(지문·교재 텍스트)을 바탕으로, 지정된 단원 번호에 맞는 학습지 초안을 **JSON 객체 하나**로만 출력합니다.

형식 규칙:
- 마크다운 표·HTML 표는 사용하지 않습니다.
- **선택되지 않은 섹션은 반드시 빈 배열 []** 로 둡니다. 내용을 만들지 마세요.
- "핵심요약(coreSummary)"은 문자열 배열(불릿 문장)입니다.
- "확인학습(practice)"(선택 시): **주관식 단답형 질문 문장만** 문자열 배열로 넣습니다. 정답·선택지·해설은 넣지 않습니다.
- "단원평가(unitTest)"(선택 시): **객체 배열**입니다. 각 원소는 반드시 "kind" 필드를 가집니다.
  - 객관식: { "kind": "mcq", "question": "...", "choices": ["보기1","보기2","보기3","보기4"] } — 보기는 **서로 다르고** 의미가 있어야 하며, 질문과 논리적으로 대응합니다. 보기 개수는 정확히 4개를 권장합니다.
  - 주관식 단답: { "kind": "short", "question": "..." }

근거 표기(선택된 모든 텍스트 섹션에 공통):
- **unitTitle**, **핵심개념 explanation**, **내용학습 제목·불릿**, **핵심요약 불릿**에는 지문 원문에 실제로 나오는 **짧은 영문 인용구**나 **핵심 영문 표현**을 한국어 설명와 함께 **괄호로 반드시 병기**합니다. (예: …은 핵심이다 (*"The evidence suggests …"*). / … 개념 (*mitochondria*, …))
- 영문은 지문에 없는 내용을 꾸며 내지 말고, 원문에서 인용하거나 그에 대응하는 표현만 씁니다.

내용 완전성(선택된 내용학습에 한함):
- **내용학습(contentStudy)**: 원문에 있는 **주장·근거·예시·정의·수치·인물·대조·절차 등 중요 정보가 누락되지 않도록** 합니다. 임의로 큰 단락·주제를 통째로 생략하거나, 한두 줄로 과도하게 축약하여 정보를 버리지 마세요.

문항 개수(해당 섹션을 선택한 경우에만):
- practice, unitTest 개수를 사용자가 지정한 대로 **정확히** 맞춥니다.

JSON 키 이름과 구조를 반드시 지키세요.`;

export function buildTextbookUnitUserPrompt(params: {
  bookTitle: string;
  sourceText: string;
  unitIndex: number;
  totalUnits: number;
  practiceMin: number;
  unitTestMcq: number;
  unitTestShort: number;
  sectionInclusion: TextbookSectionInclusion;
}): string {
  const {
    bookTitle,
    sourceText,
    unitIndex,
    totalUnits,
    practiceMin,
    unitTestMcq,
    unitTestShort,
    sectionInclusion: inc,
  } = params;
  const k = unitIndex + 1;
  const testTotal = unitTestMcq + unitTestShort;

  const secLines: string[] = [];
  if (inc.keyConcepts) {
    secLines.push(
      "- keyConcepts: { \"concept\": string, \"explanation\": string } 객체 배열을 **충실히** 작성 (빈 배열 금지). 각 explanation에 **지문 근거 영문(또는 핵심 표현) 괄호 병기**.",
    );
  } else {
    secLines.push("- keyConcepts: **[]** 빈 배열만.");
  }
  if (inc.contentStudy) {
    secLines.push(
      "- contentStudy: { \"title\": string, \"bullets\": string[] } 블록 배열을 **충실히** 작성 (빈 배열 금지). 제목·불릿에 **근거 영문 병기**.",
    );
  } else {
    secLines.push("- contentStudy: **[]** 빈 배열만.");
  }
  if (inc.coreSummary) {
    secLines.push("- coreSummary: 불릿 문자열 배열 (빈 배열 금지). 각 줄에 **근거 영문 병기**.");
  } else {
    secLines.push("- coreSummary: **[]** 빈 배열만.");
  }
  if (inc.practice) {
    secLines.push(
      `- practice: 주관식 단답형 질문만 **정확히 ${practiceMin}개** (빈 배열 금지, 정답 금지).`,
    );
  } else {
    secLines.push("- practice: **[]** 빈 배열만.");
  }
  if (inc.unitTest) {
    if (unitTestMcq === 0 && unitTestShort === 0) {
      secLines.push("- unitTest: **[]** 빈 배열만. 문항을 추가하지 마세요.");
    } else {
      const parts: string[] = [];
      if (unitTestMcq > 0) {
        parts.push(`객관식(kind="mcq") **정확히 ${unitTestMcq}개**`);
      }
      if (unitTestShort > 0) {
        parts.push(`주관식 단답(kind="short") **정확히 ${unitTestShort}개**`);
      }
      secLines.push(
        `- unitTest: ${parts.join(", ")}. 객관식·주관식 개수를 **정확히** 맞추고, 배열 합계는 ${testTotal}개입니다.`,
      );
    }
  } else {
    secLines.push("- unitTest: **[]** 빈 배열만.");
  }

  return `교재 제목(참고): ${bookTitle}

전체 원문(일부일 수 있음):
---
${sourceText}
---

총 단원 수: ${totalUnits}개 중 **제 ${k}단원**만 작성하세요. 앞뒤 단원 내용은 쓰지 말고, 이 단원 분량에 맞게 원문에서 다루 범위를 스스로 나눕니다.
**단원 제목(unitTitle)** 에 주제를 드러내는 **짧은 영문 병기**를 넣으세요.

**포함할 섹션**(선택된 항목만 채우고, 나머지는 빈 배열):
${secLines.join("\n")}

응답은 반드시 아래 키를 모두 포함하세요 (구조):

{
  "unitTitle": string,
  "keyConcepts": [ { "concept": string, "explanation": string }, ... ] | [],
  "contentStudy": [ { "title": string, "bullets": string[] }, ... ] | [],
  "coreSummary": string[],
  "practice": string[],
  "unitTest": [
    { "kind": "mcq", "question": string, "choices": string[] },
    { "kind": "short", "question": string }
  ] | []
}`;
}
