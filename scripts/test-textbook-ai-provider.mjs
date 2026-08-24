import assert from "node:assert/strict";
import test from "node:test";
import {
  requestTextbookJson,
  requestTextbookJsonWithFallback,
  resolveTextbookAiProvider,
  resolveTextbookAiProviderChain,
  textbookAiResponseMeta,
} from "../api/_lib/textbook-ai-provider.mjs";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("academy provider prefers the Korean-capable NVIDIA model and keeps a fallback", () => {
  const provider = resolveTextbookAiProvider({ NVIDIA_API_KEY: "test-key" }, "academy");
  assert.equal(provider.kind, "nvidia");
  assert.equal(provider.model, "nvidia/nemotron-3-ultra-550b-a55b");
  assert.deepEqual(provider.models, [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
  ]);
});

test("question provider includes all three fallback models", () => {
  const provider = resolveTextbookAiProvider({ NVIDIA_API_KEY: "test-key" }, "questions");
  assert.deepEqual(provider.models, [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "meta/muse-glimmer-30b",
    "google/diffusiongemma-26b-a4b-it",
  ]);
});

test("question provider chain falls back from NVIDIA to OpenAI when explicitly enabled", () => {
  const providers = resolveTextbookAiProviderChain({
    NVIDIA_API_KEY: "nvidia-test-key",
    OPENAI_API_KEY: "openai-test-key",
  }, "questions", { includeOpenAiFallback: true });
  assert.deepEqual(providers.map((provider) => provider.kind), ["nvidia", "openai"]);
  assert.equal(providers[1].model, "gpt-4o-mini");
});

test("question provider chain keeps NVIDIA-only operation when no OpenAI key exists", () => {
  const providers = resolveTextbookAiProviderChain({
    NVIDIA_API_KEY: "nvidia-test-key",
  }, "questions", { includeOpenAiFallback: true });
  assert.deepEqual(providers.map((provider) => provider.kind), ["nvidia"]);
});

test("all NVIDIA question models failing causes an actual OpenAI fallback request", async () => {
  const requestedModels = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requestedModels.push(body.model);
    if (body.model !== "gpt-4o-mini") return new Response("busy", { status: 503 });
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  const providers = resolveTextbookAiProviderChain({
    NVIDIA_API_KEY: "nvidia-test-key",
    OPENAI_API_KEY: "openai-test-key",
  }, "questions", { includeOpenAiFallback: true });
  const result = await requestTextbookJsonWithFallback({
    providers,
    requestOptions: {
      messages: [{ role: "user", content: "return json" }],
      retryDelaysMs: [0],
      retryStrategy: "round-robin",
    },
  });

  assert.deepEqual(requestedModels, [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "meta/muse-glimmer-30b",
    "google/diffusiongemma-26b-a4b-it",
    "gpt-4o-mini",
  ]);
  assert.equal(result.value.ok, true);
  assert.equal(result.meta.kind, "openai");
  assert.equal(result.meta.model, "gpt-4o-mini");
  assert.equal(JSON.stringify(result).includes("openai-test-key"), false);
});

test("question provider can use isolated keys without a shared NVIDIA key", async () => {
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ model: body.model, authorization: init.headers.Authorization });
    if (body.model === "meta/muse-glimmer-30b") return new Response("busy", { status: 503 });
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  const provider = resolveTextbookAiProvider({
    NVIDIA_API_KEY_MUSE_GLIMMER: "muse-test-key",
    NVIDIA_API_KEY_DIFFUSIONGEMMA: "diffusion-test-key",
  }, "questions");
  const result = await requestTextbookJson({
    provider,
    messages: [{ role: "user", content: "return json" }],
    retryDelaysMs: [0],
    retryStrategy: "round-robin",
  });

  assert.deepEqual(provider.models, ["meta/muse-glimmer-30b", "google/diffusiongemma-26b-a4b-it"]);
  assert.deepEqual(calls, [
    { model: "meta/muse-glimmer-30b", authorization: "Bearer muse-test-key" },
    { model: "google/diffusiongemma-26b-a4b-it", authorization: "Bearer diffusion-test-key" },
  ]);
  assert.equal(result.ok, true);
  assert.equal(textbookAiResponseMeta(result).model, "google/diffusiongemma-26b-a4b-it");
});

test("polls an accepted NVIDIA request until the result is ready", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return new Response("", { status: 202, headers: { "NVCF-REQID": "request-123", "Retry-After": "0" } });
    }
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  const result = await requestTextbookJson({
    provider: {
      kind: "nvidia",
      apiKey: "test-key",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "meta/muse-glimmer-30b",
      models: ["meta/muse-glimmer-30b"],
      enableThinking: false,
    },
    messages: [{ role: "user", content: "return json" }],
    retryDelaysMs: [0],
    timeoutMs: 5_000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(urls, [
    "https://integrate.api.nvidia.com/v1/chat/completions",
    "https://integrate.api.nvidia.com/v1/status/request-123",
  ]);
});

test("retries a transient provider failure without changing the requested content", async () => {
  let calls = 0;
  const progressEvents = [];
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.model, "nvidia/nemotron-3-ultra-550b-a55b");
    if (calls === 1) return new Response("busy", { status: 503 });
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  const result = await requestTextbookJson({
    provider: resolveTextbookAiProvider({ NVIDIA_API_KEY: "test-key" }, "academy"),
    messages: [{ role: "user", content: "return json" }],
    retryDelaysMs: [0, 0],
    onProgress: async (event) => progressEvents.push(event),
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(textbookAiResponseMeta(result).model, "nvidia/nemotron-3-ultra-550b-a55b");
  assert.deepEqual(progressEvents.map((event) => event.stage), [
    "attempt-started",
    "attempt-failed",
    "attempt-started",
    "attempt-succeeded",
  ]);
  assert.equal(JSON.stringify(progressEvents).includes("test-key"), false);
});

test("moves to the fallback NVIDIA model after repeated transient failures", async () => {
  const requestedModels = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requestedModels.push(body.model);
    if (body.model.includes("ultra")) return new Response("busy", { status: 503 });
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  const result = await requestTextbookJson({
    provider: resolveTextbookAiProvider({ NVIDIA_API_KEY: "test-key" }, "academy"),
    messages: [{ role: "user", content: "return json" }],
    retryDelaysMs: [0, 0],
  });
  assert.deepEqual(requestedModels, [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
  ]);
  assert.equal(textbookAiResponseMeta(result).model, "nvidia/nemotron-3.5-lightning-30b-a3b");
});
