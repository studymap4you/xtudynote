import { timingSafeEqual } from "node:crypto";
import { getBillingFirestore } from "./_lib/billing/admin.mjs";
import { getBillingRuntimeConfig } from "./_lib/billing/config.mjs";
import { runBillingScheduler } from "./_lib/billing/service.mjs";

function authorized(req, secret) {
  if (!secret || secret.length < 24) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(String(req.headers?.authorization || ""));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }
  const config = getBillingRuntimeConfig();
  if (!authorized(req, config.cronSecret)) {
    res.status(401).json({ error: "cron-authentication-required" });
    return;
  }
  try {
    const summary = await runBillingScheduler({
      db: getBillingFirestore(),
      config,
      now: new Date(),
    });
    res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    const code = String(error instanceof Error ? error.message : "billing-cron-failed").slice(0, 140);
    console.error("[billing-cron]", { code });
    res.status(500).json({ error: "billing-cron-failed" });
  }
}
