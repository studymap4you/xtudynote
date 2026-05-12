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
/** 시험지 형식: 단독 줄 `[문제 19]` 도 문항 시작으로 인식 (해설 뒤에 붙는 것 방지) */
const PROBLEM_BRACKET = /^\s*\[\s*문제\s*(\d+)\s*\]\s*(.*)$/i;
const CHOICE_LINE = /^\s*([①②③④⑤])\s*[.．]?\s*(.*)$/;

const CIRCLE_TO_NUM: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
const MERGE_UNIT_HEAD = /\[\s*문제\s*(\d+)\s*\]/gi;

function normalizeBracketAnchors(s: string): string {
  return s
    .replace(/\uff3b/g, "[")
    .replace(/\uff3d/g, "]")
    .replace(/【/g, "[")
    .replace(/】/g, "]");
}

const ANCHOR_PATTERNS: [string, RegExp][] = [
  ["phase2_se", /\[\s*정답\s*및\s*해설\s*\]/gi],
  ["phase2_short", /\[\s*정답\s*\]/gi],
  ["phase2_expl", /\[\s*해설\s*\]/gi],
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

function findFirstAnchorStart(text: string): number {
  let min = -1;
  for (const [, pat] of ANCHOR_PATTERNS) {
    const p = new RegExp(pat.source, pat.flags);
    const m = p.exec(text);
    if (m && (min < 0 || m.index < min)) min = m.index;
  }
  return min;
}

function fallbackPhase2(text: string): Phase2Block | null {
  const t = text.trim();
  if (!t) return null;
  const ansM = t.match(/(?:정답|답)\s*[:：]?\s*([①②③④⑤1-5])/);
  if (ansM?.[1]) {
    const token = ansM[1];
    let ans = parseInt(CIRCLE_TO_NUM[token] ?? token, 10);
    if (Number.isNaN(ans)) ans = 1;
    const idx = ansM.index ?? 0;
    let expl = t.slice(idx + ansM[0].length).trim();
    expl = expl.replace(/^\s*(?:해설|설명)\s*[:：]?\s*/m, "").trim() || t.slice(idx).trim();
    return { answer: ans, explanation: expl || t };
  }
  const explOnly = t.match(/^\s*해설\s*[:：]?\s*([\s\S]*)$/m);
  if (explOnly?.[1]?.trim()) {
    return { answer: 1, explanation: explOnly[1].trim() };
  }
  return null;
}

function parseTrailing(text: string): [Phase2Block | null, Phase3Block | null, Phase4Block | null] {
  const normalized = normalizeBracketAnchors(text);
  if (!normalized.trim()) return [null, null, null];

  const matches: { start: number; end: number; kind: string }[] = [];
  for (const [kind, pat] of ANCHOR_PATTERNS) {
    const p = new RegExp(pat.source, pat.flags);
    let m: RegExpExecArray | null;
    while ((m = p.exec(normalized)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, kind });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const segs: Record<string, string> = {};
  const p2Parts: string[] = [];

  for (let idx = 0; idx < matches.length; idx++) {
    const { end, kind } = matches[idx]!;
    const contentStart = end;
    const contentEnd = idx + 1 < matches.length ? matches[idx + 1]!.start : normalized.length;
    let chunk = normalized.slice(contentStart, contentEnd).trim();
    if (kind.startsWith("phase2_")) {
      if (chunk) p2Parts.push(chunk);
      continue;
    }
    if (segs[kind] !== undefined) segs[kind] = `${segs[kind]}\n${chunk}`.trim();
    else segs[kind] = chunk;
  }

  let p2Raw = p2Parts.join("\n\n").trim();
  let phase2: Phase2Block | null = null;
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
  if (!phase2) phase2 = fallbackPhase2(normalized);

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

/** 선택지 없는 블록을 해설(phase2)로 올릴지 — [출제의도], 기존 해설 앵커류, 한글이 실린 비어 있지 않은 줄 3줄 이상 */
function shouldPromoteNoChoiceBlob(blob: string): boolean {
  const t = blob.trim();
  if (!t) return false;
  if (
    /\[\s*정답|정답\s*및\s*해설|\[\s*해설|^\s*해설\s*[:：]?|\[\s*출제의도\s*\]/im.test(t)
  ) {
    return true;
  }
  const hangul = /[\uAC00-\uD7A3]/;
  const hangulLines = norm(t)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && hangul.test(l)).length;
  return hangulLines >= 3;
}

function looksLikeExplanationOnlyUnit(u: PassageUnit): boolean {
  const blob = `${u.phase1.stem}\n${u.phase1.passage}`.trim();
  if (!blob) return false;
  return shouldPromoteNoChoiceBlob(blob);
}

function maybePromoteNoChoiceExplanation(u: PassageUnit): PassageUnit {
  if (Object.keys(u.phase1.choices).length > 0) return u;
  const stem = u.phase1.stem ?? "";
  const passage = u.phase1.passage ?? "";
  const blob = `${stem}\n${passage}`.trim();
  if (!blob || !shouldPromoteNoChoiceBlob(blob)) return u;

  const explanation = blob;
  const phase2: Phase2Block = u.phase2
    ? {
        answer: u.phase2.answer,
        explanation: `${explanation}\n\n${u.phase2.explanation}`.trim(),
      }
    : { answer: 1, explanation };

  return {
    ...u,
    phase1: { ...u.phase1, stem: "", passage: "" },
    phase2,
  };
}

function isNonEmptyUnit(u: PassageUnit): boolean {
  const p1 = u.phase1;
  const hasP1 =
    (p1.stem ?? "").trim() !== "" ||
    (p1.passage ?? "").trim() !== "" ||
    Object.keys(p1.choices).length > 0;
  const hasRest = Boolean(u.phase2 ?? u.phase3 ?? u.phase4);
  return hasP1 || hasRest;
}

function mergeDetachedExplanations(units: PassageUnit[]): PassageUnit[] {
  const out: PassageUnit[] = [];
  for (const u of units) {
    if (!out.length) {
      out.push(u);
      continue;
    }
    const prev = out[out.length - 1]!;
    const noChoices = Object.keys(u.phase1.choices).length === 0;
    const prevHasChoices = Object.keys(prev.phase1.choices).length > 0;
    const attach = noChoices && prevHasChoices && (u.phase2 != null || looksLikeExplanationOnlyUnit(u));
    if (attach) {
      if (u.phase2) {
        if (!prev.phase2) prev.phase2 = structuredClone(u.phase2);
        else {
          prev.phase2 = {
            answer: prev.phase2.answer,
            explanation: `${prev.phase2.explanation}\n\n${u.phase2.explanation}`.trim(),
          };
        }
      } else {
        const blob = `${u.phase1.stem}\n${u.phase1.passage}`.trim();
        if (blob) {
          const block: Phase2Block = { answer: 1, explanation: blob };
          if (!prev.phase2) prev.phase2 = block;
          else {
            prev.phase2 = {
              answer: prev.phase2.answer,
              explanation: `${prev.phase2.explanation}\n\n${block.explanation}`.trim(),
            };
          }
        }
      }
      if (u.phase3) prev.phase3 = mergePhase3(prev.phase3, u.phase3);
      if (u.phase4) prev.phase4 = u.phase4;
      continue;
    }
    out.push(u);
  }
  return out;
}

export function renumberUnits(units: PassageUnit[]): PassageUnit[] {
  return units.map((u, i) => {
    const n = i + 1;
    return {
      ...u,
      number: n,
      phase1: { ...u.phase1, number: n },
    };
  });
}

/** 빈 문항(모듈 단계에서 수동 추가용) */
export function emptyPassageUnit(): PassageUnit {
  return {
    number: 1,
    phase1: { number: 1, stem: "", passage: "", choices: {} },
    phase2: null,
    phase3: null,
    phase4: null,
  };
}

function parseUnitBody(number: number, body: string): PassageUnit {
  const normBody = normalizeBracketAnchors(norm(body));
  const lines = normBody.split("\n");
  let choiceIdx: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (CHOICE_LINE.test(lines[i])) {
      choiceIdx = i;
      break;
    }
  }
  let unit: PassageUnit;
  if (choiceIdx === null) {
    const fullText = lines.join("\n").trim();
    const anchorAt = findFirstAnchorStart(fullText);
    if (anchorAt >= 0) {
      const preamble = fullText.slice(0, anchorAt).trim();
      const preambleLines = preamble ? preamble.split("\n") : [];
      const [stem, passage] = splitStemPassage(preambleLines);
      const fromAnchor = fullText.slice(anchorAt);
      const [ph2, ph3, ph4] = parseTrailing(fromAnchor);
      unit = {
        number,
        phase1: { number, stem, passage, choices: {} },
        phase2: ph2,
        phase3: ph3,
        phase4: ph4,
      };
    } else {
      const [stem, passage] = splitStemPassage(lines);
      const [ph2, ph3, ph4] = parseTrailing(fullText);
      unit = {
        number,
        phase1: { number, stem, passage, choices: {} },
        phase2: ph2,
        phase3: ph3,
        phase4: ph4,
      };
    }
  } else {
    const preamble = lines.slice(0, choiceIdx);
    const [stem, passage] = splitStemPassage(preamble);
    const [choices, endCi] = parseChoices(lines, choiceIdx);
    const trailing = lines.slice(endCi).join("\n").trim();
    const [ph2, ph3, ph4] = parseTrailing(trailing);
    unit = {
      number,
      phase1: { number, stem, passage, choices },
      phase2: ph2,
      phase3: ph3,
      phase4: ph4,
    };
  }
  return maybePromoteNoChoiceExplanation(unit);
}

export function splitUnitChunks(text: string): [number, string][] {
  text = normalizeBracketAnchors(norm(text));
  const lines = text.split("\n");
  const heads: [number, number, string][] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m = line.match(PROBLEM_START);
    if (m) {
      heads.push([i, parseInt(m[1]!, 10), m[2] ?? ""]);
      continue;
    }
    m = line.match(PROBLEM_BRACKET);
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
  let units = splitUnitChunks(raw)
    .filter(([, body]) => body.trim().length > 0)
    .map(([n, body]) => parseUnitBody(n, body));
  units = mergeDetachedExplanations(units);
  units = units.filter(isNonEmptyUnit);
  units = renumberUnits(units);
  return units;
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
