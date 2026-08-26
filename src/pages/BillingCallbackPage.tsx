import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { finalizeKakaoPayCheckout, finalizeTossCheckout } from "@/lib/billing/billingApi";
import styles from "./billingPage.module.css";

export function BillingCallbackPage() {
  const { provider } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const { setAccount } = useSubscription();
  const started = useRef(false);
  const [status, setStatus] = useState<"checking" | "done" | "error">("checking");
  const [message, setMessage] = useState("결제사 인증 결과를 확인하고 있습니다.");

  useEffect(() => {
    if (!firebaseUser || started.current) return;
    started.current = true;
    const sessionId = searchParams.get("sessionId") || "";
    const authKey = searchParams.get("authKey") || "";
    const customerKey = searchParams.get("customerKey") || "";
    const pgToken = searchParams.get("pg_token") || "";
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const finish = async () => {
      try {
        const account = provider === "toss"
          ? await finalizeTossCheckout(firebaseUser, {
              sessionId,
              authKey,
              customerKey,
            })
          : provider === "kakaopay"
            ? await finalizeKakaoPayCheckout(firebaseUser, {
                sessionId,
                pgToken,
              })
            : (() => { throw new Error("지원하지 않는 결제수단입니다."); })();
        setAccount(account);
        setStatus("done");
        setMessage("구독 처리가 완료되었습니다.");
        window.setTimeout(() => navigate("/billing?checkout=success", { replace: true }), 700);
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "결제 인증을 확인하지 못했습니다.");
      }
    };
    void finish();
  }, [firebaseUser, navigate, provider, searchParams, setAccount]);

  return (
    <DashboardShell light>
      <main className={styles.callbackPage}>
        <section className={styles.callbackPanel} aria-live="polite">
          {status === "checking" ? <LoaderCircle className={styles.spin} aria-hidden /> : status === "done" ? <CheckCircle2 aria-hidden /> : <AlertCircle aria-hidden />}
          <h1>{status === "checking" ? "결제수단 확인 중" : status === "done" ? "등록 완료" : "확인 필요"}</h1>
          <p>{message}</p>
          {status === "error" ? <Link to="/billing">구독 관리로 돌아가기</Link> : null}
        </section>
      </main>
    </DashboardShell>
  );
}
