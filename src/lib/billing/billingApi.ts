import type { User } from "firebase/auth";
import type {
  AdminBillingOverview,
  BillingAccount,
  BillingCheckout,
  BillingProviderId,
} from "@/types/billing";

type BillingErrorPayload = { error?: string };

const ERROR_MESSAGES: Record<string, string> = {
  "authentication-required": "로그인 후 구독을 관리해주세요.",
  "active-account-required": "활성 계정에서만 구독을 관리할 수 있습니다.",
  "billing-provider-unavailable": "선택한 결제수단은 아직 계약 또는 테스트 키 설정이 필요합니다.",
  "billing-provider-invalid": "지원하지 않는 결제수단입니다.",
  "billing-consent-required": "정기결제 및 자동결제 동의가 필요합니다.",
  "billing-terms-version-invalid": "결제 약관이 갱신되었습니다. 내용을 다시 확인해주세요.",
  "billing-checkout-expired": "결제수단 등록 시간이 만료되었습니다. 다시 시작해주세요.",
  "billing-checkout-processing": "결제수단 등록을 확인하고 있습니다. 잠시 후 다시 확인해주세요.",
  "billing-callback-mismatch": "결제 인증 정보가 일치하지 않습니다. 처음부터 다시 진행해주세요.",
  "billing-payment-method-unavailable": "등록된 결제수단을 사용할 수 없습니다. 다시 등록해주세요.",
  "trial-already-used": "이 계정은 첫 달 무료 혜택을 이미 사용했습니다.",
  "trial-guard-not-configured": "무료체험 보호 설정이 완료되지 않았습니다.",
  "subscription-cannot-cancel": "현재 상태에서는 구독을 해지할 수 없습니다.",
  "premium-subscription-required": "구독 결제 후 이용할 수 있습니다.",
  "bank-transfer-unavailable": "무통장 입금 계좌를 확인하지 못했습니다.",
  "bank-transfer-consent-required": "입금 확인 및 이용권 활성화 안내에 동의해주세요.",
  "bank-transfer-depositor-required": "입금자명을 입력해주세요.",
  "bank-transfer-request-not-found": "입금 신청을 찾을 수 없습니다.",
  "bank-transfer-request-stale": "새 입금 신청이 있습니다. 목록을 새로고침해주세요.",
  "bank-transfer-request-not-pending": "이미 처리된 입금 신청입니다.",
  "bank-transfer-rejection-reason-invalid": "반려 사유를 두 글자 이상 입력해주세요.",
  "billing-request-failed": "결제 서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
};

export class BillingApiError extends Error {
  code: string;

  constructor(code: string) {
    super(ERROR_MESSAGES[code] || (code.startsWith("provider-")
      ? "결제사에서 요청을 처리하지 못했습니다. 결제수단과 계약 상태를 확인해주세요."
      : "결제 요청을 처리하지 못했습니다."));
    this.name = "BillingApiError";
    this.code = code;
  }
}

async function request<T>(user: User | null, url: string, init?: RequestInit): Promise<T> {
  const token = user ? await user.getIdToken() : null;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const isJson = response.headers.get("content-type")?.toLowerCase().includes("application/json");
  if (!isJson) throw new BillingApiError("billing-request-failed");
  const payload = (await response.json().catch(() => ({}))) as T & BillingErrorPayload;
  if (!response.ok) throw new BillingApiError(String(payload.error || "billing-request-failed"));
  return payload;
}

export function loadBillingAccount(user: User): Promise<BillingAccount> {
  return request(user, "/api/billing?action=account");
}

export function startBillingCheckout(
  user: User,
  input: { provider: BillingProviderId; consent: boolean; termsVersion: string },
): Promise<BillingCheckout> {
  return request(user, "/api/billing?action=start-checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitBankTransfer(
  user: User,
  input: { depositorName: string; consent: boolean; termsVersion: string },
): Promise<BillingAccount> {
  return request(user, "/api/billing?action=submit-bank-transfer", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function finalizeTossCheckout(
  user: User,
  input: { sessionId: string; authKey: string; customerKey: string },
): Promise<BillingAccount> {
  return request(user, "/api/billing?action=finalize-toss", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function finalizeKakaoPayCheckout(
  user: User,
  input: { sessionId: string; pgToken: string },
): Promise<BillingAccount> {
  return request(user, "/api/billing?action=finalize-kakaopay", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelSubscription(user: User): Promise<BillingAccount> {
  return request(user, "/api/billing?action=cancel", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function loadAdminBillingOverview(user: User): Promise<AdminBillingOverview> {
  return request(user, "/api/billing?action=admin-overview");
}

export function saveBillingRetryPolicy(
  user: User,
  values: { retryOffsetsHours: number[]; pastDueGraceDays: number },
): Promise<{ ok: true; retryPolicy: AdminBillingOverview["retryPolicy"] }> {
  return request(user, "/api/billing?action=admin-update-retry-policy", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export function approveBankTransfer(
  user: User,
  input: { uid: string; requestId: string },
): Promise<{ ok: true; uid: string; requestId: string }> {
  return request(user, "/api/billing?action=admin-approve-bank-transfer", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function rejectBankTransfer(
  user: User,
  input: { uid: string; requestId: string; reason: string },
): Promise<{ ok: true; uid: string; requestId: string }> {
  return request(user, "/api/billing?action=admin-reject-bank-transfer", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
