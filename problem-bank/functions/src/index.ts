import { timingSafeEqual } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { getProblem } from "./api/getProblem.js";
import { ApiError } from "./api/errors.js";
import { reportUsage } from "./api/reportUsage.js";
import { saveGenerationRun } from "./api/saveGenerationRun.js";
import { saveProblem } from "./api/saveProblem.js";
import { searchProblems } from "./api/searchProblems.js";
import { DuplicateService } from "./services/duplicateService.js";
import { HashEmbeddingProvider } from "./services/embeddingService.js";
import { DuplicateQuestionIdError, FirestoreProblemRepository } from "./services/problemRepository.js";
import { ProblemSaveService } from "./services/problemSaveService.js";
import { FirestoreProblemSearchProvider } from "./services/problemSearchService.js";
import { ValidationService } from "./services/validationService.js";

if (!getApps().length) initializeApp();

const REGION = "asia-northeast3";
const serviceToken = defineSecret("PROBLEM_BANK_SERVICE_TOKEN");
const firestore = getFirestore();
const repository = new FirestoreProblemRepository(firestore);
const embeddingProvider = new HashEmbeddingProvider(256);
const searchProvider = new FirestoreProblemSearchProvider(
  firestore,
  repository,
  embeddingProvider,
  (message, context) => logger.warn(message, context),
);
const duplicateService = new DuplicateService(repository, searchProvider);
const saveService = new ProblemSaveService(
  repository,
  embeddingProvider,
  new ValidationService(),
  duplicateService,
);

function authorized(header: string | undefined, expected: string): boolean {
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function normalizedPath(path: string): string {
  const cleaned = path.replace(/\/+$/u, "") || "/";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

export const problemBankApi = onRequest(
  {
    region: REGION,
    cors: false,
    invoker: "public",
    secrets: [serviceToken],
    timeoutSeconds: 60,
    memory: "512MiB",
    maxInstances: 20,
  },
  async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    const startedAt = Date.now();
    const path = normalizedPath(request.path);
    if (!authorized(request.headers.authorization, serviceToken.value())) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      let payload: unknown;
      let operation = "unknown";
      if (request.method === "POST" && path === "/api/problems/search") {
        operation = "problem_search";
        payload = await searchProblems(request.body, searchProvider);
      } else if (request.method === "POST" && path === "/api/problems") {
        operation = "problem_save";
        payload = await saveProblem(request.body, saveService);
      } else if (request.method === "POST" && path === "/api/generation-runs") {
        operation = "generation_run_save";
        payload = await saveGenerationRun(request.body, repository);
      } else {
        const usageMatch = path.match(/^\/api\/problems\/([^/]+)\/usage$/u);
        const getMatch = path.match(/^\/api\/problems\/([^/]+)$/u);
        if (request.method === "POST" && usageMatch) {
          operation = "problem_usage";
          payload = await reportUsage(decodeURIComponent(usageMatch[1]), request.body, repository);
        } else if (request.method === "GET" && getMatch) {
          operation = "problem_get";
          payload = await getProblem(decodeURIComponent(getMatch[1]), repository);
        } else {
          throw new ApiError(404, "route_not_found", "Route not found.");
        }
      }
      const safePayload = payload as Record<string, unknown>;
      const requestDurationMs = Date.now() - startedAt;
      const transition = String(safePayload.transition || "");
      const status = String(safePayload.status || "");
      logger.info("problem_bank_request", {
        operation,
        durationMs: requestDurationMs,
        searchLatencyMs: operation === "problem_search" ? requestDurationMs : undefined,
        generationLatencyMs: operation === "generation_run_save" ? safePayload.durationMs : undefined,
        requestedCount: safePayload.requestedCount,
        foundCount: safePayload.foundCount,
        missingCount: safePayload.missingCount,
        reuseCount: operation === "problem_search"
          ? safePayload.foundCount
          : safePayload.reusedQuestionCount,
        generatedCount: safePayload.generatedQuestionCount,
        savedCount: operation === "problem_save"
          ? Number(status === "approved" || status === "gold")
          : safePayload.savedQuestionCount,
        rejectedCount: operation === "problem_save"
          ? Number(status === "rejected")
          : safePayload.rejectedQuestionCount,
        duplicateCount: operation === "problem_save"
          ? Number(transition === "raw_to_duplicate")
          : undefined,
        status: safePayload.status,
        transition: safePayload.transition,
      });
      response.status(200).json(payload);
    } catch (error) {
      const statusCode = error instanceof ApiError
        ? error.statusCode
        : error instanceof DuplicateQuestionIdError
          ? 409
          : 500;
      const code = error instanceof ApiError
        ? error.code
        : error instanceof DuplicateQuestionIdError
          ? "duplicate_question_id"
          : "internal_error";
      logger.error("problem_bank_request_failed", {
        path,
        method: request.method,
        durationMs: Date.now() - startedAt,
        code,
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      response.status(statusCode).json({ error: code });
    }
  },
);
