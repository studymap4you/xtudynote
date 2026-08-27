import assert from "node:assert/strict";
import test from "node:test";
import {
  BILLING_TERMS_VERSION,
  DEFAULT_STANDARD_PLAN,
  getBillingRuntimeConfig,
  isSuperAdminEmail,
} from "../api/_lib/billing/config.mjs";
import {
  addBillingMonths,
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
} from "../api/_lib/billing/domain.mjs";
import {
  KakaoPayBillingProvider,
  TossPaymentsBillingProvider,
} from "../api/_lib/billing/providers.mjs";
import {
  approveBankTransferRequest,
  processDueSubscription,
  resolveCheckoutPurpose,
  submitBankTransferRequest,
} from "../api/_lib/billing/service.mjs";

const plan = { ...DEFAULT_STANDARD_PLAN };
const start = new Date("2026-08-26T03:30:00.000Z");

test("지정된 두 관리자 이메일만 관리자 권한을 얻는다", () => {
  assert.equal(isSuperAdminEmail("waterfallingsound0827@gmail.com"), true);
  assert.equal(isSuperAdminEmail(" STUDYMAP0904@GMAIL.COM "), true);
  assert.equal(isSuperAdminEmail("another-admin@gmail.com"), false);
});

function trial(overrides = {}) {
  return {
    ...createTrialSubscription({
      uid: "user-a",
      plan,
      provider: "toss",
      paymentMethodId: "pm-a",
      now: start,
    }),
    ...overrides,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class MemorySnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return this.value;
  }
}

class MemoryDocumentReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
  }

  async get() {
    return new MemorySnapshot(this, this.db.values.get(this.path));
  }

  async set(value, options = {}) {
    const current = this.db.values.get(this.path) || {};
    this.db.values.set(this.path, options.merge ? { ...current, ...value } : value);
  }

  async update(value) {
    const current = this.db.values.get(this.path);
    if (!current) throw new Error("not-found");
    this.db.values.set(this.path, { ...current, ...value });
  }

  async create(value) {
    if (this.db.values.has(this.path)) throw new Error("already-exists");
    this.db.values.set(this.path, value);
  }
}

class MemoryQuery {
  constructor(db, path, filters = [], sort = null, maximum = Infinity) {
    this.db = db;
    this.path = path;
    this.filters = filters;
    this.sort = sort;
    this.maximum = maximum;
  }

  doc(id = `event-${++this.db.sequence}`) {
    return this.db.doc(`${this.path}/${id}`);
  }

  where(field, operator, value) {
    assert.equal(operator, "==");
    return new MemoryQuery(this.db, this.path, [...this.filters, { field, value }], this.sort, this.maximum);
  }

  orderBy(field, direction = "asc") {
    return new MemoryQuery(this.db, this.path, this.filters, { field, direction }, this.maximum);
  }

  limit(maximum) {
    return new MemoryQuery(this.db, this.path, this.filters, this.sort, maximum);
  }

  async get() {
    const prefix = `${this.path}/`;
    let docs = [...this.db.values.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map(([path, value]) => new MemorySnapshot(this.db.doc(path), value))
      .filter((snapshot) => this.filters.every(({ field, value }) => snapshot.data()?.[field] === value));
    if (this.sort) {
      const factor = this.sort.direction === "desc" ? -1 : 1;
      docs = docs.sort((left, right) => {
        const leftValue = left.data()?.[this.sort.field];
        const rightValue = right.data()?.[this.sort.field];
        return factor * (new Date(leftValue || 0).getTime() - new Date(rightValue || 0).getTime());
      });
    }
    docs = docs.slice(0, this.maximum);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  constructor(entries = []) {
    this.values = new Map(entries);
    this.sequence = 0;
  }

  doc(path) {
    return new MemoryDocumentReference(this, path);
  }

  collection(path) {
    return new MemoryQuery(this, path);
  }

  async runTransaction(callback) {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, value, options) => ref.set(value, options),
      update: (ref, value) => ref.update(value),
      create: (ref, value) => ref.create(value),
    });
  }
}

test("1. 신규 사용자는 Xtudy Standard trial 구독을 시작한다", () => {
  const subscription = trial();
  assert.equal(subscription.planId, "standard");
  assert.equal(subscription.status, "trial");
  assert.equal(subscription.uid, "user-a");
});

test("2. 첫 달 표시 가격은 0원이고 이후 가격은 18,000원이다", () => {
  assert.equal(plan.trialPrice, 0);
  assert.equal(plan.salePrice, 18_000);
  assert.equal(plan.listPrice, 36_000);
});

test("3. 결제수단 등록 정보가 trial 구독에 연결된다", () => {
  const subscription = trial();
  assert.equal(subscription.paymentMethodId, "pm-a");
  assert.equal(subscription.provider, "toss");
});

test("4. trial 기간은 30일 고정이 아니라 달력 한 달이다", () => {
  assert.equal(trial().trialEndsAt.toISOString(), "2026-09-26T03:30:00.000Z");
});

test("5. trial 종료 시각부터 최초 결제 대상이 된다", () => {
  const subscription = trial();
  assert.equal(isSubscriptionDue(subscription, new Date("2026-09-26T03:29:59.999Z")), false);
  assert.equal(isSubscriptionDue(subscription, subscription.trialEndsAt), true);
});

test("6. 최초 18,000원 성공 후 active와 다음 결제일을 만든다", () => {
  const paid = markPaymentSucceeded(trial(), new Date("2026-09-26T03:30:02.000Z"));
  assert.equal(paid.status, "active");
  assert.equal(paid.billingAmount, 18_000);
  assert.equal(paid.nextBillingAt.toISOString(), "2026-10-26T03:30:00.000Z");
});

test("7. 다음 달 성공 결제도 anchor day를 유지한다", () => {
  const first = markPaymentSucceeded(trial(), new Date("2026-09-26T03:30:02.000Z"));
  const second = markPaymentSucceeded(first, new Date("2026-10-26T03:30:01.000Z"));
  assert.equal(second.nextBillingAt.toISOString(), "2026-11-26T03:30:00.000Z");
});

test("8. 같은 구독 기간의 scheduler id는 항상 같다", () => {
  const subscription = trial();
  assert.equal(
    billingCycleId(subscription.uid, subscription.billingCycleAnchorAt),
    billingCycleId(subscription.uid, subscription.billingCycleAnchorAt),
  );
});

test("9. 중복 결제를 막되 재시도별 provider orderId는 구분한다", () => {
  const cycleId = billingCycleId("user-a", trial().billingCycleAnchorAt);
  assert.equal(providerOrderId(cycleId, 1), providerOrderId(cycleId, 1));
  assert.notEqual(providerOrderId(cycleId, 1), providerOrderId(cycleId, 2));
});

test("10. 결제 실패는 24시간 뒤 재시도를 예약한다", () => {
  const failedAt = new Date("2026-09-26T03:30:00.000Z");
  const failed = markPaymentFailed(trial(), failedAt, {
    retryOffsetsHours: [24, 72],
    pastDueGraceDays: 7,
  });
  assert.equal(failed.nextBillingAt.toISOString(), "2026-09-27T03:30:00.000Z");
});

test("11. 결제 실패는 계정을 삭제하지 않고 past_due로 전환한다", () => {
  const failed = markPaymentFailed(trial(), start);
  assert.equal(failed.status, "past_due");
  assert.equal(failed.retryCount, 1);
});

test("12. past_due 결제수단 재등록은 즉시 재시도 대상으로 만든다", () => {
  const failed = markPaymentFailed(trial(), start);
  const replaced = replacePaymentMethod(failed, {
    provider: "kakaopay",
    paymentMethodId: "pm-new",
    now: new Date("2026-08-27T00:00:00.000Z"),
  });
  assert.equal(replaced.paymentMethodId, "pm-new");
  assert.equal(replaced.nextBillingAt.toISOString(), "2026-08-27T00:00:00.000Z");
});

test("13. 무료 기간 중 해지는 즉시 cancelled가 되고 결제일이 사라진다", () => {
  const cancelled = requestSubscriptionCancellation(trial(), start);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.nextBillingAt, null);
});

test("14. 유료 기간 중 해지는 이용기간 종료 예약으로 바뀐다", () => {
  const active = markPaymentSucceeded(trial(), new Date("2026-09-26T03:30:01.000Z"));
  const pending = requestSubscriptionCancellation(active, new Date("2026-10-01T00:00:00.000Z"));
  assert.equal(pending.status, "cancel_pending");
  assert.equal(pending.nextBillingAt.toISOString(), active.currentPeriodEndsAt.toISOString());
});

test("15. 해지 기간 종료 처리 후 다음 결제는 중단된다", () => {
  const active = markPaymentSucceeded(trial(), new Date("2026-09-26T03:30:01.000Z"));
  const pending = requestSubscriptionCancellation(active, new Date("2026-10-01T00:00:00.000Z"));
  const cancelled = finalizePendingCancellation(pending, pending.currentPeriodEndsAt);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.nextBillingAt, null);
});

test("16. 탈퇴 후 같은 이메일 재가입은 같은 trial identity가 된다", () => {
  const secret = "billing-test-secret-with-32-characters";
  assert.equal(
    identityHash("User@Example.com", secret),
    identityHash(" user@example.com ", secret),
  );
});

test("17. trial 이력이 있으면 두 번째 구독은 유료 시작으로 판정한다", () => {
  assert.equal(resolveCheckoutPurpose(null, false), "subscribe_trial");
  assert.equal(resolveCheckoutPurpose(null, true), "subscribe_paid");
  assert.equal(resolveCheckoutPurpose({ status: "cancelled" }, true), "subscribe_paid");
  assert.equal(resolveCheckoutPurpose({ status: "cancelled" }, false), "subscribe_paid");
});

test("18. 1월 31일 anchor는 2월 마지막 유효 일자로 이동한다", () => {
  assert.equal(
    addBillingMonths(new Date("2027-01-31T03:00:00.000Z"), 1, 31).toISOString(),
    "2027-02-28T03:00:00.000Z",
  );
});

test("19. 결제 실패 상태는 유예기간과 관계없이 이용이 제한된다", () => {
  const failed = markPaymentFailed(trial(), start, { pastDueGraceDays: 7 });
  assert.equal(canUsePremiumFeatures(failed, { enforcementEnabled: true, now: start }), false);
  assert.equal(canUsePremiumFeatures(failed, { enforcementEnabled: true, now: new Date("2026-09-03T03:30:01.000Z") }), false);
});

test("20. 무료체험을 이미 사용한 유료 재가입은 즉시 결제 대기 상태다", () => {
  const subscription = createPaidSubscriptionPendingCharge({
    uid: "user-returning",
    plan,
    provider: "toss",
    paymentMethodId: "pm-returning",
    now: start,
  });
  assert.equal(subscription.status, "past_due");
  assert.equal(subscription.nextBillingAt.toISOString(), start.toISOString());
});

test("21. live billing 비활성 상태에서는 운영 키를 준비 완료로 보지 않는다", () => {
  const config = getBillingRuntimeConfig({
    TOSS_PAYMENTS_CLIENT_KEY: "live_ck_example",
    TOSS_PAYMENTS_SECRET_KEY: "live_sk_example",
    BILLING_TRIAL_HASH_SECRET: "billing-test-secret-with-32-characters",
    BILLING_LIVE_ENABLED: "false",
    BILLING_PG_CHECKOUT_ENABLED: "true",
  });
  assert.equal(config.liveEnabled, false);
  assert.equal(config.toss.ready, false);
});

test("22. Toss Billing provider는 서버가 정한 금액으로만 청구한다", async () => {
  const calls = [];
  const provider = new TossPaymentsBillingProvider({
    clientKey: "test_ck_example",
    secretKey: "test_sk_example",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
      return jsonResponse({
        paymentKey: "payment-key",
        orderId: "order-id",
        totalAmount: 18_000,
        status: "DONE",
        method: "카드",
        approvedAt: "2026-09-26T03:30:00.000Z",
      });
    },
  });
  const result = await provider.chargeSubscription({
    credentials: { billingKey: "billing-key", customerKey: "cust_random_123" },
    amount: 18_000,
    orderId: "order-id",
    orderName: "Xtudy Standard",
  });
  assert.equal(calls[0].body.amount, 18_000);
  assert.equal(result.amount, 18_000);
  assert.match(String(calls[0].init.headers.Authorization), /^Basic /);
});

test("23. KakaoPay trial 준비는 공식 0원 승인과 SID 발급 흐름을 사용한다", async () => {
  const calls = [];
  const provider = new KakaoPayBillingProvider({
    secretKey: "dev-secret",
    cid: "TCSUBSCRIP",
    cidSecret: "",
    fetchImpl: async (url, init) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url: String(url), body });
      if (String(url).endsWith("/ready")) {
        return jsonResponse({ tid: "tid-1", next_redirect_pc_url: "https://example.test/pay" });
      }
      return jsonResponse({
        tid: "tid-1",
        sid: "sid-server-only",
        partner_order_id: "checkout-1",
        amount: { total: 0 },
        payment_method_type: "MONEY",
      });
    },
  });
  await provider.createPaymentMethodSession({
    partnerOrderId: "checkout-1",
    partnerUserId: "cust_random_123",
    amount: 0,
    approvalUrl: "https://example.test/success",
    cancelUrl: "https://example.test/cancel",
    failUrl: "https://example.test/fail",
  });
  const registered = await provider.registerPaymentMethod({
    tid: "tid-1",
    pgToken: "pg-token",
    partnerOrderId: "checkout-1",
    partnerUserId: "cust_random_123",
    expectedAmount: 0,
  });
  assert.equal(calls[0].body.total_amount, 0);
  assert.equal(registered.credentials.sid, "sid-server-only");
  assert.equal(registered.initialPayment, null);
});

test("24. 같은 결제 대상을 두 번 처리해도 provider 청구는 한 번만 호출된다", async () => {
  const dueSubscription = trial();
  const dueAt = dueSubscription.nextBillingAt;
  const db = new MemoryFirestore([
    ["billing_plans/standard", { ...plan, createdAt: start, updatedAt: start }],
    ["subscriptions/user-a", dueSubscription],
    ["payment_methods/pm-a", {
      uid: "user-a",
      provider: "toss",
      status: "active",
      credentials: { billingKey: "billing-key", customerKey: "cust_random_123" },
      summary: { method: "카드", label: "테스트 카드", last4: "1234" },
    }],
  ]);
  const config = getBillingRuntimeConfig({
    TOSS_PAYMENTS_CLIENT_KEY: "test_ck_example",
    TOSS_PAYMENTS_SECRET_KEY: "test_sk_example",
    BILLING_TRIAL_HASH_SECRET: "billing-test-secret-with-32-characters",
    BILLING_LIVE_ENABLED: "false",
    BILLING_PG_CHECKOUT_ENABLED: "true",
  });
  let providerCalls = 0;
  const fetchImpl = async (_url, init) => {
    providerCalls += 1;
    const body = JSON.parse(String(init.body));
    return jsonResponse({
      paymentKey: "payment-key",
      orderId: body.orderId,
      totalAmount: body.amount,
      status: "DONE",
      method: "카드",
      approvedAt: dueAt.toISOString(),
    });
  };

  const first = await processDueSubscription({ db, config, uid: "user-a", now: dueAt, fetchImpl });
  const second = await processDueSubscription({ db, config, uid: "user-a", now: dueAt, fetchImpl });

  assert.equal(first.status, "paid");
  assert.equal(second.skipped, true);
  assert.equal(providerCalls, 1);
  assert.equal(db.values.get("subscriptions/user-a").status, "active");
});

test("25. 운영 접근 제어는 기존 false 환경값이 남아 있어도 기본 활성화된다", () => {
  const config = getBillingRuntimeConfig({ BILLING_ENFORCEMENT_ENABLED: "false" });
  assert.equal(config.enforcementEnabled, true);
});

test("26. 무통장 입금 승인 시 결제일부터 달력 한 달 구독이 생성된다", () => {
  const subscription = createBankTransferPaidSubscription({
    uid: "bank-user",
    plan,
    paymentMethodId: "bank_bank-user",
    paidAt: start,
  });
  assert.equal(subscription.provider, "bank_transfer");
  assert.equal(subscription.status, "active");
  assert.equal(subscription.currentPeriodEndsAt.toISOString(), "2026-09-26T03:30:00.000Z");
  assert.equal(canUsePremiumFeatures(subscription, { enforcementEnabled: true, now: start }), true);
});

test("27. 만료된 무통장 구독은 active 문서가 남아 있어도 이용할 수 없다", () => {
  const subscription = createBankTransferPaidSubscription({
    uid: "bank-user",
    plan,
    paymentMethodId: "bank_bank-user",
    paidAt: start,
  });
  assert.equal(canUsePremiumFeatures(subscription, {
    enforcementEnabled: true,
    now: subscription.currentPeriodEndsAt,
  }), false);
});

test("28. 이용기간 중 재입금 승인은 남은 기간 뒤에 한 달을 연장한다", () => {
  const first = createBankTransferPaidSubscription({
    uid: "bank-user",
    plan,
    paymentMethodId: "bank_bank-user",
    paidAt: start,
  });
  const renewed = createBankTransferPaidSubscription({
    uid: "bank-user",
    plan,
    paymentMethodId: "bank_bank-user",
    existingSubscription: first,
    paidAt: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal(renewed.currentPeriodEndsAt.toISOString(), "2026-10-26T03:30:00.000Z");
});

test("29. 관리자가 입금을 승인해야만 결제 거래와 active 구독이 함께 저장된다", async () => {
  const db = new MemoryFirestore([
    ["billing_plans/standard", { ...plan, createdAt: start, updatedAt: start }],
    ["bank_transfer_requests/bank-user", {
      requestId: "bankreq_test",
      uid: "bank-user",
      email: "bank@example.com",
      planId: "standard",
      amount: 18_000,
      currency: "KRW",
      depositorName: "테스트입금자",
      status: "pending",
      submittedAt: start,
      createdAt: start,
      updatedAt: start,
    }],
  ]);
  const config = getBillingRuntimeConfig({});
  await approveBankTransferRequest({
    db,
    config,
    actor: { uid: "admin" },
    uid: "bank-user",
    requestId: "bankreq_test",
    now: start,
  });
  assert.equal(db.values.get("bank_transfer_requests/bank-user").status, "approved");
  assert.equal(db.values.get("subscriptions/bank-user").status, "active");
  assert.equal(db.values.get("payment_transactions/bank_bankreq_test").status, "paid");
});

test("30. 무통장 구독도 첫 달 무료기간 동안 프리미엄 기능을 이용한다", () => {
  const subscription = createTrialSubscription({
    uid: "bank-trial-user",
    plan,
    provider: "bank_transfer",
    paymentMethodId: null,
    now: start,
  });
  assert.equal(subscription.status, "trial");
  assert.equal(subscription.provider, "bank_transfer");
  assert.equal(canUsePremiumFeatures(subscription, { enforcementEnabled: true, now: start }), true);
  assert.equal(canUsePremiumFeatures(subscription, {
    enforcementEnabled: true,
    now: subscription.trialEndsAt,
  }), false);
});

test("31. 무료기간 중 입금 승인은 무료 종료일 뒤에 유료 한 달을 이어 붙인다", () => {
  const free = createTrialSubscription({
    uid: "bank-trial-user",
    plan,
    provider: "bank_transfer",
    paymentMethodId: null,
    now: start,
  });
  const paid = createBankTransferPaidSubscription({
    uid: "bank-trial-user",
    plan,
    paymentMethodId: "bank_bank-trial-user",
    existingSubscription: free,
    paidAt: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal(paid.status, "active");
  assert.equal(paid.trialEndsAt.toISOString(), "2026-09-26T03:30:00.000Z");
  assert.equal(paid.currentPeriodEndsAt.toISOString(), "2026-10-26T03:30:00.000Z");
});

test("32. 서버 인증 설정이 있으면 별도 무료체험 Secret이 없어도 중복 방지 키를 안전하게 파생한다", () => {
  const config = getBillingRuntimeConfig({
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: "test-private-key-material-long-enough" }),
  });
  assert.equal(config.trialGuardReady, true);
  assert.equal(config.trialHashSecret.length, 64);
});

test("33. 무통장 신규 구독은 입금 신청 없이 무료 한 달 구독과 중복 방지 이력을 함께 만든다", async () => {
  const db = new MemoryFirestore([
    ["billing_plans/standard", { ...plan, createdAt: start, updatedAt: start }],
  ]);
  const config = getBillingRuntimeConfig({
    BILLING_TRIAL_HASH_SECRET: "billing-test-secret-with-32-characters",
  });
  const user = {
    uid: "bank-trial-service-user",
    email: "bank-trial@example.com",
    displayName: "무료이용자",
    role: "student",
    isMasterAdmin: false,
  };
  const account = await submitBankTransferRequest({
    db,
    config,
    user,
    depositorName: "",
    consent: true,
    termsVersion: BILLING_TERMS_VERSION,
    consentIp: "127.0.0.1",
    now: start,
  });

  const customer = db.values.get(`billing_customers/${user.uid}`);
  assert.equal(account.subscription.status, "trial");
  assert.equal(account.subscription.provider, "bank_transfer");
  assert.equal(account.entitled, true);
  assert.equal(account.trialEligible, false);
  assert.equal(db.values.has(`trial_history/${customer.identityHash}`), true);
  assert.equal(db.values.has(`bank_transfer_requests/${user.uid}`), false);
});
