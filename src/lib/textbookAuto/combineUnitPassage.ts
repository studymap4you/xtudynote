import type {
  TextbookModuleSubQuestion,
  TextbookUnitSetupState,
  TextbookUnitSourceModule,
  SourceModuleFieldKey,
} from "@/types/textbookAuto";
import {
  defaultSourceModuleFieldModes,
  defaultUnitEvaluationSetup,
  emptySubQuestion,
  normalizeReviewStudySetup,
  normalizeUnitEvaluationSetup,
} from "@/types/textbookAuto";
import { ensureKeySummaryReportFormat, ensurePassageAnalysisReportFormat } from "@/lib/textbookAuto/reportTemplates";

export function getSourceModuleFieldValue(mod: TextbookUnitSourceModule, key: SourceModuleFieldKey): string {
  switch (key) {
    case "passageNo":
      return mod.passageNo;
    case "passage":
      return mod.passage;
    case "passageAnalysis":
      return mod.passageAnalysis;
    case "keySummary":
      return mod.keySummary;
    default: {
      const _x: never = key;
      return _x;
    }
  }
}

function subQuestionNonEmpty(sq: TextbookModuleSubQuestion): boolean {
  return Boolean(sq.stem.trim() || (sq.kind === "mcq" && sq.options.trim()));
}

function normalizeSubQuestions(mod: Record<string, unknown>): TextbookModuleSubQuestion[] {
  const legacyQ = typeof mod.question === "string" ? mod.question : "";
  const legacyO = typeof mod.options === "string" ? mod.options : "";
  if (Array.isArray(mod.subQuestions) && mod.subQuestions.length > 0) {
    return (mod.subQuestions as unknown[]).map((raw) => {
      if (!raw || typeof raw !== "object") return emptySubQuestion();
      const s = raw as Record<string, unknown>;
      const id =
        typeof s.id === "string" && s.id.trim()
          ? s.id.trim()
          : typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `sq-${Date.now()}`;
      const kind = s.kind === "short" ? "short" : "mcq";
      const lang = s.lang === "en" ? "en" : "ko";
      return {
        id,
        kind,
        lang,
        stem: typeof s.stem === "string" ? s.stem : typeof s.question === "string" ? s.question : "",
        options: typeof s.options === "string" ? s.options : "",
        stemMode: s.stemMode === "ai" || s.stemMode === "manual" ? (s.stemMode as "manual" | "ai") : "manual",
        optionsMode: s.optionsMode === "ai" || s.optionsMode === "manual" ? (s.optionsMode as "manual" | "ai") : "manual",
      };
    });
  }
  if (legacyQ.trim() || legacyO.trim()) {
    return [
      {
        ...emptySubQuestion(),
        stem: legacyQ,
        options: legacyO,
        kind: legacyO.trim() ? "mcq" : "short",
      },
    ];
  }
  return [emptySubQuestion()];
}

function moduleIsTotallyEmpty(mod: TextbookUnitSourceModule): boolean {
  const subs = mod.subQuestions.some(subQuestionNonEmpty);
  return (
    [mod.passageNo, mod.passage, mod.passageAnalysis, mod.keySummary].every((s) => !String(s).trim()) && !subs
  );
}

function pushField(parts: string[], label: string, body: string) {
  const b = body.trim();
  if (!b) return;
  parts.push(`${label}\n${b}`);
}

const KIND_KO: Record<string, string> = { mcq: "객관식", short: "주관식" };
const LANG_KO: Record<string, string> = { ko: "한국어", en: "영어" };

function serializeSubQuestionLines(sqs: TextbookModuleSubQuestion[]): string[] {
  const lines: string[] = [];
  let n = 0;
  for (const sq of sqs) {
    if (!subQuestionNonEmpty(sq)) continue;
    n += 1;
    const typeLabel = KIND_KO[sq.kind] ?? sq.kind;
    const langLabel = LANG_KO[sq.lang] ?? sq.lang;
    lines.push(`[문항 ${n}] (${typeLabel}·${langLabel})`);
    const stem = sq.stem.trim();
    if (stem) lines.push(`발문\n${stem}`);
    if (sq.kind === "mcq") {
      const opts = sq.options.trim();
      if (opts) lines.push(`선택지\n${opts}`);
    }
  }
  return lines;
}

/** 단원 설정용 빈 모듈 (React key용 id 포함) */
export function emptyModule(): TextbookUnitSourceModule {
  return {
    id: crypto.randomUUID(),
    fieldModes: defaultSourceModuleFieldModes(),
    passageNo: "",
    passage: "",
    subQuestions: [emptySubQuestion()],
    passageAnalysis: "",
    keySummary: "",
  };
}

export function emptyUnitSetup(): TextbookUnitSetupState {
  return {
    manualText: "",
    modules: [emptyModule()],
    fileSegments: [],
    pendingFiles: [],
    reviewStudy: normalizeReviewStudySetup(undefined),
    unitEvaluation: defaultUnitEvaluationSetup(),
  };
}

/** 누락된 `modules` 등 구형·부분 상태를 단원 폼에 맞게 보정 */
export function normalizeUnitSetup(u: TextbookUnitSetupState | undefined): TextbookUnitSetupState {
  if (!u) return emptyUnitSetup();
  const rawMods = Array.isArray(u.modules) && u.modules.length > 0 ? u.modules : [emptyModule()];
  const modules: TextbookUnitSourceModule[] = rawMods.map((m) => {
    const o = m as unknown as Record<string, unknown>;
    const subQuestions = normalizeSubQuestions(o);
    const baseId =
      typeof o.id === "string" && o.id
        ? o.id
        : typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `mod-${Date.now()}`;
    return {
      id: baseId,
      fieldModes: { ...defaultSourceModuleFieldModes(), ...((m as TextbookUnitSourceModule).fieldModes ?? {}) },
      passageNo: String(o.passageNo ?? ""),
      passage: String(o.passage ?? ""),
      subQuestions,
      passageAnalysis: String(o.passageAnalysis ?? ""),
      keySummary: String(o.keySummary ?? ""),
    };
  });

  const ru: unknown = (u as TextbookUnitSetupState).reviewStudy;
  const legacyReviewBody =
    typeof ru === "string"
      ? { body: ru }
      : ru && typeof ru === "object"
        ? (ru as object)
        : undefined;

  return {
    manualText: u.manualText ?? "",
    modules,
    fileSegments: Array.isArray(u.fileSegments) ? u.fileSegments : [],
    pendingFiles: Array.isArray(u.pendingFiles) ? u.pendingFiles : [],
    reviewStudy: normalizeReviewStudySetup(legacyReviewBody),
    unitEvaluation: normalizeUnitEvaluationSetup(u.unitEvaluation),
  };
}

function serializeModules(mods: TextbookUnitSourceModule[] | undefined): string {
  const list = mods ?? [];
  const chunks: string[] = [];
  let n = 0;
  for (const mod of list) {
    if (moduleIsTotallyEmpty(mod)) continue;
    n += 1;
    const block: string[] = [`[모듈 ${n}]`];
    const no = mod.passageNo.trim();
    if (no) block.push(`지문번호: ${no}`);
    pushField(block, "지문:", mod.passage);
    for (const line of serializeSubQuestionLines(mod.subQuestions)) {
      block.push(line);
    }
    const pa = ensurePassageAnalysisReportFormat(mod.passageAnalysis);
    if (pa) pushField(block, "지문분석 보고서:", pa);
    const ks = ensureKeySummaryReportFormat(mod.keySummary);
    if (ks) pushField(block, "핵심정리 보고서:", ks);
    chunks.push(block.join("\n"));
  }
  return chunks.join("\n\n");
}

/** 모듈·직접 입력·추출된 파일 블록을 합친 단원 지문(세션·AI 입력용) */
export function combineUnitPassage(u: TextbookUnitSetupState): string {
  const n = normalizeUnitSetup(u);
  const parts: string[] = [];
  const fromMods = serializeModules(n.modules).trim();
  if (fromMods) parts.push(fromMods);
  const m = n.manualText.trim();
  if (m) parts.push(m);
  for (const seg of n.fileSegments) {
    const t = seg.text.trim();
    if (t) parts.push(t);
  }
  return parts.join("\n\n");
}
