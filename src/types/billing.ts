export type BillingProviderId = "toss" | "kakaopay";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancel_pending" | "cancelled";

export interface BillingPlan {
  planId: "standard";
  name: string;
  currency: "KRW";
  listPrice: number;
  salePrice: number;
  discountRate: number;
  trialPrice: number;
  trialMonths: number;
  billingCycle: "monthly";
  active: boolean;
  todayAmount: number;
  nextBillingAt: string;
  nextBillingAmount: number;
}

export interface BillingProviderAvailability {
  id: BillingProviderId;
  label: string;
  sublabel: string;
  ready: boolean;
  reason: string | null;
}

export interface SubscriptionSummary {
  planId: string;
  status: SubscriptionStatus;
  provider: BillingProviderId;
  listPrice: number;
  billingAmount: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  billingAnchorDay: number;
  currentPeriodStartedAt: string | null;
  currentPeriodEndsAt: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus: string;
  retryCount: number;
  graceEndsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaymentMethodSummary {
  provider: BillingProviderId;
  label: string;
  last4: string;
  method: string;
  status: string;
  registeredAt: string | null;
}

export interface PaymentTransactionSummary {
  id: string;
  billingCycleId: string;
  amount: number;
  currency: string;
  status: string;
  provider: BillingProviderId;
  paymentMethod: string;
  providerOrderId: string;
  providerTransactionId: string;
  receiptUrl: string;
  attemptedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  createdAt: string | null;
}

export interface BillingAccount {
  plan: BillingPlan;
  providers: Record<BillingProviderId, BillingProviderAvailability>;
  termsVersion: string;
  mode: "test" | "live";
  liveEnabled: boolean;
  enforcementEnabled: boolean;
  trialEligible: boolean;
  entitled: boolean;
  subscription: SubscriptionSummary | null;
  paymentMethod: PaymentMethodSummary | null;
  transactions: PaymentTransactionSummary[];
}

export interface BillingCheckout {
  sessionId: string;
  provider: BillingProviderId;
  purpose: "subscribe_trial" | "subscribe_paid" | "replace_payment_method";
  expiresAt: string;
  plan: BillingPlan;
  checkout: {
    todayAmount: number;
    nextBillingAmount: number;
    nextBillingAt: string;
  };
  toss?: {
    clientKey: string;
    customerKey: string;
    successUrl: string;
    failUrl: string;
  };
  kakaopay?: {
    redirectUrl: string;
    mobileRedirectUrl: string;
  };
}

export interface AdminBillingOverview {
  plan: BillingPlan;
  mode: "test" | "live";
  liveEnabled: boolean;
  counts: Record<"total" | SubscriptionStatus, number>;
  estimatedMonthlyRecurringRevenue: number;
  successfulPayments: number;
  failedPayments: number;
  retryPolicy: {
    retryOffsetsHours: number[];
    pastDueGraceDays: number;
    updatedAt: string | null;
  };
  subscriptions: Array<{
    uid: string;
    email: string;
    planId: string;
    status: SubscriptionStatus;
    provider: BillingProviderId;
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
    nextBillingAt: string | null;
    lastPaymentAt: string | null;
    lastPaymentStatus: string;
    billingAmount: number;
    updatedAt: string | null;
  }>;
  recentTransactions: PaymentTransactionSummary[];
}
