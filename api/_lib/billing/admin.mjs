import admin from "firebase-admin";
import { isSuperAdminEmail } from "./config.mjs";
import { canUsePremiumFeatures } from "./domain.mjs";

function parseServiceAccount(raw) {
  if (!raw || raw === "{}") throw new Error("server-auth-not-configured");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error("server-auth-invalid");
  }
}

export function getBillingAdminApp(env = process.env) {
  const existing = admin.apps.find((app) => app?.name === "[DEFAULT]");
  if (existing) return existing;
  const serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export function getBillingFirestore(env = process.env) {
  getBillingAdminApp(env);
  return admin.firestore();
}

function authorizationToken(req) {
  const header = String(req.headers?.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function requireBillingUser(
  req,
  { superAdmin = false, requireActive = true } = {},
  env = process.env,
) {
  getBillingAdminApp(env);
  const token = authorizationToken(req);
  if (!token) throw Object.assign(new Error("authentication-required"), { statusCode: 401 });
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    throw Object.assign(new Error("authentication-required"), { statusCode: 401 });
  }
  const profileSnapshot = await getBillingFirestore(env).doc(`users/${decoded.uid}`).get();
  const profile = profileSnapshot.data() || {};
  if (requireActive && (!profileSnapshot.exists || profile.accountStatus !== "active")) {
    throw Object.assign(new Error("active-account-required"), { statusCode: 403 });
  }
  const email = String(decoded.email || profile.email || "").trim();
  const isMasterAdmin = profile.role === "super_admin"
    && isSuperAdminEmail(email);
  if (superAdmin && !isMasterAdmin) {
    throw Object.assign(new Error("admin-access-required"), { statusCode: 403 });
  }
  return {
    uid: decoded.uid,
    email,
    displayName: String(decoded.name || profile.displayName || "").trim(),
    role: String(profile.role || "student"),
    isMasterAdmin,
  };
}

export async function requirePremiumBillingUser(req, env = process.env) {
  const user = await requireBillingUser(req, { requireActive: true }, env);
  if (user.isMasterAdmin) return user;
  const snapshot = await getBillingFirestore(env).doc(`subscriptions/${user.uid}`).get();
  const subscription = snapshot.exists ? snapshot.data() : null;
  if (!canUsePremiumFeatures(subscription, { enforcementEnabled: true, now: new Date() })) {
    throw Object.assign(new Error("premium-subscription-required"), { statusCode: 402 });
  }
  return user;
}

export function publicOrigin(req, env = process.env) {
  const configured = String(env.APP_PUBLIC_ORIGIN || "").trim().replace(/\/$/u, "");
  if (configured) return configured;
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers?.host || "").trim();
  if (!host) throw new Error("public-origin-not-configured");
  const protocol = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

export function assertTrustedOrigin(req, env = process.env) {
  const requestOrigin = String(req.headers?.origin || "").trim().replace(/\/$/u, "");
  if (!requestOrigin) return;
  const expected = publicOrigin(req, env);
  if (requestOrigin !== expected) {
    throw Object.assign(new Error("untrusted-request-origin"), { statusCode: 403 });
  }
}

export function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      throw Object.assign(new Error("invalid-json-body"), { statusCode: 400 });
    }
  }
  return {};
}

export function clientIp(req) {
  return String(req.headers?.["x-forwarded-for"] || req.headers?.["x-real-ip"] || "")
    .split(",")[0]
    .trim();
}

export function billingErrorStatus(error) {
  return Number(error?.statusCode) || 500;
}

const SAFE_ERROR_CODES = new Set([
  "authentication-required",
  "active-account-required",
  "admin-access-required",
  "billing-provider-invalid",
  "billing-provider-unavailable",
  "billing-consent-required",
  "billing-terms-version-invalid",
  "billing-plan-inactive",
  "billing-plan-invalid",
  "billing-action-invalid",
  "billing-subscription-not-found",
  "billing-subscription-not-due",
  "billing-payment-method-unavailable",
  "billing-payment-method-mismatch",
  "billing-customer-identity-mismatch",
  "billing-checkout-not-found",
  "billing-checkout-expired",
  "billing-checkout-processing",
  "billing-checkout-consumed",
  "billing-checkout-owner-mismatch",
  "billing-callback-mismatch",
  "trial-already-used",
  "trial-guard-not-configured",
  "subscription-already-active",
  "subscription-cannot-cancel",
  "live-billing-disabled",
  "untrusted-request-origin",
  "invalid-json-body",
  "retry-policy-invalid",
  "server-auth-not-configured",
  "public-origin-not-configured",
  "premium-subscription-required",
  "bank-transfer-unavailable",
  "bank-transfer-consent-required",
  "bank-transfer-depositor-required",
  "bank-transfer-request-not-found",
  "bank-transfer-request-stale",
  "bank-transfer-request-not-pending",
  "bank-transfer-rejection-reason-invalid",
]);

export function safeBillingErrorCode(error) {
  const code = String(error instanceof Error ? error.message : "billing-request-failed").trim();
  if (SAFE_ERROR_CODES.has(code)) return code;
  if (code.startsWith("provider-")) return code.slice(0, 120);
  return "billing-request-failed";
}
