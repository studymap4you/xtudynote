import {
  requestTextbookJson,
  resolveTextbookAiProvider,
  textbookAiResponseMeta,
} from "../api/_lib/textbook-ai-provider.mjs";
import { buildQuestionPrompt } from "../api/_lib/csat-question-engine/build-question-prompt.mjs";
import { loadQuestionRules } from "../api/_lib/csat-question-engine/load-question-rules.mjs";
import {
  normalizeGeneratedQuestion,
  validateQuestion,
} from "../api/_lib/csat-question-engine/validate-question.mjs";

const DEFAULT_MODELS = [
  "meta/muse-glimmer-30b",
  "google/diffusiongemma-26b-a4b-it",
];
const EXPECTED_MODELS = String(process.env.CSAT_LIVE_MODELS || "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const modelsToTest = EXPECTED_MODELS.length ? EXPECTED_MODELS : DEFAULT_MODELS;

const source = {
  id: "live-smoke-source-001",
  title: "Why Productive Struggle Improves Durable Learning",
  sourceType: "open-access-article",
  topic: ["education", "cognitive science"],
  difficulty: "high",
  copyrightStatus: "CC BY 4.0",
  text: `Students often interpret difficulty during learning as evidence that a method is ineffective. Yet cognitive research suggests that an appropriate amount of struggle can make learning more durable. When learners retrieve an idea instead of rereading it, their immediate performance may look worse because retrieval requires effort. That effort, however, strengthens the routes by which the idea can later be accessed. A similar pattern appears when practice is spaced over time. Students forget some details between sessions and must reconstruct them, but the reconstruction itself improves long-term retention. This does not mean that every obstacle is useful. Confusing instructions, missing background knowledge, and excessive task complexity can consume attention without improving understanding. Productive struggle must therefore be calibrated: a task should be difficult enough to require active reasoning but supported enough that learners can eventually succeed. Teachers can create this balance by offering brief hints after genuine attempts, comparing multiple solution paths, and asking students to explain why an answer works. The central challenge is that easy performance during a lesson is highly visible, whereas durable learning is revealed only later. Judging instruction solely by how fluent students appear in the moment may therefore reward methods that feel efficient but produce fragile knowledge.`,
};

const reference = {
  id: "2026-csat-blank-reference",
  exam: "CSAT",
  year: 2026,
  questionNumber: 31,
  questionType: "BLANK_SHORT",
  score: 3,
  difficulty: "high",
  passageStructure: "현상 제시 뒤 조건을 제한하고 핵심 결론을 빈칸으로 추론한다.",
  answerStructure: "글 전체의 역설과 제한 조건을 함께 포괄한다.",
  distractorPatterns: ["PARTIAL_TRUTH", "ADJACENT_TOPIC", "POLARITY_REVERSAL"],
  reasoningStructure: ["대조 전환을 찾는다.", "마지막 결론이 앞선 근거를 어떻게 일반화하는지 확인한다."],
};

const request = {
  userRequest: "고등학교 3학년 상위권 학생을 위한 수능형 영어 빈칸 추론 문제를 만들어줘.",
  targetGrade: "고3",
  targetLevel: "high",
  targetQuestionCount: 1,
  requestedTypes: ["BLANK_SHORT"],
  pageTargetDetected: false,
};

const rules = loadQuestionRules(["BLANK_SHORT"]);
const provider = resolveTextbookAiProvider(process.env, "questions");
if (provider.kind !== "nvidia") throw new Error("NVIDIA model-specific API keys are required");
const missingModels = modelsToTest.filter((model) => !provider.models.includes(model));
if (missingModels.length) throw new Error(`Missing model credentials: ${missingModels.join(", ")}`);

let failed = false;
for (const model of modelsToTest) {
  const startedAt = Date.now();
  try {
    const attempts = [];
    let question;
    let validation = { valid: false, issues: [] };
    let qualityAttempt = 0;
    for (qualityAttempt = 1; qualityAttempt <= 3; qualityAttempt += 1) {
      const prompt = buildQuestionPrompt({
        request,
        assignments: [{ questionType: "BLANK_SHORT", sourceId: source.id }],
        sources: [source],
        references: [reference],
        rules,
        existingQuestions: [],
        rejectionFeedback: validation.issues,
      });
      const response = await requestTextbookJson({
        provider: { ...provider, model, models: [model], enableThinking: false },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        maxTokens: 10_000,
        temperature: 0.25,
        timeoutMs: 90_000,
        maxElapsedMs: 190_000,
        retryDelaysMs: [0, 2_000],
      });
      const meta = textbookAiResponseMeta(response);
      attempts.push(...(meta?.attempts || []));
      const rawQuestion = Array.isArray(response?.questions) ? response.questions[0] : null;
      if (!rawQuestion) throw new Error("The model did not return a question");
      question = normalizeGeneratedQuestion(rawQuestion, {
        batchId: `live-${model.replace(/[^a-z0-9]+/gi, "-")}`,
        generationAttempt: qualityAttempt,
        difficulty: request.targetLevel,
        validReferenceIds: [reference.id],
        idFactory: () => "live-question-001",
      });
      validation = validateQuestion(question, {
        validSourceIds: [source.id],
        validReferenceIds: [reference.id],
        referenceIdsByType: { BLANK_SHORT: [reference.id] },
        allowedTypes: ["BLANK_SHORT"],
        existingQuestions: [],
        userRequest: request.userRequest,
        difficulty: request.targetLevel,
      });
      if (validation.valid) break;
    }
    const wordCount = (question.passage.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length;
    console.log(JSON.stringify({
      model,
      elapsedMs: Date.now() - startedAt,
      qualityAttempts: question.qualityMetadata.generationAttempt,
      attempts,
      valid: validation.valid,
      issues: validation.issues,
      passageWordCount: wordCount,
      stem: question.stem,
      choices: question.choices.map((choice) => ({
        index: choice.index,
        text: choice.text,
        isCorrect: choice.isCorrect,
      })),
      answer: question.answer,
      explanation: question.explanation,
      evidence: question.evidence,
    }, null, 2));
    if (!validation.valid) failed = true;
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({
      model,
      elapsedMs: Date.now() - startedAt,
      error: String(error?.message || error),
      attempts: Array.isArray(error?.providerAttempts) ? error.providerAttempts : [],
    }, null, 2));
  }
}

if (failed) process.exitCode = 1;
