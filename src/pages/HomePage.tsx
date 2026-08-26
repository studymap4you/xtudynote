import { LandingPage } from "@/pages/LandingPage";
import { TextbookAutoSimplePage } from "@/pages/TextbookAutoSimplePage";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

export function HomePage() {
  const { firebaseUser, profile, loading } = useAuth();

  if (loading || (firebaseUser && !profile)) {
    return (
      <div className="route-loading" aria-busy="true">
        <div className="route-loading__spinner" />
        <p>
          <span className="ui-en">Connecting...</span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
            연결 중...
          </span>
        </p>
      </div>
    );
  }

  if (!firebaseUser || !profile || profile.accountStatus === "banned") {
    return <LandingPage />;
  }

  return <TextbookAutoSimplePage />;
}
