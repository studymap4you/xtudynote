import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cancelSubscription, submitBankTransfer } from "@/lib/billing/billingApi";
import type { BillingProviderId, SubscriptionStatus } from "@/types/billing";
import styles from "./billingPage.module.css";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "첫 달 무료 이용 중",
  active: "이용 중",
  past_due: "갱신 필요",
  cancel_pending: "종료 예정",
  cancelled: "종료됨",
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
  if (provider === "bank_transfer") return "무통장 입금";
  return provider === "toss" ? "Toss Payments" : "카카오페이";
}

export function BillingPage() {
  const { firebaseUser, profile } = useAuth();
  const { account, loading, error: accountError, refresh, setAccount } = useSubscription();
  const [depositorName, setDepositorName] = useState("");
  const [consent, setConsent] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"submit" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    const needsRenewal = !account.subscription
      || ["past_due", "cancelled"].includes(account.subscription.status);
    setShowSetup(needsRenewal);
    setDepositorName((current) => current || profile?.displayName || firebaseUser?.displayName || "");
  }, [account, firebaseUser?.displayName, profile?.displayName]);

  async function copyAccountNumber() {
    if (!account?.bankTransfer.accountNumber) return;
    await navigator.clipboard.writeText(account.bankTransfer.accountNumber);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  async function submitTransfer() {
    if (!firebaseUser || !account) return;
    if (!account.trialEligible && !depositorName.trim()) {
      setError("입금자명을 입력해주세요.");
      return;
    }
    if (!consent) {
      setError("입금 확인 및 이용권 활성화 안내에 동의해주세요.");
      return;
    }
    setBusy("submit");
    setError(null);
    try {
      setAccount(await submitBankTransfer(firebaseUser, {
        depositorName: account.trialEligible ? "" : depositorName.trim(),
        consent,
        termsVersion: account.termsVersion,
      }));
      setConsent(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "구독 신청을 처리하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!firebaseUser || !account?.subscription) return;
    if (!window.confirm("구독을 종료할까요? 남은 이용기간이 있으면 종료일까지 사용할 수 있습니다.")) return;
    setBusy("cancel");
    setError(null);
    try {
      setAccount(await cancelSubscription(firebaseUser));
      setShowSetup(false);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "구독을 종료하지 못했습니다.");
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
  const transferRequest = account.bankTransferRequest;
  const transferPending = transferRequest?.status === "pending";
  const startsFreeTrial = account.trialEligible;

  return (
    <DashboardShell light>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>XTUDY MEMBERSHIP</p>
            <h1>구독 관리</h1>
            <p>첫 달은 0원이며, 이후에는 무통장 입금 확인 후 한 달씩 연장됩니다.</p>
          </div>
          <span className={`${styles.modeBadge} ${styles.live}`}>무통장 입금</span>
        </header>

        {(error || accountError) ? <div className={styles.errorNotice} role="alert"><AlertCircle size={19} aria-hidden />{error || accountError}</div> : null}
        {transferPending ? (
          <div className={styles.successNotice} role="status">
            <Clock3 size={19} aria-hidden />
            <span>{transferRequest.depositorName} 명의의 입금 신청을 확인 중입니다. 승인되면 1개월 이용권이 활성화됩니다.</span>
          </div>
        ) : null}
        {transferRequest?.status === "rejected" ? (
          <div className={styles.errorNotice} role="alert">
            <AlertCircle size={19} aria-hidden />입금 신청이 반려되었습니다. {transferRequest.rejectionReason || "입금 정보를 확인한 뒤 다시 신청해주세요."}
          </div>
        ) : null}

        <section className={styles.planSection}>
          <div className={styles.planIdentity}>
            <span>STANDARD</span>
            <h2>{account.plan.name}</h2>
            <p>첫 달 무료 · 이후 1개월 단위 무통장 입금 · 자동결제 없음</p>
          </div>
          <div className={styles.priceBlock}>
            <div><del>{won(account.plan.listPrice)}</del><span>{account.plan.discountRate}% 할인</span></div>
            <strong>{account.trialEligible ? "첫 달 0원" : won(account.plan.salePrice)}</strong><small>{account.trialEligible ? "" : "/ 1개월"}</small>
            <p>{account.trialEligible ? `이후 ${won(account.plan.salePrice)} / 1개월` : "관리자 입금 확인 후 활성화"}</p>
          </div>
          {!account.entitled ? (
            <button type="button" className={styles.primaryButton} onClick={() => setShowSetup(true)}>
              {account.trialEligible ? "첫 달 0원으로 시작하기" : "무통장 입금으로 구독하기"}
            </button>
          ) : (
            <div className={styles.currentStatus}>
              <span className={`${styles.statusDot} ${styles[`status_${subscription?.status || "active"}`]}`} />
              <div><small>현재 상태</small><strong>{subscription ? STATUS_LABEL[subscription.status] : "이용 중"}</strong></div>
            </div>
          )}
        </section>

        {subscription && subscription.status !== "cancelled" ? (
          <section className={styles.accountSection} aria-labelledby="billing-current-title">
            <div className={styles.sectionTitle}>
              <div><p>CURRENT SUBSCRIPTION</p><h2 id="billing-current-title">현재 구독</h2></div>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowSetup((value) => !value)}>
                <Building2 size={17} aria-hidden />구독 연장
              </button>
            </div>
            <div className={styles.factGrid}>
              <div><CalendarDays aria-hidden /><span>이용 기간</span><strong>{dateLabel(subscription.currentPeriodStartedAt)} - {dateLabel(subscription.currentPeriodEndsAt)}</strong></div>
              <div><ReceiptText aria-hidden /><span>현재 이용</span><strong>{subscription.status === "trial" ? "첫 달 무료" : "무통장 입금 승인"}</strong></div>
              <div><Building2 aria-hidden /><span>다음 갱신</span><strong>{subscription.status === "trial" ? `${dateLabel(subscription.trialEndsAt)} 이후 입금` : "무통장 입금"}</strong></div>
              <div><ShieldCheck aria-hidden /><span>서비스 이용</span><strong>{account.entitled ? "교재 제작·다운로드 가능" : "이용 제한"}</strong></div>
            </div>
            {subscription.status === "past_due" ? <p className={styles.pastDue}>이용기간이 끝났습니다. 다시 입금 신청하면 1개월 이용권을 갱신할 수 있습니다.</p> : null}
            {subscription.status === "cancel_pending" ? <p className={styles.cancelPending}>{dateLabel(subscription.currentPeriodEndsAt)}까지 이용 후 종료됩니다.</p> : null}
            {!subscription.cancelAtPeriodEnd && subscription.status === "active" ? (
              <button type="button" className={styles.textButton} onClick={() => void cancel()} disabled={busy !== null}>
                {busy === "cancel" ? "처리 중…" : "구독 종료"}
              </button>
            ) : null}
          </section>
        ) : null}

        {showSetup ? (
          <section className={styles.setupSection} aria-labelledby="bank-transfer-title">
            <div className={styles.sectionTitle}>
              <div><p>{startsFreeTrial ? "FREE FIRST MONTH" : "BANK TRANSFER"}</p><h2 id="bank-transfer-title">{startsFreeTrial ? "첫 달 무료 시작" : "무통장 입금 신청"}</h2></div>
            </div>
            {!startsFreeTrial ? <div className={styles.bankAccountPanel}>
              <div className={styles.bankIcon}><Building2 aria-hidden /></div>
              <div>
                <span>입금 계좌</span>
                <strong>{account.bankTransfer.bankName} {account.bankTransfer.accountNumber}</strong>
                {account.bankTransfer.accountHolder ? <small>예금주 {account.bankTransfer.accountHolder}</small> : <small>이체 화면에 표시되는 예금주를 확인해주세요.</small>}
              </div>
              <button type="button" onClick={() => void copyAccountNumber()} title="계좌번호 복사">
                {copied ? <CheckCircle2 size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
                {copied ? "복사됨" : "복사"}
              </button>
            </div> : null}
            <div className={styles.scheduleGrid}>
              <div><span>{startsFreeTrial ? "오늘 결제" : "입금 금액"}</span><strong>{startsFreeTrial ? "0원" : won(account.bankTransfer.amount)}</strong></div>
              <div><span>이용 기간</span><strong>{startsFreeTrial ? "시작일부터 1개월" : "승인일부터 1개월"}</strong></div>
              <div><span>{startsFreeTrial ? "다음 달" : "승인 방식"}</span><strong>{startsFreeTrial ? won(account.bankTransfer.amount) : "관리자 입금 확인"}</strong></div>
              <div><span>자동결제</span><strong>사용하지 않음</strong></div>
            </div>
            {!startsFreeTrial ? <label className={styles.depositorField}>
              <span>입금자명</span>
              <input value={depositorName} onChange={(event) => setDepositorName(event.target.value)} maxLength={80} placeholder="실제 입금자명" disabled={transferPending} />
            </label> : null}
            <div className={styles.consentBox}>
              {startsFreeTrial ? <ul>
                <li>오늘 결제금액은 0원이며 즉시 교재 제작과 자료 다운로드가 열립니다.</li>
                <li>무료 이용은 계정당 한 번, 시작일부터 달력 기준 1개월 제공됩니다.</li>
                <li>무료기간이 끝난 뒤 계속 이용하려면 {won(account.bankTransfer.amount)}을 입금하고 승인을 받아야 합니다.</li>
                <li>자동결제되지 않으며 무료기간 종료만으로 비용이 청구되지 않습니다.</li>
              </ul> : <ul>
                <li>정확히 {won(account.bankTransfer.amount)}을 입금해주세요.</li>
                <li>입금자명과 신청한 이름이 같아야 확인할 수 있습니다.</li>
                <li>관리자 확인 전에는 교재 제작과 자료 다운로드가 제한됩니다.</li>
                <li>현재는 자동 갱신되지 않으며, 연장할 때마다 입금 신청이 필요합니다.</li>
              </ul>}
              <label>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={transferPending} />
                <span>{startsFreeTrial ? "첫 달 무료 및 이후 무통장 갱신 안내를 확인했습니다." : "입금 확인 및 1개월 이용권 활성화 안내를 확인했습니다."} <small>필수</small></span>
              </label>
            </div>
            <div className={styles.setupActions}>
              {subscription ? <button type="button" className={styles.secondaryButton} onClick={() => setShowSetup(false)}>닫기</button> : null}
              <button type="button" className={styles.primaryButton} onClick={() => void submitTransfer()} disabled={!consent || (!startsFreeTrial && !depositorName.trim()) || transferPending || busy !== null || (!startsFreeTrial && !account.bankTransfer.ready)}>
                {busy === "submit" ? <><LoaderCircle className={styles.spin} size={18} aria-hidden />처리 중</> : transferPending ? "입금 확인 대기 중" : startsFreeTrial ? "0원으로 한 달 시작하기" : "입금 신청 완료하기"}
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
                <thead><tr><th>결제일</th><th>금액</th><th>상태</th><th>결제수단</th><th>거래번호</th></tr></thead>
                <tbody>{account.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{dateLabel(transaction.paidAt || transaction.attemptedAt)}</td>
                    <td>{won(transaction.amount)}</td>
                    <td><span className={styles.transactionStatus}>{transaction.status}</span></td>
                    <td>{transaction.paymentMethod || providerLabel(transaction.provider)}</td>
                    <td>{transaction.providerTransactionId || "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className={styles.emptyHistory}>아직 승인된 결제 내역이 없습니다.</p>}
        </section>
      </main>
    </DashboardShell>
  );
}
