const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_NVIDIA_ACADEMY_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
];
const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const DEFAULT_NVIDIA_QUESTION_MODELS = [
  DEFAULT_NVIDIA_MODEL,
  "meta/muse-glimmer-30b",
  "google/diffusiongemma-26b-a4b-it",
];
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const RESPONSE_META = Symbol("textbook-ai-response-meta");

function envFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizedBaseUrl(value, fallback) {
  return String(value || fallback).replace(/\/+$/, "");
}

function uniqueModels(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function nvidiaModels(env, modelScope) {
  const scope = modelScope.toUpperCase();
  const configuredList = String(env[`NVIDIA_MODELS_${scope}`] || env.NVIDIA_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const configuredPrimary = String(env[`NVIDIA_MODEL_${scope}`] || env.NVIDIA_MODEL || "").trim();
  const defaults = modelScope === "academy"
    ? DEFAULT_NVIDIA_ACADEMY_MODELS
    : modelScope === "questions"
      ? DEFAULT_NVIDIA_QUESTION_MODELS
      : [DEFAULT_NVIDIA_MODEL];
  return uniqueModels([configuredPrimary, ...configuredList, ...defaults]);
}

function nvidiaModelApiKeys(env, models, genericKey) {
  const aliases = {
    "nvidia/nemotron-3.5-lightning-30b-a3b": [
      "NVIDIA_API_KEY_NEMOTRON",
      "NVIDIA_API_KEY_NEMOTRON_LIGHTNING",
    ],
    "meta/muse-glimmer-30b": ["NVIDIA_API_KEY_MUSE_GLIMMER", "NVIDIA_API_KEY_MUSE"],
    "google/diffusiongemma-26b-a4b-it": [
      "NVIDIA_API_KEY_DIFFUSIONGEMMA",
      "NVIDIA_API_KEY_DIFFUSION_GEMMA",
    ],
  };
  return Object.fromEntries(
    models.flatMap((model) => {
      const specificKey = (aliases[model] || [])
        .map((name) => String(env[name] || "").trim())
        .find(Boolean);
      const apiKey = specificKey || genericKey;
      return apiKey ? [[model, apiKey]] : [];
    }),
  );
}

export function resolveTextbookAiProvider(env = process.env, modelScope = "academy") {
  const requested = String(env.TEXTBOOK_AI_PROVIDER || "nvidia").trim().toLowerCase();
  const nvidiaKey = String(env.NVIDIA_API_KEY || "").trim();
  const openAiKey = String(env.OPENAI_API_KEY || "").trim();
  const allowPaidOpenAi = envFlag(env.TEXTBOOK_ALLOW_PAID_OPENAI);

  if (requested === "nvidia" || requested === "auto") {
    const configuredModels = nvidiaModels(env, modelScope);
    const modelApiKeys = nvidiaModelApiKeys(env, configuredModels, nvidiaKey);
    const models = configuredModels.filter((model) => modelApiKeys[model]);
    if (models.length > 0) {
      return {
        kind: "nvidia",
        apiKey: modelApiKeys[models[0]],
        modelApiKeys,
        baseUrl: normalizedBaseUrl(env.NVIDIA_BASE_URL, DEFAULT_NVIDIA_BASE_URL),
        model: models[0],
        models,
        enableThinking: !/^(0|false|no|off)$/i.test(String(env.NVIDIA_ENABLE_THINKING ?? "true")),
      };
    }
  }

  if ((requested === "openai" || requested === "auto") && allowPaidOpenAi && openAiKey) {
    return {
      kind: "openai",
      apiKey: openAiKey,
      baseUrl: normalizedBaseUrl(env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL),
      model:
        String(
          env[`OPENAI_MODEL_${modelScope.toUpperCase()}`] ||
            (modelScope === "academy" ? env.OPENAI_MODEL_ACADEMY : "") ||
            env.OPENAI_MODEL ||
            "",
        ).trim() || DEFAULT_OPENAI_MODEL,
      enableThinking: false,
    };
  }

  return {
    kind: "mock",
    apiKey: "",
    baseUrl: "",
    model: "mock",
    enableThinking: false,
    reason:
      requested === "openai" && openAiKey && !allowPaidOpenAi
        ? "paid-openai-disabled"
        : requested === "nvidia" && !nvidiaKey
          ? "nvidia-key-missing"
          : "provider-not-configured",
  };
}

export function extractJsonObject(text) {
  const trimmed = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function textbookAiResponseMeta(value) {
  return value && typeof value === "object" ? value[RESPONSE_META] : undefined;
}

function wait(delayMs) {
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function emitProviderProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;
  try {
    await onProgress(event);
  } catch (error) {
    console.warn("[textbook-ai] provider progress callback failed", error instanceof Error ? error.message : error);
  }
}

function retryableProviderError(error) {
  if (typeof error?.retryable === "boolean") return error.retryable;
  const message = String(error?.message || "");
  return /json-parse-failed|provider-timeout|network-failed|request-failed:[^:]+:(408|425|429|5\d\d)/.test(message);
}

function providerError(message, { status, retryAfterMs, retryable } = {}) {
  const error = new Error(message);
  if (Number.isFinite(status)) error.status = status;
  if (Number.isFinite(retryAfterMs)) error.retryAfterMs = retryAfterMs;
  if (typeof retryable === "boolean") error.retryable = retryable;
  return error;
}

function retryAfterMs(response) {
  const value = String(response.headers.get("retry-after") || "").trim();
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function fetchProvider(url, options, timeoutMs, providerKind) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw providerError(`ai-provider-timeout:${providerKind}`, { retryable: true });
    }
    throw providerError(`ai-provider-network-failed:${providerKind}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

async function responsePayload(response) {
  const text = await response.text().catch(() => "");
  if (!text) return { text, data: null };
  try {
    return { text, data: JSON.parse(text) };
  } catch {
    return { text, data: null };
  }
}

function asyncRequestId(response, data) {
  return String(
    response.headers.get("nvcf-reqid") ||
      response.headers.get("x-request-id") ||
      data?.requestId ||
      data?.request_id ||
      data?.id ||
      "",
  ).trim();
}

async function resolveProviderResponse({ response, provider, apiKey, deadline }) {
  let current = response;
  let requestId = "";
  while (current.status === 202) {
    const payload = await responsePayload(current);
    requestId = asyncRequestId(current, payload.data) || requestId;
    if (!requestId) {
      throw providerError(`ai-provider-request-failed:${provider.kind}:202`, {
        status: 202,
        retryable: true,
      });
    }
    const delayMs = Math.max(500, retryAfterMs(current) || 1_000);
    const remainingBeforeWait = deadline - Date.now();
    if (remainingBeforeWait <= delayMs + 1_000) {
      throw providerError(`ai-provider-timeout:${provider.kind}`, { retryable: true });
    }
    await wait(delayMs);
    const remainingMs = deadline - Date.now();
    current = await fetchProvider(
      `${provider.baseUrl}/status/${encodeURIComponent(requestId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
      Math.max(1_000, remainingMs),
      provider.kind,
    );
  }
  return current;
}

async function requestProviderJson({ provider, model, messages, maxTokens, temperature, timeoutMs }) {
  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages,
  };

  if (provider.kind === "nvidia") {
    body.top_p = 0.95;
    if (model === "meta/muse-glimmer-30b") {
      if (provider.enableThinking) body.reasoning_effort = "medium";
    } else {
      body.chat_template_kwargs = { enable_thinking: provider.enableThinking };
      if (provider.enableThinking) body.reasoning_budget = Math.min(maxTokens, 4_096);
    }
  } else {
    body.response_format = { type: "json_object" };
  }

  const apiKey = provider.modelApiKeys?.[model] || provider.apiKey;
  if (!apiKey) throw providerError(`ai-provider-key-missing:${provider.kind}`, { retryable: false });
  const deadline = Date.now() + timeoutMs;
  let response = await fetchProvider(
    `${provider.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
    provider.kind,
  );
  response = await resolveProviderResponse({ response, provider, apiKey, deadline });

  if (!response.ok) {
    const payload = await responsePayload(response);
    console.error(
      `[textbook-ai] ${model} request failed`,
      response.status,
      payload.text.slice(0, 600),
    );
    throw providerError(`ai-provider-request-failed:${provider.kind}:${response.status}`, {
      status: response.status,
      retryAfterMs: retryAfterMs(response),
      retryable: [408, 425, 429].includes(response.status) || response.status >= 500,
    });
  }

  const { data } = await responsePayload(response);
  const parsed = extractJsonObject(data?.choices?.[0]?.message?.content);
  if (!parsed) {
    throw providerError(`ai-provider-json-parse-failed:${provider.kind}`, {
      status: response.status,
      retryable: true,
    });
  }
  return { value: parsed, status: response.status };
}

function providerAttemptDiagnostic({ model, attempt, startedAt, status, error }) {
  return {
    model,
    attempt,
    status: Number.isFinite(status) ? status : Number(error?.status) || null,
    durationMs: Math.max(0, Date.now() - startedAt),
    error: error ? String(error?.message || error).slice(0, 180) : null,
  };
}

function attachResponseMeta(value, meta) {
  if (!value || typeof value !== "object") return value;
  Object.defineProperty(value, RESPONSE_META, {
    configurable: false,
    enumerable: false,
    value: meta,
  });
  return value;
}

export async function requestTextbookJson({
  provider,
  messages,
  maxTokens = 7_000,
  temperature = 0.28,
  timeoutMs = 55_000,
  retryDelaysMs = [0, 900, 2_400],
  maxElapsedMs = Number.POSITIVE_INFINITY,
  retryStrategy = "model-first",
  onProgress,
}) {
  if (!provider || provider.kind === "mock" || !provider.apiKey) {
    throw new Error("ai-provider-not-configured");
  }
  const models = uniqueModels(Array.isArray(provider.models) ? provider.models : [provider.model]);
  const startedAt = Date.now();
  const attempts = [];
  const disabledModels = new Set();
  const retryAfterByModel = new Map();
  let lastError;
  const attemptIndexes = retryDelaysMs.map((_, index) => index);
  const schedule = retryStrategy === "round-robin"
    ? attemptIndexes.flatMap((attempt) => models.map((model) => ({ model, attempt })))
    : models.flatMap((model) => attemptIndexes.map((attempt) => ({ model, attempt })));

  for (const { model, attempt } of schedule) {
    if (disabledModels.has(model)) continue;
    const delayMs = Math.max(
      Number(retryDelaysMs[attempt]) || 0,
      Number(retryAfterByModel.get(model)) || 0,
    );
    retryAfterByModel.delete(model);
    const remainingBeforeWait = maxElapsedMs - (Date.now() - startedAt);
    if (remainingBeforeWait <= delayMs + 4_000) {
      await emitProviderProgress(onProgress, {
        stage: "time-budget-exhausted",
        model,
        attempt: attempt + 1,
        elapsedMs: Date.now() - startedAt,
      });
      if (lastError) break;
      throw new Error(`ai-provider-time-budget-exhausted:${provider.kind}`);
    }
    if (delayMs > 0) {
      await emitProviderProgress(onProgress, {
        stage: "retry-wait",
        model,
        attempt: attempt + 1,
        delayMs,
      });
    }
    await wait(delayMs);
    const remainingMs = maxElapsedMs - (Date.now() - startedAt);
    if (remainingMs < 5_000) break;
    const attemptStartedAt = Date.now();
    await emitProviderProgress(onProgress, {
      stage: "attempt-started",
      model,
      attempt: attempt + 1,
      timeoutMs: Math.min(timeoutMs, Math.max(4_000, remainingMs - 1_000)),
    });
    try {
      const result = await requestProviderJson({
        provider,
        model,
        messages,
        maxTokens,
        temperature,
        timeoutMs: Math.min(timeoutMs, Math.max(4_000, remainingMs - 1_000)),
      });
      const diagnostic = providerAttemptDiagnostic({
        model,
        attempt: attempt + 1,
        startedAt: attemptStartedAt,
        status: result.status,
      });
      attempts.push(diagnostic);
      await emitProviderProgress(onProgress, {
        stage: "attempt-succeeded",
        ...diagnostic,
      });
      return attachResponseMeta(result.value, { kind: provider.kind, model, attempts });
    } catch (error) {
      lastError = error;
      const diagnostic = providerAttemptDiagnostic({
        model,
        attempt: attempt + 1,
        startedAt: attemptStartedAt,
        error,
      });
      attempts.push(diagnostic);
      const canRetry = retryableProviderError(error);
      if (!canRetry) disabledModels.add(model);
      if (canRetry && Number(error?.retryAfterMs) > 0) {
        retryAfterByModel.set(model, Number(error.retryAfterMs));
      }
      await emitProviderProgress(onProgress, {
        stage: "attempt-failed",
        ...diagnostic,
        retryable: canRetry,
        retryAfterMs: Number(error?.retryAfterMs) || 0,
      });
      console.warn(
        canRetry ? `[textbook-ai] retrying ${model}` : `[textbook-ai] moving past ${model}`,
        `${attempt + 1}/${retryDelaysMs.length}`,
        String(error?.message || error),
      );
    }
  }
  const error = lastError || new Error(`ai-provider-request-failed:${provider.kind}:unknown`);
  Object.defineProperty(error, "providerAttempts", {
    configurable: false,
    enumerable: false,
    value: attempts,
  });
  throw error;
}
