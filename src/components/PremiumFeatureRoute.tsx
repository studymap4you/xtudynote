import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";

export function PremiumFeatureRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { loading, entitled, enforcementEnabled } = useSubscription();

  if (loading && enforcementEnabled) {
    return (
      <div className="route-loading" aria-busy="true">
        <div className="route-loading__spinner" />
        <p>구독 상태를 확인하고 있습니다.</p>
      </div>
    );
  }
  if (enforcementEnabled && !entitled) {
    return <Navigate to="/billing" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
