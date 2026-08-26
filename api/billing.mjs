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
  approveBankTransferRequest,
  cancelBillingSubscription,
  finalizeBillingCheckout,
  getAdminBillingOverview,
  getBillingAccount,
  getPublicBillingConfiguration,
  getRetryPolicy,
  rejectBankTransferRequest,
  startBillingCheckout,
  submitBankTransferRequest,
  updateRetryPolicy,
} from "./_lib/billing/service.mjs";
import { getSiteOperationsOverview, recordSiteVisit } from "./_lib/admin/site-analytics.mjs";

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
    if (req.method === "POST" && action === "track-visit") {
      assertTrustedOrigin(req);
      const body = parseBody(req);
      let visitorUser = null;
      if (String(req.headers?.authorization || "").startsWith("Bearer ")) {
        try {
          visitorUser = await requireBillingUser(req, { requireActive: false });
        } catch {
          visitorUser = null;
        }
      }
      await recordSiteVisit({
        db,
        config,
        visitorId: String(body.visitorId || ""),
        ip: clientIp(req),
        userAgent: String(req.headers?.["user-agent"] || ""),
        path: String(body.path || "/"),
        user: visitorUser,
      });
      res.status(204).end();
      return;
    }
    if ([
      "admin-overview",
      "admin-update-retry-policy",
      "admin-approve-bank-transfer",
      "admin-reject-bank-transfer",
    ].includes(action)) {
      const actor = await requireBillingUser(req, { superAdmin: true });
      if (req.method === "GET" && action === "admin-overview") {
        const [billing, operations] = await Promise.all([
          getAdminBillingOverview({ db, config }),
          getSiteOperationsOverview({ db }),
        ]);
        res.status(200).json({ ...billing, ...operations });
        return;
      }
      if (req.method === "POST" && action === "admin-update-retry-policy") {
        assertTrustedOrigin(req);
        const body = parseBody(req);
        const retryPolicy = await updateRetryPolicy({ db, values: body, actor });
        res.status(200).json({ ok: true, retryPolicy });
        return;
      }
      if (req.method === "POST" && action === "admin-approve-bank-transfer") {
        assertTrustedOrigin(req);
        const body = parseBody(req);
        res.status(200).json(await approveBankTransferRequest({
          db,
          config,
          actor,
          uid: String(body.uid || ""),
          requestId: String(body.requestId || ""),
        }));
        return;
      }
      if (req.method === "POST" && action === "admin-reject-bank-transfer") {
        assertTrustedOrigin(req);
        const body = parseBody(req);
        res.status(200).json(await rejectBankTransferRequest({
          db,
          actor,
          uid: String(body.uid || ""),
          requestId: String(body.requestId || ""),
          reason: String(body.reason || ""),
        }));
        return;
      }
      res.status(405).json({ error: "method-not-allowed" });
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
    if (action === "submit-bank-transfer") {
      const account = await submitBankTransferRequest({
        db,
        config,
        user,
        depositorName: String(body.depositorName || ""),
        consent: body.consent,
        termsVersion: String(body.termsVersion || ""),
        consentIp: clientIp(req),
      });
      res.status(201).json({ ...account, termsVersion: BILLING_TERMS_VERSION });
      return;
    }
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
