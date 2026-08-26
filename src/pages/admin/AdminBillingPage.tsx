import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CreditCard, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { AdminTopNav } from "@/components/AdminTopNav";
import { useAuth } from "@/contexts/AuthContext";
import { loadAdminBillingOverview, saveBillingRetryPolicy } from "@/lib/billing/billingApi";
import type { AdminBillingOverview, SubscriptionStatus } from "@/types/billing";
import styles from "./adminBillingPage.module.css";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "무료 이용",
  active: "이용 중",
  past_due: "결제 실패",
  cancel_pending: "해지 예정",
  cancelled: "해지",
};

function won(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function dateLabel(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}

export function AdminBillingPage() {
  const { firebaseUser } = useAuth();
  const [overview, setOverview] = useState<AdminBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [offsets, setOffsets] = useState("24, 72");
  const [graceDays, setGraceDays] = useState(7);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const data = await loadAdminBillingOverview(firebaseUser);
      setOverview(data);
      setOffsets(data.retryPolicy.retryOffsetsHours.join(", "));
      setGraceDays(data.retryPolicy.pastDueGraceDays);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "결제 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return overview?.subscriptions ?? [];
    return (overview?.subscriptions ?? []).filter((row) =>
      row.email.toLowerCase().includes(normalized)
      || row.uid.toLowerCase().includes(normalized)
      || row.status.includes(normalized));
  }, [overview, query]);

  async function savePolicy() {
    if (!firebaseUser) return;
    const parsed = offsets.split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
    setSaving(true);
    try {
      const result = await saveBillingRetryPolicy(firebaseUser, {
        retryOffsetsHours: parsed,
        pastDueGraceDays: graceDays,
      });
      setOverview((current) => current ? { ...current, retryPolicy: result.retryPolicy } : current);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "재시도 정책을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell app-shell--admin app-shell--light">
      <AdminTopNav />
      <main className={styles.page}>
        <header className={styles.header}>
          <div><p>BILLING OPERATIONS</p><h1>구독 결제 관리</h1><span>Xtudy Standard의 구독, 결제 성공·실패, 재시도 정책을 확인합니다.</span></div>
          <div className={styles.headerActions}>
            <span className={overview?.liveEnabled ? styles.live : styles.test}>{overview?.liveEnabled ? "LIVE" : "TEST MODE"}</span>
            <button type="button" onClick={() => void load()} title="새로고침" disabled={loading}><RefreshCw size={18} className={loading ? styles.spin : ""} aria-hidden /></button>
          </div>
        </header>

        {error ? <div className={styles.error} role="alert"><AlertCircle size={18} aria-hidden />{error}</div> : null}
        {loading && !overview ? <div className={styles.loading}><LoaderCircle className={styles.spin} aria-hidden />결제 현황을 불러오고 있습니다.</div> : null}

        {overview ? <>
          <section className={styles.stats} aria-label="구독 통계">
            <div><span>전체 구독자</span><strong>{overview.counts.total}</strong></div>
            <div><span>무료 이용</span><strong>{overview.counts.trial}</strong></div>
            <div><span>이용 중</span><strong>{overview.counts.active}</strong></div>
            <div><span>결제 실패</span><strong>{overview.counts.past_due}</strong></div>
            <div><span>해지·예정</span><strong>{overview.counts.cancelled + overview.counts.cancel_pending}</strong></div>
            <div><span>예상 월 반복매출</span><strong>{won(overview.estimatedMonthlyRecurringRevenue)}</strong></div>
            <div><span>성공 결제</span><strong>{overview.successfulPayments}</strong></div>
            <div><span>실패·확인</span><strong>{overview.failedPayments}</strong></div>
          </section>

          <section className={styles.policySection}>
            <div><p>RETRY POLICY</p><h2>결제 실패 재시도</h2><span>첫 실패 시점을 기준으로 재시도할 시간과 유예기간입니다.</span></div>
            <label><span>재시도 시간</span><input value={offsets} onChange={(event) => setOffsets(event.target.value)} placeholder="24, 72" /><small>시간 단위, 쉼표로 구분</small></label>
            <label><span>유예기간</span><input type="number" min={1} max={30} value={graceDays} onChange={(event) => setGraceDays(Number(event.target.value))} /><small>일 단위</small></label>
            <button type="button" onClick={() => void savePolicy()} disabled={saving}><Save size={17} aria-hidden />{saving ? "저장 중" : "정책 저장"}</button>
          </section>

          <section className={styles.tableSection}>
            <div className={styles.tableHeader}>
              <div><p>SUBSCRIPTIONS</p><h2>사용자별 구독</h2></div>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이메일, UID, 상태 검색" aria-label="구독 검색" />
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>사용자</th><th>플랜</th><th>상태</th><th>Provider</th><th>무료 종료</th><th>다음 결제</th><th>마지막 결제</th><th>금액</th></tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.uid}>
                    <td><strong>{row.email || "이메일 없음"}</strong><small>{row.uid}</small></td>
                    <td>{row.planId}</td>
                    <td><span className={`${styles.status} ${styles[`status_${row.status}`]}`}>{STATUS_LABEL[row.status]}</span></td>
                    <td>{row.provider}</td>
                    <td>{dateLabel(row.trialEndsAt)}</td>
                    <td>{dateLabel(row.nextBillingAt)}</td>
                    <td>{dateLabel(row.lastPaymentAt)}</td>
                    <td>{won(row.billingAmount)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!rows.length ? <div className={styles.empty}><CreditCard aria-hidden />표시할 구독이 없습니다.</div> : null}
            </div>
          </section>
        </> : null}
      </main>
    </div>
  );
}
