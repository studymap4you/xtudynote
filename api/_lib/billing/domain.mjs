import { createHash, createHmac } from "node:crypto";

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export const SUBSCRIPTION_STATUSES = Object.freeze([
  "trial",
  "active",
  "past_due",
  "cancel_pending",
  "cancelled",
]);

export function asDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.toMillis === "function") return new Date(value.toMillis());
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function kstParts(date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

export function billingAnchorDay(date = new Date()) {
  const parsed = asDate(date);
  if (!parsed) throw new Error("billing-date-invalid");
  return kstParts(parsed).day;
}

export function addBillingMonths(date, months = 1, anchorDay = billingAnchorDay(date)) {
  const parsed = asDate(date);
  if (!parsed || !Number.isInteger(months)) throw new Error("billing-date-invalid");
  const current = kstParts(parsed);
  const absoluteMonth = current.year * 12 + current.month + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, Number(anchorDay) || current.day), lastDay);
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    day,
    current.hour,
    current.minute,
    current.second,
    current.millisecond,
  ) - KST_OFFSET_MS);
}

export function identityHash(email, secret) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || String(secret || "").length < 24) throw new Error("trial-guard-not-configured");
  return createHmac("sha256", secret).update(normalized).digest("hex");
}

export function auditHash(value, secret) {
  if (!value) return null;
  return createHmac("sha256", secret).update(String(value)).digest("hex");
}

export function billingCycleId(uid, cycleAnchor) {
  const anchor = asDate(cycleAnchor);
  if (!uid || !anchor) throw new Error("billing-cycle-invalid");
  return `cycle_${createHash("sha256").update(`${uid}:${anchor.toISOString()}`).digest("hex").slice(0, 40)}`;
}

export function providerOrderId(cycleId, attempt = 1) {
  const digest = createHash("sha256").update(`${cycleId}:${attempt}`).digest("hex").slice(0, 30);
  return `xtudy_${digest}`;
}

export function createTrialSubscription({ uid, plan, provider, paymentMethodId, now = new Date() }) {
  const startedAt = asDate(now);
  const anchor = billingAnchorDay(startedAt);
  const endsAt = addBillingMonths(startedAt, Number(plan.trialMonths) || 1, anchor);
  return {
    uid,
    planId: plan.planId,
    status: "trial",
    provider,
    paymentMethodId,
    listPrice: plan.listPrice,
    billingAmount: plan.salePrice,
    trialStartedAt: startedAt,
    trialEndsAt: endsAt,
    billingAnchorDay: anchor,
    currentPeriodStartedAt: startedAt,
    currentPeriodEndsAt: endsAt,
    nextBillingAt: endsAt,
    billingCycleAnchorAt: endsAt,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    lastPaymentAt: null,
    lastPaymentStatus: "trial",
    retryCount: 0,
    failureStartedAt: null,
    graceEndsAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

export function createPaidSubscriptionPendingCharge({ uid, plan, provider, paymentMethodId, now = new Date() }) {
  const startedAt = asDate(now);
  return {
    uid,
    planId: plan.planId,
    status: "past_due",
    provider,
    paymentMethodId,
    listPrice: plan.listPrice,
    billingAmount: plan.salePrice,
    trialStartedAt: null,
    trialEndsAt: null,
    billingAnchorDay: billingAnchorDay(startedAt),
    currentPeriodStartedAt: startedAt,
    currentPeriodEndsAt: startedAt,
    nextBillingAt: startedAt,
    billingCycleAnchorAt: startedAt,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    lastPaymentAt: null,
    lastPaymentStatus: "pending",
    retryCount: 0,
    failureStartedAt: null,
    graceEndsAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

export function markPaymentSucceeded(subscription, paidAt = new Date()) {
  const paidDate = asDate(paidAt);
  const periodStart = asDate(subscription.billingCycleAnchorAt)
    || asDate(subscription.nextBillingAt)
    || paidDate;
  const periodEnd = addBillingMonths(periodStart, 1, subscription.billingAnchorDay);
  return {
    ...subscription,
    status: "active",
    currentPeriodStartedAt: periodStart,
    currentPeriodEndsAt: periodEnd,
    nextBillingAt: periodEnd,
    billingCycleAnchorAt: periodEnd,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    lastPaymentAt: paidDate,
    lastPaymentStatus: "paid",
    retryCount: 0,
    failureStartedAt: null,
    graceEndsAt: null,
    updatedAt: paidDate,
  };
}

export function markPaymentFailed(subscription, failedAt = new Date(), retryPolicy = {}) {
  const now = asDate(failedAt);
  const failureStartedAt = asDate(subscription.failureStartedAt) || now;
  const offsets = Array.isArray(retryPolicy.retryOffsetsHours) && retryPolicy.retryOffsetsHours.length
    ? retryPolicy.retryOffsetsHours
    : [24, 72];
  const retryCount = (Number(subscription.retryCount) || 0) + 1;
  const nextOffset = offsets[retryCount - 1];
  const nextBillingAt = Number.isFinite(nextOffset)
    ? new Date(failureStartedAt.getTime() + nextOffset * HOUR_MS)
    : null;
  const graceDays = Number(retryPolicy.pastDueGraceDays) || 7;
  return {
    ...subscription,
    status: "past_due",
    nextBillingAt,
    lastPaymentStatus: "failed",
    retryCount,
    failureStartedAt,
    graceEndsAt: new Date(failureStartedAt.getTime() + graceDays * DAY_MS),
    updatedAt: now,
  };
}

export function replacePaymentMethod(subscription, { provider, paymentMethodId, now = new Date() }) {
  const updatedAt = asDate(now);
  const retryNow = subscription.status === "past_due";
  return {
    ...subscription,
    provider,
    paymentMethodId,
    nextBillingAt: retryNow ? updatedAt : subscription.nextBillingAt,
    updatedAt,
  };
}

export function requestSubscriptionCancellation(subscription, now = new Date()) {
  const cancelledAt = asDate(now);
  if (!subscription || subscription.status === "cancelled") return subscription;
  if (subscription.status === "trial" || subscription.status === "past_due") {
    return {
      ...subscription,
      status: "cancelled",
      cancelAtPeriodEnd: false,
      cancelledAt,
      nextBillingAt: null,
      billingCycleAnchorAt: null,
      updatedAt: cancelledAt,
    };
  }
  if (subscription.status === "active" || subscription.status === "cancel_pending") {
    return {
      ...subscription,
      status: "cancel_pending",
      cancelAtPeriodEnd: true,
      cancelledAt,
      nextBillingAt: asDate(subscription.currentPeriodEndsAt),
      billingCycleAnchorAt: asDate(subscription.currentPeriodEndsAt),
      updatedAt: cancelledAt,
    };
  }
  throw new Error("subscription-cannot-cancel");
}

export function finalizePendingCancellation(subscription, now = new Date()) {
  const updatedAt = asDate(now);
  return {
    ...subscription,
    status: "cancelled",
    cancelAtPeriodEnd: false,
    nextBillingAt: null,
    billingCycleAnchorAt: null,
    cancelledAt: asDate(subscription.cancelledAt) || updatedAt,
    updatedAt,
  };
}

export function isSubscriptionDue(subscription, now = new Date()) {
  const due = asDate(subscription?.nextBillingAt);
  return Boolean(due && due.getTime() <= asDate(now).getTime());
}

export function canUsePremiumFeatures(subscription, { enforcementEnabled = false, now = new Date() } = {}) {
  if (!enforcementEnabled) return true;
  if (!subscription) return false;
  if (["trial", "active", "cancel_pending"].includes(subscription.status)) return true;
  if (subscription.status !== "past_due") return false;
  const graceEndsAt = asDate(subscription.graceEndsAt);
  return Boolean(graceEndsAt && graceEndsAt.getTime() >= asDate(now).getTime());
}

