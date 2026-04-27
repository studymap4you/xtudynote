import { useCallback, useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import type { UserProfile, UserRole } from "@/types/user";
import { AdminTopNav } from "@/components/AdminTopNav";
import "@/pages/pages.css";

type Row = UserProfile & { id: string };

function rolePillClass(role: UserRole): string {
  const base = "admin-members-page__role-pill";
  if (role === "super_admin") return `${base} ${base}--super`;
  if (role === "teacher") return `${base} ${base}--teacher`;
  if (role === "pending_teacher") return `${base} ${base}--pending`;
  return `${base} ${base}--student`;
}

function statusPillClass(status: UserProfile["accountStatus"]): string {
  const base = "admin-members-page__status-pill";
  if (status === "banned") return `${base} ${base}--banned`;
  return `${base} ${base}--active`;
}

export function AdminPanelPage() {
  const { firebaseUser, refreshProfile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list: Row[] = [];
      snap.forEach((d) => {
        const x = d.data();
        const cr = x.createdAt as { toMillis?: () => number } | undefined;
        const vs = x.verificationSubmittedAt as
          | { toMillis?: () => number }
          | number
          | undefined;
        list.push({
          id: d.id,
          uid: d.id,
          email: (x.email as string) ?? "",
          role: x.role as UserRole,
          accountStatus: (x.accountStatus as UserProfile["accountStatus"]) ?? "active",
          verificationFileUrls: x.verificationFileUrls as string[] | undefined,
          verificationSubmittedAt:
            typeof vs === "number"
              ? vs
              : typeof vs?.toMillis === "function"
                ? vs.toMillis()
                : undefined,
          createdAt: cr?.toMillis?.() ?? 0,
          displayName: x.displayName as string | undefined,
        });
      });
      list.sort((a, b) => {
        const pa = a.role === "pending_teacher" ? 0 : 1;
        const pb = b.role === "pending_teacher" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return b.createdAt - a.createdAt;
      });
      setRows(list);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not load directory. 목록을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approveTeacher(uid: string) {
    setBusyId(uid);
    setError(null);
    try {
      await updateDoc(doc(db, "users", uid), { role: "teacher" });
      await load();
      await refreshProfile();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed. 승인에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function banUser(uid: string) {
    if (!firebaseUser || uid === firebaseUser.uid) return;
    setBusyId(uid);
    setError(null);
    try {
      await updateDoc(doc(db, "users", uid), { accountStatus: "banned" });
      await load();
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Suspension failed. 추방 처리에 실패했습니다."
      );
    } finally {
      setBusyId(null);
    }
  }

  const totalCount = rows.length;

  return (
    <div className="app-shell app-shell--admin app-shell--light">
      <AdminTopNav />
      <main className="admin-layout admin-layout--light admin-members-page admin-members-page--bright">
        <header className="admin-members-page__hero">
          <div className="admin-members-page__hero-bg" aria-hidden />
          <div className="admin-members-page__hero-main">
            <p className="admin-members-page__eyebrow ui-en">Member directory</p>
            <div className="admin-members-page__title-row">
              <h1 className="admin-members-page__h1">회원 관리</h1>
              <div className="admin-members-page__meta">
                <span className="ui-ko admin-members-page__meta-text">승인·추방 · Firestore 기준</span>
                <span className="admin-members-page__count-badge" aria-live="polite">
                  전체 {totalCount}명
                </span>
              </div>
            </div>
          </div>
        </header>

        <p className="admin-members-page__lede">
          <span className="ui-en admin-members-page__lede-en">
            Directory of every learner and educator plus verification files for pending teachers.
          </span>
          <span className="ui-ko admin-members-page__lede-ko">
            전체 사용자와 pending_teacher 증빙을 확인하고 승인·추방할 수 있습니다.
          </span>
        </p>

        {error ? <p className="auth-error">{error}</p> : null}

        <div className="admin-members-page__toolbar">
          <button
            type="button"
            className="btn btn--ghost btn--stack admin-members-page__refresh"
            onClick={() => load()}
            disabled={loading}
          >
            <span className="ui-en">Refresh</span>
            <span className="ui-ko">새로고침</span>
          </button>
        </div>

        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p>
              <span className="ui-en">Loading…</span>
              <span className="ui-ko admin-members-page__loading-ko">불러오는 중…</span>
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap admin-members-page__table-shell">
            <table className="admin-table admin-table--contents admin-table--light admin-members-page__table">
              <thead>
                <tr>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">Email</span>
                    <span className="admin-th__sub">(이메일)</span>
                  </th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">Role</span>
                    <span className="admin-th__sub">(역할)</span>
                  </th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">Status</span>
                    <span className="admin-th__sub">(상태)</span>
                  </th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">Documents</span>
                    <span className="admin-th__sub">(증빙)</span>
                  </th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">Actions</span>
                    <span className="admin-th__sub">(작업)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-members-page__empty">
                      <span className="ui-en">No users found.</span>
                      <span className="ui-ko admin-members-page__empty-ko">
                        등록된 사용자가 없습니다.
                      </span>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const docs = r.verificationFileUrls ?? [];
                    const isSelf = firebaseUser?.uid === r.id;
                    const pending = r.role === "pending_teacher" && r.accountStatus === "active";
                    return (
                      <tr
                        key={r.id}
                        className={
                          r.accountStatus === "banned" ? "admin-members-page__row--muted" : undefined
                        }
                      >
                        <td className="admin-members-page__cell-email">{r.email}</td>
                        <td>
                          <span className={rolePillClass(r.role)}>{r.role}</span>
                        </td>
                        <td>
                          <span className={statusPillClass(r.accountStatus)}>
                            {r.accountStatus}
                          </span>
                        </td>
                        <td>
                          <div className="admin-docs admin-members-page__docs">
                            {docs.length === 0 ? (
                              <span className="admin-members-page__dash">—</span>
                            ) : (
                              docs.map((url, i) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer">
                                  Doc {i + 1} · 서류 {i + 1}
                                </a>
                              ))
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="admin-actions admin-members-page__actions">
                            {pending && (
                              <button
                                type="button"
                                className="btn btn--success btn--stack admin-members-page__btn-approve"
                                disabled={busyId === r.id}
                                onClick={() => approveTeacher(r.id)}
                              >
                                <span className="ui-en">Approve Teacher</span>
                                <span className="ui-ko">승인</span>
                              </button>
                            )}
                            {!isSelf && r.accountStatus === "active" && (
                              <button
                                type="button"
                                className="btn btn--danger btn--stack admin-members-page__btn-suspend"
                                disabled={busyId === r.id}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Suspend this account? They will be signed out and blocked.\n\n${r.email} 계정을 추방(비활성)할까요? 로그인이 차단됩니다.`
                                    )
                                  ) {
                                    banUser(r.id);
                                  }
                                }}
                              >
                                <span className="ui-en">Suspend</span>
                                <span className="ui-ko">추방</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <footer className="admin-members-page__footnote">
          <span className="ui-en admin-members-page__footnote-en">
            Deleting the Firebase Auth user still requires the Admin SDK or Cloud Functions. Suspend
            sets Firestore to <code className="admin-members-page__code">banned</code> so the client
            cannot proceed.
          </span>
          <span className="ui-ko admin-members-page__footnote-ko">
            Auth 계정 완전 삭제는 Admin SDK 또는 Cloud Functions가 필요합니다. 추방은 Firestore를 banned로
            두어 앱 접근을 차단합니다.
          </span>
        </footer>
      </main>
    </div>
  );
}
