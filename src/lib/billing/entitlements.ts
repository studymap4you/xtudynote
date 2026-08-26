import type { SubscriptionSummary } from "@/types/billing";

export function canUsePremiumFeatures(
  subscription: SubscriptionSummary | null,
  options: { enforcementEnabled: boolean; isSuperAdmin?: boolean; now?: Date },
): boolean {
  if (options.isSuperAdmin || !options.enforcementEnabled) return true;
  if (!subscription) return false;
  if (!["active", "cancel_pending"].includes(subscription.status) || !subscription.currentPeriodEndsAt) return false;
  return new Date(subscription.currentPeriodEndsAt).getTime() > (options.now ?? new Date()).getTime();
}
