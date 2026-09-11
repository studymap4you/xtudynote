import crypto from "node:crypto";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getProblemBankFirestore, problemBankSettings } from "./_lib/problem-bank/admin.mjs";

globalThis.pdfjsWorker = pdfjsWorker;

const TOKEN = "grade3-final-import";
const DATASET_ID = "xtudy-g3-final-11-variants-v2";
const DATASET_VERSION = "2026-09-11.1";
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const VALID_NUMBERS = new Set([
  ...Array.from({ length: 7 }, (_, index) => index + 18),
  ...Array.from({ length: 17 }, (_, index) => index + 29),
]);

const TYPE_BY_LABEL = Object.freeze({
  "어법": "grammar",
  "주제": "topic",
  "제목": "title",
  "어휘": "vocabulary",
  "함축의미추론": "implied_meaning",
  "함축 의미추론": "implied_meaning",
  "요약문완성": "summary",
  "요약문 완성": "summary",
  "빈칸추론": "blank_inference",
  "빈칸 추론": "blank_inference",
  "문장의 순서": "paragraph_order",
  "문장삽입": "sentence_insertion",
  "문장 삽입": "sentence_insertion",
  "전체 흐름과 무관한 문장": "irrelevant_sentence",
  "글의 흐름": "irrelevant_sentence",
  "내용일치": "factual_description",
  "내용 일치": "factual_description",
});

const STEM_BY_TYPE = Object.freeze({
  grammar: "다음 글의 굵게 표시된 부분 중, 어법상 틀린 것은?",
  topic: "다음 글의 주제로 가장 적절한 것은?",
  title: "다음 글의 제목으로 가장 적절한 것은?",
  vocabulary: "다음 글의 굵게 표시된 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
  implied_meaning: "다음 글에서 굵은 글씨로 강조된 부분이 의미하는 바로 가장 적절한 것은?",
  summary: "다음 글의 내용을 한 문장으로 요약할 때 빈칸에 들어갈 말로 가장 적절한 것은?",
  blank_inference: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
  paragraph_order: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
  sentence_insertion: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?",
  irrelevant_sentence: "다음 글에서 전체 흐름과 관계없는 문장은?",
  factual_description: "다음 글의 내용과 일치하지 않는 것은?",
});

const SESSIONS = Object.freeze([
  { year: 2025, month: 3, title: "2025년 3월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 5, title: "2025년 5월 고3 전국연합학력평가", organizer: "경기도교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 6, title: "2026학년도 6월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 7, title: "2025년 7월 고3 전국연합학력평가", organizer: "인천광역시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 9, title: "2026학년도 9월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 10, title: "2025년 10월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock", sets: 20, sourceProblems: 220, expanded: 253 },
  { year: 2025, month: 11, title: "2026학년도 대학수학능력시험", organizer: "한국교육과정평가원", examKind: "csat", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 3, title: "2026년 3월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 5, title: "2026년 5월 고3 전국연합학력평가", organizer: "경기도교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 6, title: "2027학년도 6월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 7, title: "2026년 7월 고3 전국연합학력평가", organizer: "인천광역시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
]);

const LABEL_PATTERN = Object.keys(TYPE_BY_LABEL)
  .sort((a, b) => b.length - a.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
  .join("|");
const MASTER_RE = /([0-9]{1,2}(?:\s*[~～-]\s*[0-9]{1,2})?)번(?:\s+공통지문)?\s*[·|]\s*MASTER PASSAGE/giu;
const QUESTION_RE = new RegExp(`(?:^|\\s)(?<raw>\\d{1,3})\\.\\s*\\[(?<label>${LABEL_PATTERN})\\]`, "giu");
const ANSWER_RE = new RegExp(`(?:^|\\s)(?<raw>\\d{1,3})\\.\\s*\\[(?<label>${LABEL_PATTERN})\\]\\s*정답\\s*(?<answer>[①②③④⑤])`, "giu");

function clean(value, max = 100000) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\u0000/gu, " ")
    .replace(/[\t\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}
function sha(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function examId(year, month) { return `exam_english_g3_${year}_${String(month).padStart(2, "0")}`; }
function sessionKey(year, month) { return `g3-${year}-${String(month).padStart(2, "0")}`; }
function configFromKey(value) {
  const match = /^g3-(2025|2026)-(03|05|06|07|09|10|11)$/u.exec(clean(value, 40));
  if (!match) return null;
  return SESSIONS.find((session) => session.year === Number(match[1]) && session.month === Number(match[2])) || null;
}
function numbersFrom(label) {
  const numbers = String(label).match(/\d{1,2}/gu)?.map(Number) || [];
  if (numbers.length === 1) return numbers;
  if (numbers.length === 2 && numbers[1] >= numbers[0]) return Array.from({ length: numbers[1] - numbers[0] + 1 }, (_, i) => numbers[0] + i);
  return [];
}
function stripPageHeader(text) {
  return String(text)
    .split(/\r?\n/u)
    .filter((line) => !line.trim().startsWith("Xtudy Universe"))
    .join("\n");
}
function compact(value) {
  return clean(String(value).replace(/\[\[PAGE_\d+\]\]/gu, " "));
}
function pageAt(text, offset) {
  const matches = [...text.slice(0, offset).matchAll(/\[\[PAGE_(\d+)\]\]/gu)];
  return matches.length ? Number(matches.at(-1)[1]) : 1;
}
function removeStem(block) {
  let value = compact(String(block).split(/\s*문항\s*코드\s*:/u)[0]);
  const candidates = [];
  for (const pattern of [
    /\[주어진 문장\]/u,
    /\[주어진 글\]/u,
    /\bDear\b/u,
    /\bTo Whom\b/u,
    /\bTo whom\b/u,
    /“/u,
    /"/u,
    /(?<![A-Za-z])[A-Za-z][A-Za-z'’\-]{1,}/u,
  ]) {
    const match = pattern.exec(value);
    if (match) candidates.push(match.index);
  }
  if (candidates.length) return value.slice(Math.min(...candidates)).trim();
  const questionMark = value.indexOf("?");
  return (questionMark >= 0 ? value.slice(questionMark + 1) : value).trim();
}
function parseInline(block) {
  let passage = removeStem(block);
  passage = passage.replace(/\s*①\s*②\s*③\s*④\s*⑤\s*$/u, "").trim();
  return { passage, choices: [...CIRCLED] };
}
function parseNormal(block) {
  const body = removeStem(block);
  const markers = [...body.matchAll(/[①②③④⑤]/gu)];
  if (markers.length < 5) return { passage: body, choices: [] };
  const tail = markers.slice(-5);
  if (tail.map((match) => match[0]).join("") !== CIRCLED.join("")) return { passage: body, choices: [] };
  const choices = tail.map((match, index) => clean(body.slice(
    Number(match.index) + 1,
    index < 4 ? Number(tail[index + 1].index) : body.length,
  ), 4000));
  return { passage: clean(body.slice(0, Number(tail[0].index)), 30000), choices };
}
function impliedTarget(explanation) {
  const match = clean(explanation, 12000).match(/(?:굵게\s*표시된|굵은\s*글씨로\s*강조된|강조된)\s*[‘'“"]([^’'”"]{2,220})[’'”"]/u);
  return match?.[1]?.trim() || "";
}
function emphasisRanges(passage, type, explanation) {
  if (type === "implied_meaning") {
    const target = impliedTarget(explanation);
    const start = target ? passage.indexOf(target) : -1;
    return start >= 0 ? [{ target: "passage", start, end: start + target.length, style: "bold", source: "explanation-target" }] : [];
  }
  if (!["grammar", "vocabulary"].includes(type)) return [];
  const ranges = [];
  for (let i = 0; i < CIRCLED.length; i += 1) {
    const marker = CIRCLED[i];
    const hits = [...passage.matchAll(new RegExp(marker, "gu"))];
    if (hits.length !== 1) continue;
    const base = Number(hits[0].index) + 1;
    const tail = passage.slice(base);
    if (type === "vocabulary") {
      const match = /^\s*([A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)*)/u.exec(tail);
      if (!match) continue;
      const start = base + match[0].indexOf(match[1]);
      ranges.push({ target: "passage", start, end: start + match[1].length, style: "bold", source: "marker-word" });
    } else {
      const match = /^\s*((?:[A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)?(?:\s+|$)){1,4})/u.exec(tail);
      if (!match) continue;
      const phrase = match[1].trim();
      if (!phrase) continue;
      const start = base + match[0].indexOf(match[1]);
      ranges.push({ target: "passage", start, end: start + phrase.length, style: "bold", source: "marker-phrase" });
    }
  }
  return ranges;
}
function ensureDomGlobals() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init.slice(0, 6).map(Number);
      }
      multiplySelf(other) {
        const o = other || new globalThis.DOMMatrix();
        const a = this.a * o.a + this.c * o.b;
        const b = this.b * o.a + this.d * o.b;
        const c = this.a * o.c + this.c * o.d;
        const d = this.b * o.c + this.d * o.d;
        const e = this.a * o.e + this.c * o.f + this.e;
        const f = this.b * o.e + this.d * o.f + this.f;
        Object.assign(this, { a, b, c, d, e, f });
        return this;
      }
      preMultiplySelf(other) { const result = new globalThis.DOMMatrix([other?.a ?? 1, other?.b ?? 0, other?.c ?? 0, other?.d ?? 1, other?.e ?? 0, other?.f ?? 0]); result.multiplySelf(this); Object.assign(this, result); return this; }
      translateSelf(tx = 0, ty = 0) { return this.multiplySelf(new globalThis.DOMMatrix([1, 0, 0, 1, Number(tx), Number(ty)])); }
      scaleSelf(sx = 1, sy = sx) { return this.multiplySelf(new globalThis.DOMMatrix([Number(sx), 0, 0, Number(sy), 0, 0])); }
      rotateSelf(angle = 0) { const r = Number(angle) * Math.PI / 180; return this.multiplySelf(new globalThis.DOMMatrix([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0])); }
      inverse() { const det = this.a * this.d - this.b * this.c; if (!det) return new globalThis.DOMMatrix(); return new globalThis.DOMMatrix([this.d / det, -this.b / det, -this.c / det, this.a / det, (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det]); }
      invertSelf() { Object.assign(this, this.inverse()); return this; }
      transformPoint(point = { x: 0, y: 0 }) { return { x: this.a * Number(point.x || 0) + this.c * Number(point.y || 0) + this.e, y: this.b * Number(point.x || 0) + this.d * Number(point.y || 0) + this.f }; }
    };
  }
  if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = class ImageData {};
  if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = class Path2D { addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} closePath() {} };
}
async function driveToken() {
  const serviceAccount = problemBankSettings().serviceAccount;
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) throw new Error("service-account-unavailable");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT" });
  const body = encode({ iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3500 });
  const unsigned = `${header}.${body}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), serviceAccount.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) {
    const fallback = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    });
    if (!fallback.ok) throw new Error(`drive-token-${fallback.status}`);
    return (await fallback.json()).access_token;
  }
  return (await response.json()).access_token;
}
async function drivePdf(fileId) {
  const token = await driveToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`drive-fetch-${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function extractText(bytes) {
  ensureDomGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const raw = content.items.map((item) => item && "str" in item ? item.str : "").join("\n");
    pages.push(`\n[[PAGE_${pageNumber}]]\n${stripPageHeader(raw)}`);
  }
  return { text: pages.join("\n"), pageCount: pdf.numPages };
}
function parseSegment(segment, sourceLabel, config) {
  let boundary = segment.indexOf("정답 및 상세 해설");
  if (boundary < 0) boundary = segment.indexOf("정답 및 해설");
  const questionPart = boundary >= 0 ? segment.slice(0, boundary) : segment;
  const answerPart = boundary >= 0 ? segment.slice(boundary) : "";
  const questionMatches = [...questionPart.matchAll(QUESTION_RE)].slice(0, 11);
  const answerMatches = [...answerPart.matchAll(ANSWER_RE)].slice(0, 11);
  const answers = answerMatches.map((match, index) => {
    const end = index + 1 < answerMatches.length ? Number(answerMatches[index + 1].index) : answerPart.length;
    return {
      answer: CIRCLED.indexOf(match.groups.answer) + 1,
      explanation: compact(answerPart.slice(Number(match.index) + match[0].length, end)),
    };
  });
  return questionMatches.map((match, index) => {
    const end = index + 1 < questionMatches.length ? Number(questionMatches[index + 1].index) : questionPart.length;
    const label = clean(match.groups.label, 80);
    const type = TYPE_BY_LABEL[label];
    const block = questionPart.slice(Number(match.index) + match[0].length, end);
    const parsed = ["grammar", "vocabulary", "sentence_insertion", "irrelevant_sentence"].includes(type) ? parseInline(block) : parseNormal(block);
    const answer = answers[index] || {};
    const ranges = emphasisRanges(parsed.passage, type, answer.explanation || "");
    return {
      baseQuestionId: `G3-${config.year}-${String(config.month).padStart(2, "0")}-${sourceLabel}-${String(index + 1).padStart(2, "0")}`,
      questionType: type,
      subtype: label,
      passage: parsed.passage,
      question: STEM_BY_TYPE[type],
      choices: parsed.choices,
      answer: answer.answer,
      explanation: answer.explanation || "",
      sourcePageNumber: pageAt(segment, Number(match.index)),
      emphasisRanges: ranges,
      formattingVersion: "grade3-final-import-v2",
      formattingFingerprint: sha(JSON.stringify({ passage: parsed.passage, ranges })),
    };
  });
}
async function parsePdf(bytes, config, sourceFileName) {
  const extracted = await extractText(bytes);
  const masters = [...extracted.text.matchAll(MASTER_RE)];
  const sources = masters.map((match, index) => {
    const sourceLabel = String(match[1]).replace(/\s+/gu, "").replace(/[～-]/gu, "~");
    const segment = extracted.text.slice(Number(match.index), index + 1 < masters.length ? Number(masters[index + 1].index) : extracted.text.length);
    return { sourceLabel, numbers: numbersFrom(sourceLabel), problems: parseSegment(segment, sourceLabel, config) };
  }).filter((source) => source.numbers.length);
  return { sourceFileName, pageCount: extracted.pageCount, sources };
}
async function ensureExams(db) {
  const batch = db.batch();
  for (const session of SESSIONS) {
    const id = examId(session.year, session.month);
    batch.set(db.collection("exams").doc(id), { id, year: session.year, grade: 3, month: session.month, subject: "english", title: session.title, organizer: session.organizer, examKind: session.examKind, problemBankReady: false, variantBankExpected: true }, { merge: true });
  }
  await batch.commit();
  return { examCount: SESSIONS.length, problemBankReady: false };
}
async function importDrive(req, db) {
  const config = configFromKey(req.query?.session);
  const fileId = clean(req.query?.fileId, 160);
  const sourceFileName = clean(req.query?.fileName, 240) || `drive-${fileId}.pdf`;
  if (!config || !fileId) throw Object.assign(new Error("import-params-invalid"), { statusCode: 400 });
  const parsed = await parsePdf(await drivePdf(fileId), config, sourceFileName);
  const sourceProblems = parsed.sources.reduce((sum, source) => sum + source.problems.length, 0);
  const expanded = parsed.sources.reduce((sum, source) => sum + source.numbers.length * source.problems.length, 0);
  if (parsed.sources.length !== config.sets || sourceProblems !== config.sourceProblems || expanded !== config.expanded) {
    throw Object.assign(new Error(`parse-count-invalid:${parsed.sources.length}/${sourceProblems}/${expanded}`), { statusCode: 409 });
  }
  const id = examId(config.year, config.month);
  const now = new Date();
  const batch = db.batch();
  const answerDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let imported = 0;
  let emphasizedProblems = 0;
  for (const source of parsed.sources) {
    if (source.problems.length !== 11) throw new Error(`source-problem-count:${source.sourceLabel}`);
    for (const problem of source.problems) {
      if (problem.choices.length !== 5 || !Number.isInteger(problem.answer) || problem.answer < 1 || problem.answer > 5 || problem.passage.length < 80 || problem.explanation.length < 20) {
        throw new Error(`problem-invalid:${problem.baseQuestionId}:${problem.choices.length}/${problem.answer}/${problem.passage.length}/${problem.explanation.length}`);
      }
      answerDistribution[problem.answer] += 1;
      if (problem.emphasisRanges.length) emphasizedProblems += 1;
      for (const rawNumber of source.numbers) {
        const number = Number(rawNumber);
        if (!VALID_NUMBERS.has(number)) throw new Error(`number-invalid:${number}`);
        const questionId = `${problem.baseQuestionId}-Q${String(number).padStart(2, "0")}`;
        const docId = `problem_${sha(questionId).slice(0, 32)}`;
        batch.set(db.collection("problems").doc(docId), {
          questionId,
          subject: "english",
          language: "en",
          examFamily: config.examKind === "csat" ? "csat" : "mock_exam",
          grade: 12,
          schoolGrade: 3,
          examYear: config.year,
          examMonth: config.month,
          examQuestionNumbers: source.numbers,
          questionType: problem.questionType,
          subtype: problem.subtype,
          difficulty: 4,
          sourceId: `xtudy-g3-${config.year}-${String(config.month).padStart(2, "0")}-${source.sourceLabel}`,
          passage: problem.passage,
          question: problem.question,
          choices: problem.choices,
          answer: problem.answer,
          explanation: problem.explanation,
          emphasisRanges: problem.emphasisRanges,
          formattingVersion: problem.formattingVersion,
          formattingFingerprint: problem.formattingFingerprint,
          conceptTags: [problem.questionType, "grade-3", "high-school-english"],
          skillTags: [problem.questionType, config.examKind === "csat" ? "csat-variant" : "mock-exam-variant", `${config.year}-${String(config.month).padStart(2, "0")}`],
          qualityScore: 95,
          status: "approved",
          validation: { answerPresent: true, explanationPresent: true, structurallyValid: true, issues: [], sourceVerified: true, parserVersion: DATASET_VERSION },
          generator: { provider: "xtudy-universe", model: "source-pdf", version: DATASET_VERSION },
          datasetId: DATASET_ID,
          datasetVersion: DATASET_VERSION,
          sourceFileName: parsed.sourceFileName,
          sourcePageNumber: problem.sourcePageNumber,
          sourcePassageLabel: source.sourceLabel,
          duplicateIndex: 1,
          examId: id,
          sourceExamId: id,
          examQuestionNumber: number,
          originalQuestionNumber: number,
          sourceQuestionNumber: number,
          metadata: { examId: id, questionNumber: number, sourcePassageLabel: source.sourceLabel },
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
        imported += 1;
      }
    }
  }
  if (imported !== config.expanded) throw new Error(`expanded-count-invalid:${imported}`);
  await batch.commit();
  await db.collection("exams").doc(id).set({ problemBankReady: false, variantBankExpected: true, problemBankDatasetId: DATASET_ID, problemBankDatasetVersion: DATASET_VERSION }, { merge: true });
  return { session: sessionKey(config.year, config.month), examId: id, pageCount: parsed.pageCount, masterSets: parsed.sources.length, sourceProblems, imported, emphasizedProblems, answerDistribution, problemBankReady: false };
}
async function auditSession(db, config) {
  const id = examId(config.year, config.month);
  const exam = await db.collection("exams").doc(id).get();
  const snapshot = await db.collection("problems").where("examId", "==", id).limit(600).get();
  const docs = snapshot.docs.map((doc) => doc.data() || {}).filter((problem) => problem.datasetId === DATASET_ID && problem.status === "approved");
  const buckets = {};
  for (const problem of docs) {
    const key = `${Number(problem.examQuestionNumber)}:${clean(problem.questionType, 80)}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const expectedNumbers = [...VALID_NUMBERS].filter((number) => !(config.year === 2025 && config.month === 10 && number === 20));
  const missing = [];
  for (const number of expectedNumbers) {
    for (const type of Object.values(TYPE_BY_LABEL).filter((value, index, values) => values.indexOf(value) === index)) {
      const count = buckets[`${number}:${type}`] || 0;
      if (count !== 1) missing.push(`${number}:${type}:${count}`);
    }
  }
  return { session: sessionKey(config.year, config.month), examId: id, examExists: exam.exists, problemBankReady: exam.exists ? Boolean(exam.data()?.problemBankReady) : false, approvedDatasetProblems: docs.length, expectedExpanded: config.expanded, missing: missing.slice(0, 100), valid: docs.length === config.expanded && missing.length === 0 };
}
async function markReady(db, config) {
  const audit = await auditSession(db, config);
  if (!audit.valid) throw Object.assign(new Error(`audit-not-ready:${JSON.stringify(audit)}`), { statusCode: 409 });
  await db.collection("exams").doc(audit.examId).set({ problemBankReady: true, variantBankExpected: true, problemBankVerifiedAt: new Date(), problemBankDatasetId: DATASET_ID, problemBankDatasetVersion: DATASET_VERSION }, { merge: true });
  return { ...audit, problemBankReady: true };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" || clean(req.query?.token, 100) !== TOKEN) return res.status(404).json({ error: "not-found" });
  const action = clean(req.query?.action, 40);
  const db = getProblemBankFirestore();
  try {
    if (action === "identity") return res.status(200).json({ clientEmail: problemBankSettings().serviceAccount?.client_email || null, datasetId: DATASET_ID, datasetVersion: DATASET_VERSION });
    if (action === "ensure-exams") return res.status(200).json(await ensureExams(db));
    if (action === "import-drive") return res.status(200).json(await importDrive(req, db));
    if (action === "audit-all") {
      const sessions = [];
      for (const session of SESSIONS) sessions.push(await auditSession(db, session));
      return res.status(200).json({ datasetId: DATASET_ID, datasetVersion: DATASET_VERSION, sessions });
    }
    if (action === "ready") {
      const config = configFromKey(req.query?.session);
      if (!config) return res.status(400).json({ error: "session-invalid" });
      return res.status(200).json(await markReady(db, config));
    }
    return res.status(400).json({ error: "action-invalid" });
  } catch (error) {
    console.error("[temporary-g3-final-import]", error);
    return res.status(Number(error?.statusCode) || 500).json({ error: clean(error instanceof Error ? error.message : error, 1000) });
  }
}
