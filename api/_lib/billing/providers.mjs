const TOSS_API_ORIGIN = "https://api.tosspayments.com";
const KAKAOPAY_API_ORIGIN = "https://open-api.kakaopay.com";

export class BillingProviderError extends Error {
  constructor(provider, code, statusCode, retryable = false) {
    super(`provider-${provider}-${String(code || "request-failed").slice(0, 80)}`);
    this.name = "BillingProviderError";
    this.provider = provider;
    this.providerCode = String(code || "request-failed").slice(0, 120);
    this.statusCode = Number(statusCode) || 502;
    this.retryable = Boolean(retryable);
  }
}

async function requestJson({ provider, fetchImpl, url, method = "POST", headers, body, timeoutMs = 65_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      ...(body == null ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = payload?.code || payload?.error_code || payload?.errorCode || `http-${response.status}`;
      const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
      throw new BillingProviderError(provider, code, response.status, retryable);
    }
    return payload;
  } catch (error) {
    if (error instanceof BillingProviderError) throw error;
    if (error?.name === "AbortError") throw new BillingProviderError(provider, "timeout", 504, true);
    throw new BillingProviderError(provider, "network-error", 502, true);
  } finally {
    clearTimeout(timer);
  }
}

function cardSummary(payload, fallback) {
  const card = payload?.card && typeof payload.card === "object" ? payload.card : {};
  const number = String(card.number || payload?.cardNumber || "").replace(/\s/gu, "");
  const last4 = number.replace(/[^0-9]/gu, "").slice(-4);
  const issuer = String(card.issuerCode || card.company || payload?.payment_method_type || "").trim();
  return {
    label: issuer ? `${fallback} · ${issuer}` : fallback,
    last4,
    method: String(payload?.method || payload?.payment_method_type || "CARD").trim(),
  };
}

export class BillingProvider {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
  }

  async registerPaymentMethod() {
    throw new Error("provider-method-not-implemented");
  }

  async createTrial() {
    return { chargedAmount: 0 };
  }

  async chargeSubscription() {
    throw new Error("provider-method-not-implemented");
  }

  async cancelSubscription(params) {
    return this.deactivatePaymentMethod(params);
  }

  async deactivatePaymentMethod() {
    throw new Error("provider-method-not-implemented");
  }

  async getPaymentStatus() {
    throw new Error("provider-method-not-implemented");
  }

  async refundPayment() {
    throw new Error("provider-method-not-implemented");
  }
}

export class TossPaymentsBillingProvider extends BillingProvider {
  constructor({ clientKey, secretKey, fetchImpl = fetch }) {
    super({ fetchImpl });
    this.clientKey = clientKey;
    this.secretKey = secretKey;
  }

  headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    };
  }

  async registerPaymentMethod({ authKey, customerKey }) {
    const payload = await requestJson({
      provider: "toss",
      fetchImpl: this.fetchImpl,
      url: `${TOSS_API_ORIGIN}/v1/billing/authorizations/issue`,
      headers: this.headers(),
      body: { authKey, customerKey },
      timeoutMs: 30_000,
    });
    if (!payload?.billingKey || payload.customerKey !== customerKey) {
      throw new BillingProviderError("toss", "invalid-billing-response", 502, false);
    }
    return {
      credentials: {
        billingKey: String(payload.billingKey),
        customerKey,
      },
      summary: cardSummary(payload, "토스페이먼츠 카드"),
      providerReference: String(payload.mId || ""),
      initialPayment: null,
    };
  }

  async chargeSubscription({ credentials, amount, orderId, orderName, customerEmail }) {
    const payload = await requestJson({
      provider: "toss",
      fetchImpl: this.fetchImpl,
      url: `${TOSS_API_ORIGIN}/v1/billing/${encodeURIComponent(credentials.billingKey)}`,
      headers: this.headers(),
      body: {
        amount,
        customerKey: credentials.customerKey,
        orderId,
        orderName: String(orderName || "Xtudy Standard").slice(0, 14),
        ...(customerEmail ? { customerEmail: String(customerEmail).slice(0, 100) } : {}),
      },
    });
    if (!payload?.paymentKey || Number(payload.totalAmount ?? payload.balanceAmount) !== Number(amount)) {
      throw new BillingProviderError("toss", "invalid-charge-response", 502, false);
    }
    return {
      providerTransactionId: String(payload.paymentKey),
      providerOrderId: String(payload.orderId || orderId),
      status: String(payload.status || "DONE"),
      amount: Number(payload.totalAmount ?? payload.balanceAmount),
      method: String(payload.method || "카드"),
      receiptUrl: String(payload.receipt?.url || ""),
      approvedAt: payload.approvedAt ? new Date(payload.approvedAt) : new Date(),
    };
  }

  async deactivatePaymentMethod({ credentials }) {
    await requestJson({
      provider: "toss",
      fetchImpl: this.fetchImpl,
      url: `${TOSS_API_ORIGIN}/v1/billing/${encodeURIComponent(credentials.billingKey)}`,
      method: "DELETE",
      headers: this.headers(),
      body: null,
      timeoutMs: 30_000,
    });
    return { status: "INACTIVE" };
  }

  async getPaymentStatus({ orderId }) {
    const payload = await requestJson({
      provider: "toss",
      fetchImpl: this.fetchImpl,
      url: `${TOSS_API_ORIGIN}/v1/payments/orders/${encodeURIComponent(orderId)}`,
      method: "GET",
      headers: this.headers(),
      body: null,
      timeoutMs: 30_000,
    });
    return {
      paid: payload?.status === "DONE",
      providerTransactionId: String(payload?.paymentKey || ""),
      providerOrderId: String(payload?.orderId || orderId),
      status: String(payload?.status || "UNKNOWN"),
      amount: Number(payload?.totalAmount ?? payload?.balanceAmount) || 0,
      method: String(payload?.method || "카드"),
      receiptUrl: String(payload?.receipt?.url || ""),
      approvedAt: payload?.approvedAt ? new Date(payload.approvedAt) : new Date(),
    };
  }

  async refundPayment({ providerTransactionId, reason, amount }) {
    const payload = await requestJson({
      provider: "toss",
      fetchImpl: this.fetchImpl,
      url: `${TOSS_API_ORIGIN}/v1/payments/${encodeURIComponent(providerTransactionId)}/cancel`,
      headers: this.headers(),
      body: {
        cancelReason: String(reason || "구독 결제 환불").slice(0, 200),
        ...(Number.isInteger(amount) && amount > 0 ? { cancelAmount: amount } : {}),
      },
    });
    return { status: String(payload?.status || "CANCELED"), providerTransactionId };
  }
}

export class KakaoPayBillingProvider extends BillingProvider {
  constructor({ secretKey, cid, cidSecret, fetchImpl = fetch }) {
    super({ fetchImpl });
    this.secretKey = secretKey;
    this.cid = cid;
    this.cidSecret = cidSecret;
  }

  headers() {
    return {
      Authorization: `SECRET_KEY ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  baseBody() {
    return {
      cid: this.cid,
      ...(this.cidSecret ? { cid_secret: this.cidSecret } : {}),
    };
  }

  async createPaymentMethodSession({ partnerOrderId, partnerUserId, amount, approvalUrl, cancelUrl, failUrl }) {
    const payload = await requestJson({
      provider: "kakaopay",
      fetchImpl: this.fetchImpl,
      url: `${KAKAOPAY_API_ORIGIN}/online/v1/payment/ready`,
      headers: this.headers(),
      body: {
        ...this.baseBody(),
        partner_order_id: partnerOrderId,
        partner_user_id: partnerUserId,
        item_name: "Xtudy Standard",
        item_code: "standard",
        quantity: 1,
        total_amount: amount,
        tax_free_amount: 0,
        approval_url: approvalUrl,
        cancel_url: cancelUrl,
        fail_url: failUrl,
      },
      timeoutMs: 30_000,
    });
    if (!payload?.tid || !payload?.next_redirect_pc_url) {
      throw new BillingProviderError("kakaopay", "invalid-ready-response", 502, false);
    }
    return {
      tid: String(payload.tid),
      redirectUrl: String(payload.next_redirect_pc_url),
      mobileRedirectUrl: String(payload.next_redirect_mobile_url || payload.next_redirect_pc_url),
      createdAt: payload.created_at ? new Date(payload.created_at) : new Date(),
    };
  }

  async registerPaymentMethod({ tid, pgToken, partnerOrderId, partnerUserId, expectedAmount }) {
    const payload = await requestJson({
      provider: "kakaopay",
      fetchImpl: this.fetchImpl,
      url: `${KAKAOPAY_API_ORIGIN}/online/v1/payment/approve`,
      headers: this.headers(),
      body: {
        ...this.baseBody(),
        tid,
        partner_order_id: partnerOrderId,
        partner_user_id: partnerUserId,
        pg_token: pgToken,
      },
      timeoutMs: 30_000,
    });
    const approvedAmount = Number(payload?.amount?.total ?? 0);
    if (!payload?.sid || payload?.tid !== tid || approvedAmount !== Number(expectedAmount)) {
      throw new BillingProviderError("kakaopay", "invalid-approval-response", 502, false);
    }
    return {
      credentials: {
        sid: String(payload.sid),
        cid: this.cid,
        partnerUserId,
      },
      summary: cardSummary(payload, "카카오페이"),
      providerReference: String(payload.tid),
      initialPayment: approvedAmount > 0 ? {
        providerTransactionId: String(payload.tid),
        providerOrderId: String(payload.partner_order_id || partnerOrderId),
        status: "DONE",
        amount: approvedAmount,
        method: String(payload.payment_method_type || "KAKAOPAY"),
        receiptUrl: "",
        approvedAt: payload.approved_at ? new Date(payload.approved_at) : new Date(),
      } : null,
    };
  }

  async chargeSubscription({ credentials, amount, orderId }) {
    const payload = await requestJson({
      provider: "kakaopay",
      fetchImpl: this.fetchImpl,
      url: `${KAKAOPAY_API_ORIGIN}/online/v1/payment/subscription`,
      headers: this.headers(),
      body: {
        ...this.baseBody(),
        sid: credentials.sid,
        partner_order_id: orderId,
        partner_user_id: credentials.partnerUserId,
        item_name: "Xtudy Standard",
        item_code: "standard",
        quantity: 1,
        total_amount: amount,
        tax_free_amount: 0,
      },
    });
    const approvedAmount = Number(payload?.amount?.total ?? 0);
    if (!payload?.tid || approvedAmount !== Number(amount)) {
      throw new BillingProviderError("kakaopay", "invalid-charge-response", 502, false);
    }
    return {
      providerTransactionId: String(payload.tid),
      providerOrderId: String(payload.partner_order_id || orderId),
      status: "DONE",
      amount: approvedAmount,
      method: String(payload.payment_method_type || "KAKAOPAY"),
      receiptUrl: "",
      approvedAt: payload.approved_at ? new Date(payload.approved_at) : new Date(),
    };
  }

  async deactivatePaymentMethod({ credentials }) {
    const payload = await requestJson({
      provider: "kakaopay",
      fetchImpl: this.fetchImpl,
      url: `${KAKAOPAY_API_ORIGIN}/online/v1/payment/manage/subscription/inactive`,
      headers: this.headers(),
      body: { ...this.baseBody(), sid: credentials.sid },
      timeoutMs: 30_000,
    });
    return { status: String(payload?.status || "INACTIVE") };
  }

  async getPaymentStatus({ credentials }) {
    const payload = await requestJson({
      provider: "kakaopay",
      fetchImpl: this.fetchImpl,
      url: `${KAKAOPAY_API_ORIGIN}/online/v1/payment/manage/subscription/status`,
      headers: this.headers(),
      body: { ...this.baseBody(), sid: credentials.sid },
      timeoutMs: 30_000,
    });
    return { paid: false, status: String(payload?.status || "UNKNOWN"), available: Boolean(payload?.available) };
  }

  async refundPayment({ providerTransactionId, amount }) {
    const payload = await requestJson({
      provider: "kakaopay",
      fetchImpl: this.fetchImpl,
      url: `${KAKAOPAY_API_ORIGIN}/online/v1/payment/cancel`,
      headers: this.headers(),
      body: {
        ...this.baseBody(),
        tid: providerTransactionId,
        cancel_amount: amount,
        cancel_tax_free_amount: 0,
      },
    });
    return { status: String(payload?.status || "CANCELED"), providerTransactionId };
  }
}

export function getBillingProvider(provider, config, fetchImpl = fetch) {
  if (provider === "toss") {
    if (!config.toss.ready) throw Object.assign(new Error("billing-provider-unavailable"), { statusCode: 503 });
    return new TossPaymentsBillingProvider({ ...config.toss, fetchImpl });
  }
  if (provider === "kakaopay") {
    if (!config.kakaopay.ready) throw Object.assign(new Error("billing-provider-unavailable"), { statusCode: 503 });
    return new KakaoPayBillingProvider({ ...config.kakaopay, fetchImpl });
  }
  throw Object.assign(new Error("billing-provider-invalid"), { statusCode: 400 });
}

