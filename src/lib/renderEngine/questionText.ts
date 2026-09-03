const IMPORTED_PAGE_TRAILER = /\s*Xtudy[\s-]*Universe\s*\|\s*고[1-3]\s+\d{4}년\s+0?\d{1,2}월\s+11유형\s+변형문제[\s\S]*$/iu;

export function cleanImportedQuestionText(value: string): string {
  return String(value || "").replace(IMPORTED_PAGE_TRAILER, "").trimEnd();
}

export function stripLegacyInlineEmphasis(value: string): string {
  const withoutMarkup = String(value || "")
    .replace(/<(?:strong|b|u)>([\s\S]*?)<\/(?:strong|b|u)>/giu, "$1")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1");
  return [...withoutMarkup].map((character) => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint >= 0x1d400 && codePoint <= 0x1d7ff
      ? character.normalize("NFKC")
      : character;
  }).join("");
}
