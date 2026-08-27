import assert from "node:assert/strict";
import test from "node:test";
import {
  correctVariantQuestion,
  validateCorrectedVariantQuestion,
} from "./lib/variant-question-corrector.mjs";

const source = [
  "Students often improve their reading when they examine how ideas connect across a passage.",
  "A clear topic sentence gives them a useful starting point for that analysis.",
  "Supporting details then explain why the writer selected a particular example.",
  "Careful readers compare those details instead of choosing an answer from one familiar word.",
  "They also check whether a choice expands or reduces the scope of the original claim.",
  "This process prevents attractive distractors from replacing the writer’s actual conclusion.",
  "Regular practice makes the evidence easier to locate during a timed examination.",
  "As a result, students can select answers more accurately and explain their reasoning clearly.",
].join(" ");

function problem(overrides) {
  return {
    questionId: "VPB-TEST-001",
    sourceId: "source-test",
    questionType: "claim",
    passage: source,
    question: "필자의 주장을 고르시오.",
    choices: [
      "An unrelated sentence.",
      "Careful readers compare those details instead of choosing an answer from one familiar word.",
      "Another unrelated sentence.",
      "A fourth unrelated sentence.",
      "A fifth unrelated sentence.",
    ],
    answer: 2,
    difficulty: 3,
    ...overrides,
  };
}

test("semantic choices preserve one answer and use four distinct distractor patterns", () => {
  const corrected = correctVariantQuestion(problem({ questionType: "claim" }), { typeLabel: "필자의 주장" });
  assert.equal(corrected.choices.length, 5);
  assert.equal(corrected.choiceRationales.filter((choice) => choice.isCorrect).length, 1);
  assert.equal(new Set(corrected.choiceRationales.filter((choice) => !choice.isCorrect).map((choice) => choice.distractorPattern)).size, 4);
  assert.doesNotMatch(corrected.choices.join(" "), /It is not true that|\bnot\s+not\b/iu);
  assert.equal(validateCorrectedVariantQuestion(corrected).valid, true);
});

test("purpose converts the central source claim into a purpose statement", () => {
  const staleAnswer = "A clear topic sentence gives them a useful starting point for that analysis.";
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-PURPOSE",
    questionType: "purpose",
    choices: [staleAnswer, "Two", "Three", "Four", "Five"],
    answer: 1,
  }), { typeLabel: "글의 목적" });
  const correct = corrected.choices[corrected.answer - 1];
  assert.match(correct, /^To explain that\s/iu);
  assert.doesNotMatch(correct, new RegExp(`^${staleAnswer.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"));
  assert.match(correct, /accurately|reasoning|conclusion|distractors/iu);
});

test("short blank removes the source word and reconstructs the source exactly", () => {
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-BLANK-SHORT",
    questionType: "blank_short",
    question: "원문의 빈칸에 들어갈 단어를 고르시오. Regular practice makes the evidence easier to locate during a timed __________.",
    choices: ["lesson", "teacher", "examination", "method", "example"],
    answer: 3,
  }), { typeLabel: "빈칸 추론" });
  assert.equal((corrected.passage.match(/________/gu) || []).length, 1);
  assert.equal(corrected.transformation.removedText, "examination");
  assert.equal(corrected.transformation.reconstructionValid, true);
  assert.equal(corrected.choices[corrected.answer - 1], "examination");
});

test("long blank removes the exact source sentence", () => {
  const answerSentence = "As a result, students can select answers more accurately and explain their reasoning clearly.";
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-BLANK-LONG",
    questionType: "blank_long",
    choices: ["Wrong one.", answerSentence, "Wrong two.", "Wrong three.", "Wrong four."],
    answer: 2,
  }), { typeLabel: "빈칸 추론" });
  assert.equal(corrected.transformation.removedText, answerSentence);
  assert.equal(corrected.transformation.reconstructionValid, true);
  assert.equal(corrected.choices[corrected.answer - 1], answerSentence);
});

test("paragraph order shuffles A B C and the answer reconstructs the source", () => {
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-ORDER",
    questionType: "paragraph_order",
    choices: ["(A)-(B)-(C)", "(A)-(C)-(B)", "(B)-(A)-(C)", "(B)-(C)-(A)", "(C)-(A)-(B)"],
    answer: 1,
  }), { typeLabel: "글의 순서" });
  assert.match(corrected.passage, /^\(A\).+\(B\).+\(C\)/su);
  assert.equal(corrected.transformation.reconstructionValid, true);
});

test("grammar changes one source form and marks exactly five candidates", () => {
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-GRAMMAR",
    questionType: "grammar",
    question: "원문 S4의 ‘choosing’ 자리에 들어갈 형태를 고르시오.",
    choices: ["choose", "chooses", "choosing", "chosen", "to choose"],
    answer: 3,
  }), { typeLabel: "어법" });
  assert.equal((corrected.passage.match(/[①②③④⑤]/gu) || []).length, 5);
  assert.notEqual(corrected.transformation.original, corrected.transformation.replacement);
  assert.equal(corrected.choices[corrected.answer - 1], corrected.transformation.replacement);
});

test("sentence insertion removes one sentence and exposes five positions", () => {
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-INSERTION",
    questionType: "sentence_insertion",
    answer: 2,
  }), { typeLabel: "문장 삽입" });
  assert.match(corrected.passage, /\[주어진 문장\]/u);
  assert.equal((corrected.passage.match(/[①②③④⑤]/gu) || []).length, 5);
  assert.equal(corrected.transformation.reconstructionValid, true);
});

test("factual question keeps four source-grounded statements and one controlled distortion", () => {
  const falseChoice = "Careful readers do not compare those details instead of choosing an answer from one familiar word.";
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-FACTUAL",
    questionType: "factual_description",
    choices: ["One", "Two", falseChoice, "Four", "Five"],
    answer: 3,
  }), { typeLabel: "내용 일치" });
  assert.equal(corrected.choices.length, 5);
  assert.equal(corrected.choices[corrected.answer - 1], falseChoice);
  assert.equal(corrected.choiceRationales.filter((choice) => !choice.isCorrect).length, 4);
});

test("writing reorder rebuilds an exact source sentence from four shuffled phrases", () => {
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-WRITING-REORDER",
    questionType: "writing_reorder",
  }), { typeLabel: "어구 배열" });
  assert.equal(corrected.choices.length, 0);
  assert.equal(corrected.transformation.sourcePhrases.length, 4);
  assert.notDeepEqual(corrected.transformation.sourcePhrases, corrected.transformation.shuffledPhrases);
  assert.equal(corrected.transformation.reconstructionValid, true);
  assert.match(source, new RegExp(corrected.answer.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("conditional writing answer and required words come from the source", () => {
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-WRITING-CONDITIONAL",
    questionType: "writing_conditional",
  }), { typeLabel: "조건 영작" });
  assert.equal(corrected.choices.length, 0);
  assert.equal(corrected.transformation.requiredWords.length, 3);
  assert.equal(corrected.transformation.reconstructionValid, true);
  assert.ok(corrected.transformation.requiredWords.every((word) => corrected.answer.toLowerCase().includes(word.toLowerCase())));
});

test("grammar correction rejects an answer that is not present in the source", () => {
  assert.throws(() => correctVariantQuestion(problem({
    questionId: "VPB-TEST-GRAMMAR-CORRECTION-BAD",
    questionType: "grammar_correction",
    answer: "This sentence was invented and is not present in the source passage.",
  }), { typeLabel: "어법 오류 수정" }), /원문에서 복원하지 못했습니다/u);
});

test("title focuses on the passage conclusion instead of incidental family roles", () => {
  const automobileSource = [
    "Consider an innocent question asked years ago by a son to his father: Who invented the automobile?",
    "Trying to be instructive, the father told his son that Karl Benz invented the automobile.",
    "Someone else invented the tires, and another person invented the wheel.",
    "No one person invented all of the components of the automobile.",
    "Many people made significant discoveries that led to the invention of the automobile.",
  ].join(" ");
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-TITLE",
    questionType: "title",
    passage: automobileSource,
    choices: ["Gold and Money", "Trigger and Power", "Father and Son", "Wheel and Tires", "Automobile and Invented"],
    answer: 5,
  }), { typeLabel: "글의 제목" });
  const correct = corrected.choices[corrected.answer - 1];
  assert.match(correct, /automobile|invention/iu);
  assert.doesNotMatch(correct, /\b(?:son|father|us)\b/iu);
});

test("title removes quantifiers from extracted theme concepts", () => {
  const wellbeingSource = [
    "Recent research examines factors influencing wellbeing in later adulthood.",
    "Older learners select goals that match their life priorities.",
    "Together, these studies suggest that both goal alignment and positive selfperception are crucial for motivation and wellbeing in later life.",
    "This connection helps explain why carefully selected goals support a meaningful later life.",
  ].join(" ");
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-TITLE-QUANTIFIER",
    questionType: "title",
    passage: wellbeingSource,
    choices: ["Both Goal", "Two", "Three", "Four", "Five"],
    answer: 1,
  }), { typeLabel: "글의 제목" });
  assert.doesNotMatch(corrected.choices.join(" "), /\bBoth Goal\b/iu);
});

test("recommendation topic states the communicative purpose and named person", () => {
  const recommendationSource = [
    "I am writing to you on behalf of Ashley Hale.",
    "I have had the pleasure of coaching Ashley in soccer for three years and instructing her in Spanish.",
    "Ashley has displayed a very strong commitment to both her athletic and academic work.",
    "I recommend Ashley because her discipline and achievements make her an excellent candidate.",
  ].join(" ");
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-RECOMMENDATION",
    questionType: "topic",
    passage: recommendationSource,
    choices: ["soccer", "Spanish", "coaching", "a recommendation for Ashley Hale", "athletics"],
    answer: 4,
  }), { typeLabel: "글의 주제" });
  const correct = corrected.choices[corrected.answer - 1];
  assert.match(correct, /recommendation/iu);
  assert.match(correct, /Ashley Hale/iu);
});

test("long blank avoids form labels and selects a complete source sentence", () => {
  const formSource = [
    "A community group is holding a handmade toy competition for local families.",
    "The contest encourages creative play and the reuse of safe materials.",
    "Who: Open to all ages What to submit: A handmade toy and an instruction manual Where to send: Community Hall, 110 Main Street.",
    "Entries will be reviewed by teachers and artists after the submission deadline.",
  ].join(" ");
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-FORM-BLANK",
    questionType: "blank_long",
    passage: formSource,
    choices: ["One", "Two", "Three", "Four", "Who: Open to all ages What to submit: A handmade toy and an instruction manual Where to send: Community Hall, 110 Main Street."],
    answer: 5,
  }), { typeLabel: "빈칸 추론" });
  assert.doesNotMatch(corrected.transformation.removedText, /Who:|What to submit:|Where to send:/iu);
  assert.equal(corrected.transformation.reconstructionValid, true);
});

test("long blank rejects a lowercase sentence fragment", () => {
  const fragmentedSource = [
    "A design firm introduced a schedule that gives workers time to rest after work.",
    "Employees now leave their desks at a fixed time and use the office for community activities.",
    "is becoming a serious priority in offices around the world hoping to achieve similar results.",
  ].join(" ");
  assert.throws(() => correctVariantQuestion(problem({
    questionId: "VPB-TEST-FRAGMENT-BLANK",
    questionType: "blank_long",
    passage: fragmentedSource,
    choices: ["One", "Two", "Three", "Four", "Five"],
    answer: 5,
  }), { typeLabel: "빈칸 추론" }), /완전한 원문 문장/);
});

test("paragraph order rejects list and application form artifacts", () => {
  const listSource = [
    "Night at the Museum welcomes local students for an overnight program.",
    "Date & Time Every third weekend of the month.",
    "Booking Information w Book tickets online through the museum website.",
    "w Refunds can only be given up to two weeks before the event.",
  ].join(" ");
  assert.throws(() => correctVariantQuestion(problem({
    questionId: "VPB-TEST-LIST-ORDER",
    questionType: "paragraph_order",
    passage: listSource,
    choices: ["(A)-(B)-(C)", "(A)-(C)-(B)", "(B)-(A)-(C)", "(B)-(C)-(A)", "(C)-(A)-(B)"],
    answer: 1,
  }), { typeLabel: "글의 순서" }), /목록·신청서형/);
});

test("short blank distractors exclude pronouns abbreviations and one-letter tokens", () => {
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-BLANK-FILTER",
    questionType: "blank_short",
    passage: "The community library provides evening services for local visitors who cannot arrive during the day. Library officials review visitor demand and adjust staff hours whenever attendance changes. Regular readers use the library because its books and study rooms remain available after work. Families also attend reading programs, while teachers reserve quiet tables for students who need additional study time.",
    question: "원문의 빈칸에 들어갈 단어를 고르시오. Regular readers use the __________ because its books remain available.",
    choices: ["pm", "i", "them", "library", "it"],
    answer: 4,
  }), { typeLabel: "빈칸 추론" });
  assert.equal(corrected.choices[corrected.answer - 1], "library");
  assert.doesNotMatch(corrected.choices.join(" "), /^(?:i|it|pm|them)$/imu);
});

test("partial-truth distractor does not break a required based-on complement", () => {
  const argumentSource = [
    "An opinion is a belief or attitude about a subject.",
    "An argument differs because it supplies reasons and evidence for a conclusion.",
    "Arguments are the building blocks of philosophy, and a good philosopher creates strong arguments based on a solid foundation.",
    "A careful reader therefore tests whether each premise supports the stated conclusion.",
  ].join(" ");
  const corrected = correctVariantQuestion(problem({
    questionId: "VPB-TEST-BASED-ON",
    questionType: "claim",
    passage: argumentSource,
    choices: ["One", "Two", "Arguments are the building blocks of philosophy, and a good philosopher creates strong arguments based on a solid foundation.", "Four", "Five"],
    answer: 3,
  }), { typeLabel: "필자의 주장" });
  assert.doesNotMatch(corrected.choices.join(" "), /based\s+while/iu);
});
