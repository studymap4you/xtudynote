/** Firestore `introduction` 필드 상한에 맞춘 큐레이션 병합 길이 제한 */
export const INTRO_MERGE_MAX = 85_000;

function escapeHtmlForIntro(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 큐레이션 본문(마크다운 원문)을 안전한 HTML 조각으로 변환해 강의 소개 HTML 뒤에 붙입니다. */
export function knowledgeMaterialAppendHtml(bodyMarkdown: string): string {
  const inner = escapeHtmlForIntro(bodyMarkdown).replace(/\n/g, "<br/>");
  return `<hr/><h2>큐레이션 기반 학습자료</h2><div class="classroom-intro__md-plain">${inner}</div>`;
}

export function mergeIntroductionWithKnowledgeMaterial(
  introHtml: string,
  bodyMarkdown: string
): string {
  const block = knowledgeMaterialAppendHtml(bodyMarkdown);
  const intro = introHtml.trim();
  const merged = intro ? `${intro}${block}` : block;
  if (merged.length <= INTRO_MERGE_MAX) return merged;
  return `${merged.slice(0, INTRO_MERGE_MAX)}<p><em>(일부 생략)</em></p>`;
}
