const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_NVIDIA_ACADEMY_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
];
const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
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
  const defaults = modelScope === "academy" ? DEFAULT_NVIDIA_ACADEMY_MODELS : [DEFAULT_NVIDIA_MODEL];
  return uniqueModels([configuredPrimary, ...configuredList, ...defaults]);
}

export function resolveTextbookAiProvider(env = process.env, modelScope = "academy") {
  const requested = String(env.TEXTBOOK_AI_PROVIDER || "nvidia").trim().toLowerCase();
  const nvidiaKey = String(env.NVIDIA_API_KEY || "").trim();
  const openAiKey = String(env.OPENAI_API_KEY || "").trim();
  const allowPaidOpenAi = envFlag(env.TEXTBOOK_ALLOW_PAID_OPENAI);

  if ((requested === "nvidia" || requested === "auto") && nvidiaKey) {
    const models = nvidiaModels(env, modelScope);
    return {
      kind: "nvidia",
      apiKey: nvidiaKey,
      baseUrl: normalizedBaseUrl(env.NVIDIA_BASE_URL, DEFAULT_NVIDIA_BASE_URL),
      model: models[0],
      models,
      enableThinking: !/^(0|false|no|off)$/i.test(String(env.NVIDIA_ENABLE_THINKING ?? "true")),
    };
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

function retryableProviderError(error) {
  const message = String(error?.message || "");
  return /json-parse-failed|provider-timeout|network-failed|request-failed:[^:]+:(408|425|429|5\d\d)/.test(message);
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
    body.chat_template_kwargs = { enable_thinking: provider.enableThinking };
    if (provider.enableThinking) body.reasoning_budget = Math.min(maxTokens, 4_096);
  } else {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`ai-provider-timeout:${provider.kind}`);
    throw new Error(`ai-provider-network-failed:${provider.kind}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[textbook-ai] ${model} request failed`,
      response.status,
      detail.slice(0, 600),
    );
    throw new Error(`ai-provider-request-failed:${provider.kind}:${response.status}`);
  }

  const data = await response.json();
  const parsed = extractJsonObject(data?.choices?.[0]?.message?.content);
  if (!parsed) throw new Error(`ai-provider-json-parse-failed:${provider.kind}`);
  if (parsed && typeof parsed === "object") {
    Object.defineProperty(parsed, RESPONSE_META, {
      configurable: false,
      enumerable: false,
      value: { kind: provider.kind, model },
    });
  }
  return parsed;
}

export async function requestTextbookJson({
  provider,
  messages,
  maxTokens = 7_000,
  temperature = 0.28,
  timeoutMs = 55_000,
  retryDelaysMs = [0, 900, 2_400],
  maxElapsedMs = Number.POSITIVE_INFINITY,
}) {
  if (!provider || provider.kind === "mock" || !provider.apiKey) {
    throw new Error("ai-provider-not-configured");
  }
  const models = uniqueModels(Array.isArray(provider.models) ? provider.models : [provider.model]);
  const startedAt = Date.now();
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
      await wait(Number(retryDelaysMs[attempt]) || 0);
      const remainingMs = maxElapsedMs - (Date.now() - startedAt);
      if (remainingMs < 5_000) {
        throw lastError || new Error(`ai-provider-time-budget-exhausted:${provider.kind}`);
      }
      try {
        return await requestProviderJson({
          provider,
          model,
          messages,
          maxTokens,
          temperature,
          timeoutMs: Math.min(timeoutMs, Math.max(4_000, remainingMs - 1_000)),
        });
      } catch (error) {
        lastError = error;
        const canRetry = retryableProviderError(error);
        if (!canRetry) break;
        console.warn(
          `[textbook-ai] retrying ${model}`,
          `${attempt + 1}/${retryDelaysMs.length}`,
          String(error?.message || error),
        );
      }
    }
  }
  throw lastError || new Error(`ai-provider-request-failed:${provider.kind}:unknown`);
}
