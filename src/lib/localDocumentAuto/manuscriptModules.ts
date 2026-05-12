import type { ParsedManuscript } from "@/lib/localDocumentAuto/parseManuscript";
import { parseDocument, splitUnitChunks, type PassageUnit } from "@/lib/passageClassification/processor";

/** 세분 모듈 구역. txt 내보내기는 modulesToManuscriptText 가 넓은 마커로 정규화합니다. */
export type LocalDocModuleField =
  | "preamble"
  | "problem"
  | "answer"
  | "explanation"
  | "interpretation"
  | "topic_gist"
  | "literal_translation"
  | "evaluation";

export type ModuleInputMode = "manual" | "ai";

export type LocalDocModule = {
  id: string;
  field: LocalDocModuleField;
  body: string;
  /** 주제·요지 / 직독직해 */
  inputMode?: ModuleInputMode;
};

const CH: string[] = ["①", "②", "③", "④", "⑤"];

function answerCircle(n: number): string {
  return n >= 1 && n <= 5 ? CH[n - 1]! : `${n}번`;
}

function newModuleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ld-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function norm(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export const LOCAL_DOC_FIELD_LABEL: Record<LocalDocModuleField, string> = {
  preamble: "도입 (구획 전)",
  problem: "문제 · 지문 · 선택지",
  answer: "정답",
  explanation: "해설",
  interpretation: "해석",
  topic_gist: "주제 · 제목 · 요지",
  literal_translation: "직독직해",
  evaluation: "[평가문제]",
};

const ALL_FIELDS_LIST: LocalDocModuleField[] = [
  "preamble",
  "problem",
  "answer",
  "explanation",
  "interpretation",
  "topic_gist",
  "literal_translation",
  "evaluation",
];

export const ALL_LOCAL_DOC_MODULE_FIELDS = ALL_FIELDS_LIST;

const HEADER_LINE =
  /^\s*(\[문제\+지문\]|\[문제\]|\[정답\+해설\]|\[정답\]|\[해설\]|\[해석\]|\[주제\+요지\]|\[주제\]|\[직독직해\]|\[평가문제\])\s*$/;

type MarkerField = LocalDocModuleField | "legacy_answer_explanation";

type Marker = { kind: MarkerField; lineIndex: number };

function headerToMarkerKind(anchor: string): MarkerField | null {
  const map: Record<string, MarkerField> = {
    "[문제+지문]": "problem",
    "[문제]": "problem",
    "[정답+해설]": "legacy_answer_explanation",
    "[정답]": "answer",
    "[해설]": "explanation",
    "[해석]": "interpretation",
    "[주제+요지]": "topic_gist",
    "[주제]": "topic_gist",
    "[직독직해]": "literal_translation",
    "[평가문제]": "evaluation",
  };
  return map[anchor] ?? null;
}

function splitAnswerExplanationBody(body: string): { answer: string; explanation: string } {
  const t = body.trim();
  if (!t) return { answer: "", explanation: "" };
  const CIRCLE_TO_NUM: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
  const m = t.match(/(?:정답|답)\s*[:：]?\s*([①②③④⑤1-5])/);
  if (m?.[1]) {
    const token = m[1]!;
    let n = parseInt(CIRCLE_TO_NUM[token] ?? token, 10);
    if (Number.isNaN(n)) n = 1;
    const line = `정답: ${answerCircle(n)}`;
    const rest = t.slice((m.index ?? 0) + m[0].length).trim();
    return { answer: line, explanation: rest };
  }
  return { answer: "", explanation: t };
}

function formatProblemUnit(u: PassageUnit): string {
  const lines: string[] = [];
  const stem = (u.phase1.stem ?? "").trim();
  const passage = (u.phase1.passage ?? "").trim();
  if (stem) lines.push(stem);
  if (passage) lines.push(passage);
  const keys = Object.keys(u.phase1.choices ?? {}).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  for (const k of keys) {
    const i = parseInt(k, 10);
    const mark = i >= 1 && i <= 5 ? CH[i - 1]! : k;
    const t = (u.phase1.choices[k] ?? "").trim();
    lines.push(`${mark} ${t}`.trim());
  }
  return lines.join("\n\n");
}

function topicGistBodyFromPhase3(u: PassageUnit): string {
  const p3 = u.phase3;
  if (!p3) return "";
  const parts: string[] = [];
  if ((p3.topic ?? "").trim()) parts.push(`[주제] ${(p3.topic ?? "").trim()}`);
  if ((p3.gist ?? "").trim()) parts.push(`[요지] ${(p3.gist ?? "").trim()}`);
  return parts.join("\n\n");
}

export function passageDocumentToFineModules(raw: string): LocalDocModule[] {
  const units = parseDocument(norm(raw));
  const out: LocalDocModule[] = [];
  for (const u of units) {
    const prob = formatProblemUnit(u);
    if (!prob.trim()) continue;
    out.push({ id: newModuleId(), field: "problem", body: prob });
    if (u.phase2) {
      out.push({ id: newModuleId(), field: "answer", body: `정답: ${answerCircle(u.phase2.answer)}` });
      if ((u.phase2.explanation ?? "").trim()) {
        out.push({ id: newModuleId(), field: "explanation", body: (u.phase2.explanation ?? "").trim() });
      }
    }
    if (u.phase3?.key_sentence?.trim()) {
      out.push({ id: newModuleId(), field: "interpretation", body: (u.phase3.key_sentence ?? "").trim() });
    }
    const tg = topicGistBodyFromPhase3(u);
    if (tg) {
      out.push({ id: newModuleId(), field: "topic_gist", body: tg, inputMode: "manual" });
    }
    if ((u.phase3?.literal ?? "").trim()) {
      out.push({
        id: newModuleId(),
        field: "literal_translation",
        body: (u.phase3!.literal ?? "").trim(),
        inputMode: "manual",
      });
    }
  }
  return out;
}

function looksLikePassageManuscript(raw: string): boolean {
  return splitUnitChunks(norm(raw)).length > 0;
}

function collectMarkers(lines: string[]): Marker[] {
  const markers: Marker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(HEADER_LINE);
    if (!m) continue;
    const kind = headerToMarkerKind(m[1] ?? "");
    if (!kind) continue;
    markers.push({ kind, lineIndex: i });
  }
  return markers;
}

function pushModulesFromBody(kind: LocalDocModuleField, body: string, out: LocalDocModule[]): void {
  const t = body.trim();
  if (!t) return;
  if (kind === "topic_gist" || kind === "literal_translation") {
    out.push({ id: newModuleId(), field: kind, body: t, inputMode: "manual" });
  } else {
    out.push({ id: newModuleId(), field: kind, body: t });
  }
}

function expandLegacyAnswerExplanation(body: string, out: LocalDocModule[]): void {
  const { answer, explanation } = splitAnswerExplanationBody(body);
  if (answer.trim()) out.push({ id: newModuleId(), field: "answer", body: answer.trim() });
  if (explanation.trim()) out.push({ id: newModuleId(), field: "explanation", body: explanation.trim() });
  if (!answer.trim() && !explanation.trim() && body.trim()) {
    out.push({ id: newModuleId(), field: "explanation", body: body.trim() });
  }
}

export function parseMarkerManuscriptToModules(raw: string): LocalDocModule[] {
  const lines = norm(raw).split("\n");
  const markers = collectMarkers(lines);
  if (markers.length === 0) return [];

  const out: LocalDocModule[] = [];
  const preBody = lines.slice(0, markers[0]!.lineIndex).join("\n").trim();
  if (preBody) out.push({ id: newModuleId(), field: "preamble", body: preBody });

  for (let idx = 0; idx < markers.length; idx++) {
    const mk = markers[idx]!;
    const start = mk.lineIndex + 1;
    const end = idx + 1 < markers.length ? markers[idx + 1]!.lineIndex : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    if (mk.kind === "legacy_answer_explanation") {
      expandLegacyAnswerExplanation(body, out);
    } else {
      pushModulesFromBody(mk.kind, body, out);
    }
  }
  return out;
}

export function parseManuscriptToModules(raw: string): LocalDocModule[] {
  const n = norm(raw).trim();
  if (!n) return [];

  if (looksLikePassageManuscript(n)) {
    const fine = passageDocumentToFineModules(n);
    if (fine.length > 0) return fine;
  }

  const markerMods = parseMarkerManuscriptToModules(n);
  if (markerMods.length > 0) return markerMods;

  return [{ id: newModuleId(), field: "preamble", body: n }];
}

function appendAgg(target: string, addition: string): string {
  const t = addition.trim();
  if (!t) return target;
  if (!target.trim()) return t;
  return `${target.trimEnd()}\n\n${t}`.trim();
}

export function modulesToParsedManuscript(sourceName: string, modules: LocalDocModule[]): ParsedManuscript {
  const doc: ParsedManuscript = {
    sourceName,
    preamble: "",
    problem_passage: "",
    answer_explanation: "",
    topic_gist: "",
    literal_translation: "",
    evaluation: "",
  };

  for (const m of modules) {
    const b = (m.body ?? "").trim();
    if (!b) continue;
    switch (m.field) {
      case "preamble":
        doc.preamble = appendAgg(doc.preamble, b);
        break;
      case "problem":
        doc.problem_passage = appendAgg(doc.problem_passage, b);
        break;
      case "answer":
        doc.answer_explanation = appendAgg(doc.answer_explanation, b);
        break;
      case "explanation":
        doc.answer_explanation = appendAgg(doc.answer_explanation, `【해설】\n${b}`);
        break;
      case "interpretation":
        doc.answer_explanation = appendAgg(doc.answer_explanation, `【해석】\n${b}`);
        break;
      case "topic_gist":
        doc.topic_gist = appendAgg(doc.topic_gist, b);
        break;
      case "literal_translation":
        doc.literal_translation = appendAgg(doc.literal_translation, b);
        break;
      case "evaluation":
        doc.evaluation = appendAgg(doc.evaluation, b);
        break;
      default:
        break;
    }
  }

  return doc;
}

export function modulesToManuscriptText(modules: LocalDocModule[]): string {
  const p = modulesToParsedManuscript("export", modules);
  const chunks: string[] = [];
  if (p.preamble.trim()) chunks.push(p.preamble.trim());
  if (p.problem_passage.trim()) chunks.push(`[문제+지문]\n${p.problem_passage.trim()}`);
  if (p.answer_explanation.trim()) chunks.push(`[정답+해설]\n${p.answer_explanation.trim()}`);
  if (p.topic_gist.trim()) chunks.push(`[주제+요지]\n${p.topic_gist.trim()}`);
  if (p.literal_translation.trim()) chunks.push(`[직독직해]\n${p.literal_translation.trim()}`);
  if (p.evaluation.trim()) chunks.push(`[평가문제]\n${p.evaluation.trim()}`);
  return chunks.join("\n\n").trim();
}

export function emptyLocalDocModule(field: LocalDocModuleField): LocalDocModule {
  const base: LocalDocModule = { id: newModuleId(), field, body: "" };
  if (field === "topic_gist" || field === "literal_translation") base.inputMode = "manual";
  return base;
}

/** AI 등: beforeIndex 직전까지 스캔해 가장 가까운 「문제·지문·선택지」 블록만 사용. 없으면 모든 문제 블록을 이어붙임. */
export function buildAiContextFromModules(modules: LocalDocModule[], beforeIndex: number): string {
  for (let i = Math.min(beforeIndex, modules.length) - 1; i >= 0; i--) {
    const m = modules[i]!;
    if (m.field === "problem") {
      const t = (m.body ?? "").trim();
      if (t) return t;
    }
  }
  const parts: string[] = [];
  for (const m of modules) {
    if (m.field === "problem") {
      const t = (m.body ?? "").trim();
      if (t) parts.push(t);
    }
  }
  return parts.join("\n\n---\n\n");
}
