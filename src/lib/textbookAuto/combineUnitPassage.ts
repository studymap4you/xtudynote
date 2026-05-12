import type { TextbookUnitSetupState, TextbookUnitSourceModule, SourceModuleFieldKey } from "@/types/textbookAuto";
import { defaultSourceModuleFieldModes } from "@/types/textbookAuto";

export function getSourceModuleFieldValue(mod: TextbookUnitSourceModule, key: SourceModuleFieldKey): string {
  switch (key) {
    case "passageNo":
      return mod.passageNo;
    case "passage":
      return mod.passage;
    case "question":
      return mod.question;
    case "options":
      return mod.options;
    case "passageAnalysis":
      return mod.passageAnalysis;
    case "keySummary":
      return mod.keySummary;
    case "reviewStudy":
      return mod.reviewStudy;
    default: {
      const _x: never = key;
      return _x;
    }
  }
}

function moduleIsTotallyEmpty(mod: TextbookUnitSourceModule): boolean {
  return [
    mod.passageNo,
    mod.passage,
    mod.question,
    mod.options,
    mod.passageAnalysis,
    mod.keySummary,
    mod.reviewStudy,
  ].every((s) => !String(s).trim());
}

function pushField(parts: string[], label: string, body: string) {
  const b = body.trim();
  if (!b) return;
  parts.push(`${label}\n${b}`);
}

/** 단원 설정용 빈 모듈 (React key용 id 포함) */
export function emptyModule(): TextbookUnitSourceModule {
  return {
    id: crypto.randomUUID(),
    fieldModes: defaultSourceModuleFieldModes(),
    passageNo: "",
    passage: "",
    question: "",
    options: "",
    passageAnalysis: "",
    keySummary: "",
    reviewStudy: "",
  };
}

export function emptyUnitSetup(): TextbookUnitSetupState {
  return { manualText: "", modules: [emptyModule()], fileSegments: [], pendingFiles: [] };
}

/** 누락된 `modules` 등 구형·부분 상태를 단원 폼에 맞게 보정 */
export function normalizeUnitSetup(u: TextbookUnitSetupState | undefined): TextbookUnitSetupState {
  if (!u) return emptyUnitSetup();
  const rawMods = Array.isArray(u.modules) && u.modules.length > 0 ? u.modules : [emptyModule()];
  const modules = rawMods.map((m) => ({
    ...m,
    fieldModes: { ...defaultSourceModuleFieldModes(), ...(m.fieldModes ?? {}) },
  }));
  return {
    manualText: u.manualText ?? "",
    modules,
    fileSegments: Array.isArray(u.fileSegments) ? u.fileSegments : [],
    pendingFiles: Array.isArray(u.pendingFiles) ? u.pendingFiles : [],
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
    pushField(block, "문제:", mod.question);
    pushField(block, "선택지:", mod.options);
    pushField(block, "지문분석:", mod.passageAnalysis);
    pushField(block, "핵심정리:", mod.keySummary);
    pushField(block, "확인학습:", mod.reviewStudy);
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
