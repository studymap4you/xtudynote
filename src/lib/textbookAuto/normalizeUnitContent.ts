import type {
  TextbookContentStudyBlock,
  TextbookKeyConceptItem,
  TextbookUnitContent,
  TextbookUnitTestItem,
} from "@/types/textbookAuto";
import { DEFAULT_SECTION_INCLUSION } from "@/types/textbookAuto";
import { parseSectionInclusionFromUnknown } from "@/lib/textbookAuto/sectionInclusion";
import {
  ALL_LOCAL_DOC_MODULE_FIELDS,
  type LocalDocModule,
  type LocalDocModuleField,
} from "@/lib/localDocumentAuto/manuscriptModules";

const MODULE_FIELD_SET = new Set<LocalDocModuleField>(ALL_LOCAL_DOC_MODULE_FIELDS);
const MAX_MANUSCRIPT_MODULES = 400;

function parseManuscriptModules(raw: unknown): LocalDocModule[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalDocModule[] = [];
  for (const x of raw) {
    if (out.length >= MAX_MANUSCRIPT_MODULES) break;
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
    const field = o.field as LocalDocModuleField;
    const body = typeof o.body === "string" ? o.body : "";
    if (!id || !MODULE_FIELD_SET.has(field)) continue;
    const m: LocalDocModule = { id, field, body };
    if (o.inputMode === "manual" || o.inputMode === "ai") m.inputMode = o.inputMode;
    if (typeof o.questionNumber === "string" && o.questionNumber.trim()) m.questionNumber = o.questionNumber.trim();
    out.push(m);
  }
  return out;
}

function cleanLines(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x === "string") {
      const t = x.trim();
      if (t) out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}

function parseKeyConceptItem(raw: unknown): TextbookKeyConceptItem | null {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const concept = typeof o.concept === "string" ? o.concept.trim() : "";
    const explanation = typeof o.explanation === "string" ? o.explanation.trim() : "";
    if (concept || explanation) {
      return { concept: concept || "(개념)", explanation: explanation || "—" };
    }
    return null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    const parts = t.split(/\s*[–—\-]\s*/).map((s) => s.trim());
    if (parts.length >= 2) {
      return { concept: parts[0] ?? t, explanation: parts.slice(1).join(" — ") };
    }
    return { concept: t, explanation: "—" };
  }
  return null;
}

function parseContentStudyBlock(raw: unknown): TextbookContentStudyBlock | null {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const bulletsRaw = o.bullets ?? o.explanationBullets;
    const bullets = cleanLines(bulletsRaw, 80);
    if (!title && bullets.length === 0) return null;
    return {
      title: title || "(제목)",
      bullets: bullets.length ? bullets : ["(내용을 추가하세요)"],
    };
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    return { title: "내용", bullets: [t] };
  }
  return null;
}

function parseUnitTestItem(raw: unknown): TextbookUnitTestItem | null {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const kindRaw = o.kind ?? o.type;
    const kind =
      kindRaw === "mcq" || kindRaw === "multiple_choice" || kindRaw === "객관식" || kindRaw === "objective"
        ? "mcq"
        : "short";
    const question = typeof o.question === "string" ? o.question.trim() : "";
    if (!question) return null;
    if (kind === "mcq") {
      const choices = cleanLines(o.choices ?? o.options, 12);
      return { kind: "mcq", question, choices: choices.length >= 2 ? choices : [choices[0] ?? "보기1", "보기2"] };
    }
    return { kind: "short", question };
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    return { kind: "short", question: t };
  }
  return null;
}

/** Firestore / AI 파싱 통합 */
export function normalizeUnitContentFromUnknown(raw: Record<string, unknown>): TextbookUnitContent {
  const unitTitle = typeof raw.unitTitle === "string" ? raw.unitTitle.trim() : "";

  const keyOut: TextbookKeyConceptItem[] = [];
  if (Array.isArray(raw.keyConcepts)) {
    for (const x of raw.keyConcepts) {
      const p = parseKeyConceptItem(x);
      if (p) keyOut.push(p);
      if (keyOut.length >= 40) break;
    }
  }

  const csOut: TextbookContentStudyBlock[] = [];
  if (Array.isArray(raw.contentStudy)) {
    for (const x of raw.contentStudy) {
      const p = parseContentStudyBlock(x);
      if (p) csOut.push(p);
      if (csOut.length >= 40) break;
    }
  }

  const utOut: TextbookUnitTestItem[] = [];
  if (Array.isArray(raw.unitTest)) {
    for (const x of raw.unitTest) {
      const p = parseUnitTestItem(x);
      if (p) utOut.push(p);
      if (utOut.length >= 50) break;
    }
  }

  const sectionInclusion =
    parseSectionInclusionFromUnknown(raw.sectionInclusion) ?? DEFAULT_SECTION_INCLUSION;

  const mm = parseManuscriptModules(raw.manuscriptModules);

  return {
    unitTitle: unitTitle || "(제목 없음)",
    keyConcepts: keyOut,
    contentStudy: csOut,
    coreSummary: cleanLines(raw.coreSummary, 40),
    practice: cleanLines(raw.practice, 50),
    unitTest: utOut,
    sectionInclusion,
    ...(mm.length ? { manuscriptModules: mm } : {}),
  };
}

/** Firestore 단원 문서(맵·배열 혼재) → 앱 타입 */
export function unitContentFromFirestoreDoc(data: Record<string, unknown>): TextbookUnitContent {
  return normalizeUnitContentFromUnknown({
    unitTitle: data.unitTitle,
    keyConcepts: data.keyConcepts,
    contentStudy: data.contentStudy,
    coreSummary: data.coreSummary,
    practice: data.practice,
    unitTest: data.unitTest,
    sectionInclusion: data.sectionInclusion,
    manuscriptModules: data.manuscriptModules,
  });
}
