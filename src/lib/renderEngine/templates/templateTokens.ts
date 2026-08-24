import type { CSATRenderTemplateId } from "@/lib/renderEngine/templateIds";

export type CSATTemplateTokens = {
  id: CSATRenderTemplateId;
  colors: {
    paper: string;
    ink: string;
    muted: string;
    primary: string;
    primarySoft: string;
    secondary: string;
    secondarySoft: string;
    accent: string;
    accentSoft: string;
    highlight: string;
    line: string;
    passage: string;
  };
  typography: {
    passageFont: string;
    uiFont: string;
  };
  radius: {
    card: string;
    chip: string;
  };
  spacing: {
    pageX: string;
    pageTop: string;
    pageBottom: string;
    bodyTop: string;
    bodyBottom: string;
    questionGap: string;
  };
  pagination: {
    estimatedUnitScale: number;
    estimatedCapacity: number;
    estimatedGap: number;
  };
  cover: {
    edition: string;
    eyebrow: string;
    focus: string;
    footer: string;
    motivationalCopy: string;
  };
};

export const CSAT_TEMPLATE_TOKENS: Record<CSATRenderTemplateId, CSATTemplateTokens> = {
  "xuniverse-csat-studygram-pop-v1": {
    id: "xuniverse-csat-studygram-pop-v1",
    colors: {
      paper: "#fffefb", ink: "#172536", muted: "#66748a", primary: "#1456b8", primarySoft: "#dce9fb",
      secondary: "#85d7c5", secondarySoft: "#e0f5ef", accent: "#ff6c62", accentSoft: "#ffe5e1",
      highlight: "#f2d66f", line: "#cbd8ea", passage: "#202936",
    },
    typography: { passageFont: "Georgia, 'Times New Roman', serif", uiFont: "Inter, Pretendard, 'Noto Sans KR', Arial, sans-serif" },
    radius: { card: "8px", chip: "999px" },
    spacing: { pageX: "16mm", pageTop: "12mm", pageBottom: "10mm", bodyTop: "7mm", bodyBottom: "5mm", questionGap: "7mm" },
    pagination: { estimatedUnitScale: 1, estimatedCapacity: 900, estimatedGap: 28 },
    cover: { edition: "Studygram Edition · v1", eyebrow: "HIGH SCHOOL ENGLISH", focus: "Reading · Reasoning · Accuracy", footer: "STUDYGRAM PRACTICE SET", motivationalCopy: "한 문제씩, 점수는 쌓인다." },
  },
  "xuniverse-csat-campus-tech-blue-v1": {
    id: "xuniverse-csat-campus-tech-blue-v1",
    colors: {
      paper: "#f7fbff", ink: "#10243e", muted: "#5e7591", primary: "#1557d5", primarySoft: "#dce8ff",
      secondary: "#27c8d6", secondarySoft: "#dff8fa", accent: "#ff7468", accentSoft: "#ffe6e2",
      highlight: "#9ceaf0", line: "#bdd2ec", passage: "#172b44",
    },
    typography: { passageFont: "Georgia, 'Times New Roman', serif", uiFont: "Inter, Pretendard, 'Noto Sans KR', Arial, sans-serif" },
    radius: { card: "6px", chip: "999px" },
    spacing: { pageX: "14mm", pageTop: "11mm", pageBottom: "9mm", bodyTop: "6mm", bodyBottom: "4mm", questionGap: "6.2mm" },
    pagination: { estimatedUnitScale: 0.94, estimatedCapacity: 922, estimatedGap: 24 },
    cover: { edition: "Campus Tech · v1", eyebrow: "ADVANCED DIGITAL LEARNING", focus: "Focus · Structure · Performance", footer: "CAMPUS TECH BLUE", motivationalCopy: "Analyze clearly. Answer precisely." },
  },
  "xuniverse-csat-premium-stationery-v1": {
    id: "xuniverse-csat-premium-stationery-v1",
    colors: {
      paper: "#fffaf2", ink: "#3b3749", muted: "#7b7487", primary: "#826cab", primarySoft: "#eee8f7",
      secondary: "#83b8aa", secondarySoft: "#e6f3ee", accent: "#dd9a78", accentSoft: "#f8e7dd",
      highlight: "#efdca0", line: "#ddd5e4", passage: "#433e4c",
    },
    typography: { passageFont: "Georgia, 'Times New Roman', serif", uiFont: "Inter, Pretendard, 'Noto Sans KR', Arial, sans-serif" },
    radius: { card: "7px", chip: "999px" },
    spacing: { pageX: "17mm", pageTop: "13mm", pageBottom: "11mm", bodyTop: "8mm", bodyBottom: "6mm", questionGap: "8mm" },
    pagination: { estimatedUnitScale: 1.08, estimatedCapacity: 866, estimatedGap: 32 },
    cover: { edition: "Stationery Collection · v1", eyebrow: "A QUIET STUDY COMPANION", focus: "Reading · Reflection · Mastery", footer: "PREMIUM STATIONERY", motivationalCopy: "차분하게 읽고, 정확하게 이해하기." },
  },
  "xuniverse-csat-mono-highlighter-v1": {
    id: "xuniverse-csat-mono-highlighter-v1",
    colors: {
      paper: "#ffffff", ink: "#111111", muted: "#555555", primary: "#111111", primarySoft: "#ededed",
      secondary: "#82d7bd", secondarySoft: "#e3f5ef", accent: "#111111", accentSoft: "#f0f0f0",
      highlight: "#f4ef54", line: "#343434", passage: "#111111",
    },
    typography: { passageFont: "Georgia, 'Times New Roman', serif", uiFont: "Arial, Pretendard, 'Noto Sans KR', sans-serif" },
    radius: { card: "0", chip: "2px" },
    spacing: { pageX: "14.5mm", pageTop: "10mm", pageBottom: "9mm", bodyTop: "5.5mm", bodyBottom: "4mm", questionGap: "5.4mm" },
    pagination: { estimatedUnitScale: 0.9, estimatedCapacity: 936, estimatedGap: 21 },
    cover: { edition: "Mock Exam Edition · v1", eyebrow: "ENGLISH CSAT MOCK TEST", focus: "Timed Practice · Accuracy", footer: "MONO HIGHLIGHTER", motivationalCopy: "Mark the evidence. Choose the answer." },
  },
  "xuniverse-csat-editorial-magazine-v1": {
    id: "xuniverse-csat-editorial-magazine-v1",
    colors: {
      paper: "#f8f1e6", ink: "#1c2939", muted: "#6f6a65", primary: "#7b2634", primarySoft: "#eadbde",
      secondary: "#2d4c63", secondarySoft: "#dfe8ec", accent: "#b38a4c", accentSoft: "#efe4d1",
      highlight: "#d8c08c", line: "#c9bca9", passage: "#202a35",
    },
    typography: { passageFont: "Georgia, 'Times New Roman', serif", uiFont: "Georgia, 'Times New Roman', Pretendard, serif" },
    radius: { card: "2px", chip: "2px" },
    spacing: { pageX: "17mm", pageTop: "12mm", pageBottom: "10mm", bodyTop: "7mm", bodyBottom: "5mm", questionGap: "7.2mm" },
    pagination: { estimatedUnitScale: 1.04, estimatedCapacity: 888, estimatedGap: 29 },
    cover: { edition: "Editorial Reading · v1", eyebrow: "IDEAS · LANGUAGE · REASONING", focus: "Humanities · Society · Critical Reading", footer: "EDITORIAL MAGAZINE", motivationalCopy: "Read beyond the sentence." },
  },
  "xuniverse-csat-notebook-grid-v1": {
    id: "xuniverse-csat-notebook-grid-v1",
    colors: {
      paper: "#fbfdff", ink: "#24384f", muted: "#6f8297", primary: "#2769b2", primarySoft: "#e1edfa",
      secondary: "#e39aaa", secondarySoft: "#fae9ed", accent: "#e39aaa", accentSoft: "#fae9ed",
      highlight: "#f4df84", line: "#b9cee6", passage: "#26394e",
    },
    typography: { passageFont: "Georgia, 'Times New Roman', serif", uiFont: "Inter, Pretendard, 'Noto Sans KR', Arial, sans-serif" },
    radius: { card: "4px", chip: "4px" },
    spacing: { pageX: "16mm", pageTop: "12mm", pageBottom: "10mm", bodyTop: "7mm", bodyBottom: "5mm", questionGap: "7.4mm" },
    pagination: { estimatedUnitScale: 1.02, estimatedCapacity: 890, estimatedGap: 30 },
    cover: { edition: "Study Notebook · v1", eyebrow: "READ · MARK · REVIEW", focus: "Homework · Review · Self Study", footer: "NOTEBOOK GRID", motivationalCopy: "근거를 표시하고, 오답을 기록하기." },
  },
};

export function getCSATTemplateTokens(id: CSATRenderTemplateId): CSATTemplateTokens {
  return CSAT_TEMPLATE_TOKENS[id];
}

export function templateCssVariables(tokens: CSATTemplateTokens): Record<string, string> {
  return {
    "--csat-paper": tokens.colors.paper,
    "--csat-ink": tokens.colors.ink,
    "--csat-muted": tokens.colors.muted,
    "--csat-primary": tokens.colors.primary,
    "--csat-primary-soft": tokens.colors.primarySoft,
    "--csat-mint": tokens.colors.secondary,
    "--csat-mint-soft": tokens.colors.secondarySoft,
    "--csat-coral": tokens.colors.accent,
    "--csat-coral-soft": tokens.colors.accentSoft,
    "--csat-lemon": tokens.colors.highlight,
    "--csat-line": tokens.colors.line,
    "--csat-passage": tokens.colors.passage,
    "--csat-ui-font": tokens.typography.uiFont,
    "--csat-passage-font": tokens.typography.passageFont,
    "--csat-radius": tokens.radius.card,
    "--csat-small-radius": tokens.radius.chip,
    "--csat-page-x": tokens.spacing.pageX,
    "--csat-page-top": tokens.spacing.pageTop,
    "--csat-page-bottom": tokens.spacing.pageBottom,
    "--csat-body-top": tokens.spacing.bodyTop,
    "--csat-body-bottom": tokens.spacing.bodyBottom,
    "--csat-question-gap": tokens.spacing.questionGap,
  };
}
