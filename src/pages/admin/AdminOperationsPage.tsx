import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { AdminTopNav } from "@/components/AdminTopNav";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import {
  approveBankTransfer,
  loadAdminBillingOverview,
  rejectBankTransfer,
} from "@/lib/billing/billingApi";
import { SUPER_ADMIN_EMAIL, isSuperAdminEmail } from "@/types/user";
import type { AdminBillingOverview } from "@/types/billing";
import styles from "./adminOperationsPage.module.css";

function won(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function roleLabel(role: string) {
  if (role === "super_admin") return "마스터";
  if (role === "teacher") return "강사";
  if (role === "pending_teacher") return "강사 승인 대기";
  return "학생";
}

export function AdminOperationsPage() {
  const { firebaseUser } = useAuth();
  const [overview, setOverview] = useState<AdminBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      setOverview(await loadAdminBillingOverview(firebaseUser));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "관리자 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => { void load(); }, [load]);

  const members = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = overview?.members.rows ?? [];
    if (!normalized) return rows.slice(0, 30);
    return rows.filter((member) =>
      member.email.toLowerCase().includes(normalized)
      || member.displayName.toLowerCase().includes(normalized)
      || member.uid.toLowerCase().includes(normalized)
      || roleLabel(member.role).includes(normalized),
    ).slice(0, 100);
  }, [overview, query]);

  const maxDailyVisitors = Math.max(1, ...(overview?.visitors.daily.map((row) => row.uniqueVisitors) ?? [1]));

  async function approveTransfer(uid: string, requestId: string, depositorName: string) {
    if (!firebaseUser || !window.confirm(`${depositorName} 명의의 입금을 확인했나요? 승인하면 유료 이용기간 1개월이 활성화 또는 연장됩니다.`)) return;
    setBusyId(requestId);
    try {
      await approveBankTransfer(firebaseUser, { uid, requestId });
      await load();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "입금 승인을 처리하지 못했습니다.");
    } finally {
      setBusyId("");
    }
  }

  async function rejectTransfer(uid: string, requestId: string) {
    if (!firebaseUser) return;
    const reason = window.prompt("사용자에게 표시할 반려 사유를 입력해주세요.", "입금 내역을 확인할 수 없습니다.");
    if (!reason?.trim()) return;
    setBusyId(requestId);
    try {
      await rejectBankTransfer(firebaseUser, { uid, requestId, reason: reason.trim() });
      await load();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "입금 신청을 반려하지 못했습니다.");
    } finally {
      setBusyId("");
    }
  }

  async function updateMember(uid: string, values: { role?: string; accountStatus?: string }, label: string) {
    if (!window.confirm(`${label} 처리할까요?`)) return;
    setBusyId(uid);
    try {
      await updateDoc(doc(db, "users", uid), values);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "회원 정보를 변경하지 못했습니다.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="app-shell app-shell--admin app-shell--light">
      <AdminTopNav />
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p>MASTER OPERATIONS</p>
            <h1>Xtudy 관리자</h1>
            <span>방문 현황, 구독 승인, 로그인 회원을 한 화면에서 관리합니다.</span>
          </div>
          <div className={styles.headerActions}>
            <span><ShieldCheck size={16} aria-hidden />마스터 전용</span>
            <button type="button" onClick={() => void load()} disabled={loading} title="새로고침">
              <RefreshCw size={18} className={loading ? styles.spin : ""} aria-hidden />
            </button>
          </div>
        </header>

        {error ? <div className={styles.error} role="alert"><AlertCircle size={18} aria-hidden />{error}</div> : null}
        {loading && !overview ? <div className={styles.loading}><LoaderCircle className={styles.spin} aria-hidden />관리자 데이터를 불러오고 있습니다.</div> : null}

        {overview ? <>
          <section className={styles.metrics} aria-label="운영 요약">
            <article><Eye aria-hidden /><span>오늘 방문자</span><strong>{overview.visitors.todayUniqueVisitors}</strong><small>조회 {overview.visitors.todayPageViews}회</small></article>
            <article><Users aria-hidden /><span>누적 방문자</span><strong>{overview.visitors.totalUniqueVisitors}</strong><small>누적 조회 {overview.visitors.totalPageViews}회</small></article>
            <article><UserCheck aria-hidden /><span>전체 회원</span><strong>{overview.members.total}</strong><small>활성 {overview.members.active}명</small></article>
            <article><CheckCircle2 aria-hidden /><span>이용 가능 구독</span><strong>{overview.counts.trial + overview.counts.active + overview.counts.cancel_pending}</strong><small>무료 {overview.counts.trial}명 · 유료 {overview.counts.active}명</small></article>
            <article><Clock3 aria-hidden /><span>입금 승인 대기</span><strong>{overview.bankTransferRequests.length}</strong><small>확인 후 1개월 연장</small></article>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div><p>VISITOR TREND</p><h2>최근 7일 방문</h2></div>
              <span>오늘 로그인 방문자 {overview.visitors.todayAuthenticatedVisitors}명</span>
            </div>
            <div className={styles.visitorChart}>
              {[...overview.visitors.daily].reverse().map((row) => (
                <div key={row.day} className={styles.visitorDay}>
                  <div><span style={{ height: `${Math.max(6, (row.uniqueVisitors / maxDailyVisitors) * 100)}%` }} /></div>
                  <strong>{row.uniqueVisitors}</strong>
                  <small>{row.day.slice(5)}</small>
                </div>
              ))}
              {!overview.visitors.daily.length ? <p className={styles.empty}>방문 데이터는 이번 배포 이후부터 집계됩니다.</p> : null}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div><p>BANK TRANSFER</p><h2>구독 입금 승인</h2></div>
              <span>{overview.bankTransferRequests.length}건 대기</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>신청 회원</th><th>입금자명</th><th>금액</th><th>신청일</th><th>처리</th></tr></thead>
                <tbody>{overview.bankTransferRequests.map((request) => (
                  <tr key={request.requestId}>
                    <td><strong>{request.email || request.displayName || "이메일 없음"}</strong><small>{request.uid}</small></td>
                    <td>{request.depositorName}</td>
                    <td>{won(request.amount)}</td>
                    <td>{dateLabel(request.submittedAt)}</td>
                    <td><div className={styles.rowActions}>
                      <button type="button" className={styles.approve} onClick={() => void approveTransfer(request.uid, request.requestId, request.depositorName)} disabled={Boolean(busyId)}>
                        {busyId === request.requestId ? <LoaderCircle size={15} className={styles.spin} aria-hidden /> : <Check size={15} aria-hidden />}승인
                      </button>
                      <button type="button" className={styles.reject} onClick={() => void rejectTransfer(request.uid, request.requestId)} disabled={Boolean(busyId)}><X size={15} aria-hidden />반려</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
              {!overview.bankTransferRequests.length ? <p className={styles.empty}>현재 승인 대기 중인 입금 신청이 없습니다.</p> : null}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div><p>MEMBERS</p><h2>로그인 사용자 회원 관리</h2></div>
              <Link to="/admin/members">강의실별 상세 관리</Link>
            </div>
            <div className={styles.memberToolbar}>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이메일, 이름, UID, 역할 검색" aria-label="회원 검색" />
              <span>활성 {overview.members.active} · 정지 {overview.members.banned} · 승인 대기 강사 {overview.members.roleCounts.pending_teacher}</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>회원</th><th>가입일</th><th>역할</th><th>상태</th><th>관리</th></tr></thead>
                <tbody>{members.map((member) => {
                  const isMaster = member.email.toLowerCase() === SUPER_ADMIN_EMAIL;
                  const isDesignatedAdmin = isSuperAdminEmail(member.email);
                  return <tr key={member.uid}>
                    <td><strong>{member.displayName || member.email || "이름 없음"}</strong><small>{member.email}<br />{member.uid}</small></td>
                    <td>{dateLabel(member.createdAt)}</td>
                    <td><span className={styles.role}>{roleLabel(member.role)}</span></td>
                    <td><span className={member.accountStatus === "banned" ? styles.banned : styles.active}>{member.accountStatus === "banned" ? "정지" : "활성"}</span></td>
                    <td><div className={styles.rowActions}>
                      {member.role === "pending_teacher" ? <button type="button" className={styles.approve} onClick={() => void updateMember(member.uid, { role: "teacher" }, "강사 승인")} disabled={Boolean(busyId)}><UserCheck size={15} aria-hidden />강사 승인</button> : null}
                      {!isDesignatedAdmin && member.accountStatus !== "banned" ? <button type="button" className={styles.reject} onClick={() => void updateMember(member.uid, { accountStatus: "banned" }, "계정 정지")} disabled={Boolean(busyId)}><Ban size={15} aria-hidden />정지</button> : null}
                      {!isDesignatedAdmin && member.accountStatus === "banned" ? <button type="button" className={styles.approve} onClick={() => void updateMember(member.uid, { accountStatus: "active" }, "계정 복구")} disabled={Boolean(busyId)}><Check size={15} aria-hidden />복구</button> : null}
                      {isMaster ? <span className={styles.master}>마스터 계정</span> : null}
                      {!isMaster && isDesignatedAdmin ? <span className={styles.master}>관리자 계정</span> : null}
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
              {!members.length ? <p className={styles.empty}>검색 조건에 맞는 회원이 없습니다.</p> : null}
            </div>
          </section>
        </> : null}
      </main>
    </div>
  );
}
