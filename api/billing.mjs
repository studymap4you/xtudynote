import {
  assertTrustedOrigin,
  billingErrorStatus,
  clientIp,
  getBillingFirestore,
  parseBody,
  publicOrigin,
  requireBillingUser,
  safeBillingErrorCode,
} from "./_lib/billing/admin.mjs";
import { BILLING_TERMS_VERSION, getBillingRuntimeConfig } from "./_lib/billing/config.mjs";
import {
  cancelBillingSubscription,
  finalizeBillingCheckout,
  getBillingAccount,
  getPublicBillingConfiguration,
  getRetryPolicy,
  startBillingCheckout,
} from "./_lib/billing/service.mjs";

function queryAction(req) {
  return String(req.query?.action || "account").trim();
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  try {
    const db = getBillingFirestore();
    const config = getBillingRuntimeConfig();
    const action = queryAction(req);
    if (req.method === "GET" && action === "plan") {
      res.status(200).json({
        ...(await getPublicBillingConfiguration({ db, config })),
        termsVersion: BILLING_TERMS_VERSION,
      });
      return;
    }
    const user = await requireBillingUser(req);
    if (req.method === "GET" && action === "account") {
      res.status(200).json({
        ...(await getBillingAccount({ db, config, user })),
        termsVersion: BILLING_TERMS_VERSION,
      });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method-not-allowed" });
      return;
    }
    assertTrustedOrigin(req);
    const body = parseBody(req);
    if (action === "start-checkout") {
      const checkout = await startBillingCheckout({
        db,
        config,
        user,
        provider: String(body.provider || ""),
        consent: body.consent,
        termsVersion: String(body.termsVersion || ""),
        consentIp: clientIp(req),
        origin: publicOrigin(req),
      });
      res.status(201).json(checkout);
      return;
    }
    if (action === "finalize-toss" || action === "finalize-kakaopay") {
      const retryPolicy = await getRetryPolicy({ db, config });
      const account = await finalizeBillingCheckout({
        db,
        config: { ...config, ...retryPolicy },
        user,
        provider: action === "finalize-toss" ? "toss" : "kakaopay",
        sessionId: String(body.sessionId || ""),
        authKey: String(body.authKey || ""),
        customerKey: String(body.customerKey || ""),
        pgToken: String(body.pgToken || ""),
      });
      res.status(200).json({ ...account, termsVersion: BILLING_TERMS_VERSION });
      return;
    }
    if (action === "cancel") {
      const account = await cancelBillingSubscription({ db, config, user });
      res.status(200).json({ ...account, termsVersion: BILLING_TERMS_VERSION });
      return;
    }
    throw Object.assign(new Error("billing-action-invalid"), { statusCode: 400 });
  } catch (error) {
    const code = safeBillingErrorCode(error);
    const statusCode = billingErrorStatus(error);
    console.error("[billing-api]", { code, statusCode });
    res.status(statusCode).json({ error: code });
  }
}
