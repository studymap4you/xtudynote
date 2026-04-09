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

  return (
    <div className="app-shell">
      <AdminTopNav />
      <main className="admin-layout">
        <div className="admin-layout__title-row">
          <h1>회원 관리</h1>
          <span className="ui-ko">Members · 승인·추방</span>
        </div>
        <p>
          <span className="ui-en" style={{ display: "block", color: "var(--text-muted)" }}>
            Directory of every learner and educator plus verification files for pending teachers.
          </span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
            전체 사용자와 pending_teacher 증빙을 확인하고 승인·추방할 수 있습니다.
          </span>
        </p>
        {error && <p className="auth-error">{error}</p>}
        <p style={{ marginBottom: "1rem" }}>
          <button type="button" className="btn btn--ghost btn--stack" onClick={() => load()} disabled={loading}>
            <span className="ui-en">Refresh</span>
            <span className="ui-ko">새로고침</span>
          </button>
        </p>
        {loading ? (
          <div className="route-loading">
            <div className="route-loading__spinner" />
            <p>
              <span className="ui-en">Loading…</span>
              <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
                불러오는 중…
              </span>
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th-bilingual">
                    <span className="ui-en">Email</span>
                    <span className="ui-ko">이메일</span>
                  </th>
                  <th className="th-bilingual">
                    <span className="ui-en">Role</span>
                    <span className="ui-ko">역할</span>
                  </th>
                  <th className="th-bilingual">
                    <span className="ui-en">Status</span>
                    <span className="ui-ko">상태</span>
                  </th>
                  <th className="th-bilingual">
                    <span className="ui-en">Documents</span>
                    <span className="ui-ko">증빙</span>
                  </th>
                  <th className="th-bilingual">
                    <span className="ui-en">Actions</span>
                    <span className="ui-ko">작업</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const docs = r.verificationFileUrls ?? [];
                  const isSelf = firebaseUser?.uid === r.id;
                  const pending = r.role === "pending_teacher" && r.accountStatus === "active";
                  return (
                    <tr key={r.id}>
                      <td>{r.email}</td>
                      <td className="admin-table__role">{r.role}</td>
                      <td>{r.accountStatus}</td>
                      <td>
                        <div className="admin-docs">
                          {docs.length === 0 ? (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
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
                        <div className="admin-actions">
                          {pending && (
                            <button
                              type="button"
                              className="btn btn--success btn--stack"
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
                              className="btn btn--danger btn--stack"
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
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          <span className="ui-en">
            Deleting the Firebase Auth user still requires the Admin SDK or Cloud Functions. Suspend
            sets Firestore to <code>banned</code> so the client cannot proceed.
          </span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.4rem" }}>
            Auth 계정 완전 삭제는 Admin SDK 또는 Cloud Functions가 필요합니다. 추방은 Firestore를
            banned로 두어 앱 접근을 차단합니다.
          </span>
        </p>
      </main>
    </div>
  );
}
