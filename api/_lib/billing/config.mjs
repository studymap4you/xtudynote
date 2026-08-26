export const STANDARD_PLAN_ID = "standard";
export const BILLING_TERMS_VERSION = "2026-08-26";

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

export function getBillingRuntimeConfig(env = process.env) {
  const liveEnabled = text(env.BILLING_LIVE_ENABLED).toLowerCase() === "true";
  const enforcementEnabled = text(env.BILLING_ENFORCEMENT_ENABLED).toLowerCase() === "true";
  const trialHashSecret = text(env.BILLING_TRIAL_HASH_SECRET);
  const cronSecret = text(env.CRON_SECRET);
  const toss = tossConfiguration(env, liveEnabled);
  const kakaopay = kakaoConfiguration(env, liveEnabled);
  const trialGuardReady = trialHashSecret.length >= 24;
  return {
    liveEnabled,
    enforcementEnabled,
    mode: liveEnabled ? "live" : "test",
    trialHashSecret,
    trialGuardReady,
    cronSecret,
    retryOffsetsHours: parseRetryOffsets(env.BILLING_RETRY_OFFSETS_HOURS),
    pastDueGraceDays: positiveInteger(env.BILLING_PAST_DUE_GRACE_DAYS, 7),
    checkoutSessionMinutes: positiveInteger(env.BILLING_CHECKOUT_SESSION_MINUTES, 20),
    toss: {
      ...toss,
      ready: toss.ready && trialGuardReady,
      reason: trialGuardReady ? toss.reason : "무료체험 중복 방지용 서버 Secret 설정이 필요합니다.",
    },
    kakaopay: {
      ...kakaopay,
      ready: kakaopay.ready && trialGuardReady,
      reason: trialGuardReady ? kakaopay.reason : "무료체험 중복 방지용 서버 Secret 설정이 필요합니다.",
    },
  };
}

export function publicProviderAvailability(config) {
  return {
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

