import assert from "node:assert/strict";
import test from "node:test";
import type { DuplicateCluster, GenerationRun, UsageEvent } from "../models/generationRun.js";
import type {
  Problem,
  ProblemDraft,
  ProblemSearchQuery,
  ProblemStatus,
} from "../models/problem.js";
import type { Source } from "../models/source.js";
import { DuplicateService } from "../services/duplicateService.js";
import { HashEmbeddingProvider } from "../services/embeddingService.js";
import {
  DuplicateQuestionIdError,
  type ProblemRepository,
} from "../services/problemRepository.js";
import { ProblemReuseService } from "../services/problemReuseService.js";
import { ProblemSaveService } from "../services/problemSaveService.js";
import { InMemoryProblemSearchProvider } from "../services/problemSearchService.js";
import { ValidationService } from "../services/validationService.js";

class InMemoryRepository implements ProblemRepository {
  readonly problems = new Map<string, Problem>();
  readonly statusHistory = new Map<string, ProblemStatus[]>();
  readonly clusters = new Map<string, DuplicateCluster>();
  readonly usage = new Set<string>();
  readonly generationRuns = new Map<string, GenerationRun>();
  readonly sources = new Map<string, Source>();

  private record(problem: Problem): void {
    this.problems.set(problem.questionId, problem);
    const history = this.statusHistory.get(problem.questionId) || [];
    history.push(problem.status);
    this.statusHistory.set(problem.questionId, history);
  }

  async createRaw(problem: Problem): Promise<void> {
    if (this.problems.has(problem.questionId)) throw new DuplicateQuestionIdError(problem.questionId);
    this.record(problem);
  }

  async updateProblem(problem: Problem): Promise<void> {
    this.record(problem);
  }

  async getByQuestionId(questionId: string): Promise<Problem | null> {
    return this.problems.get(questionId) || null;
  }

  async findByFingerprint(fingerprint: string, limit = 5): Promise<Problem[]> {
    return [...this.problems.values()]
      .filter((problem) => problem.contentFingerprint === fingerprint)
      .slice(0, limit);
  }

  async listCandidates(
    query: ProblemSearchQuery,
    statuses: ProblemStatus[],
    limit: number,
  ): Promise<Problem[]> {
    return [...this.problems.values()]
      .filter((problem) => statuses.includes(problem.status))
      .filter((problem) => problem.subject === query.subject)
      .filter((problem) => problem.examFamily === query.examFamily)
      .filter((problem) => problem.questionType === query.questionType)
      .slice(0, limit);
  }

  async saveDuplicateCluster(cluster: DuplicateCluster): Promise<void> {
    this.clusters.set(cluster.clusterId, cluster);
  }

  async recordUsage(
    questionId: string,
    workbookId: string,
  ): Promise<{ recorded: boolean; event?: UsageEvent }> {
    const key = `${workbookId}:${questionId}`;
    if (this.usage.has(key)) return { recorded: false };
    this.usage.add(key);
    const event: UsageEvent = {
      eventId: `XUE_${this.usage.size}`,
      questionId,
      workbookId,
      timestamp: new Date(),
    };
    return { recorded: true, event };
  }

  async saveGenerationRun(run: GenerationRun): Promise<void> {
    this.generationRuns.set(run.generationRunId, run);
  }

  async saveSource(source: Source): Promise<void> {
    this.sources.set(source.sourceId, source);
  }
}

function validDraft(seed: number, questionId?: string): ProblemDraft {
  const passage = `Researchers examined how students evaluate evidence in unfamiliar contexts. `
    + `The ${seed}th study found that careful comparison improved judgment because participants checked `
    + `each claim against a clearly defined standard. Repeated practice also helped learners distinguish `
    + `relevant information from attractive but unsupported details. This result suggests that instruction `
    + `should emphasize explicit reasoning steps instead of rewarding quick guesses alone.`;
  return {
    questionId,
    subject: "english",
    language: "en",
    examFamily: "csat",
    grade: 12,
    questionType: "blank",
    difficulty: 4,
    sourceId: `XUS_${seed}`,
    passage,
    question: `Which option best completes the blank in study ${seed}?`,
    choices: [
      `checking evidence carefully ${seed}`,
      `ignoring all standards ${seed}`,
      `memorizing unrelated facts ${seed}`,
      `choosing the longest statement ${seed}`,
      `avoiding comparison entirely ${seed}`,
    ],
    answer: 1,
    explanation: `Option 1 restates the passage's claim that explicit comparison against evidence improves judgment in study ${seed}.`,
    conceptTags: ["evidence", `study-${seed}`],
    skillTags: ["inference"],
    generator: { provider: "test", model: "fixture", version: "1" },
  };
}

function createServices(repository = new InMemoryRepository()) {
  const embedding = new HashEmbeddingProvider(256);
  const search = new InMemoryProblemSearchProvider(
    () => [...repository.problems.values()],
    embedding,
  );
  const duplicate = new DuplicateService(repository, search);
  const save = new ProblemSaveService(
    repository,
    embedding,
    new ValidationService(),
    duplicate,
  );
  return { repository, search, save };
}

function searchQuery(count: number): ProblemSearchQuery {
  return {
    subject: "english",
    language: "en",
    examFamily: "csat",
    grade: 12,
    questionType: "blank",
    difficulty: 4,
    count,
    sourceText: "evidence based reasoning and careful comparison",
    conceptTags: ["evidence"],
    skillTags: ["inference"],
  };
}

test("a valid AI problem is written as raw before it becomes approved", async () => {
  const { repository, save } = createServices();
  const result = await save.save(validDraft(1, "XUQ_VALID_1"));
  assert.equal(result.problem.status, "approved");
  assert.deepEqual(repository.statusHistory.get("XUQ_VALID_1"), ["raw", "approved"]);
});

test("a missing answer is rejected by validation", async () => {
  const { repository, save } = createServices();
  const draft = validDraft(2, "XUQ_INVALID_ANSWER");
  draft.answer = undefined;
  const result = await save.save(draft);
  assert.equal(result.problem.status, "rejected");
  assert.equal(result.problem.validation.answerPresent, false);
  assert.deepEqual(repository.statusHistory.get("XUQ_INVALID_ANSWER"), ["raw", "rejected"]);
});

test("search returns approved and gold problems only", async () => {
  const { repository, save, search } = createServices();
  const approved = await save.save(validDraft(3, "XUQ_APPROVED"));
  const gold: Problem = { ...approved.problem, questionId: "XUQ_GOLD", status: "gold" };
  const raw: Problem = { ...approved.problem, questionId: "XUQ_RAW", status: "raw" };
  const rejected: Problem = { ...approved.problem, questionId: "XUQ_REJECTED", status: "rejected" };
  await repository.createRaw(gold);
  await repository.createRaw(raw);
  await repository.createRaw(rejected);
  const result = await search.searchSimilarProblems(searchQuery(10));
  assert.deepEqual(
    new Set(result.problems.map((entry) => entry.problem.status)),
    new Set<ProblemStatus>(["approved", "gold"]),
  );
});

test("saving the same permanent questionId twice is blocked", async () => {
  const { save } = createServices();
  await save.save(validDraft(4, "XUQ_STABLE_ID"));
  await assert.rejects(
    () => save.save(validDraft(5, "XUQ_STABLE_ID")),
    DuplicateQuestionIdError,
  );
});

test("identical content is placed in a duplicate cluster", async () => {
  const { repository, save } = createServices();
  await save.save(validDraft(6, "XUQ_CANONICAL"));
  const duplicateDraft = validDraft(6, "XUQ_DUPLICATE");
  const duplicate = await save.save(duplicateDraft);
  assert.equal(duplicate.problem.status, "duplicate");
  assert.ok(duplicate.problem.duplicateClusterId);
  assert.equal(repository.clusters.size, 1);
});

test("10 requested with 7 reusable problems generates only the missing 3", async () => {
  const { repository, save, search } = createServices();
  for (let index = 1; index <= 7; index += 1) {
    await save.save(validDraft(100 + index, `XUQ_REUSE_${index}`));
  }
  const reuse = new ProblemReuseService(search, save);
  let requestedFromGenerator = 0;
  const result = await reuse.fulfill(searchQuery(10), async (missingCount) => {
    requestedFromGenerator = missingCount;
    return Array.from({ length: missingCount }, (_, index) => (
      validDraft(200 + index, `XUQ_GENERATED_${index + 1}`)
    ));
  });
  assert.equal(requestedFromGenerator, 3);
  assert.equal(result.reusedQuestionCount, 7);
  assert.equal(result.generatedQuestionCount, 3);
  assert.equal(result.savedQuestionCount, 3);
  assert.equal(result.problems.length, 10);
  assert.equal(repository.problems.size, 10);
});
