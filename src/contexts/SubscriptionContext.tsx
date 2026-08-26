import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { canUsePremiumFeatures } from "@/lib/billing/entitlements";
import { loadBillingAccount } from "@/lib/billing/billingApi";
import type { BillingAccount } from "@/types/billing";

type SubscriptionContextValue = {
  account: BillingAccount | null;
  loading: boolean;
  error: string | null;
  entitled: boolean;
  enforcementEnabled: boolean;
  refresh: () => Promise<void>;
  setAccount: (account: BillingAccount) => void;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { firebaseUser, isSuperAdmin } = useAuth();
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!firebaseUser) {
      setAccount(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setAccount(await loadBillingAccount(firebaseUser));
      setError(null);
    } catch (loadError) {
      setAccount(null);
      setError(loadError instanceof Error ? loadError.message : "구독 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enforcementEnabled = account?.enforcementEnabled ?? true;
  const entitled = useMemo(() => canUsePremiumFeatures(account?.subscription ?? null, {
    enforcementEnabled,
    isSuperAdmin,
  }), [account, enforcementEnabled, isSuperAdmin]);

  const value = useMemo<SubscriptionContextValue>(() => ({
    account,
    loading,
    error,
    entitled,
    enforcementEnabled,
    refresh,
    setAccount,
  }), [account, loading, error, entitled, enforcementEnabled, refresh]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error("useSubscription must be used within SubscriptionProvider");
  return context;
}
