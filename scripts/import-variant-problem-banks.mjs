#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const MAIN_PROJECT_ID = "xtudynote";
const PROBLEM_BANK_PROJECT_ID = "xstudy-problem-bank";
const STORAGE_BUCKET = "xtudynote.firebasestorage.app";
const DATASET_ID = "high-school-variant-problem-bank-v1";
const DATASET_VERSION = "2026-08-26.2";
const WORKBOOKS_PER_GRADE = 10;
const QUESTIONS_PER_WORKBOOK = 50;
const WORK_ROOT = path.resolve("tmp/variant-problem-bank");
const OUTPUT_ROOT = path.resolve("output/pdf");
const SOURCE_ROOT = process.env.VARIANT_PROBLEM_BANK_SOURCE_ROOT
  || path.join(process.env.HOME || "", "Downloads");

const gradeSources = [
  {
    grade: 1,
    schoolGrade: 10,
    fileName: "문제은행_고1.pdf",
    expectedPassages: 1009,
    expectedQuestions: 19171,
  },
  {
    grade: 2,
    schoolGrade: 11,
    fileName: "문제은행_고2.pdf",
    expectedPassages: 1006,
    expectedQuestions: 19114,
  },
  {
    grade: 3,
    schoolGrade: 12,
    fileName: "문제은행_고3.pdf",
    expectedPassages: 852,
    expectedQuestions: 16188,
  },
];

const styleReference = {
  fileName: "수능특강 영어 변형문제[1강~30강].pdf",
  archiveId: "variant-workbook-style-reference-v1",
};

const questionTypeByNumber = Object.freeze({
  1: "purpose",
  2: "emotion_change",
  3: "claim",
  4: "main_idea",
  5: "title",
  6: "topic",
  7: "factual_description",
  8: "grammar",
  9: "vocabulary",
  10: "implied_meaning",
  11: "blank_short",
  12: "blank_long",
  13: "irrelevant_sentence",
  14: "paragraph_order",
  15: "sentence_insertion",
  16: "summary",
  17: "writing_reorder",
  18: "writing_conditional",
  19: "grammar_correction",
});

const questionTypeLabel = Object.freeze({
  purpose: "글의 목적",
  emotion_change: "심경 변화",
  claim: "필자의 주장",
  main_idea: "글의 요지",
  title: "글의 제목",
  topic: "글의 주제",
  factual_description: "내용 일치",
  grammar: "어법",
  vocabulary: "어휘",
  implied_meaning: "함축 의미",
  blank_short: "빈칸 추론",
  blank_long: "빈칸 추론",
  irrelevant_sentence: "무관한 문장",
  paragraph_order: "글의 순서",
  sentence_insertion: "문장 삽입",
  summary: "요약문 완성",
  writing_reorder: "어구 배열",
  writing_conditional: "조건 영작",
  grammar_correction: "어법 오류 수정",
});

const args = new Set(process.argv.slice(2));
const shouldImport = args.has("--import");
const shouldVerify = args.has("--verify");
const shouldPublishMain = args.has("--publish-main");
const shouldPrepare = args.has("--prepare")
  || (!shouldImport && !shouldVerify && !shouldPublishMain);

function clean(value, maxLength = 100_000) {
  return String(value ?? "")
    .replace(/\u0000/gu, " ")
    .replace(/[\t\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function comparable(value) {
  return clean(value, 200_000)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "")
    .trim();
}

function words(value) {
  return clean(value, 200_000)
    .normalize("NFKC")
    .toLowerCase()
    .match(/[a-z]+(?:[-'][a-z]+)*|[가-힣]+|\d+/gu) || [];
}

function wordCount(value) {
  return (clean(value).match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/gu) || []).length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeFileName(value) {
  return clean(value, 180).normalize("NFC").replace(/[^\w.\-가-힣]+/gu, "_") || "file.pdf";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function docId(namespace, permanentId) {
  return `${namespace}_${sha256(`${namespace}:${permanentId}`).slice(0, 32)}`;
}

function storagePathForGrade(grade) {
  return `problem-bank-sources/variant/grade${grade}/problem-bank.pdf`;
}

function workbookPathForGrade(grade, volume) {
  return path.join(
    OUTPUT_ROOT,
    `xstudy-grade${grade}-english-variant-workbook-${String(volume).padStart(2, "0")}-50.pdf`,
  );
}

function workbookStoragePath(grade, volume) {
  return `contents/system-variant-workbooks/grade${grade}/xstudy-variant-50-volume${String(volume).padStart(2, "0")}-v1.pdf`;
}

function workbookContentDocumentPath(grade, volume) {
  return volume === 1
    ? `contents/variant-workbook-grade${grade}-v1`
    : `contents/variant-workbook-grade${grade}-volume${String(volume).padStart(2, "0")}-v1`;
}

async function resolveSourceFile(fileName) {
  const direct = path.join(SOURCE_ROOT, fileName);
  const directStat = await stat(direct).catch(() => null);
  if (directStat?.isFile()) return direct;
  throw new Error(`Source PDF was not found: ${direct}`);
}

function splitSentences(value) {
  return (clean(value).match(/[^.!?]+[.!?]+(?:[”’"']+)?|[^.!?]+$/gu) || [])
    .map((item) => clean(item))
    .filter(Boolean);
}

function tokenOverlapScore(candidate, passage) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "was", "were",
    "it", "this", "that", "as", "by", "from", "at", "be", "been", "being", "about", "into", "their", "they",
    "his", "her", "we", "you", "i", "its", "not", "can", "may", "will", "would", "have", "has", "had",
  ]);
  const passageTokens = words(passage);
  const passageCounts = new Map();
  passageTokens.forEach((token) => passageCounts.set(token, (passageCounts.get(token) || 0) + 1));
  const candidateTokens = unique(words(candidate).filter((token) => token.length > 2 && !stop.has(token)));
  if (!candidateTokens.length) return 0;
  const matched = candidateTokens.reduce((sum, token) => sum + Math.min(2, passageCounts.get(token) || 0), 0);
  return matched / (candidateTokens.length * 2);
}

function choiceResult(choices, scores, evidence, baseConfidence = 0.82) {
  if (choices.length !== 5 || scores.length !== choices.length) {
    return { answer: 0, confidence: 0, evidence: "선지 구조를 복원하지 못했습니다." };
  }
  const ranked = scores
    .map((score, index) => ({ score, index }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const margin = ranked[0].score - ranked[1].score;
  const confidence = Math.min(0.99, baseConfidence + Math.max(0, margin) * 0.4);
  return { answer: ranked[0].index + 1, confidence, evidence };
}

function parseChoices(raw, questionNumber) {
  if (questionNumber >= 17) return { stem: clean(raw), choices: [] };
  if (questionNumber === 13) {
    const boundary = raw.lastIndexOf("① 문장");
    return {
      stem: clean(boundary >= 0 ? raw.slice(0, boundary) : raw),
      choices: ["문장 ①", "문장 ②", "문장 ③", "문장 ④", "문장 ⑤"],
    };
  }
  if (questionNumber === 15) {
    const boundary = raw.lastIndexOf("① 위치");
    return {
      stem: clean(boundary >= 0 ? raw.slice(0, boundary) : raw),
      choices: ["위치 ①", "위치 ②", "위치 ③", "위치 ④", "위치 ⑤"],
    };
  }
  const markers = [...raw.matchAll(/[①②③④⑤]/gu)];
  const start = markers.findIndex((match, index) => match[0] === "①"
    && markers.slice(index, index + 5).map((item) => item[0]).join("") === "①②③④⑤");
  if (start < 0) return { stem: clean(raw), choices: [] };
  const group = markers.slice(start, start + 5);
  const choices = group.map((marker, index) => {
    const from = Number(marker.index) + marker[0].length;
    const to = index < 4 ? Number(group[index + 1].index) : raw.length;
    return clean(raw.slice(from, to), 8_000);
  });
  return { stem: clean(raw.slice(0, Number(group[0].index)), 20_000), choices };
}

function exactSourceChoice(choices, passage) {
  const passageComparable = comparable(passage);
  const scores = choices.map((choice) => {
    const normalized = comparable(choice);
    if (!normalized) return 0;
    if (passageComparable.includes(normalized)) return 1;
    return tokenOverlapScore(choice, passage) * 0.75;
  });
  return choiceResult(choices, scores, "정답 선지는 원문에 직접 확인되는 문장 또는 핵심 진술입니다.", 0.87);
}

function keywordChoice(choices, passage, label) {
  const scores = choices.map((choice) => tokenOverlapScore(choice, passage));
  return choiceResult(choices, scores, `${label} 선지의 핵심어가 원문의 중심 어휘와 가장 일관되게 연결됩니다.`, 0.78);
}

function emotionChoice(choices, passage) {
  const passageLower = clean(passage).toLowerCase();
  const emotionVocabulary = unique(choices.flatMap((choice) => words(choice)))
    .filter((token) => !["no", "explicit", "emotion", "change"].includes(token));
  const hasExplicitEmotion = emotionVocabulary.some((token) => passageLower.includes(token));
  const scores = choices.map((choice) => {
    const normalized = clean(choice).toLowerCase();
    if (normalized.includes("no explicit") && !hasExplicitEmotion) return 2;
    const pair = normalized.split(/→|->/u).map((item) => clean(item).toLowerCase());
    if (pair.length !== 2) return 0;
    const left = passageLower.indexOf(pair[0]);
    const right = passageLower.lastIndexOf(pair[1]);
    return (left >= 0 ? 1 : 0) + (right >= 0 ? 1 : 0) + (left >= 0 && right > left ? 0.5 : 0);
  });
  return choiceResult(choices, scores, "초기와 마지막의 감정 표현을 원문의 등장 순서대로 대조했습니다.", 0.74);
}

function factualMismatchChoice(choices, passage) {
  const passageComparable = comparable(passage);
  const similarities = choices.map((choice) => {
    const normalized = comparable(choice);
    if (normalized && passageComparable.includes(normalized)) return 1;
    return tokenOverlapScore(choice, passage);
  });
  const mismatchScores = similarities.map((score) => 1 - score);
  return choiceResult(
    choices,
    mismatchScores,
    "정답 선지는 원문의 핵심 표현을 바꾸거나 부정해 내용과 일치하지 않습니다.",
    0.84,
  );
}

function grammarChoice(stem, choices) {
  const target = stem.match(/[‘']([^’']+)[’']\s*자리에/u)?.[1];
  if (!target) return { answer: 0, confidence: 0, evidence: "원문 기준 어형을 찾지 못했습니다." };
  const targetComparable = comparable(target);
  const index = choices.findIndex((choice) => comparable(choice) === targetComparable);
  return index < 0
    ? { answer: 0, confidence: 0, evidence: "원문 기준 어형과 일치하는 선지가 없습니다." }
    : { answer: index + 1, confidence: 0.99, evidence: `원문에 사용된 어형은 '${clean(target, 100)}'입니다.` };
}

function shortBlankChoice(stem, choices, passage) {
  const scores = choices.map((choice) => {
    const restored = comparable(stem.replace(/_{3,}/gu, choice));
    if (restored && comparable(passage).includes(restored)) return 1;
    return tokenOverlapScore(choice, passage);
  });
  return choiceResult(choices, scores, "빈칸에 선지를 복원한 뒤 원문의 해당 문장과 대조했습니다.", 0.84);
}

function orderChoice(stem, choices, passage) {
  const chunks = {};
  const matches = [...stem.matchAll(/\(([ABC])\)\s*([\s\S]*?)(?=\s*\([ABC]\)\s|$)/gu)];
  matches.forEach((match) => { chunks[match[1]] = clean(match[2]); });
  if (Object.keys(chunks).length !== 3) {
    return { answer: 0, confidence: 0, evidence: "(A), (B), (C) 단위를 복원하지 못했습니다." };
  }
  const normalizedPassage = comparable(passage);
  const order = Object.entries(chunks)
    .map(([label, value]) => ({ label, position: normalizedPassage.indexOf(comparable(value).slice(0, 120)) }))
    .sort((left, right) => left.position - right.position)
    .map((item) => item.label);
  if (order.some((_, index) => Object.values(chunks)[index] == null) || order.length !== 3) {
    return { answer: 0, confidence: 0, evidence: "원문에서 문단 단위의 위치를 찾지 못했습니다." };
  }
  const expected = order.join("");
  const index = choices.findIndex((choice) => comparable(choice).replace(/[^abc]/gu, "") === expected.toLowerCase());
  return index < 0
    ? { answer: 0, confidence: 0, evidence: "원문 순서와 일치하는 선지를 찾지 못했습니다." }
    : { answer: index + 1, confidence: 0.97, evidence: `원문의 전개 순서는 (${order.join(")-(")})입니다.` };
}

function numberedSentenceSegments(stem) {
  const boundary = stem.includes("[남은 글]") ? stem.indexOf("[남은 글]") + "[남은 글]".length : 0;
  const text = stem.slice(boundary);
  const markers = [...text.matchAll(/[①②③④⑤]/gu)].slice(0, 5);
  if (markers.length !== 5) return [];
  return markers.map((marker, index) => {
    const from = Number(marker.index) + marker[0].length;
    const to = index < 4 ? Number(markers[index + 1].index) : text.length;
    return clean(text.slice(from, to));
  });
}

function irrelevantSentenceChoice(stem, passage) {
  const segments = numberedSentenceSegments(stem);
  if (segments.length !== 5) return { answer: 0, confidence: 0, evidence: "번호 문장들을 복원하지 못했습니다." };
  const passageComparable = comparable(passage);
  const mismatch = segments.map((segment) => {
    const normalized = comparable(segment);
    if (normalized && passageComparable.includes(normalized)) return 0;
    return 1 - tokenOverlapScore(segment, passage);
  });
  return choiceResult(segments, mismatch, "원문의 흐름에 존재하지 않는 문장을 식별했습니다.", 0.82);
}

function insertionChoice(stem, passage) {
  const given = clean(stem.match(/\[주어진\s*문장\]\s*([\s\S]*?)\s*\[남은\s*글\]/u)?.[1]);
  if (!given) return { answer: 0, confidence: 0, evidence: "주어진 문장을 복원하지 못했습니다." };
  const sourceSentences = splitSentences(passage);
  const givenComparable = comparable(given);
  const sentenceIndex = sourceSentences.findIndex((sentence) => comparable(sentence) === givenComparable
    || comparable(sentence).includes(givenComparable)
    || givenComparable.includes(comparable(sentence)));
  if (sentenceIndex < 0 || sentenceIndex > 4) {
    return { answer: 0, confidence: 0, evidence: "주어진 문장의 원문 위치를 찾지 못했습니다." };
  }
  return { answer: sentenceIndex + 1, confidence: 0.94, evidence: `주어진 문장은 원문에서 ${sentenceIndex + 1}번째 위치에 있습니다.` };
}

function bestSourceSentence(passage, targetText) {
  const targetTokens = new Set(words(targetText));
  const candidates = splitSentences(passage).map((sentence) => {
    const sentenceTokens = new Set(words(sentence));
    const overlap = [...targetTokens].filter((token) => sentenceTokens.has(token)).length;
    const union = new Set([...targetTokens, ...sentenceTokens]).size || 1;
    return { sentence, score: overlap / union };
  });
  return candidates.sort((left, right) => right.score - left.score)[0] || { sentence: "", score: 0 };
}

function openWritingAnswer(questionNumber, stem, passage) {
  if (questionNumber === 17) {
    const fragments = clean(stem.split(/보기>/u)[1] || "").split("/").map(clean).filter(Boolean);
    const source = splitSentences(passage)
      .map((sentence) => ({ sentence, matched: fragments.filter((fragment) => comparable(sentence).includes(comparable(fragment))).length }))
      .sort((left, right) => right.matched - left.matched)[0];
    if (source?.matched === fragments.length && fragments.length >= 2) {
      return { answer: source.sentence, confidence: 0.98, evidence: "보기의 모든 어구를 원문 순서로 복원했습니다." };
    }
  }
  if (questionNumber === 18) {
    const condition = stem.match(/제시어\s*([^/]+)\/\s*총\s*(\d+)단어/u);
    const required = condition ? condition[1].split(",").map((item) => clean(item).toLowerCase()).filter(Boolean) : [];
    const expectedCount = Number(condition?.[2] || 0);
    const candidates = splitSentences(passage)
      .map((sentence) => ({
        sentence,
        matched: required.filter((token) => clean(sentence).toLowerCase().includes(token)).length,
        distance: expectedCount ? Math.abs(wordCount(sentence) - expectedCount) : 0,
      }))
      .sort((left, right) => right.matched - left.matched || left.distance - right.distance);
    if (candidates[0]?.matched === required.length && required.length >= 2) {
      return { answer: candidates[0].sentence, confidence: 0.95, evidence: "제시어와 단어 수 조건에 맞는 원문 문장을 복원했습니다." };
    }
  }
  if (questionNumber === 19) {
    const modified = clean(stem.split(/쓰시오\./u).pop());
    const source = bestSourceSentence(passage, modified);
    if (source.score >= 0.55) {
      return { answer: source.sentence, confidence: 0.94, evidence: "변형 문장과 가장 가까운 원문 문장을 대조해 오류를 복원했습니다." };
    }
  }
  return { answer: "", confidence: 0, evidence: "서술형 정답을 안전하게 복원하지 못했습니다." };
}

function resolveAnswer(questionNumber, stem, choices, passage) {
  if ([1, 3, 4, 12].includes(questionNumber)) return exactSourceChoice(choices, passage);
  if (questionNumber === 2) return emotionChoice(choices, passage);
  if ([5, 6, 9, 10, 16].includes(questionNumber)) {
    return keywordChoice(choices, passage, questionTypeLabel[questionTypeByNumber[questionNumber]] || "핵심");
  }
  if (questionNumber === 7) return factualMismatchChoice(choices, passage);
  if (questionNumber === 8) return grammarChoice(stem, choices);
  if (questionNumber === 11) return shortBlankChoice(stem, choices, passage);
  if (questionNumber === 13) return irrelevantSentenceChoice(stem, passage);
  if (questionNumber === 14) return orderChoice(stem, choices, passage);
  if (questionNumber === 15) return insertionChoice(stem, passage);
  return openWritingAnswer(questionNumber, stem, passage);
}

function explanationFor(type, result) {
  const prefix = questionTypeLabel[type] || "문항";
  return `${prefix} 검증: ${result.evidence} 원문과 문항 구조를 자동 대조한 결과이며, 정답 신뢰도는 ${Math.round(result.confidence * 100)}%입니다.`;
}

function parsePassageSection(sectionText, metadata, sourceConfig) {
  const firstQuestion = sectionText.search(/\s1\.\s*\[목적\]/u);
  if (firstQuestion < 0) return null;
  const passage = clean(sectionText.slice(0, firstQuestion), 30_000);
  const questionText = sectionText.slice(firstQuestion);
  const candidateMarkers = [...questionText.matchAll(/(?:^|\s)(\d{1,2})\.\s*\[([^\]]+)\]\s*/gu)];
  const markers = [];
  let markerCursor = 0;
  for (let expectedNumber = 1; expectedNumber <= 19; expectedNumber += 1) {
    const relativeIndex = candidateMarkers.slice(markerCursor)
      .findIndex((marker) => Number(marker[1]) === expectedNumber);
    if (relativeIndex < 0) break;
    const absoluteIndex = markerCursor + relativeIndex;
    markers.push(candidateMarkers[absoluteIndex]);
    markerCursor = absoluteIndex + 1;
  }
  const sourceId = `vpb_g${sourceConfig.grade}_${metadata.passageId}`.replace(/[^A-Za-z0-9_\-]/gu, "_");
  const questions = markers.map((marker, index) => {
    const questionNumber = Number(marker[1]);
    const start = Number(marker.index) + marker[0].length;
    const end = index + 1 < markers.length ? Number(markers[index + 1].index) : questionText.length;
    const raw = clean(questionText.slice(start, end), 40_000);
    const parsed = parseChoices(raw, questionNumber);
    const answerResult = resolveAnswer(questionNumber, parsed.stem, parsed.choices, passage);
    const type = questionTypeByNumber[questionNumber] || `unknown_${questionNumber}`;
    const openEnded = questionNumber >= 17;
    const markerContamination = ![13, 15].includes(questionNumber)
      && (/[①②③④⑤]/u.test(parsed.stem) || parsed.choices.some((choice) => /[①②③④⑤]/u.test(choice)));
    const structurallyValid = openEnded
      ? Boolean(parsed.stem && String(answerResult.answer).length >= 10)
      : parsed.choices.length === 5
        && Number(answerResult.answer) >= 1
        && Number(answerResult.answer) <= 5
        && !markerContamination;
    const approved = structurallyValid && answerResult.confidence >= 0.72;
    const questionId = `VPB-G${sourceConfig.grade}-${metadata.passageId}-Q${String(questionNumber).padStart(2, "0")}`;
    const explanation = explanationFor(type, answerResult);
    const contentFingerprint = sha256([
      comparable(passage), comparable(parsed.stem), ...parsed.choices.map(comparable), comparable(answerResult.answer),
    ].join("\n"));
    return {
      questionId,
      subject: "english",
      language: "en",
      examFamily: openEnded ? "school_writing" : "csat",
      grade: sourceConfig.schoolGrade,
      questionType: type,
      subtype: clean(marker[2], 100),
      difficulty: sourceConfig.grade === 1 ? 2 : sourceConfig.grade === 2 ? 3 : 4,
      sourceId,
      passage,
      question: parsed.stem,
      choices: parsed.choices,
      answer: answerResult.answer,
      explanation,
      conceptTags: unique([type, `grade-${sourceConfig.grade}`, "high-school-english"]),
      skillTags: unique([type, "variant-problem", metadata.passageId.slice(0, 6).toLowerCase()]),
      qualityScore: approved ? Math.max(78, Math.round(answerResult.confidence * 100)) : 45,
      status: approved ? "approved" : "raw",
      validation: {
        answerPresent: Boolean(answerResult.answer),
        explanationPresent: explanation.length >= 20,
        structurallyValid,
        issues: approved
          ? []
          : markerContamination
            ? ["choice_marker_boundary_review_required"]
            : ["automatic_answer_review_required"],
        answerConfidence: Number(answerResult.confidence.toFixed(4)),
        answerMethod: "source-reconstruction-v1",
      },
      generator: { provider: "deterministic-parser", model: "source-reconstruction-v1", version: DATASET_VERSION },
      embedding: [],
      contentFingerprint,
      usageCount: 0,
      datasetId: DATASET_ID,
      sourceArchiveId: `variant-problem-bank-grade${sourceConfig.grade}`,
      sourceQuestionNumber: questionNumber,
      sourcePassageSequence: metadata.sequence,
      sourcePassageHash: metadata.sourceHash,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      updatedAt: new Date(),
    };
  });
  return {
    source: {
      sourceId,
      title: `[고${sourceConfig.grade}] ${metadata.passageId}`,
      sourceType: "mock_exam",
      text: passage,
      metadata: {
        datasetId: DATASET_ID,
        grade: sourceConfig.grade,
        schoolGrade: sourceConfig.schoolGrade,
        passageId: metadata.passageId,
        sequence: metadata.sequence,
        sequenceTotal: metadata.sequenceTotal,
        sourceHash: metadata.sourceHash,
        sourceArchiveId: `variant-problem-bank-grade${sourceConfig.grade}`,
      },
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      updatedAt: new Date(),
    },
    questions,
  };
}

async function extractPdfPages(sourcePath, grade) {
  const bytes = await readFile(sourcePath);
  const fingerprint = sha256(bytes);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = clean(content.items.map((item) => (item && "str" in item ? item.str : "")).join(" "))
      .replace(new RegExp(`(?:^|\\s)고${grade}\\s*·\\s*${pageNumber}(?=\\s|$)`, "gu"), " ");
    pages.push(pageText);
    if (pageNumber % 500 === 0 || pageNumber === pdf.numPages) {
      console.log(`고${grade} PDF 읽기 ${pageNumber}/${pdf.numPages}쪽`);
    }
  }
  return { text: pages.join("\n"), fingerprint, pageCount: pdf.numPages, byteSize: bytes.length };
}

function parseGradeText(extracted, sourceConfig) {
  const headerPattern = /\[고([123])\]\s+([A-Za-z0-9_~\-]+)\s+원문\s+SHA-256:\s*([a-f0-9]+)\s*·\s*지문\s*(\d+)\/(\d+)\s+\[원문\s*-\s*변경\s*금지\]\s*/gu;
  const headers = [...extracted.text.matchAll(headerPattern)];
  const parsed = [];
  headers.forEach((header, index) => {
    const start = Number(header.index) + header[0].length;
    const end = index + 1 < headers.length ? Number(headers[index + 1].index) : extracted.text.length;
    const section = parsePassageSection(extracted.text.slice(start, end), {
      passageId: header[2],
      sourceHash: header[3],
      sequence: Number(header[4]),
      sequenceTotal: Number(header[5]),
    }, sourceConfig);
    if (section) parsed.push(section);
  });
  const sources = parsed.map((item) => item.source);
  const problems = parsed.flatMap((item) => item.questions);
  const approved = problems.filter((problem) => problem.status === "approved");
  return {
    sources,
    problems,
    summary: {
      grade: sourceConfig.grade,
      sourceFile: sourceConfig.fileName,
      sourceFingerprint: extracted.fingerprint,
      sourceByteSize: extracted.byteSize,
      sourcePageCount: extracted.pageCount,
      passageCount: sources.length,
      questionCount: problems.length,
      approvedQuestionCount: approved.length,
      rawQuestionCount: problems.length - approved.length,
      approvedByType: Object.fromEntries([...approved.reduce((counts, problem) => {
        counts.set(problem.questionType, Number(counts.get(problem.questionType) || 0) + 1);
        return counts;
      }, new Map())]),
    },
  };
}

const workbookQuestionPlan = Object.freeze([
  { type: "purpose", count: 3 },
  { type: "emotion_change", count: 2 },
  { type: "claim", count: 3 },
  { type: "main_idea", count: 3 },
  { type: "title", count: 3 },
  { type: "topic", count: 4 },
  { type: "factual_description", count: 4 },
  { type: "grammar", count: 4 },
  { type: "vocabulary", count: 3 },
  { type: "implied_meaning", count: 1 },
  { type: "blank_short", count: 3 },
  { type: "blank_long", count: 3 },
  { type: "irrelevant_sentence", count: 2 },
  { type: "paragraph_order", count: 3 },
  { type: "sentence_insertion", count: 3 },
  { type: "summary", count: 5 },
  { type: "grammar_correction", count: 1 },
]);

function selectEvenly(candidates, count, usedSourceIds, usedQuestionIds, volumeIndex) {
  const selected = [];
  const selectedQuestionIds = new Set();
  for (let index = 0; index < count; index += 1) {
    const globalOrdinal = volumeIndex * count + index + 1;
    const totalRequired = count * WORKBOOKS_PER_GRADE;
    const target = Math.floor((globalOrdinal / (totalRequired + 1)) * candidates.length);
    let picked = null;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const positions = [target + offset, target - offset];
      picked = positions
        .filter((position) => position >= 0 && position < candidates.length)
        .map((position) => candidates[position])
        .find((problem) => !usedSourceIds.has(problem.sourceId)
          && !usedQuestionIds.has(problem.questionId)
          && !selectedQuestionIds.has(problem.questionId));
      if (picked) break;
    }
    if (!picked) {
      for (let offset = 0; offset < candidates.length; offset += 1) {
        const positions = [target + offset, target - offset];
        picked = positions
          .filter((position) => position >= 0 && position < candidates.length)
          .map((position) => candidates[position])
          .find((problem) => !usedQuestionIds.has(problem.questionId)
            && !selectedQuestionIds.has(problem.questionId));
        if (picked) break;
      }
    }
    if (!picked) break;
    selected.push(picked);
    selectedQuestionIds.add(picked.questionId);
    usedSourceIds.add(picked.sourceId);
  }
  return selected;
}

function mixQuestionTypes(groupedSelections, volumeIndex) {
  const queues = groupedSelections.map((group) => [...group]);
  const mixed = [];
  while (queues.some((queue) => queue.length > 0)) {
    for (let offset = 0; offset < queues.length; offset += 1) {
      const queueIndex = (offset + volumeIndex) % queues.length;
      const problem = queues[queueIndex].shift();
      if (problem) mixed.push(problem);
    }
  }
  return mixed;
}

function manifestQuestion(problem, index, sourceConfig) {
  return {
    number: index + 1,
    questionId: problem.questionId,
    sourceId: problem.sourceId,
    sourcePassageId: problem.sourceId.replace(`vpb_g${sourceConfig.grade}_`, ""),
    type: problem.questionType,
    typeLabel: questionTypeLabel[problem.questionType] || problem.subtype,
    difficulty: problem.difficulty,
    passage: problem.passage,
    stem: problem.question,
    choices: problem.choices,
    answer: problem.answer,
    explanation: problem.explanation,
    answerConfidence: problem.validation.answerConfidence,
  };
}

function buildWorkbookManifests(parsed, sourceConfig) {
  const candidatePools = new Map(workbookQuestionPlan.map((item) => [
    item.type,
    parsed.problems
      .filter((problem) => problem.questionType === item.type)
      .filter((problem) => problem.status === "approved")
      .filter((problem) => Number(problem.validation.answerConfidence) >= 0.94)
      .filter((problem) => wordCount(problem.passage) >= 70 && wordCount(problem.passage) <= 230)
      .filter((problem) => problem.question.length + problem.choices.join(" ").length <= 7_500)
      .sort((left, right) => left.sourcePassageSequence - right.sourcePassageSequence),
  ]));
  console.log(
    `고${sourceConfig.grade} 교재 후보: ${JSON.stringify(Object.fromEntries(
      [...candidatePools].map(([type, problems]) => [type, problems.length]),
    ))}`,
  );
  const usedQuestionIds = new Set();
  const manifests = [];
  for (let volumeIndex = 0; volumeIndex < WORKBOOKS_PER_GRADE; volumeIndex += 1) {
    const usedQuestionCountBeforeVolume = usedQuestionIds.size;
    const usedSourceIds = new Set();
    const groupedSelections = workbookQuestionPlan.map((item) => {
      const candidates = candidatePools.get(item.type) || [];
      const typeSelection = selectEvenly(
        candidates,
        item.count,
        usedSourceIds,
        usedQuestionIds,
        volumeIndex,
      );
      if (typeSelection.length !== item.count) {
        throw new Error(
          `고${sourceConfig.grade} ${volumeIndex + 1}권 ${item.type} 문항을 ${item.count}개 선별하지 못했습니다.`,
        );
      }
      typeSelection.forEach((problem) => usedQuestionIds.add(problem.questionId));
      return typeSelection;
    });
    const selected = mixQuestionTypes(groupedSelections, volumeIndex);
    if (selected.length !== QUESTIONS_PER_WORKBOOK) {
      throw new Error(`고${sourceConfig.grade} ${volumeIndex + 1}권 문항 수가 ${selected.length}개입니다.`);
    }
    if (usedQuestionIds.size !== usedQuestionCountBeforeVolume + QUESTIONS_PER_WORKBOOK) {
      throw new Error(`고${sourceConfig.grade} ${volumeIndex + 1}권에 중복 문항이 있습니다.`);
    }
    const volume = volumeIndex + 1;
    manifests.push({
      schemaVersion: "xstudy-variant-workbook-v2",
      workbookId: `xstudy-grade${sourceConfig.grade}-variant-50-v1-volume${String(volume).padStart(2, "0")}`,
      title: `고${sourceConfig.grade} 영어 변형문제 실전 50제 · 제${volume}권`,
      subtitle: "문제은행 기반 학교 시험 대비",
      grade: sourceConfig.grade,
      schoolGrade: sourceConfig.schoolGrade,
      volume,
      volumeCount: WORKBOOKS_PER_GRADE,
      questionCount: QUESTIONS_PER_WORKBOOK,
      datasetId: DATASET_ID,
      sourceFingerprint: parsed.summary.sourceFingerprint,
      styleReferenceArchiveId: styleReference.archiveId,
      template: {
        id: "xstudy-blue-editorial-v1",
        styleReference: styleReference.fileName,
        canvaConnection: "connected-pending-template-entitlement",
      },
      composition: Object.fromEntries(workbookQuestionPlan.map((item) => [item.type, item.count])),
      summaryGroups: [
        { label: "핵심 독해", count: 18 },
        { label: "내용·어휘", count: 8 },
        { label: "어법", count: 5 },
        { label: "빈칸 추론", count: 6 },
        { label: "문장·흐름", count: 13 },
      ],
      questions: selected.map((problem, index) => manifestQuestion(problem, index, sourceConfig)),
      createdAt: new Date().toISOString(),
    });
  }
  if (usedQuestionIds.size !== WORKBOOKS_PER_GRADE * QUESTIONS_PER_WORKBOOK) {
    throw new Error(`고${sourceConfig.grade} 전체 고유 문항 수가 ${usedQuestionIds.size}개입니다.`);
  }
  return manifests;
}

async function prepareGrade(sourceConfig) {
  const sourcePath = await resolveSourceFile(sourceConfig.fileName);
  console.log(`고${sourceConfig.grade} 문제은행 분석 시작: ${sourcePath}`);
  const extracted = await extractPdfPages(sourcePath, sourceConfig.grade);
  const parsed = parseGradeText(extracted, sourceConfig);
  if (parsed.summary.passageCount !== sourceConfig.expectedPassages) {
    throw new Error(`고${sourceConfig.grade} 지문 수 불일치: ${parsed.summary.passageCount}/${sourceConfig.expectedPassages}`);
  }
  if (parsed.summary.questionCount !== sourceConfig.expectedQuestions) {
    const counts = parsed.problems.reduce((result, problem) => {
      result.set(problem.sourceId, Number(result.get(problem.sourceId) || 0) + 1);
      return result;
    }, new Map());
    const anomalies = [...counts].filter(([, count]) => count !== 19).slice(0, 20);
    throw new Error(`고${sourceConfig.grade} 문항 수 불일치: ${parsed.summary.questionCount}/${sourceConfig.expectedQuestions} · ${JSON.stringify(anomalies)}`);
  }
  const manifests = buildWorkbookManifests(parsed, sourceConfig);
  await mkdir(WORK_ROOT, { recursive: true });
  for (const manifest of manifests) {
    await writeFile(
      path.join(WORK_ROOT, `grade${sourceConfig.grade}-workbook-${String(manifest.volume).padStart(2, "0")}.json`),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
  }
  await writeFile(path.join(WORK_ROOT, `grade${sourceConfig.grade}-summary.json`), JSON.stringify(parsed.summary, null, 2), "utf8");
  console.log(
    `고${sourceConfig.grade} 분석 완료: ${parsed.summary.questionCount}문항, 승인 ${parsed.summary.approvedQuestionCount}문항, 50문항 교재 ${manifests.length}권`,
  );
  return { sourceConfig, sourcePath, parsed, manifests };
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value)
          .filter(([, child]) => child !== undefined)
          .map(([key, child]) => [key, firestoreValue(child)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function documentWrite(projectId, documentPath, data) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${documentPath}`,
      fields: Object.fromEntries(Object.entries(data)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, firestoreValue(value)])),
    },
  };
}

async function createCliAccessToken() {
  const require = createRequire(import.meta.url);
  const firebaseAuth = require("/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js");
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI login is required");
  if (account.tokens.access_token && Number(account.tokens.expires_at) > Date.now() + 120_000) {
    return account.tokens.access_token;
  }
  const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [
    "email",
    "openid",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ]);
  if (!token?.access_token) throw new Error("Firebase CLI access token is unavailable");
  return token.access_token;
}

async function commitWrites(accessToken, projectId, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Firestore ${projectId} commit failed (${response.status}): ${detail.slice(0, 800)}`);
  }
}

async function commitInBatches(accessToken, projectId, writes, label, batchSize = 180) {
  for (let index = 0; index < writes.length; index += batchSize) {
    await commitWrites(accessToken, projectId, writes.slice(index, index + batchSize));
    console.log(`${label} ${Math.min(index + batchSize, writes.length)}/${writes.length}`);
  }
}

async function storageMetadata(accessToken, storagePath) {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage metadata failed (${response.status})`);
  return response.json();
}

async function uploadFile(accessToken, localPath, storagePath, metadata = {}) {
  const bytes = await readFile(localPath);
  const fingerprint = sha256(bytes);
  const current = await storageMetadata(accessToken, storagePath);
  if (current && Number(current.size) === bytes.length && current.metadata?.sourceFingerprint === fingerprint) {
    console.log(`Storage 유지: ${storagePath}`);
    return { storagePath, byteSize: bytes.length, fingerprint };
  }
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o`);
  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", storagePath);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/pdf" },
    body: bytes,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${detail.slice(0, 800)}`);
  }
  const patchResponse = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: "application/pdf",
        metadata: {
          sourceFingerprint: fingerprint,
          datasetId: DATASET_ID,
          accessPolicy: "private-problem-bank-source",
          ...metadata,
        },
      }),
    },
  );
  if (!patchResponse.ok) throw new Error(`Storage metadata update failed (${patchResponse.status})`);
  console.log(`Storage 업로드: ${storagePath}`);
  return { storagePath, byteSize: bytes.length, fingerprint };
}

async function importGrade(accessToken, prepared) {
  const { sourceConfig, sourcePath, parsed } = prepared;
  const archive = await uploadFile(accessToken, sourcePath, storagePathForGrade(sourceConfig.grade), {
    grade: String(sourceConfig.grade),
    sourceRole: "variant-problem-bank",
  });
  const sourceWrites = parsed.sources.map((source) => documentWrite(
    PROBLEM_BANK_PROJECT_ID,
    `sources/${source.sourceId}`,
    { ...source, metadata: { ...source.metadata, storagePath: archive.storagePath } },
  ));
  sourceWrites.push(documentWrite(
    PROBLEM_BANK_PROJECT_ID,
    `source_archives/variant-problem-bank-grade${sourceConfig.grade}`,
    {
      archiveId: `variant-problem-bank-grade${sourceConfig.grade}`,
      datasetId: DATASET_ID,
      datasetVersion: DATASET_VERSION,
      grade: sourceConfig.grade,
      schoolGrade: sourceConfig.schoolGrade,
      title: `고${sourceConfig.grade} 영어 변형문제 문제은행`,
      storageBucket: STORAGE_BUCKET,
      storagePath: archive.storagePath,
      sourceFingerprint: archive.fingerprint,
      sourceByteSize: archive.byteSize,
      sourcePageCount: parsed.summary.sourcePageCount,
      passageCount: parsed.summary.passageCount,
      questionCount: parsed.summary.questionCount,
      status: "ready",
      visibility: "server_only",
      updatedAt: new Date(),
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
    },
  ));
  await commitInBatches(accessToken, PROBLEM_BANK_PROJECT_ID, sourceWrites, `고${sourceConfig.grade} 지문 DB`);

  const problemBatchSize = 180;
  for (let index = 0; index < parsed.problems.length; index += problemBatchSize) {
    const problemWrites = parsed.problems
      .slice(index, index + problemBatchSize)
      .map((problem) => documentWrite(
        PROBLEM_BANK_PROJECT_ID,
        `problems/${docId("problem", problem.questionId)}`,
        problem,
      ));
    await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, problemWrites);
    console.log(`고${sourceConfig.grade} 문항 DB ${Math.min(index + problemBatchSize, parsed.problems.length)}/${parsed.problems.length}`);
  }
  await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, [documentWrite(
    PROBLEM_BANK_PROJECT_ID,
    `import_runs/${DATASET_ID}-grade${sourceConfig.grade}`,
    {
      importRunId: `${DATASET_ID}-grade${sourceConfig.grade}`,
      datasetId: DATASET_ID,
      datasetVersion: DATASET_VERSION,
      grade: sourceConfig.grade,
      ...parsed.summary,
      completedAt: new Date(),
      status: "completed",
    },
  )]);
}

function workbookContentDocument(grade, manifest, upload, outputStat) {
  const category = `grade${grade}_mock`;
  const workbookId = manifest.workbookId;
  const title = manifest.title;
  return {
    authorId: "system-variant-problem-bank",
    teacherId: "system-variant-problem-bank",
    subject: title,
    audience: `고등학교 ${grade}학년`,
    section: category,
    identifier: workbookId,
    learningTopic: "17개 영어 유형 혼합 · 50문항 · 한 페이지 한 문항 · 통합 정답 및 해설",
    introduction: `<p><strong>${title}</strong>입니다.</p><p>검증된 문제은행에서 서로 다른 지문 50개를 골라 17개 유형으로 구성했으며, 정답과 해설은 교재 뒤쪽에 분리했습니다.</p>`,
    lectureLink: null,
    learningMaterialFilePaths: [upload.storagePath],
    referenceMaterialFilePaths: [],
    type: "share",
    status: "approved",
    libraryCategory: "problem_bank",
    themes: ["k_entrance"],
    thumbnailPath: null,
    previewUrl: null,
    clickCount: 0,
    purchaseLink: null,
    homeworkCode: null,
    shortCode: null,
    homeworkInstruction: null,
    classroomId: null,
    classroomTitle: null,
    educationalInstantPublish: true,
    resourceCatalog: "high_school",
    resourceCategory: category,
    resourcePlacements: [{ catalog: "high_school", category }],
    resourceSource: DATASET_ID,
    resourceFiles: [{
      name: `${title}.pdf`,
      path: upload.storagePath,
      size: outputStat.size,
      contentType: "application/pdf",
    }],
    sourceDatabase: "xstudy-problem-bank",
    sourceDatabaseVersion: DATASET_VERSION,
    workbookId,
    workbookVolume: manifest.volume,
    workbookVolumeCount: manifest.volumeCount,
    workbookQuestionCount: manifest.questionCount,
    workbookComposition: manifest.composition,
    canvaTemplateStatus: "connected-pending-paid-template-access",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function stageSourceArchives(accessToken) {
  for (const sourceConfig of gradeSources) {
    const sourcePath = await resolveSourceFile(sourceConfig.fileName);
    await uploadFile(accessToken, sourcePath, storagePathForGrade(sourceConfig.grade), {
      grade: String(sourceConfig.grade),
      sourceRole: "variant-problem-bank",
    });
  }
}

async function importStyleAndWorkbooks(accessToken, { registerProblemBankArchive = true } = {}) {
  const stylePath = await resolveSourceFile(styleReference.fileName);
  const styleUpload = await uploadFile(
    accessToken,
    stylePath,
    "problem-bank-sources/variant/style-reference/ebs-special-variant-reference.pdf",
    { sourceRole: "layout-style-reference", reusePolicy: "structure-only" },
  );
  if (registerProblemBankArchive) {
    await commitWrites(accessToken, PROBLEM_BANK_PROJECT_ID, [documentWrite(
      PROBLEM_BANK_PROJECT_ID,
      `source_archives/${styleReference.archiveId}`,
      {
        archiveId: styleReference.archiveId,
        datasetId: DATASET_ID,
        title: "수능특강 영어 변형문제 스타일 참고 자료",
        storageBucket: STORAGE_BUCKET,
        storagePath: styleUpload.storagePath,
        sourceFingerprint: styleUpload.fingerprint,
        sourceByteSize: styleUpload.byteSize,
        sourceRole: "layout-style-reference",
        reusePolicy: "layout-and-structure-only",
        visibility: "server_only",
        status: "ready",
        updatedAt: new Date(),
        createdAt: new Date("2026-08-26T00:00:00.000Z"),
      },
    )]);
  }

  const writes = [];
  for (const sourceConfig of gradeSources) {
    for (let volume = 1; volume <= WORKBOOKS_PER_GRADE; volume += 1) {
      const localPath = workbookPathForGrade(sourceConfig.grade, volume);
      const manifestPath = path.join(
        WORK_ROOT,
        `grade${sourceConfig.grade}-workbook-${String(volume).padStart(2, "0")}.json`,
      );
      const [outputStat, manifestText] = await Promise.all([
        stat(localPath).catch(() => null),
        readFile(manifestPath, "utf8").catch(() => null),
      ]);
      if (!outputStat?.isFile() || !manifestText) {
        throw new Error(`완성 교재 또는 manifest가 없습니다. 먼저 npm run build:variant-workbooks 를 실행하세요: ${localPath}`);
      }
      const manifest = JSON.parse(manifestText);
      const upload = await uploadFile(
        accessToken,
        localPath,
        workbookStoragePath(sourceConfig.grade, volume),
        {
          sourceRole: "published-workbook",
          grade: String(sourceConfig.grade),
          volume: String(volume),
          accessPolicy: "subscriber-download",
        },
      );
      writes.push(documentWrite(
        MAIN_PROJECT_ID,
        workbookContentDocumentPath(sourceConfig.grade, volume),
        workbookContentDocument(sourceConfig.grade, manifest, upload, outputStat),
      ));
    }
  }
  await commitWrites(accessToken, MAIN_PROJECT_ID, writes);
  console.log("고1·고2·고3 각 10권, 총 30권을 고등 내신 메뉴에 등록했습니다.");
}

async function getDocument(accessToken, projectId, documentPath) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  return response.json();
}

async function aggregateProblemCount(accessToken, grade) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROBLEM_BANK_PROJECT_ID}/databases/(default)/documents:runAggregationQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery: {
            from: [{ collectionId: "problems" }],
            where: {
              compositeFilter: {
                op: "AND",
                filters: [
                  { fieldFilter: { field: { fieldPath: "datasetId" }, op: "EQUAL", value: { stringValue: DATASET_ID } } },
                  { fieldFilter: { field: { fieldPath: "grade" }, op: "EQUAL", value: { integerValue: String(9 + grade) } } },
                ],
              },
            },
          },
          aggregations: [{ alias: "total", count: {} }],
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Problem count verification failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  const rows = await response.json();
  return Number(rows?.[0]?.result?.aggregateFields?.total?.integerValue || 0);
}

async function verifyImport(accessToken) {
  const result = [];
  for (const sourceConfig of gradeSources) {
    const count = await aggregateProblemCount(accessToken, sourceConfig.grade);
    const archive = await getDocument(
      accessToken,
      PROBLEM_BANK_PROJECT_ID,
      `source_archives/variant-problem-bank-grade${sourceConfig.grade}`,
    );
    const contents = [];
    for (let volume = 1; volume <= WORKBOOKS_PER_GRADE; volume += 1) {
      contents.push(await getDocument(
        accessToken,
        MAIN_PROJECT_ID,
        workbookContentDocumentPath(sourceConfig.grade, volume),
      ));
    }
    const contentCount = contents.filter(Boolean).length;
    const ok = count === sourceConfig.expectedQuestions
      && Boolean(archive)
      && contentCount === WORKBOOKS_PER_GRADE;
    result.push({
      grade: sourceConfig.grade,
      count,
      expected: sourceConfig.expectedQuestions,
      archive: Boolean(archive),
      contentCount,
      ok,
    });
  }
  if (result.some((item) => !item.ok)) throw new Error(`등록 검증 실패: ${JSON.stringify(result)}`);
  console.log(`등록 검증 완료: ${JSON.stringify(result)}`);
  return result;
}

async function verifyMainPublication(accessToken) {
  const result = [];
  for (const sourceConfig of gradeSources) {
    const source = await storageMetadata(accessToken, storagePathForGrade(sourceConfig.grade));
    let workbookCount = 0;
    let contentCount = 0;
    for (let volume = 1; volume <= WORKBOOKS_PER_GRADE; volume += 1) {
      const workbook = await storageMetadata(
        accessToken,
        workbookStoragePath(sourceConfig.grade, volume),
      );
      const content = await getDocument(
        accessToken,
        MAIN_PROJECT_ID,
        workbookContentDocumentPath(sourceConfig.grade, volume),
      );
      if (workbook) workbookCount += 1;
      if (content) contentCount += 1;
    }
    result.push({
      grade: sourceConfig.grade,
      source: Boolean(source),
      workbookCount,
      contentCount,
      ok: Boolean(source)
        && workbookCount === WORKBOOKS_PER_GRADE
        && contentCount === WORKBOOKS_PER_GRADE,
    });
  }
  const style = await storageMetadata(
    accessToken,
    "problem-bank-sources/variant/style-reference/ebs-special-variant-reference.pdf",
  );
  if (!style || result.some((item) => !item.ok)) {
    throw new Error(`메인 게시 검증 실패: ${JSON.stringify({ style: Boolean(style), grades: result })}`);
  }
  console.log(`메인 게시 검증 완료: ${JSON.stringify({ style: true, grades: result })}`);
}

await mkdir(WORK_ROOT, { recursive: true });
const preparedGrades = [];
if (shouldPrepare || shouldImport) {
  for (const sourceConfig of gradeSources) {
    preparedGrades.push(await prepareGrade(sourceConfig));
  }
  const combinedSummary = {
    datasetId: DATASET_ID,
    datasetVersion: DATASET_VERSION,
    grades: preparedGrades.map((item) => item.parsed.summary),
    totalPassages: preparedGrades.reduce((sum, item) => sum + item.parsed.summary.passageCount, 0),
    totalQuestions: preparedGrades.reduce((sum, item) => sum + item.parsed.summary.questionCount, 0),
    totalApproved: preparedGrades.reduce((sum, item) => sum + item.parsed.summary.approvedQuestionCount, 0),
    totalRaw: preparedGrades.reduce((sum, item) => sum + item.parsed.summary.rawQuestionCount, 0),
  };
  await writeFile(path.join(WORK_ROOT, "summary.json"), JSON.stringify(combinedSummary, null, 2), "utf8");
  console.log(`전체 분석 완료: ${combinedSummary.totalPassages}지문 · ${combinedSummary.totalQuestions}문항`);
}

let accessToken;
if (shouldImport || shouldVerify || shouldPublishMain) accessToken = await createCliAccessToken();
if (shouldImport) {
  for (const prepared of preparedGrades) await importGrade(accessToken, prepared);
  await importStyleAndWorkbooks(accessToken);
}
if (shouldVerify) await verifyImport(accessToken);
if (shouldPublishMain) {
  await stageSourceArchives(accessToken);
  await importStyleAndWorkbooks(accessToken, { registerProblemBankArchive: false });
  await verifyMainPublication(accessToken);
}
