import { assignSourcesToBatch, buildNextBatchTypes, buildQuestionTypePlan, MAX_BATCH_RETRY } from "./build-batch-plan.mjs";
import { normalizeGeneratedQuestion, validateQuestion } from "./validate-question.mjs";

function assignmentKey(value) {
  return `${value.questionType}::${value.sourceId}`;
}

function removeAssignment(assignments, question) {
  const key = assignmentKey(question);
  const index = assignments.findIndex((assignment) => assignmentKey(assignment) === key);
  if (index < 0) return false;
  assignments.splice(index, 1);
  return true;
}

function padRetryAssignments(assignments, sources) {
  const padded = [...assignments];
  let cursor = 0;
  while (padded.length > 0 && padded.length < 4) {
    const base = assignments[cursor % assignments.length];
    const source = sources[(cursor + assignments.length) % sources.length];
    padded.push({
      questionType: base.questionType,
      sourceId: source.id,
      supplementalCandidate: true,
    });
    cursor += 1;
  }
  return padded;
}

export async function generateNextValidatedBatch({
  request,
  targetTypes,
  sources,
  references,
  rules,
  existingQuestions = [],
  generateBatch,
  batchId,
  maxBatchRetry = MAX_BATCH_RETRY,
  idFactory,
}) {
  const initialAssignments = assignSourcesToBatch(targetTypes, sources);
  const remainingAssignments = [...initialAssignments];
  const accepted = [];
  const rejected = [];
  let modelCallCount = 0;

  for (let generationAttempt = 1; generationAttempt <= maxBatchRetry && remainingAssignments.length; generationAttempt += 1) {
    modelCallCount += 1;
    const attemptAssignments = padRetryAssignments(remainingAssignments, sources);
    const raw = await generateBatch({
      request,
      assignments: attemptAssignments,
      sources,
      references,
      rules,
      existingQuestions: [...existingQuestions, ...accepted],
      generationAttempt,
      rejectionFeedback: rejected.slice(-12).flatMap((item) => item.issues),
    });
    const candidates = Array.isArray(raw?.questions) ? raw.questions : [];
    if (candidates.length === 0) {
      rejected.push({ candidateIndex: -1, issues: ["모델이 questions 배열을 반환하지 않았습니다."] });
      continue;
    }

    for (let candidateIndex = 0; candidateIndex < candidates.length && remainingAssignments.length; candidateIndex += 1) {
      const question = normalizeGeneratedQuestion(candidates[candidateIndex], {
        batchId,
        generationAttempt,
        difficulty: request.targetLevel,
        validReferenceIds: references.map((reference) => reference.id),
        idFactory,
      });
      const assignmentExists = remainingAssignments.some(
        (assignment) => assignment.questionType === question.questionType && assignment.sourceId === question.sourceId,
      );
      if (!assignmentExists) {
        rejected.push({ candidateIndex, questionType: question.questionType, issues: ["배정되지 않은 유형 또는 sourceId입니다."] });
        continue;
      }
      const validation = validateQuestion(question, {
        validSourceIds: sources.map((source) => source.id),
        validReferenceIds: references.map((reference) => reference.id),
        referenceIdsByType: Object.fromEntries(
          [...new Set(references.map((reference) => reference.questionType))].map((type) => [
            type,
            references.filter((reference) => reference.questionType === type).map((reference) => reference.id),
          ]),
        ),
        allowedTypes: remainingAssignments.map((assignment) => assignment.questionType),
        existingQuestions: [...existingQuestions, ...accepted],
        userRequest: request.userRequest,
        difficulty: request.targetLevel,
      });
      if (!validation.valid) {
        rejected.push({ candidateIndex, questionType: question.questionType, issues: validation.issues });
        continue;
      }
      if (!removeAssignment(remainingAssignments, question)) continue;
      accepted.push(question);
    }
  }

  return {
    assignments: initialAssignments,
    accepted,
    rejected,
    missingAssignments: remainingAssignments,
    modelCallCount,
    retryCount: Math.max(0, modelCallCount - 1),
    exhausted: remainingAssignments.length > 0,
  };
}

export async function runQuestionGenerationPipeline({
  request,
  sourceProvider,
  referenceProvider,
  rules,
  generateBatch,
  maxConsecutiveEmptyBatches = 3,
  idFactory,
}) {
  const questionTypePlan = buildQuestionTypePlan(request);
  const acceptedQuestions = [];
  let modelCallCount = 0;
  let retryCount = 0;
  let rejectedCount = 0;
  let consecutiveEmptyBatches = 0;
  let batchNumber = 0;

  while (acceptedQuestions.length < request.targetQuestionCount && consecutiveEmptyBatches < maxConsecutiveEmptyBatches) {
    batchNumber += 1;
    const targetTypes = buildNextBatchTypes(questionTypePlan, acceptedQuestions, 5);
    const sources = await sourceProvider({ request, acceptedQuestions, targetTypes, batchNumber });
    const references = await referenceProvider({ request, acceptedQuestions, targetTypes, batchNumber });
    const result = await generateNextValidatedBatch({
      request,
      targetTypes,
      sources,
      references,
      rules,
      existingQuestions: acceptedQuestions,
      generateBatch,
      batchId: `batch-${batchNumber}`,
      idFactory,
    });
    const needed = request.targetQuestionCount - acceptedQuestions.length;
    acceptedQuestions.push(...result.accepted.slice(0, needed));
    modelCallCount += result.modelCallCount;
    retryCount += result.retryCount;
    rejectedCount += result.rejected.length;
    consecutiveEmptyBatches = result.accepted.length ? 0 : consecutiveEmptyBatches + 1;
  }

  return {
    request,
    questionTypePlan,
    questions: acceptedQuestions,
    completed: acceptedQuestions.length === request.targetQuestionCount,
    modelCallCount,
    retryCount,
    rejectedCount,
    batchCount: batchNumber,
  };
}
