import {
  assertTrustedOrigin,
  billingErrorStatus,
  getBillingFirestore,
  parseBody,
  requireBillingUser,
  safeBillingErrorCode,
} from "./_lib/billing/admin.mjs";
import { getBillingRuntimeConfig } from "./_lib/billing/config.mjs";
import { getAdminBillingOverview, updateRetryPolicy } from "./_lib/billing/service.mjs";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  try {
    const actor = await requireBillingUser(req, { superAdmin: true });
    const db = getBillingFirestore();
    const config = getBillingRuntimeConfig();
    if (req.method === "GET") {
      res.status(200).json(await getAdminBillingOverview({ db, config }));
      return;
    }
    if (req.method === "POST") {
      assertTrustedOrigin(req);
      const body = parseBody(req);
      if (String(body.action || "") !== "update-retry-policy") {
        throw Object.assign(new Error("billing-action-invalid"), { statusCode: 400 });
      }
      const retryPolicy = await updateRetryPolicy({ db, values: body, actor });
      res.status(200).json({ ok: true, retryPolicy });
      return;
    }
    res.status(405).json({ error: "method-not-allowed" });
  } catch (error) {
    const code = safeBillingErrorCode(error);
    const statusCode = billingErrorStatus(error);
    console.error("[admin-billing-api]", { code, statusCode });
    res.status(statusCode).json({ error: code });
  }
}
