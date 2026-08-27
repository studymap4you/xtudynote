import { createHash } from "node:crypto";

export const STANDARD_PLAN_ID = "standard";
export const BILLING_TERMS_VERSION = "2026-08-26-bank-transfer-trial-v2";
export const MASTER_ADMIN_EMAIL = "waterfallingsound0827@gmail.com";
export const SUPER_ADMIN_EMAILS = Object.freeze([
  MASTER_ADMIN_EMAIL,
  "studymap0904@gmail.com",
]);

export function isSuperAdminEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(normalized);
}

export const DEFAULT_STANDARD_PLAN = Object.freeze({
  planId: STANDARD_PLAN_ID,
  name: "Xtudy Standard",
  currency: "KRW",
  listPrice: 36_000,
  salePrice: 18_000,
  discountRate: 50,
  trialPrice: 0,
  trialMonths: 1,
  billingCycle: "monthly",
  active: true,
});

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRetryOffsets(value) {
  const parsed = text(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0 && item <= 24 * 30);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b).slice(0, 5) : [24, 72];
}

function tossConfiguration(env, liveEnabled) {
  const clientKey = text(env.TOSS_PAYMENTS_CLIENT_KEY);
  const secretKey = text(env.TOSS_PAYMENTS_SECRET_KEY);
  const hasKeys = Boolean(clientKey && secretKey);
  const testKeys = clientKey.startsWith("test_") && secretKey.startsWith("test_");
  const ready = hasKeys && (liveEnabled || testKeys);
  return {
    clientKey,
    secretKey,
    ready,
    reason: ready
      ? null
      : !hasKeys
        ? "토스페이먼츠 자동결제 테스트 키를 등록해주세요."
        : "실결제가 꺼진 상태에서는 test_ 키만 사용할 수 있습니다.",
  };
}

function kakaoConfiguration(env, liveEnabled) {
  const secretKey = text(env.KAKAOPAY_SECRET_KEY);
  const cid = text(env.KAKAOPAY_CID) || (liveEnabled ? "" : "TCSUBSCRIP");
  const cidSecret = text(env.KAKAOPAY_CID_SECRET);
  const hasKeys = Boolean(secretKey && cid);
  const testKeys = cid === "TCSUBSCRIP";
  const ready = hasKeys && (liveEnabled || testKeys);
  return {
    secretKey,
    cid,
    cidSecret,
    ready,
    reason: ready
      ? null
      : !hasKeys
        ? "카카오페이 개발용 Secret Key를 등록해주세요."
        : "실결제가 꺼진 상태에서는 TCSUBSCRIP만 사용할 수 있습니다.",
  };
}

function bankTransferConfiguration(env) {
  const bankName = text(env.BANK_TRANSFER_BANK_NAME) || "지역농협";
  const accountNumber = text(env.BANK_TRANSFER_ACCOUNT_NUMBER) || "3521660492353";
  const accountHolder = text(env.BANK_TRANSFER_ACCOUNT_HOLDER);
  return {
    bankName,
    accountNumber,
    accountHolder,
    ready: Boolean(bankName && accountNumber),
    reason: bankName && accountNumber ? null : "무통장 입금 계좌를 확인해주세요.",
  };
}

export function getBillingRuntimeConfig(env = process.env) {
  const liveEnabled = text(env.BILLING_LIVE_ENABLED).toLowerCase() === "true";
  // Access control is fail-closed. It may only be disabled in an explicit test process.
  const enforcementEnabled = !(
    text(env.NODE_ENV).toLowerCase() === "test"
    && text(env.BILLING_ACCESS_CONTROL_DISABLED_FOR_TESTS).toLowerCase() === "true"
  );
  const pgCheckoutEnabled = text(env.BILLING_PG_CHECKOUT_ENABLED).toLowerCase() === "true";
  const cronSecret = text(env.CRON_SECRET);
  const configuredTrialSecret = text(env.BILLING_TRIAL_HASH_SECRET);
  const fallbackTrialSeed = cronSecret || text(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const trialHashSecret = configuredTrialSecret || (fallbackTrialSeed
    ? createHash("sha256").update(fallbackTrialSeed).digest("hex")
    : "");
  const toss = tossConfiguration(env, liveEnabled);
  const kakaopay = kakaoConfiguration(env, liveEnabled);
  const bankTransfer = bankTransferConfiguration(env);
  const trialGuardReady = trialHashSecret.length >= 24;
  return {
    liveEnabled,
    enforcementEnabled,
    pgCheckoutEnabled,
    mode: liveEnabled ? "live" : "test",
    trialHashSecret,
    trialGuardReady,
    cronSecret,
    retryOffsetsHours: parseRetryOffsets(env.BILLING_RETRY_OFFSETS_HOURS),
    pastDueGraceDays: positiveInteger(env.BILLING_PAST_DUE_GRACE_DAYS, 7),
    checkoutSessionMinutes: positiveInteger(env.BILLING_CHECKOUT_SESSION_MINUTES, 20),
    toss: {
      ...toss,
      ready: pgCheckoutEnabled && toss.ready && trialGuardReady,
      reason: pgCheckoutEnabled
        ? trialGuardReady ? toss.reason : "무료체험 중복 방지용 서버 Secret 설정이 필요합니다."
        : "현재는 무통장 입금만 지원합니다.",
    },
    kakaopay: {
      ...kakaopay,
      ready: pgCheckoutEnabled && kakaopay.ready && trialGuardReady,
      reason: pgCheckoutEnabled
        ? trialGuardReady ? kakaopay.reason : "무료체험 중복 방지용 서버 Secret 설정이 필요합니다."
        : "현재는 무통장 입금만 지원합니다.",
    },
    bankTransfer,
  };
}

export function publicProviderAvailability(config) {
  return {
    bank_transfer: {
      id: "bank_transfer",
      label: "무통장 입금",
      sublabel: config.bankTransfer.bankName,
      ready: config.bankTransfer.ready,
      reason: config.bankTransfer.reason,
    },
    toss: {
      id: "toss",
      label: "신용·체크카드",
      sublabel: "Toss Payments",
      ready: config.toss.ready,
      reason: config.toss.reason,
    },
    kakaopay: {
      id: "kakaopay",
      label: "카카오페이",
      sublabel: "KakaoPay",
      ready: config.kakaopay.ready,
      reason: config.kakaopay.reason,
    },
  };
}
