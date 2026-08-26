import { randomUUID } from "node:crypto";
import {
  BILLING_TERMS_VERSION,
  DEFAULT_STANDARD_PLAN,
  STANDARD_PLAN_ID,
  publicProviderAvailability,
} from "./config.mjs";
import {
  asDate,
  auditHash,
  billingCycleId,
  canUsePremiumFeatures,
  createBankTransferPaidSubscription,
  createPaidSubscriptionPendingCharge,
  createTrialSubscription,
  finalizePendingCancellation,
  identityHash,
  isSubscriptionDue,
  markPaymentFailed,
  markPaymentSucceeded,
  providerOrderId,
  replacePaymentMethod,
  requestSubscriptionCancellation,
} from "./domain.mjs";
import { BillingProviderError, getBillingProvider } from "./providers.mjs";

const CHECKOUT_LOCK_MS = 2 * 60 * 1_000;
const DUE_BATCH_SIZE = 100;
const HISTORY_LIMIT = 100;

function billingError(code, statusCode = 400) {
  return Object.assign(new Error(code), { statusCode });
}

function cleanText(value, maxLength = 500) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function iso(value) {
  const date = asDate(value);
  return date ? date.toISOString() : null;
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function randomId(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function normalizePlan(data = {}) {
  const plan = {
    planId: cleanText(data.planId || STANDARD_PLAN_ID, 60),
    name: cleanText(data.name || DEFAULT_STANDARD_PLAN.name, 120),
    currency: cleanText(data.currency || "KRW", 12),
    listPrice: integer(data.listPrice),
    salePrice: integer(data.salePrice),
    discountRate: integer(data.discountRate),
    trialPrice: integer(data.trialPrice),
    trialMonths: integer(data.trialMonths),
    billingCycle: cleanText(data.billingCycle || "monthly", 30),
    active: data.active === true,
  };
  if (
    plan.planId !== STANDARD_PLAN_ID
    || plan.currency !== "KRW"
    || plan.listPrice <= 0
    || plan.salePrice <= 0
    || plan.salePrice > plan.listPrice
    || plan.trialPrice !== 0
    || plan.trialMonths !== 1
    || plan.billingCycle !== "monthly"
  ) {
    throw billingError("billing-plan-invalid", 500);
  }
  return plan;
}

export async function ensureStandardPlan(db, now = new Date()) {
  const ref = db.doc(`billing_plans/${STANDARD_PLAN_ID}`);
  let snapshot = await ref.get();
  if (!snapshot.exists) {
    try {
      await ref.create({
        ...DEFAULT_STANDARD_PLAN,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (Number(error?.code) !== 6 && String(error?.code) !== "already-exists") throw error;
    }
    snapshot = await ref.get();
  }
  const plan = normalizePlan(snapshot.data());
  if (!plan.active) throw billingError("billing-plan-inactive", 503);
  return plan;
}

export function serializePlan(plan, now = new Date()) {
  const anchor = new Date(now);
  const next = createTrialSubscription({
    uid: "preview",
    plan,
    provider: "preview",
    paymentMethodId: "preview",
    now: anchor,
  }).trialEndsAt;
  return {
    ...plan,
    todayAmount: plan.trialPrice,
    nextBillingAt: iso(next),
    nextBillingAmount: plan.salePrice,
  };
}

function serializeBankTransfer(config, plan) {
  return {
    bankName: cleanText(config.bankTransfer.bankName, 80),
    accountNumber: cleanText(config.bankTransfer.accountNumber, 40),
    accountHolder: cleanText(config.bankTransfer.accountHolder, 80),
    amount: plan.salePrice,
    currency: plan.currency,
    ready: Boolean(config.bankTransfer.ready),
  };
}

function serializeBankTransferRequest(data) {
  if (!data) return null;
  return {
    id: cleanText(data.requestId, 100),
    status: cleanText(data.status, 30),
    depositorName: cleanText(data.depositorName, 80),
    amount: integer(data.amount),
    currency: cleanText(data.currency || "KRW", 12),
    submittedAt: iso(data.submittedAt),
    approvedAt: iso(data.approvedAt),
    rejectedAt: iso(data.rejectedAt),
    rejectionReason: cleanText(data.rejectionReason, 300),
  };
}

function serializeSubscription(subscription, config, isMasterAdmin = false) {
  if (!subscription) {
    return {
      subscription: null,
      entitled: isMasterAdmin || canUsePremiumFeatures(null, config),
    };
  }
  const publicSubscription = {
    planId: cleanText(subscription.planId, 60),
    status: cleanText(subscription.status, 30),
    provider: cleanText(subscription.provider, 30),
    listPrice: integer(subscription.listPrice),
    billingAmount: integer(subscription.billingAmount),
    trialStartedAt: iso(subscription.trialStartedAt),
    trialEndsAt: iso(subscription.trialEndsAt),
    billingAnchorDay: integer(subscription.billingAnchorDay),
    currentPeriodStartedAt: iso(subscription.currentPeriodStartedAt),
    currentPeriodEndsAt: iso(subscription.currentPeriodEndsAt),
    nextBillingAt: iso(subscription.nextBillingAt),
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    cancelledAt: iso(subscription.cancelledAt),
    lastPaymentAt: iso(subscription.lastPaymentAt),
    lastPaymentStatus: cleanText(subscription.lastPaymentStatus, 30),
    retryCount: integer(subscription.retryCount),
    graceEndsAt: iso(subscription.graceEndsAt),
    createdAt: iso(subscription.createdAt),
    updatedAt: iso(subscription.updatedAt),
  };
  return {
    subscription: publicSubscription,
    entitled: isMasterAdmin || canUsePremiumFeatures(subscription, config),
  };
}

function serializeTransaction(snapshot) {
  const data = snapshot.data?.() || snapshot;
  return {
    id: snapshot.id || cleanText(data.id, 100),
    billingCycleId: cleanText(data.billingCycleId, 100),
    amount: integer(data.amount),
    currency: cleanText(data.currency || "KRW", 12),
    status: cleanText(data.status, 30),
    provider: cleanText(data.provider, 30),
    paymentMethod: cleanText(data.paymentMethod, 80),
    providerOrderId: cleanText(data.providerOrderId, 100),
    providerTransactionId: cleanText(data.providerTransactionId, 160),
    receiptUrl: cleanText(data.receiptUrl, 1_000),
    attemptedAt: iso(data.attemptedAt),
    paidAt: iso(data.paidAt),
    failedAt: iso(data.failedAt),
    createdAt: iso(data.createdAt),
  };
}

function serializePaymentMethod(data) {
  if (!data) return null;
  return {
    provider: cleanText(data.provider, 30),
    label: cleanText(data.summary?.label, 100),
    last4: cleanText(data.summary?.last4, 4),
    method: cleanText(data.summary?.method, 50),
    status: cleanText(data.status, 30),
    registeredAt: iso(data.registeredAt),
  };
}

export async function getPublicBillingConfiguration({ db, config, now = new Date() }) {
  const plan = await ensureStandardPlan(db, now);
  return {
    plan: serializePlan(plan, now),
    providers: publicProviderAvailability(config),
    bankTransfer: serializeBankTransfer(config, plan),
    mode: config.mode,
    liveEnabled: config.liveEnabled,
    enforcementEnabled: config.enforcementEnabled,
  };
}

export async function getBillingAccount({ db, config, user, now = new Date() }) {
  const [plan, subscriptionSnapshot, transactionsSnapshot, bankTransferRequestSnapshot] = await Promise.all([
    ensureStandardPlan(db, now),
    db.doc(`subscriptions/${user.uid}`).get(),
    db.collection("payment_transactions")
      .where("uid", "==", user.uid)
      .orderBy("attemptedAt", "desc")
      .limit(HISTORY_LIMIT)
      .get(),
    db.doc(`bank_transfer_requests/${user.uid}`).get(),
  ]);
  const subscription = subscriptionSnapshot.exists ? subscriptionSnapshot.data() : null;
  const trialHistorySnapshot = config.trialGuardReady && user.email
    ? await db.doc(`trial_history/${identityHash(user.email, config.trialHashSecret)}`).get()
    : null;
  const methodSnapshot = subscription?.paymentMethodId
    ? await db.doc(`payment_methods/${subscription.paymentMethodId}`).get()
    : null;
  const transactions = transactionsSnapshot.docs
    .map(serializeTransaction)
    .sort((left, right) => Date.parse(right.attemptedAt || right.createdAt || "") - Date.parse(left.attemptedAt || left.createdAt || ""));
  return {
    plan: serializePlan(plan, now),
    providers: publicProviderAvailability(config),
    bankTransfer: serializeBankTransfer(config, plan),
    bankTransferRequest: bankTransferRequestSnapshot.exists
      ? serializeBankTransferRequest(bankTransferRequestSnapshot.data())
      : null,
    mode: config.mode,
    liveEnabled: config.liveEnabled,
    enforcementEnabled: config.enforcementEnabled,
    trialEligible: Boolean(
      config.trialGuardReady
      && !trialHistorySnapshot?.exists
      && !subscriptionSnapshot.exists
    ),
    ...serializeSubscription(subscription, {
      enforcementEnabled: config.enforcementEnabled,
      now,
    }, user.isMasterAdmin),
    paymentMethod: methodSnapshot?.exists ? serializePaymentMethod(methodSnapshot.data()) : null,
    transactions,
  };
}

export async function submitBankTransferRequest({
  db,
  config,
  user,
  depositorName,
  consent,
  termsVersion,
  consentIp,
  now = new Date(),
}) {
  if (consent !== true) throw billingError("bank-transfer-consent-required", 400);
  if (termsVersion !== BILLING_TERMS_VERSION) throw billingError("billing-terms-version-invalid", 400);
  const plan = await ensureStandardPlan(db, now);
  if (config.trialGuardReady && user.email) {
    const customer = await ensureBillingCustomer({ db, config, user, now });
    const trialRef = db.doc(`trial_history/${customer.identityHash}`);
    const subscriptionRef = db.doc(`subscriptions/${user.uid}`);
    let trialStarted = false;
    await db.runTransaction(async (transaction) => {
      const [trialSnapshot, subscriptionSnapshot] = await Promise.all([
        transaction.get(trialRef),
        transaction.get(subscriptionRef),
      ]);
      if (trialSnapshot.exists || subscriptionSnapshot.exists) return;
      const subscription = createTrialSubscription({
        uid: user.uid,
        plan,
        provider: "bank_transfer",
        paymentMethodId: null,
        now,
      });
      transaction.create(trialRef, {
        identityHash: trialRef.id,
        firstUid: user.uid,
        planId: plan.planId,
        provider: "bank_transfer",
        trialStartedAt: now,
        trialEndsAt: subscription.trialEndsAt,
        createdAt: now,
      });
      transaction.set(subscriptionRef, subscription);
      transaction.create(db.collection("billing_events").doc(), {
        uid: user.uid,
        type: "bank_transfer_trial_started",
        provider: "bank_transfer",
        planId: plan.planId,
        amount: plan.trialPrice,
        termsVersion,
        consentAt: now,
        consentIpHash: auditHash(consentIp, config.trialHashSecret),
        createdAt: now,
      });
      trialStarted = true;
    });
    if (trialStarted) return getBillingAccount({ db, config, user, now });
  }

  if (!config.bankTransfer.ready) throw billingError("bank-transfer-unavailable", 503);
  const cleanDepositorName = cleanText(depositorName, 80);
  if (cleanDepositorName.length < 2) throw billingError("bank-transfer-depositor-required", 400);
  const requestRef = db.doc(`bank_transfer_requests/${user.uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(requestRef);
    const existing = snapshot.exists ? snapshot.data() : null;
    if (existing?.status === "pending") return;
    const requestId = randomId("bankreq");
    transaction.set(requestRef, {
      requestId,
      uid: user.uid,
      email: cleanText(user.email, 200),
      displayName: cleanText(user.displayName, 120),
      planId: plan.planId,
      amount: plan.salePrice,
      currency: plan.currency,
      depositorName: cleanDepositorName,
      status: "pending",
      termsVersion,
      consentAt: now,
      consentIpHash: config.trialGuardReady ? auditHash(consentIp, config.trialHashSecret) : null,
      submittedAt: now,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
    });
    transaction.create(db.collection("billing_events").doc(), {
      uid: user.uid,
      type: "bank_transfer_submitted",
      provider: "bank_transfer",
      planId: plan.planId,
      requestId,
      amount: plan.salePrice,
      createdAt: now,
    });
  });
  return getBillingAccount({ db, config, user, now });
}

export async function approveBankTransferRequest({
  db,
  config,
  actor,
  uid,
  requestId,
  now = new Date(),
}) {
  const targetUid = cleanText(uid, 160);
  const expectedRequestId = cleanText(requestId, 100);
  if (!targetUid || targetUid.includes("/")) throw billingError("bank-transfer-request-not-found", 404);
  const plan = await ensureStandardPlan(db, now);
  const requestRef = db.doc(`bank_transfer_requests/${targetUid}`);
  const subscriptionRef = db.doc(`subscriptions/${targetUid}`);
  const paymentMethodId = `bank_${targetUid}`;
  const paymentMethodRef = db.doc(`payment_methods/${paymentMethodId}`);
  let approvedRequestId = expectedRequestId;
  await db.runTransaction(async (transaction) => {
    const [requestSnapshot, subscriptionSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(subscriptionRef),
    ]);
    if (!requestSnapshot.exists) throw billingError("bank-transfer-request-not-found", 404);
    const request = requestSnapshot.data();
    approvedRequestId = cleanText(request.requestId, 100);
    if (expectedRequestId && expectedRequestId !== approvedRequestId) {
      throw billingError("bank-transfer-request-stale", 409);
    }
    if (request.status === "approved") return;
    if (request.status !== "pending") throw billingError("bank-transfer-request-not-pending", 409);
    if (integer(request.amount) !== plan.salePrice || request.planId !== plan.planId) {
      throw billingError("billing-plan-invalid", 409);
    }
    const existingSubscription = subscriptionSnapshot.exists ? subscriptionSnapshot.data() : null;
    const subscription = createBankTransferPaidSubscription({
      uid: targetUid,
      plan,
      paymentMethodId,
      existingSubscription,
      paidAt: now,
    });
    const transactionId = `bank_${approvedRequestId}`;
    transaction.set(paymentMethodRef, {
      uid: targetUid,
      provider: "bank_transfer",
      status: "active",
      credentials: {},
      summary: {
        label: `${config.bankTransfer.bankName} 무통장 입금`,
        last4: config.bankTransfer.accountNumber.slice(-4),
        method: "무통장 입금",
      },
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(subscriptionRef, subscription);
    transaction.set(db.doc(`payment_transactions/${transactionId}`), {
      id: transactionId,
      billingCycleId: transactionId,
      uid: targetUid,
      planId: plan.planId,
      provider: "bank_transfer",
      paymentMethodId,
      amount: plan.salePrice,
      currency: plan.currency,
      status: "paid",
      attempt: 1,
      providerOrderId: approvedRequestId,
      providerTransactionId: approvedRequestId,
      paymentMethod: "무통장 입금",
      receiptUrl: "",
      attemptedAt: request.submittedAt || now,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    });
    transaction.update(requestRef, {
      status: "approved",
      approvedAt: now,
      approvedByUid: actor.uid,
      transactionId,
      updatedAt: now,
    });
    transaction.create(db.collection("billing_events").doc(), {
      uid: targetUid,
      actorUid: actor.uid,
      type: "bank_transfer_approved",
      provider: "bank_transfer",
      planId: plan.planId,
      requestId: approvedRequestId,
      amount: plan.salePrice,
      createdAt: now,
    });
  });
  return { ok: true, uid: targetUid, requestId: approvedRequestId };
}

export async function rejectBankTransferRequest({
  db,
  actor,
  uid,
  requestId,
  reason,
  now = new Date(),
}) {
  const targetUid = cleanText(uid, 160);
  const expectedRequestId = cleanText(requestId, 100);
  const rejectionReason = cleanText(reason, 300);
  if (!targetUid || targetUid.includes("/")) throw billingError("bank-transfer-request-not-found", 404);
  if (rejectionReason.length < 2) throw billingError("bank-transfer-rejection-reason-invalid", 400);
  const requestRef = db.doc(`bank_transfer_requests/${targetUid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(requestRef);
    if (!snapshot.exists) throw billingError("bank-transfer-request-not-found", 404);
    const request = snapshot.data();
    if (expectedRequestId && expectedRequestId !== cleanText(request.requestId, 100)) {
      throw billingError("bank-transfer-request-stale", 409);
    }
    if (request.status !== "pending") throw billingError("bank-transfer-request-not-pending", 409);
    transaction.update(requestRef, {
      status: "rejected",
      rejectionReason,
      rejectedAt: now,
      rejectedByUid: actor.uid,
      updatedAt: now,
    });
    transaction.create(db.collection("billing_events").doc(), {
      uid: targetUid,
      actorUid: actor.uid,
      type: "bank_transfer_rejected",
      provider: "bank_transfer",
      requestId: cleanText(request.requestId, 100),
      reason: rejectionReason,
      createdAt: now,
    });
  });
  return { ok: true, uid: targetUid, requestId: expectedRequestId };
}

async function ensureBillingCustomer({ db, config, user, now }) {
  if (!config.trialGuardReady) throw billingError("trial-guard-not-configured", 503);
  const emailIdentityHash = identityHash(user.email, config.trialHashSecret);
  const ref = db.doc(`billing_customers/${user.uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      if (snapshot.data()?.identityHash !== emailIdentityHash) {
        throw billingError("billing-customer-identity-mismatch", 409);
      }
      transaction.update(ref, { updatedAt: now });
      return;
    }
    transaction.create(ref, {
      uid: user.uid,
      customerKey: randomId("cust"),
      identityHash: emailIdentityHash,
      createdAt: now,
      updatedAt: now,
    });
  });
  const snapshot = await ref.get();
  return snapshot.data();
}

export function resolveCheckoutPurpose(subscription, hasTrialHistory) {
  if (subscription && ["trial", "active", "cancel_pending", "past_due"].includes(subscription.status)) {
    return "replace_payment_method";
  }
  return hasTrialHistory || Boolean(subscription) ? "subscribe_paid" : "subscribe_trial";
}

export async function startBillingCheckout({
  db,
  config,
  user,
  provider,
  consent,
  termsVersion,
  consentIp,
  origin,
  now = new Date(),
  fetchImpl = fetch,
}) {
  if (consent !== true) throw billingError("billing-consent-required", 400);
  if (!termsVersion || termsVersion !== BILLING_TERMS_VERSION) {
    throw billingError("billing-terms-version-invalid", 400);
  }
  const providerAdapter = getBillingProvider(provider, config, fetchImpl);
  const [plan, customer, subscriptionSnapshot] = await Promise.all([
    ensureStandardPlan(db, now),
    ensureBillingCustomer({ db, config, user, now }),
    db.doc(`subscriptions/${user.uid}`).get(),
  ]);
  const trialSnapshot = await db.doc(`trial_history/${customer.identityHash}`).get();
  const subscription = subscriptionSnapshot.exists ? subscriptionSnapshot.data() : null;
  const purpose = resolveCheckoutPurpose(subscription, trialSnapshot.exists);
  const sessionId = randomId("checkout");
  const sessionRef = db.doc(`billing_checkout_sessions/${sessionId}`);
  const expiresAt = new Date(now.getTime() + config.checkoutSessionMinutes * 60 * 1_000);
  const approvalAmount = provider === "kakaopay" && purpose === "subscribe_paid" ? plan.salePrice : 0;
  const partnerOrderId = `checkout_${sessionId.slice(-36)}`;
  const callbackBase = `${origin}/billing/callback`;
  const session = {
    id: sessionId,
    uid: user.uid,
    provider,
    planId: plan.planId,
    purpose,
    status: "pending",
    approvalAmount,
    customerKey: customer.customerKey,
    partnerOrderId,
    termsVersion,
    billingConsentAt: now,
    billingConsentIpHash: auditHash(consentIp, config.trialHashSecret),
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
  let providerSession = null;
  if (provider === "kakaopay") {
    providerSession = await providerAdapter.createPaymentMethodSession({
      partnerOrderId,
      partnerUserId: customer.customerKey,
      amount: approvalAmount,
      approvalUrl: `${callbackBase}/kakaopay?sessionId=${encodeURIComponent(sessionId)}`,
      cancelUrl: `${origin}/billing?checkout=cancelled`,
      failUrl: `${origin}/billing?checkout=failed`,
    });
    session.providerSession = {
      tid: providerSession.tid,
      createdAt: providerSession.createdAt,
    };
  }
  await sessionRef.create(session);
  const result = {
    sessionId,
    provider,
    purpose,
    expiresAt: iso(expiresAt),
    plan: serializePlan(plan, now),
    checkout: {
      todayAmount: purpose === "replace_payment_method" && subscription?.status === "past_due"
        ? plan.salePrice
        : purpose === "subscribe_paid"
          ? plan.salePrice
          : 0,
      nextBillingAmount: plan.salePrice,
      nextBillingAt: serializePlan(plan, now).nextBillingAt,
    },
  };
  if (provider === "toss") {
    return {
      ...result,
      toss: {
        clientKey: config.toss.clientKey,
        customerKey: customer.customerKey,
        successUrl: `${callbackBase}/toss?sessionId=${encodeURIComponent(sessionId)}`,
        failUrl: `${origin}/billing?checkout=failed`,
      },
    };
  }
  return {
    ...result,
    kakaopay: {
      redirectUrl: providerSession.redirectUrl,
      mobileRedirectUrl: providerSession.mobileRedirectUrl,
    },
  };
}

async function claimCheckout({ db, sessionId, uid, provider, now }) {
  const ref = db.doc(`billing_checkout_sessions/${sessionId}`);
  let claimed = null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw billingError("billing-checkout-not-found", 404);
    const data = snapshot.data();
    if (data.uid !== uid) throw billingError("billing-checkout-owner-mismatch", 403);
    if (data.provider !== provider) throw billingError("billing-callback-mismatch", 400);
    if (data.status === "consumed") {
      claimed = { ...data, alreadyConsumed: true };
      return;
    }
    const expiresAt = asDate(data.expiresAt);
    if (!expiresAt || expiresAt.getTime() < now.getTime()) {
      transaction.update(ref, { status: "expired", updatedAt: now });
      throw billingError("billing-checkout-expired", 410);
    }
    const processingAt = asDate(data.processingAt);
    if (data.status === "processing" && processingAt && now.getTime() - processingAt.getTime() < CHECKOUT_LOCK_MS) {
      throw billingError("billing-checkout-processing", 409);
    }
    if (!["pending", "failed", "processing"].includes(data.status)) {
      throw billingError("billing-checkout-consumed", 409);
    }
    const processingToken = randomId("lock");
    transaction.update(ref, {
      status: "processing",
      processingAt: now,
      processingToken,
      updatedAt: now,
    });
    claimed = { ...data, processingToken, alreadyConsumed: false };
  });
  return { ref, data: claimed };
}

async function markCheckoutFailed(ref, processingToken, error, now) {
  await ref.update({
    status: "failed",
    failureCode: cleanText(error instanceof Error ? error.message : "billing-request-failed", 140),
    processingToken,
    updatedAt: now,
  }).catch(() => {});
}

async function deactivateMethodBestEffort({ db, config, methodId, now, fetchImpl }) {
  if (!methodId) return;
  const ref = db.doc(`payment_methods/${methodId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.status === "inactive") return;
  const method = snapshot.data();
  if (method.provider === "bank_transfer") {
    await ref.update({ status: "inactive", deactivatedAt: now, updatedAt: now });
    return;
  }
  try {
    const provider = getBillingProvider(method.provider, config, fetchImpl);
    await provider.deactivatePaymentMethod({ credentials: method.credentials });
    await ref.update({ status: "inactive", deactivatedAt: now, updatedAt: now });
  } catch (error) {
    await ref.update({
      status: "deactivation_failed",
      deactivationFailureCode: cleanText(error instanceof Error ? error.message : "provider-request-failed", 140),
      updatedAt: now,
    }).catch(() => {});
  }
}

function paymentMethodDocument({ user, provider, registration, config, now }) {
  return {
    uid: user.uid,
    provider,
    status: "active",
    credentials: registration.credentials,
    summary: registration.summary,
    providerReferenceHash: auditHash(registration.providerReference, config.trialHashSecret),
    registeredAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function persistRegistration({
  db,
  config,
  user,
  checkout,
  checkoutRef,
  registration,
  provider,
  now,
}) {
  const plan = await ensureStandardPlan(db, now);
  const methodId = randomId("pm");
  const methodRef = db.doc(`payment_methods/${methodId}`);
  const subscriptionRef = db.doc(`subscriptions/${user.uid}`);
  const trialRef = db.doc(`trial_history/${identityHash(user.email, config.trialHashSecret)}`);
  const customerRef = db.doc(`billing_customers/${user.uid}`);
  let oldMethodId = null;
  let chargeImmediately = false;
  await db.runTransaction(async (transaction) => {
    const [sessionSnapshot, subscriptionSnapshot, trialSnapshot] = await Promise.all([
      transaction.get(checkoutRef),
      transaction.get(subscriptionRef),
      transaction.get(trialRef),
    ]);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || session.processingToken !== checkout.processingToken || session.status !== "processing") {
      throw billingError("billing-checkout-processing", 409);
    }
    const existingSubscription = subscriptionSnapshot.exists ? subscriptionSnapshot.data() : null;
    let nextSubscription;
    if (checkout.purpose === "subscribe_trial") {
      if (trialSnapshot.exists) throw billingError("trial-already-used", 409);
      nextSubscription = createTrialSubscription({
        uid: user.uid,
        plan,
        provider,
        paymentMethodId: methodId,
        now,
      });
      transaction.create(trialRef, {
        identityHash: trialRef.id,
        firstUid: user.uid,
        planId: plan.planId,
        provider,
        trialStartedAt: now,
        trialEndsAt: nextSubscription.trialEndsAt,
        createdAt: now,
      });
    } else if (checkout.purpose === "replace_payment_method") {
      if (!existingSubscription || existingSubscription.status === "cancelled") {
        throw billingError("billing-subscription-not-found", 404);
      }
      oldMethodId = existingSubscription.paymentMethodId || null;
      nextSubscription = replacePaymentMethod(existingSubscription, {
        provider,
        paymentMethodId: methodId,
        now,
      });
      chargeImmediately = existingSubscription.status === "past_due";
    } else if (checkout.purpose === "subscribe_paid") {
      nextSubscription = createPaidSubscriptionPendingCharge({
        uid: user.uid,
        plan,
        provider,
        paymentMethodId: methodId,
        now,
      });
      chargeImmediately = !registration.initialPayment;
    } else {
      throw billingError("billing-callback-mismatch", 400);
    }
    transaction.create(methodRef, paymentMethodDocument({ user, provider, registration, config, now }));
    transaction.set(subscriptionRef, nextSubscription);
    transaction.update(customerRef, {
      activeProvider: provider,
      activePaymentMethodId: methodId,
      updatedAt: now,
    });
    if (registration.initialPayment) {
      const cycleId = billingCycleId(user.uid, nextSubscription.billingCycleAnchorAt);
      const paidSubscription = markPaymentSucceeded(nextSubscription, registration.initialPayment.approvedAt || now);
      transaction.set(subscriptionRef, paidSubscription);
      transaction.set(db.doc(`payment_transactions/${cycleId}`), {
        id: cycleId,
        billingCycleId: cycleId,
        uid: user.uid,
        planId: plan.planId,
        provider,
        paymentMethodId: methodId,
        amount: plan.salePrice,
        currency: plan.currency,
        status: "paid",
        attempt: 1,
        providerOrderId: registration.initialPayment.providerOrderId,
        providerTransactionId: registration.initialPayment.providerTransactionId,
        paymentMethod: registration.initialPayment.method,
        receiptUrl: registration.initialPayment.receiptUrl || "",
        attemptedAt: now,
        paidAt: registration.initialPayment.approvedAt || now,
        createdAt: now,
        updatedAt: now,
      });
    }
    transaction.update(checkoutRef, {
      status: "consumed",
      consumedAt: now,
      paymentMethodId: methodId,
      updatedAt: now,
    });
    transaction.create(db.collection("billing_events").doc(), {
      uid: user.uid,
      type: "payment_method_registered",
      provider,
      planId: plan.planId,
      purpose: checkout.purpose,
      termsVersion: checkout.termsVersion,
      billingConsentAt: checkout.billingConsentAt,
      billingConsentIpHash: checkout.billingConsentIpHash || null,
      createdAt: now,
    });
  });
  return { methodId, oldMethodId, chargeImmediately };
}

export async function finalizeBillingCheckout({
  db,
  config,
  user,
  provider,
  sessionId,
  authKey,
  customerKey,
  pgToken,
  now = new Date(),
  fetchImpl = fetch,
}) {
  const cleanSessionId = cleanText(sessionId, 100);
  if (!cleanSessionId) throw billingError("billing-checkout-not-found", 404);
  const claimed = await claimCheckout({ db, sessionId: cleanSessionId, uid: user.uid, provider, now });
  if (claimed.data.alreadyConsumed) return getBillingAccount({ db, config, user, now });
  const checkout = claimed.data;
  const adapter = getBillingProvider(provider, config, fetchImpl);
  let registration;
  try {
    if (provider === "toss") {
      if (!authKey || customerKey !== checkout.customerKey) throw billingError("billing-callback-mismatch", 400);
      registration = await adapter.registerPaymentMethod({ authKey, customerKey: checkout.customerKey });
    } else {
      const tid = checkout.providerSession?.tid;
      if (!pgToken || !tid) throw billingError("billing-callback-mismatch", 400);
      registration = await adapter.registerPaymentMethod({
        tid,
        pgToken,
        partnerOrderId: checkout.partnerOrderId,
        partnerUserId: checkout.customerKey,
        expectedAmount: checkout.approvalAmount,
      });
    }
  } catch (error) {
    await markCheckoutFailed(claimed.ref, checkout.processingToken, error, now);
    throw error;
  }
  let persisted;
  try {
    persisted = await persistRegistration({
      db,
      config,
      user,
      checkout,
      checkoutRef: claimed.ref,
      registration,
      provider,
      now,
    });
  } catch (error) {
    if (registration.initialPayment) {
      await adapter.refundPayment({
        providerTransactionId: registration.initialPayment.providerTransactionId,
        reason: "구독 저장 실패 자동 환불",
        amount: registration.initialPayment.amount,
      }).catch(() => {});
    }
    await adapter.deactivatePaymentMethod({ credentials: registration.credentials }).catch(() => {});
    await markCheckoutFailed(claimed.ref, checkout.processingToken, error, now);
    throw error;
  }
  if (persisted.oldMethodId && persisted.oldMethodId !== persisted.methodId) {
    await deactivateMethodBestEffort({ db, config, methodId: persisted.oldMethodId, now, fetchImpl });
  }
  if (persisted.chargeImmediately) {
    await processDueSubscription({ db, config, uid: user.uid, now, fetchImpl });
  }
  return getBillingAccount({ db, config, user, now });
}

async function claimBillingCycle({ db, uid, config, now }) {
  const subscriptionRef = db.doc(`subscriptions/${uid}`);
  let claim = null;
  await db.runTransaction(async (transaction) => {
    const subscriptionSnapshot = await transaction.get(subscriptionRef);
    if (!subscriptionSnapshot.exists) throw billingError("billing-subscription-not-found", 404);
    const subscription = subscriptionSnapshot.data();
    if (!isSubscriptionDue(subscription, now)) throw billingError("billing-subscription-not-due", 409);
    if (!["trial", "active", "past_due"].includes(subscription.status)) {
      throw billingError("billing-subscription-not-due", 409);
    }
    const cycleAnchor = asDate(subscription.billingCycleAnchorAt) || asDate(subscription.nextBillingAt);
    const cycleId = billingCycleId(uid, cycleAnchor);
    const transactionRef = db.doc(`payment_transactions/${cycleId}`);
    const transactionSnapshot = await transaction.get(transactionRef);
    const existing = transactionSnapshot.exists ? transactionSnapshot.data() : null;
    if (existing && ["paid", "processing", "reconciliation_required"].includes(existing.status)) {
      claim = { skipped: true, reason: existing.status, cycleId };
      return;
    }
    const attempt = Math.max(1, integer(existing?.attempt) + 1);
    const orderId = providerOrderId(cycleId, attempt);
    const planSnapshot = await transaction.get(db.doc(`billing_plans/${subscription.planId || STANDARD_PLAN_ID}`));
    const plan = normalizePlan(planSnapshot.data());
    const methodRef = db.doc(`payment_methods/${subscription.paymentMethodId}`);
    const methodSnapshot = await transaction.get(methodRef);
    if (!methodSnapshot.exists || methodSnapshot.data()?.status !== "active") {
      throw billingError("billing-payment-method-unavailable", 409);
    }
    const method = methodSnapshot.data();
    if (method.provider !== subscription.provider) throw billingError("billing-payment-method-mismatch", 409);
    const transactionData = {
      id: cycleId,
      billingCycleId: cycleId,
      uid,
      planId: plan.planId,
      provider: subscription.provider,
      paymentMethodId: subscription.paymentMethodId,
      amount: plan.salePrice,
      currency: plan.currency,
      status: "processing",
      attempt,
      providerOrderId: orderId,
      providerTransactionId: "",
      paymentMethod: method.summary?.method || method.summary?.label || subscription.provider,
      receiptUrl: "",
      attemptedAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    transaction.set(transactionRef, transactionData);
    claim = {
      skipped: false,
      cycleId,
      transactionRef,
      subscriptionRef,
      subscription,
      method,
      plan,
      orderId,
      attempt,
    };
  });
  return claim;
}

async function recordChargeSuccess({ db, claim, result, now }) {
  await db.runTransaction(async (transaction) => {
    const [subscriptionSnapshot, paymentSnapshot] = await Promise.all([
      transaction.get(claim.subscriptionRef),
      transaction.get(claim.transactionRef),
    ]);
    if (!subscriptionSnapshot.exists || !paymentSnapshot.exists) return;
    const payment = paymentSnapshot.data();
    if (payment.status === "paid") return;
    if (payment.status !== "processing" || payment.providerOrderId !== claim.orderId) return;
    const current = subscriptionSnapshot.data();
    transaction.update(claim.transactionRef, {
      status: "paid",
      providerTransactionId: result.providerTransactionId,
      providerOrderId: result.providerOrderId || claim.orderId,
      paymentMethod: result.method || payment.paymentMethod,
      receiptUrl: result.receiptUrl || "",
      paidAt: result.approvedAt || now,
      updatedAt: now,
    });
    transaction.set(claim.subscriptionRef, markPaymentSucceeded(current, result.approvedAt || now));
    transaction.create(db.collection("billing_events").doc(), {
      uid: current.uid,
      type: "payment_succeeded",
      provider: current.provider,
      billingCycleId: claim.cycleId,
      amount: claim.plan.salePrice,
      createdAt: now,
    });
  });
}

async function recordChargeFailure({ db, config, claim, error, now }) {
  const uncertain = error instanceof BillingProviderError && error.retryable;
  await db.runTransaction(async (transaction) => {
    const [subscriptionSnapshot, paymentSnapshot] = await Promise.all([
      transaction.get(claim.subscriptionRef),
      transaction.get(claim.transactionRef),
    ]);
    if (!subscriptionSnapshot.exists || !paymentSnapshot.exists) return;
    const payment = paymentSnapshot.data();
    if (payment.status !== "processing" || payment.providerOrderId !== claim.orderId) return;
    const current = subscriptionSnapshot.data();
    let failedSubscription = markPaymentFailed(current, now, config);
    if (uncertain) failedSubscription = { ...failedSubscription, nextBillingAt: null };
    transaction.update(claim.transactionRef, {
      status: uncertain ? "reconciliation_required" : "failed",
      failureCode: cleanText(error instanceof Error ? error.message : "provider-request-failed", 140),
      retryable: !uncertain,
      failedAt: now,
      updatedAt: now,
    });
    transaction.set(claim.subscriptionRef, failedSubscription);
    transaction.create(db.collection("billing_events").doc(), {
      uid: current.uid,
      type: uncertain ? "payment_reconciliation_required" : "payment_failed",
      provider: current.provider,
      billingCycleId: claim.cycleId,
      amount: claim.plan.salePrice,
      createdAt: now,
    });
  });
}

export async function processDueSubscription({ db, config, uid, now = new Date(), fetchImpl = fetch }) {
  let claim;
  try {
    claim = await claimBillingCycle({ db, uid, config, now });
  } catch (error) {
    if (["billing-subscription-not-due", "billing-subscription-not-found"].includes(error?.message)) {
      return { uid, skipped: true, reason: error.message };
    }
    throw error;
  }
  if (claim.skipped) return { uid, ...claim };
  try {
    const provider = getBillingProvider(claim.subscription.provider, config, fetchImpl);
    const result = await provider.chargeSubscription({
      credentials: claim.method.credentials,
      amount: claim.plan.salePrice,
      orderId: claim.orderId,
      orderName: claim.plan.name,
    });
    await recordChargeSuccess({ db, claim, result, now });
    return { uid, skipped: false, status: "paid", billingCycleId: claim.cycleId };
  } catch (error) {
    await recordChargeFailure({ db, config, claim, error, now });
    return {
      uid,
      skipped: false,
      status: error instanceof BillingProviderError && error.retryable ? "reconciliation_required" : "failed",
      billingCycleId: claim.cycleId,
      error: cleanText(error instanceof Error ? error.message : "provider-request-failed", 140),
    };
  }
}

async function finalizeCancellation({ db, config, uid, subscription, now, fetchImpl }) {
  await db.doc(`subscriptions/${uid}`).set(finalizePendingCancellation(subscription, now));
  await deactivateMethodBestEffort({
    db,
    config,
    methodId: subscription.paymentMethodId,
    now,
    fetchImpl,
  });
  await db.collection("billing_events").add({
    uid,
    type: "subscription_cancelled",
    provider: subscription.provider,
    createdAt: now,
  });
  return { uid, status: "cancelled" };
}

async function expireBankTransferSubscription({ db, uid, now }) {
  const ref = db.doc(`subscriptions/${uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const current = snapshot.data();
    const periodEndsAt = asDate(current.currentPeriodEndsAt);
    if (
      current.provider !== "bank_transfer"
      || !["trial", "active"].includes(current.status)
      || !periodEndsAt
      || periodEndsAt.getTime() > now.getTime()
    ) return;
    transaction.set(ref, {
      ...current,
      status: "past_due",
      nextBillingAt: null,
      billingCycleAnchorAt: null,
      lastPaymentStatus: current.status === "trial" ? "trial_ended" : "renewal_required",
      retryCount: 0,
      graceEndsAt: null,
      updatedAt: now,
    });
    transaction.create(db.collection("billing_events").doc(), {
      uid,
      type: current.status === "trial"
        ? "bank_transfer_trial_expired"
        : "bank_transfer_subscription_expired",
      provider: "bank_transfer",
      createdAt: now,
    });
  });
  return { uid, status: "expired" };
}

export async function runBillingScheduler({ db, config, now = new Date(), fetchImpl = fetch }) {
  const retryPolicy = await getRetryPolicy({ db, config });
  const effectiveConfig = { ...config, ...retryPolicy };
  const dueSnapshot = await db.collection("subscriptions").where("nextBillingAt", "<=", now).limit(DUE_BATCH_SIZE).get();
  const summary = {
    scanned: dueSnapshot.size,
    paid: 0,
    failed: 0,
    reconciliationRequired: 0,
    cancelled: 0,
    skipped: 0,
    results: [],
  };
  for (const snapshot of dueSnapshot.docs) {
    const subscription = snapshot.data();
    let result;
    try {
      if (subscription.status === "cancel_pending") {
        result = await finalizeCancellation({
          db,
          config: effectiveConfig,
          uid: snapshot.id,
          subscription,
          now,
          fetchImpl,
        });
      } else if (subscription.provider === "bank_transfer" && ["trial", "active"].includes(subscription.status)) {
        result = await expireBankTransferSubscription({ db, uid: snapshot.id, now });
      } else if (["trial", "active", "past_due"].includes(subscription.status)) {
        result = await processDueSubscription({
          db,
          config: effectiveConfig,
          uid: snapshot.id,
          now,
          fetchImpl,
        });
      } else {
        result = { uid: snapshot.id, skipped: true, reason: "status-not-due" };
      }
    } catch (error) {
      result = {
        uid: snapshot.id,
        skipped: false,
        status: "failed",
        error: cleanText(error instanceof Error ? error.message : "billing-cycle-failed", 140),
      };
    }
    if (result.status === "paid") summary.paid += 1;
    else if (result.status === "failed") summary.failed += 1;
    else if (result.status === "reconciliation_required") summary.reconciliationRequired += 1;
    else if (result.status === "cancelled") summary.cancelled += 1;
    else if (result.status === "expired") summary.failed += 1;
    else summary.skipped += 1;
    summary.results.push(result);
  }
  return summary;
}

export async function cancelBillingSubscription({ db, config, user, now = new Date(), fetchImpl = fetch }) {
  const ref = db.doc(`subscriptions/${user.uid}`);
  let previous;
  let next;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw billingError("billing-subscription-not-found", 404);
    previous = snapshot.data();
    next = requestSubscriptionCancellation(previous, now);
    if (!next || next.status === previous.status && previous.status === "cancelled") {
      throw billingError("subscription-cannot-cancel", 409);
    }
    transaction.set(ref, next);
    transaction.create(db.collection("billing_events").doc(), {
      uid: user.uid,
      type: next.status === "cancel_pending" ? "cancellation_scheduled" : "subscription_cancelled",
      provider: previous.provider,
      effectiveAt: next.status === "cancel_pending" ? next.currentPeriodEndsAt : now,
      createdAt: now,
    });
  });
  if (next.status === "cancelled") {
    await deactivateMethodBestEffort({ db, config, methodId: previous.paymentMethodId, now, fetchImpl });
  }
  return getBillingAccount({ db, config, user, now });
}

export async function getRetryPolicy({ db, config }) {
  const snapshot = await db.doc("billing_settings/retry_policy").get();
  const data = snapshot.data() || {};
  const offsets = Array.isArray(data.retryOffsetsHours)
    ? data.retryOffsetsHours.map(Number).filter((value) => Number.isInteger(value) && value > 0).slice(0, 5)
    : [];
  return {
    retryOffsetsHours: offsets.length ? offsets : config.retryOffsetsHours,
    pastDueGraceDays: integer(data.pastDueGraceDays, config.pastDueGraceDays),
    updatedAt: iso(data.updatedAt),
  };
}

export async function updateRetryPolicy({ db, values, actor, now = new Date() }) {
  const offsets = Array.isArray(values.retryOffsetsHours)
    ? [...new Set(values.retryOffsetsHours.map(Number))].sort((a, b) => a - b)
    : [];
  const graceDays = Number(values.pastDueGraceDays);
  if (
    !offsets.length
    || offsets.length > 5
    || offsets.some((value) => !Number.isInteger(value) || value < 1 || value > 720)
    || !Number.isInteger(graceDays)
    || graceDays < 1
    || graceDays > 30
  ) {
    throw billingError("retry-policy-invalid", 400);
  }
  const value = {
    retryOffsetsHours: offsets,
    pastDueGraceDays: graceDays,
    updatedByUid: actor.uid,
    updatedAt: now,
  };
  await db.doc("billing_settings/retry_policy").set(value, { merge: true });
  return { ...value, updatedAt: iso(now) };
}

export async function getAdminBillingOverview({ db, config, now = new Date() }) {
  const [subscriptionSnapshot, paymentSnapshot, bankTransferSnapshot, plan, retryPolicy] = await Promise.all([
    db.collection("subscriptions").limit(1_000).get(),
    db.collection("payment_transactions").limit(1_000).get(),
    db.collection("bank_transfer_requests").limit(1_000).get(),
    ensureStandardPlan(db, now),
    getRetryPolicy({ db, config }),
  ]);
  const userRefs = subscriptionSnapshot.docs.map((snapshot) => db.doc(`users/${snapshot.id}`));
  const userSnapshots = userRefs.length ? await db.getAll(...userRefs) : [];
  const userMap = new Map(userSnapshots.map((snapshot) => [snapshot.id, snapshot.data() || {}]));
  const counts = { total: subscriptionSnapshot.size, trial: 0, active: 0, past_due: 0, cancel_pending: 0, cancelled: 0 };
  const rows = subscriptionSnapshot.docs.map((snapshot) => {
    const subscription = snapshot.data();
    if (Object.hasOwn(counts, subscription.status)) counts[subscription.status] += 1;
    const profile = userMap.get(snapshot.id) || {};
    return {
      uid: snapshot.id,
      email: cleanText(profile.email, 200),
      planId: cleanText(subscription.planId, 60),
      status: cleanText(subscription.status, 30),
      provider: cleanText(subscription.provider, 30),
      trialEndsAt: iso(subscription.trialEndsAt),
      currentPeriodEndsAt: iso(subscription.currentPeriodEndsAt),
      nextBillingAt: iso(subscription.nextBillingAt),
      lastPaymentAt: iso(subscription.lastPaymentAt),
      lastPaymentStatus: cleanText(subscription.lastPaymentStatus, 30),
      billingAmount: integer(subscription.billingAmount),
      updatedAt: iso(subscription.updatedAt),
    };
  }).sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""));
  const payments = paymentSnapshot.docs.map(serializeTransaction);
  const successfulPayments = payments.filter((item) => item.status === "paid");
  const failedPayments = payments.filter((item) => ["failed", "reconciliation_required"].includes(item.status));
  const recurringSubscribers = counts.active + counts.cancel_pending;
  const bankTransferRequests = bankTransferSnapshot.docs
    .map((snapshot) => {
      const request = snapshot.data();
      return {
        uid: snapshot.id,
        requestId: cleanText(request.requestId, 100),
        email: cleanText(request.email, 200),
        displayName: cleanText(request.displayName, 120),
        depositorName: cleanText(request.depositorName, 80),
        amount: integer(request.amount),
        currency: cleanText(request.currency || "KRW", 12),
        status: cleanText(request.status, 30),
        submittedAt: iso(request.submittedAt),
        approvedAt: iso(request.approvedAt),
        rejectedAt: iso(request.rejectedAt),
        rejectionReason: cleanText(request.rejectionReason, 300),
      };
    })
    .filter((request) => request.status === "pending")
    .sort((left, right) => Date.parse(right.submittedAt || "") - Date.parse(left.submittedAt || ""));
  return {
    plan: serializePlan(plan, now),
    mode: config.mode,
    liveEnabled: config.liveEnabled,
    counts,
    estimatedMonthlyRecurringRevenue: recurringSubscribers * plan.salePrice,
    successfulPayments: successfulPayments.length,
    failedPayments: failedPayments.length,
    retryPolicy,
    bankTransferRequests,
    subscriptions: rows,
    recentTransactions: payments
      .sort((left, right) => Date.parse(right.attemptedAt || right.createdAt || "") - Date.parse(left.attemptedAt || left.createdAt || ""))
      .slice(0, 100),
  };
}
