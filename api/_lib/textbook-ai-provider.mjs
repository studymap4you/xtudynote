const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function envFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizedBaseUrl(value, fallback) {
  return String(value || fallback).replace(/\/+$/, "");
}

export function resolveTextbookAiProvider(env = process.env, modelScope = "academy") {
  const requested = String(env.TEXTBOOK_AI_PROVIDER || "nvidia").trim().toLowerCase();
  const nvidiaKey = String(env.NVIDIA_API_KEY || "").trim();
  const openAiKey = String(env.OPENAI_API_KEY || "").trim();
  const allowPaidOpenAi = envFlag(env.TEXTBOOK_ALLOW_PAID_OPENAI);

  if ((requested === "nvidia" || requested === "auto") && nvidiaKey) {
    return {
      kind: "nvidia",
      apiKey: nvidiaKey,
      baseUrl: normalizedBaseUrl(env.NVIDIA_BASE_URL, DEFAULT_NVIDIA_BASE_URL),
      model:
        String(env[`NVIDIA_MODEL_${modelScope.toUpperCase()}`] || env.NVIDIA_MODEL || "").trim() ||
        DEFAULT_NVIDIA_MODEL,
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

export async function requestTextbookJson({
  provider,
  messages,
  maxTokens = 7_000,
  temperature = 0.28,
  timeoutMs = 55_000,
}) {
  if (!provider || provider.kind === "mock" || !provider.apiKey) {
    throw new Error("ai-provider-not-configured");
  }

  const body = {
    model: provider.model,
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
    console.error(`[textbook-ai] ${provider.kind} request failed`, response.status, detail.slice(0, 600));
    throw new Error(`ai-provider-request-failed:${provider.kind}:${response.status}`);
  }

  const data = await response.json();
  const parsed = extractJsonObject(data?.choices?.[0]?.message?.content);
  if (!parsed) throw new Error(`ai-provider-json-parse-failed:${provider.kind}`);
  return parsed;
}
