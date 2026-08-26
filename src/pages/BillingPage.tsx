import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  MessageCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cancelSubscription, startBillingCheckout } from "@/lib/billing/billingApi";
import { openTossBillingWindow } from "@/lib/billing/loadTossBillingSdk";
import type { BillingProviderId, SubscriptionStatus } from "@/types/billing";
import styles from "./billingPage.module.css";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "무료 이용 중",
  active: "이용 중",
  past_due: "결제 확인 필요",
  cancel_pending: "해지 예정",
  cancelled: "해지됨",
};

function won(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function providerLabel(provider: BillingProviderId) {
  return provider === "toss" ? "Toss Payments" : "카카오페이";
}

export function BillingPage() {
  const { firebaseUser, profile } = useAuth();
  const { account, loading, error: accountError, refresh, setAccount } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProvider, setSelectedProvider] = useState<BillingProviderId>("toss");
  const [consent, setConsent] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [busy, setBusy] = useState<"checkout" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    const firstReady = (Object.values(account.providers).find((provider) => provider.ready)?.id ?? "toss") as BillingProviderId;
    setSelectedProvider(firstReady);
    setShowSetup(!account.subscription || account.subscription.status === "cancelled");
  }, [account]);

  const queryNotice = useMemo(() => {
    const value = searchParams.get("checkout");
    if (value === "success") return { kind: "success", text: "결제수단 등록과 구독 처리가 완료되었습니다." };
    if (value === "cancelled") return { kind: "error", text: "결제수단 등록을 취소했습니다." };
    if (value === "failed") return { kind: "error", text: "결제사 인증을 완료하지 못했습니다. 다시 시도해주세요." };
    return null;
  }, [searchParams]);

  const replacing = Boolean(account?.subscription && account.subscription.status !== "cancelled");
  const pastDueReplacement = account?.subscription?.status === "past_due";
  const todayAmount = pastDueReplacement
    ? account?.plan.salePrice ?? 0
    : replacing
      ? 0
      : account?.trialEligible
        ? 0
        : account?.plan.salePrice ?? 0;
  const nextBillingAt = pastDueReplacement
    ? account?.plan.nextBillingAt
    : replacing
      ? account?.subscription?.nextBillingAt
      : account?.plan.nextBillingAt;

  async function beginCheckout() {
    if (!firebaseUser || !account) return;
    if (!consent) {
      setError("정기결제 및 자동결제 동의가 필요합니다.");
      return;
    }
    setBusy("checkout");
    setError(null);
    try {
      const checkout = await startBillingCheckout(firebaseUser, {
        provider: selectedProvider,
        consent,
        termsVersion: account.termsVersion,
      });
      if (checkout.provider === "toss" && checkout.toss) {
        await openTossBillingWindow({
          ...checkout.toss,
          customerEmail: firebaseUser.email || undefined,
          customerName: profile?.displayName,
        });
        return;
      }
      if (checkout.provider === "kakaopay" && checkout.kakaopay) {
        window.location.assign(checkout.kakaopay.redirectUrl);
        return;
      }
      throw new Error("결제사 등록 화면을 열지 못했습니다.");
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "결제수단 등록을 시작하지 못했습니다.");
      setBusy(null);
    }
  }

  async function cancel() {
    if (!firebaseUser || !account?.subscription) return;
    const message = account.subscription.status === "trial"
      ? "무료 이용을 지금 종료할까요? 종료 후에는 결제가 발생하지 않습니다."
      : "구독을 해지할까요? 유료 이용 중이면 현재 이용기간 종료일까지 사용할 수 있습니다.";
    if (!window.confirm(message)) return;
    setBusy("cancel");
    setError(null);
    try {
      setAccount(await cancelSubscription(firebaseUser));
      setShowSetup(false);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "구독을 해지하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !account) {
    return (
      <DashboardShell light>
        <main className={styles.page}><div className={styles.loading}><LoaderCircle aria-hidden />구독 정보를 확인하고 있습니다.</div></main>
      </DashboardShell>
    );
  }

  if (!account) {
    return (
      <DashboardShell light>
        <main className={styles.page}>
          <section className={styles.loadError} role="alert">
            <AlertCircle aria-hidden />
            <div><h1>구독 정보를 불러오지 못했습니다.</h1><p>{accountError}</p></div>
            <button type="button" onClick={() => void refresh()}><RefreshCw size={18} aria-hidden />다시 불러오기</button>
          </section>
        </main>
      </DashboardShell>
    );
  }

  const subscription = account.subscription;
  const selectedAvailability = account.providers[selectedProvider];

  return (
    <DashboardShell light>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>XTUDY MEMBERSHIP</p>
            <h1>구독 관리</h1>
            <p>교재 제작과 Xtudy 학습 도구를 하나의 멤버십으로 이용합니다.</p>
          </div>
          <span className={`${styles.modeBadge} ${account.liveEnabled ? styles.live : ""}`}>
            {account.liveEnabled ? "LIVE" : "TEST MODE"}
          </span>
        </header>

        {queryNotice ? (
          <div className={queryNotice.kind === "success" ? styles.successNotice : styles.errorNotice} role="status">
            {queryNotice.kind === "success" ? <CheckCircle2 size={19} aria-hidden /> : <AlertCircle size={19} aria-hidden />}
            <span>{queryNotice.text}</span>
            <button type="button" onClick={() => setSearchParams({})} aria-label="알림 닫기">×</button>
          </div>
        ) : null}
        {(error || accountError) ? <div className={styles.errorNotice} role="alert"><AlertCircle size={19} aria-hidden />{error || accountError}</div> : null}

        <section className={styles.planSection}>
          <div className={styles.planIdentity}>
            <span>STANDARD</span>
            <h2>{account.plan.name}</h2>
            <p>첫 1개월 무료, 이후 매월 자동결제</p>
          </div>
          <div className={styles.priceBlock}>
            <div><del>{won(account.plan.listPrice)}</del><span>{account.plan.discountRate}% 할인</span></div>
            <strong>{won(account.plan.salePrice)}</strong><small>/ 월</small>
            <p>첫 달 {won(account.plan.trialPrice)}</p>
          </div>
          {!subscription || subscription.status === "cancelled" ? (
            <button type="button" className={styles.primaryButton} onClick={() => setShowSetup(true)}>
              첫 달 무료로 시작하기
            </button>
          ) : (
            <div className={styles.currentStatus}>
              <span className={`${styles.statusDot} ${styles[`status_${subscription.status}`]}`} />
              <div><small>현재 상태</small><strong>{STATUS_LABEL[subscription.status]}</strong></div>
            </div>
          )}
        </section>

        {subscription && subscription.status !== "cancelled" ? (
          <section className={styles.accountSection} aria-labelledby="billing-current-title">
            <div className={styles.sectionTitle}>
              <div><p>CURRENT SUBSCRIPTION</p><h2 id="billing-current-title">현재 구독</h2></div>
              <button type="button" className={styles.secondaryButton} onClick={() => { setShowSetup((value) => !value); setConsent(false); }}>
                <CreditCard size={17} aria-hidden />결제수단 변경
              </button>
            </div>
            <div className={styles.factGrid}>
              <div><CalendarDays aria-hidden /><span>이용 기간</span><strong>{dateLabel(subscription.currentPeriodStartedAt)} - {dateLabel(subscription.currentPeriodEndsAt)}</strong></div>
              <div><ReceiptText aria-hidden /><span>다음 결제</span><strong>{subscription.nextBillingAt ? `${dateLabel(subscription.nextBillingAt)} · ${won(subscription.billingAmount)}` : "예정 없음"}</strong></div>
              <div><CreditCard aria-hidden /><span>결제수단</span><strong>{account.paymentMethod ? `${account.paymentMethod.label}${account.paymentMethod.last4 ? ` · ${account.paymentMethod.last4}` : ""}` : "확인 필요"}</strong></div>
              <div><ShieldCheck aria-hidden /><span>서비스 이용</span><strong>{account.entitled ? "정상 이용 가능" : "이용 제한"}</strong></div>
            </div>
            {subscription.status === "past_due" ? <p className={styles.pastDue}>결제가 완료되지 않았습니다. 결제수단을 다시 등록해주세요.</p> : null}
            {subscription.status === "cancel_pending" ? <p className={styles.cancelPending}>{dateLabel(subscription.currentPeriodEndsAt)}까지 이용 후 자동으로 종료됩니다.</p> : null}
            {!subscription.cancelAtPeriodEnd ? (
              <button type="button" className={styles.textButton} onClick={() => void cancel()} disabled={busy !== null}>
                {busy === "cancel" ? "처리 중…" : "구독 해지"}
              </button>
            ) : null}
          </section>
        ) : null}

        {showSetup ? (
          <section className={styles.setupSection} aria-labelledby="billing-method-title">
            <div className={styles.sectionTitle}>
              <div><p>PAYMENT METHOD</p><h2 id="billing-method-title">{replacing ? "결제수단 변경" : "결제수단 등록"}</h2></div>
            </div>
            <div className={styles.scheduleGrid}>
              <div><span>오늘 결제금액</span><strong>{won(todayAmount)}</strong></div>
              <div><span>다음 결제</span><strong>{dateLabel(nextBillingAt)}</strong></div>
              <div><span>다음 결제금액</span><strong>{won(account.plan.salePrice)}</strong></div>
              <div><span>이후</span><strong>월 {won(account.plan.salePrice)}</strong></div>
            </div>

            <fieldset className={styles.providerFieldset}>
              <legend>결제수단 선택</legend>
              {(Object.values(account.providers) as typeof account.providers[BillingProviderId][]).map((provider) => (
                <label key={provider.id} className={`${styles.providerOption} ${selectedProvider === provider.id ? styles.providerSelected : ""} ${!provider.ready ? styles.providerDisabled : ""}`}>
                  <input type="radio" name="provider" value={provider.id} checked={selectedProvider === provider.id} onChange={() => setSelectedProvider(provider.id)} disabled={!provider.ready} />
                  <span className={styles.providerIcon}>{provider.id === "toss" ? <CreditCard aria-hidden /> : <MessageCircle aria-hidden />}</span>
                  <span><strong>{provider.label}</strong><small>{provider.sublabel}</small></span>
                  {provider.ready ? <Check className={styles.providerCheck} aria-hidden /> : <em>설정 필요</em>}
                </label>
              ))}
            </fieldset>

            <div className={styles.consentBox}>
              <ul>
                <li>오늘 결제금액은 {won(todayAmount)}입니다.</li>
                {account.trialEligible && !replacing ? <li>첫 1개월은 무료이며 종료일부터 {won(account.plan.salePrice)}이 결제됩니다.</li> : null}
                <li>이후 매월 {won(account.plan.salePrice)}이 자동결제됩니다.</li>
                <li>무료기간 중 해지 시 결제가 없으며, 유료 구독은 현재 이용기간 종료까지 이용할 수 있습니다.</li>
              </ul>
              <label>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>정기결제 및 자동결제에 동의합니다. <small>필수</small></span>
              </label>
            </div>

            {!selectedAvailability.ready ? <p className={styles.providerReason}>{selectedAvailability.reason}</p> : null}
            <div className={styles.setupActions}>
              {replacing ? <button type="button" className={styles.secondaryButton} onClick={() => setShowSetup(false)}>닫기</button> : null}
              <button type="button" className={styles.primaryButton} onClick={() => void beginCheckout()} disabled={!consent || !selectedAvailability.ready || busy !== null}>
                {busy === "checkout" ? <><LoaderCircle className={styles.spin} size={18} aria-hidden />연결 중</> : todayAmount === 0 ? "0원으로 시작하기" : `${won(todayAmount)} 결제하고 시작하기`}
              </button>
            </div>
          </section>
        ) : null}

        <section className={styles.historySection} aria-labelledby="billing-history-title">
          <div className={styles.sectionTitle}>
            <div><p>PAYMENT HISTORY</p><h2 id="billing-history-title">결제 내역</h2></div>
          </div>
          {account.transactions.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>결제일</th><th>금액</th><th>상태</th><th>결제수단</th><th>영수증·거래</th></tr></thead>
                <tbody>{account.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{dateLabel(transaction.paidAt || transaction.attemptedAt)}</td>
                    <td>{won(transaction.amount)}</td>
                    <td><span className={styles.transactionStatus}>{transaction.status}</span></td>
                    <td>{transaction.paymentMethod || providerLabel(transaction.provider)}</td>
                    <td>{transaction.receiptUrl ? <a href={transaction.receiptUrl} target="_blank" rel="noreferrer">영수증</a> : transaction.providerTransactionId || "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className={styles.emptyHistory}>아직 결제 내역이 없습니다.</p>}
        </section>
      </main>
    </DashboardShell>
  );
}
