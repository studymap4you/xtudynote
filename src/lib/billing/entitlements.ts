import type { SubscriptionSummary } from "@/types/billing";

export function canUsePremiumFeatures(
  subscription: SubscriptionSummary | null,
  options: { enforcementEnabled: boolean; isSuperAdmin?: boolean; now?: Date },
): boolean {
  if (options.isSuperAdmin || !options.enforcementEnabled) return true;
  if (!subscription) return false;
  if (["trial", "active", "cancel_pending"].includes(subscription.status)) return true;
  if (subscription.status !== "past_due" || !subscription.graceEndsAt) return false;
  return new Date(subscription.graceEndsAt).getTime() >= (options.now ?? new Date()).getTime();
}
