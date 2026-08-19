#!/usr/bin/env node

import {
  requestTextbookJson,
  resolveTextbookAiProvider,
} from "../api/_lib/textbook-ai-provider.mjs";

const live = process.argv.includes("--live");
const thinking = process.argv.includes("--thinking");
const provider = resolveTextbookAiProvider(process.env, "academy");

if (process.env.TEXTBOOK_AI_PROVIDER === "openai" && process.env.TEXTBOOK_ALLOW_PAID_OPENAI !== "true") {
  throw new Error("Paid OpenAI is disabled unless TEXTBOOK_ALLOW_PAID_OPENAI=true");
}

if (!live) {
  console.log(
    JSON.stringify({
      provider: provider.kind,
      model: provider.model,
      paidOpenAiEnabled: process.env.TEXTBOOK_ALLOW_PAID_OPENAI === "true",
      liveRequest: false,
    }),
  );
  process.exit(0);
}

if (provider.kind !== "nvidia") {
  throw new Error("Live smoke testing requires TEXTBOOK_AI_PROVIDER=nvidia and NVIDIA_API_KEY");
}

const result = await requestTextbookJson({
  provider: { ...provider, enableThinking: thinking },
  maxTokens: thinking ? 1_024 : 256,
  timeoutMs: 30_000,
  temperature: 0.1,
  messages: [
    {
      role: "system",
      content: "Return only valid JSON with no markdown.",
    },
    {
      role: "user",
      content: 'Return exactly this object: {"ok":true,"provider":"nvidia"}',
    },
  ],
});

if (result?.ok !== true || result?.provider !== "nvidia") {
  throw new Error(`Unexpected NVIDIA response: ${JSON.stringify(result)}`);
}

console.log(JSON.stringify({ provider: provider.kind, model: provider.model, thinking, liveRequest: true, ok: true }));
