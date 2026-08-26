export type BillingProviderId = "bank_transfer" | "toss" | "kakaopay";
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

export interface BankTransferInfo {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  currency: string;
  ready: boolean;
}

export interface BankTransferRequestSummary {
  id: string;
  status: "pending" | "approved" | "rejected";
  depositorName: string;
  amount: number;
  currency: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string;
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
  bankTransfer: BankTransferInfo;
  bankTransferRequest: BankTransferRequestSummary | null;
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
  bankTransferRequests: Array<{
    uid: string;
    requestId: string;
    email: string;
    displayName: string;
    depositorName: string;
    amount: number;
    currency: string;
    status: "pending";
    submittedAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string;
  }>;
  visitors: {
    today: string;
    todayPageViews: number;
    todayUniqueVisitors: number;
    todayAuthenticatedVisitors: number;
    totalPageViews: number;
    totalUniqueVisitors: number;
    updatedAt: string | null;
    daily: Array<{
      day: string;
      pageViews: number;
      uniqueVisitors: number;
      authenticatedVisitors: number;
    }>;
  };
  members: {
    total: number;
    active: number;
    banned: number;
    roleCounts: {
      super_admin: number;
      teacher: number;
      pending_teacher: number;
      student: number;
    };
    rows: Array<{
      uid: string;
      email: string;
      displayName: string;
      role: string;
      accountStatus: string;
      createdAt: string | null;
    }>;
    truncated: boolean;
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
