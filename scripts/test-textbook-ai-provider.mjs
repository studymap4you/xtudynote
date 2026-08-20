import assert from "node:assert/strict";
import test from "node:test";
import {
  requestTextbookJson,
  resolveTextbookAiProvider,
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

test("retries a transient provider failure without changing the requested content", async () => {
  let calls = 0;
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
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(textbookAiResponseMeta(result).model, "nvidia/nemotron-3-ultra-550b-a55b");
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
