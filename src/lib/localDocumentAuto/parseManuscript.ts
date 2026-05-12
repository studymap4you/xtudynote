export type ParsedManuscript = {
  sourceName: string;
  preamble: string;
  problem_passage: string;
  answer_explanation: string;
  topic_gist: string;
  literal_translation: string;
  evaluation: string;
};

const HEADER_LINE =
  /^\s*(\[문제\+지문\]|\[정답\+해설\]|\[주제\+요지\]|\[직독직해\]|\[평가문제\])\s*$/;

const HEADER_TO_FIELD: Record<string, keyof Omit<ParsedManuscript, "sourceName">> = {
  "[문제+지문]": "problem_passage",
  "[정답+해설]": "answer_explanation",
  "[주제+요지]": "topic_gist",
  "[직독직해]": "literal_translation",
  "[평가문제]": "evaluation",
};

type Marker = { field: keyof Omit<ParsedManuscript, "sourceName">; lineIndex: number };

function assignField(doc: ParsedManuscript, field: keyof Omit<ParsedManuscript, "sourceName">, body: string) {
  if (!body) return;
  const cur = doc[field];
  if (cur) doc[field] = `${cur.trimEnd()}\n\n${body}`.trim();
  else doc[field] = body;
}

export function parseManuscript(sourceName: string, raw: string): ParsedManuscript {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const markers: Marker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(HEADER_LINE);
    if (!m) continue;
    const field = HEADER_TO_FIELD[m[1] ?? ""];
    if (field) markers.push({ field, lineIndex: i });
  }

  if (markers.length === 0) {
    return {
      sourceName,
      preamble: raw.trim(),
      problem_passage: "",
      answer_explanation: "",
      topic_gist: "",
      literal_translation: "",
      evaluation: "",
    };
  }

  const doc: ParsedManuscript = {
    sourceName,
    preamble: lines.slice(0, markers[0]!.lineIndex).join("\n").trim(),
    problem_passage: "",
    answer_explanation: "",
    topic_gist: "",
    literal_translation: "",
    evaluation: "",
  };

  for (let idx = 0; idx < markers.length; idx++) {
    const mk = markers[idx]!;
    const start = mk.lineIndex + 1;
    const end = idx + 1 < markers.length ? markers[idx + 1]!.lineIndex : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    assignField(doc, mk.field, body);
  }

  return doc;
}
