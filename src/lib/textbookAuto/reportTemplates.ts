/** 세션 전 지문분석·핵심정리를 동일 보고서 틀로 직렬화할 때 사용 */

export const PASSAGE_ANALYSIS_REPORT_HEAD = `《지문분석 보고서》
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 1. 분석 목적
지문에 대한 체계적 독해·문장 단위 분석을 기록합니다.

■ 2. 분석 범위
지문 전체(문장별 영문·해석·함축적 의미·핵심 표현 분석).

■ 3. 본문
(이하부터 실제 분석 내용을 작성합니다. 문장마다 "영문 / 해석 / 함축적 의미 / 핵심표현 분석" 순으로 정리합니다.)
`;

export const KEY_SUMMARY_REPORT_HEAD = `《핵심정리 보고서》
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 1. 작성 목적
학습 지문의 요지·어휘·구조를 수업용으로 압축 정리합니다.

■ 2. 서식 원칙
항목마다 "제목 — 내용" 형식. 내용에는 반드시 영어 원문(또는 핵심 표현) 인용 후 한국어 설명을 덧붙입니다.

■ 3. 본문
(이하부터 항목별 핵심정리를 작성합니다.)
`;

export function hasPassageAnalysisReportEnvelope(body: string): boolean {
  return body.includes("《지문분석 보고서》");
}

export function hasKeySummaryReportEnvelope(body: string): boolean {
  return body.includes("《핵심정리 보고서》");
}

/** 직렬화 시 보고서 머리말이 없으면 부착합니다(이미 있으면 그대로). */
export function ensurePassageAnalysisReportFormat(userBody: string): string {
  const b = userBody.trim();
  if (!b) return "";
  if (hasPassageAnalysisReportEnvelope(b)) return b;
  return `${PASSAGE_ANALYSIS_REPORT_HEAD.trimEnd()}\n\n${b}`;
}

export function ensureKeySummaryReportFormat(userBody: string): string {
  const b = userBody.trim();
  if (!b) return "";
  if (hasKeySummaryReportEnvelope(b)) return b;
  return `${KEY_SUMMARY_REPORT_HEAD.trimEnd()}\n\n${b}`;
}
