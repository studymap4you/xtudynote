/**
 * Python document-automation/passage-classification/processor.py 와 동일 규칙.
 * 브라우저(Vercel)에서 외부 API 없이 파싱·병합.
 */

export interface Phase1Block {
  number: number;
  stem: string;
  passage: string;
  choices: Record<string, string>;
}

export interface Phase2Block {
  answer: number;
  explanation: string;
}

export interface Phase3Block {
  topic: string | null;
  gist: string | null;
  key_sentence: string | null;
  literal: string | null;
}

export interface Phase4Block {
  body: string;
}

export interface PassageUnit {
  number: number;
  phase1: Phase1Block;
  phase2: Phase2Block | null;
  phase3: Phase3Block | null;
  phase4: Phase4Block | null;
}

const PROBLEM_START = /^\s*(\d+)\.\s*(.*)$/;
const CHOICE_LINE = /^\s*([①②③④⑤])\s*(.*)$/;
const CIRCLE_TO_NUM: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
const MERGE_UNIT_HEAD = /\[\s*문제\s*(\d+)\s*\]/gi;

const ANCHOR_PATTERNS: [string, RegExp][] = [
  ["phase2_se", /\[\s*정답\s*및\s*해설\s*\]/gi],
  ["phase2_short", /\[\s*정답\s*\]/gi],
  ["phase3_topic", /\[\s*주제\s*\]/gi],
  ["phase3_gist", /\[\s*요지\s*\]/gi],
  ["phase3_keysent", /\[\s*주제문\s*\]/gi],
  ["phase3_literal", /\[\s*직독직해\s*\]/gi],
  ["phase4_ko", /\[\s*확인문제\s*\]/gi],
  ["phase4_en", /\[\s*Review\s*\]/gi],
];

function norm(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function phase3Effective(p: Phase3Block | null): Phase3Block | null {
  if (!p) return null;
  const has = [p.topic, p.gist, p.key_sentence, p.literal].some((x) => (x ?? "").trim());
  return has ? p : null;
}

function phase4Effective(p: Phase4Block | null): Phase4Block | null {
  if (!p || !(p.body ?? "").trim()) return null;
  return p;
}

function splitStemPassage(preambleLines: string[]): [string, string] {
  if (!preambleLines.length) return ["", ""];
  const text = preambleLines.join("\n").trim();
  if (text.includes("\n\n")) {
    const i = text.indexOf("\n\n");
    return [text.slice(0, i).trim(), text.slice(i + 2).trim()];
  }
  if (preambleLines.length >= 2) {
    return [preambleLines[0].trim(), preambleLines.slice(1).join("\n").trim()];
  }
  return [text, ""];
}

function parseChoices(lines: string[], start: number): [Record<string, string>, number] {
  const choices: Record<string, string> = {};
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(CHOICE_LINE);
    if (!m) break;
    const circle = m[1]!;
    const rest = m[2]!.trim();
    const num = CIRCLE_TO_NUM[circle];
    if (num) choices[num] = rest;
    i += 1;
    if (Object.keys(choices).length >= 5) break;
  }
  return [choices, i];
}

function parseTrailing(text: string): [Phase2Block | null, Phase3Block | null, Phase4Block | null] {
  if (!text.trim()) return [null, null, null];

  const matches: { start: number; end: number; kind: string }[] = [];
  for (const [kind, pat] of ANCHOR_PATTERNS) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    const p = new RegExp(pat.source, pat.flags);
    while ((m = p.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, kind });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const segs: Record<string, string> = {};
  for (let idx = 0; idx < matches.length; idx++) {
    const { end, kind } = matches[idx]!;
    const contentStart = end;
    const contentEnd = idx + 1 < matches.length ? matches[idx + 1]!.start : text.length;
    let chunk = text.slice(contentStart, contentEnd).trim();
    if (segs[kind] !== undefined) segs[kind] = `${segs[kind]}\n${chunk}`.trim();
    else segs[kind] = chunk;
  }

  let phase2: Phase2Block | null = null;
  const p2Raw = (segs.phase2_se ?? segs.phase2_short ?? "").trim();
  if (p2Raw) {
    const ansM = p2Raw.match(/(?:정답|답)\s*[:：]?\s*([①②③④⑤1-5])/);
    let ans = 1;
    if (ansM?.[1]) {
      const token = ansM[1];
      ans = parseInt(CIRCLE_TO_NUM[token] ?? token, 10);
      if (Number.isNaN(ans)) ans = 1;
    }
    let expl = p2Raw.replace(/^\s*(?:정답|답)\s*[:：]?\s*[①②③④⑤1-5]\s*/m, "").trim();
    if (!expl) expl = p2Raw;
    phase2 = { answer: ans, explanation: expl };
  }

  let p3: Phase3Block | null = {
    topic: (segs.phase3_topic ?? "").trim() || null,
    gist: (segs.phase3_gist ?? "").trim() || null,
    key_sentence: (segs.phase3_keysent ?? "").trim() || null,
    literal: (segs.phase3_literal ?? "").trim() || null,
  };
  p3 = phase3Effective(p3);

  const p4Raw = (segs.phase4_ko ?? segs.phase4_en ?? "").trim();
  const p4 = phase4Effective(p4Raw ? { body: p4Raw } : null);

  return [phase2, p3, p4];
}

function parseUnitBody(number: number, body: string): PassageUnit {
  const lines = body.split("\n");
  let choiceIdx: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (CHOICE_LINE.test(lines[i])) {
      choiceIdx = i;
      break;
    }
  }
  if (choiceIdx === null) {
    const [stem, passage] = splitStemPassage(lines);
    return {
      number,
      phase1: { number, stem, passage, choices: {} },
      phase2: null,
      phase3: null,
      phase4: null,
    };
  }

  const preamble = lines.slice(0, choiceIdx);
  const [stem, passage] = splitStemPassage(preamble);
  const [choices, endCi] = parseChoices(lines, choiceIdx);
  const trailing = lines.slice(endCi).join("\n").trim();
  const [ph2, ph3, ph4] = parseTrailing(trailing);
  return {
    number,
    phase1: { number, stem, passage, choices },
    phase2: ph2,
    phase3: ph3,
    phase4: ph4,
  };
}

export function splitUnitChunks(text: string): [number, string][] {
  text = norm(text);
  const lines = text.split("\n");
  const heads: [number, number, string][] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PROBLEM_START);
    if (m) heads.push([i, parseInt(m[1]!, 10), m[2] ?? ""]);
  }
  if (!heads.length) return [];

  const chunks: [number, string][] = [];
  for (let hi = 0; hi < heads.length; hi++) {
    const [lineI, num, firstRest] = heads[hi]!;
    const endLine = hi + 1 < heads.length ? heads[hi + 1]![0] : lines.length;
    const chunkLines: string[] = [];
    if (firstRest.trim()) chunkLines.push(firstRest);
    chunkLines.push(...lines.slice(lineI + 1, endLine));
    chunks.push([num, chunkLines.join("\n").trim()]);
  }
  return chunks;
}

export function parseDocument(raw: string): PassageUnit[] {
  return splitUnitChunks(raw).map(([n, body]) => parseUnitBody(n, body));
}

function mergePhase3(a: Phase3Block | null, b: Phase3Block | null): Phase3Block | null {
  if (!b) return a;
  if (!a) return phase3Effective(b);
  const merged: Phase3Block = {
    topic: (b.topic ?? "").trim() ? b.topic : a.topic,
    gist: (b.gist ?? "").trim() ? b.gist : a.gist,
    key_sentence: (b.key_sentence ?? "").trim() ? b.key_sentence : a.key_sentence,
    literal: (b.literal ?? "").trim() ? b.literal : a.literal,
  };
  return phase3Effective(merged);
}

export function mergeUnits(base: PassageUnit[], patchRaw: string): PassageUnit[] {
  const byNum = new Map(base.map((u) => [u.number, structuredClone(u)]));
  if (byNum.size === 0) return base;

  const patch = norm(patchRaw);
  const re = new RegExp(MERGE_UNIT_HEAD.source, MERGE_UNIT_HEAD.flags);
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(patch)) !== null) matches.push(m);

  const applyBody = (n: number, body: string) => {
    const u = byNum.get(n);
    if (!u) return;
    const [ph2, ph3, ph4] = parseTrailing(body);
    if (ph2) u.phase2 = ph2;
    if (ph3) u.phase3 = mergePhase3(u.phase3, ph3);
    if (ph4) u.phase4 = ph4;
  };

  if (!matches.length) {
    const firstN = Math.min(...byNum.keys());
    applyBody(firstN, patch);
    return [...byNum.values()].sort((a, b) => a.number - b.number);
  }

  for (let i = 0; i < matches.length; i++) {
    const n = parseInt(matches[i]![1]!, 10);
    const start = matches[i]!.index + matches[i]![0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index : patch.length;
    applyBody(n, patch.slice(start, end));
  }

  return [...byNum.values()].sort((a, b) => a.number - b.number);
}

export function countPhaseStats(units: PassageUnit[]): { n: number; p2: number; p3: number; p4: number } {
  const n = units.length;
  const p2 = units.filter((u) => u.phase2).length;
  const p3 = units.filter((u) => u.phase3).length;
  const p4 = units.filter((u) => u.phase4).length;
  return { n, p2, p3, p4 };
}

export function applyPhaseToggles(
  units: PassageUnit[],
  includePhase3: boolean,
  includePhase4: boolean,
): PassageUnit[] {
  return units.map((u) => {
    const c: PassageUnit = structuredClone(u);
    if (!includePhase3) c.phase3 = null;
    if (!includePhase4) c.phase4 = null;
    return c;
  });
}

export function unitToJsonRecord(u: PassageUnit): Record<string, unknown> {
  return {
    number: u.number,
    phase1: u.phase1,
    phase2: u.phase2,
    phase3: u.phase3,
    phase4: u.phase4,
  };
}
