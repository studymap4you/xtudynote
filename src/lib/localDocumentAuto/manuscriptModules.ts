import type { ParsedManuscript } from "@/lib/localDocumentAuto/parseManuscript";

const HEADER_LINE =
  /^\s*(\[문제\+지문\]|\[정답\+해설\]|\[주제\+요지\]|\[직독직해\]|\[평가문제\])\s*$/;

/** parseManuscript.ts 와 동일 키 (preamble 은 마커 없음) */
export const LOCAL_DOC_HEADER_TO_FIELD: Record<string, keyof Omit<ParsedManuscript, "sourceName">> = {
  "[문제+지문]": "problem_passage",
  "[정답+해설]": "answer_explanation",
  "[주제+요지]": "topic_gist",
  "[직독직해]": "literal_translation",
  "[평가문제]": "evaluation",
};

export const LOCAL_DOC_FIELD_LABEL: Record<keyof Omit<ParsedManuscript, "sourceName">, string> = {
  preamble: "도입 (구획 전)",
  problem_passage: "[문제+지문]",
  answer_explanation: "[정답+해설]",
  topic_gist: "[주제+요지]",
  literal_translation: "[직독직해]",
  evaluation: "[평가문제]",
};

export type LocalDocSectionKey = keyof Omit<ParsedManuscript, "sourceName">;

export type LocalDocModule = {
  id: string;
  field: LocalDocSectionKey;
  body: string;
};

function newModuleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ld-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Marker = { field: LocalDocSectionKey; lineIndex: number };

/** 마커 순서를 유지해 각 블록을 독립 모듈로 분리 (도입은 preamble) */
export function parseManuscriptToModules(raw: string): LocalDocModule[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const markers: Marker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(HEADER_LINE);
    if (!m) continue;
    const field = LOCAL_DOC_HEADER_TO_FIELD[m[1] ?? ""];
    if (field) markers.push({ field, lineIndex: i });
  }

  if (markers.length === 0) {
    const body = raw.trim();
    if (!body) return [];
    return [{ id: newModuleId(), field: "preamble", body }];
  }

  const modules: LocalDocModule[] = [];
  const preBody = lines.slice(0, markers[0]!.lineIndex).join("\n").trim();
  if (preBody) modules.push({ id: newModuleId(), field: "preamble", body: preBody });

  for (let idx = 0; idx < markers.length; idx++) {
    const mk = markers[idx]!;
    const start = mk.lineIndex + 1;
    const end = idx + 1 < markers.length ? markers[idx + 1]!.lineIndex : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    modules.push({ id: newModuleId(), field: mk.field, body });
  }

  return modules;
}

const MARKER_LINE: Record<Exclude<LocalDocSectionKey, "preamble">, string> = {
  problem_passage: "[문제+지문]",
  answer_explanation: "[정답+해설]",
  topic_gist: "[주제+요지]",
  literal_translation: "[직독직해]",
  evaluation: "[평가문제]",
};

export function modulesToManuscriptText(modules: LocalDocModule[]): string {
  const chunks: string[] = [];
  for (let i = 0; i < modules.length; i++) {
    const m = modules[i]!;
    const body = (m.body ?? "").trim();
    if (m.field === "preamble") {
      if (body) chunks.push(body);
      continue;
    }
    const line = MARKER_LINE[m.field];
    if (body) chunks.push(`${line}\n${body}`);
    else chunks.push(line);
  }
  return chunks.join("\n\n").trim();
}

/** 웹 PDF·검증용: 같은 field 는 순서대로 합침 (기존 ParsedManuscript 호환) */
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

  const assign = (field: LocalDocSectionKey, body: string) => {
    const t = body.trim();
    if (!t) return;
    const cur = doc[field];
    if (cur) doc[field] = `${cur.trimEnd()}\n\n${t}`.trim();
    else doc[field] = t;
  };

  for (const m of modules) assign(m.field, m.body ?? "");
  return doc;
}

export function emptyLocalDocModule(field: LocalDocSectionKey): LocalDocModule {
  return { id: newModuleId(), field, body: "" };
}
