import {
  assignSourcesToBatch,
  buildNextBatchTypes,
  buildQuestionTypePlan,
  MAX_BATCH_RETRY,
  QUESTION_BATCH_MAX,
} from "./build-batch-plan.mjs";
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

async function emitPipelineProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;
  try {
    await onProgress(event);
  } catch (error) {
    console.warn("[csat-question-engine] pipeline progress callback failed", error instanceof Error ? error.message : error);
  }
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
  onProgress,
}) {
  const initialAssignments = assignSourcesToBatch(targetTypes, sources);
  const remainingAssignments = [...initialAssignments];
  const accepted = [];
  const rejected = [];
  let modelCallCount = 0;

  await emitPipelineProgress(onProgress, {
    stage: "assignments-prepared",
    assignments: initialAssignments,
  });

  for (let generationAttempt = 1; generationAttempt <= maxBatchRetry && remainingAssignments.length; generationAttempt += 1) {
    modelCallCount += 1;
    const attemptAssignments = [...remainingAssignments];
    const acceptedBefore = accepted.length;
    const rejectedBefore = rejected.length;
    await emitPipelineProgress(onProgress, {
      stage: "generation-attempt-started",
      generationAttempt,
      assignments: attemptAssignments,
      previousRejectionIssues: rejected.slice(-12).flatMap((item) => item.issues),
    });
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
    await emitPipelineProgress(onProgress, {
      stage: "model-response-parsed",
      generationAttempt,
      candidateCount: candidates.length,
    });
    if (candidates.length === 0) {
      const issues = ["모델이 questions 배열을 반환하지 않았습니다."];
      rejected.push({ candidateIndex: -1, issues });
      await emitPipelineProgress(onProgress, {
        stage: "candidate-rejected",
        generationAttempt,
        candidateIndex: -1,
        issues,
      });
      await emitPipelineProgress(onProgress, {
        stage: "generation-attempt-completed",
        generationAttempt,
        acceptedCount: 0,
        rejectedCount: rejected.length - rejectedBefore,
        remainingAssignments: [...remainingAssignments],
      });
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
        const issues = ["배정되지 않은 유형 또는 sourceId입니다."];
        rejected.push({ candidateIndex, questionType: question.questionType, issues });
        await emitPipelineProgress(onProgress, {
          stage: "candidate-rejected",
          generationAttempt,
          candidateIndex,
          questionType: question.questionType,
          sourceId: question.sourceId,
          issues,
        });
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
        await emitPipelineProgress(onProgress, {
          stage: "candidate-rejected",
          generationAttempt,
          candidateIndex,
          questionType: question.questionType,
          sourceId: question.sourceId,
          issues: validation.issues,
        });
        continue;
      }
      if (!removeAssignment(remainingAssignments, question)) continue;
      accepted.push(question);
      await emitPipelineProgress(onProgress, {
        stage: "candidate-accepted",
        generationAttempt,
        candidateIndex,
        questionId: question.id,
        questionType: question.questionType,
        sourceId: question.sourceId,
        referenceQuestionIds: question.referenceQuestionIds,
      });
    }
    await emitPipelineProgress(onProgress, {
      stage: "generation-attempt-completed",
      generationAttempt,
      acceptedCount: accepted.length - acceptedBefore,
      rejectedCount: rejected.length - rejectedBefore,
      remainingAssignments: [...remainingAssignments],
    });
  }

  await emitPipelineProgress(onProgress, {
    stage: "validated-batch-completed",
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    missingAssignments: [...remainingAssignments],
    modelCallCount,
  });

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
  onProgress,
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
    const targetTypes = buildNextBatchTypes(questionTypePlan, acceptedQuestions, QUESTION_BATCH_MAX);
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
      onProgress,
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
