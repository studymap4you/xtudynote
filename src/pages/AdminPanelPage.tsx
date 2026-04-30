import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { ClassroomDocument } from "@/types/classroom";
import { AdminTopNav } from "@/components/AdminTopNav";
import "@/pages/pages.css";

type Row = UserProfile & { id: string };

type ClassroomMeta = ClassroomDocument & { id: string };

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

function sortDirectoryUsers(a: Row, b: Row): number {
  const pa = a.role === "pending_teacher" ? 0 : 1;
  const pb = b.role === "pending_teacher" ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return b.createdAt - a.createdAt;
}

function canSuspendTarget(u: Row | null | undefined, selfUid: string | undefined): boolean {
  if (!u || !selfUid) return false;
  if (u.id === selfUid) return false;
  if (u.role === "super_admin") return false;
  if (u.accountStatus !== "active") return false;
  return true;
}

function parseUserRow(d: { id: string; data: () => Record<string, unknown> }): Row {
  const x = d.data();
  const cr = x.createdAt as { toMillis?: () => number } | undefined;
  const vs = x.verificationSubmittedAt as
    | { toMillis?: () => number }
    | number
    | undefined;
  return {
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
  };
}

export function AdminPanelPage() {
  const { firebaseUser, refreshProfile } = useAuth();
  const [users, setUsers] = useState<Row[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const roomById = useMemo(() => new Map(classrooms.map((c) => [c.id, c])), [classrooms]);

  const linkedUids = useMemo(() => {
    const s = new Set<string>();
    for (const c of classrooms) {
      s.add(c.teacherId);
      for (const sid of c.memberStudentIds ?? []) s.add(sid);
    }
    return s;
  }, [classrooms]);

  const generalMembers = useMemo(() => {
    return users.filter((u) => !linkedUids.has(u.id)).sort(sortDirectoryUsers);
  }, [users, linkedUids]);

  const selectedUidCount = useMemo(() => {
    const uids = new Set<string>();
    for (const key of selectedKeys) {
      const uid = keyToUid(key, roomById);
      if (uid) uids.add(uid);
    }
    return uids.size;
  }, [selectedKeys, roomById]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    setSelectedKeys(new Set());
    try {
      const [uSnap, cSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "classrooms"), orderBy("createdAt", "desc"))),
      ]);
      const uList: Row[] = [];
      uSnap.forEach((d) => uList.push(parseUserRow(d)));
      uList.sort(sortDirectoryUsers);

      const cList: ClassroomMeta[] = [];
      cSnap.forEach((d) =>
        cList.push({ id: d.id, ...(d.data() as ClassroomDocument) }),
      );
      setUsers(uList);
      setClassrooms(cList);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not load directory. 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleKey(key: string) {
    const uid = keyToUid(key, roomById);
    const u = uid ? userById.get(uid) : undefined;
    if (!canSuspendTarget(u, firebaseUser?.uid)) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectSectionClassroom(c: ClassroomMeta) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const tKey = keyTeacher(c.id);
      const tu = userById.get(c.teacherId);
      if (canSuspendTarget(tu, firebaseUser?.uid)) next.add(tKey);
      for (const sid of c.memberStudentIds ?? []) {
        const k = keyStudent(c.id, sid);
        const su = userById.get(sid);
        if (canSuspendTarget(su, firebaseUser?.uid)) next.add(k);
      }
      return next;
    });
  }

  function selectSectionGeneral() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const m of generalMembers) {
        if (canSuspendTarget(m, firebaseUser?.uid)) next.add(keyGeneral(m.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

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
    if (!firebaseUser || !canSuspendTarget(userById.get(uid), firebaseUser.uid)) return;
    setBusyId(uid);
    setError(null);
    try {
      await updateDoc(doc(db, "users", uid), { accountStatus: "banned" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suspension failed. 추방 처리에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkSuspendSelected() {
    if (!firebaseUser || selectedKeys.size === 0) return;
    const uids = new Set<string>();
    for (const key of selectedKeys) {
      const uid = keyToUid(key, roomById);
      if (uid && canSuspendTarget(userById.get(uid), firebaseUser.uid)) uids.add(uid);
    }
    if (uids.size === 0) return;
    const ok = window.confirm(
      `선택한 ${uids.size}명의 계정을 추방(비활성)할까요? Firestore accountStatus가 banned로 바뀌며 앱 로그인이 차단됩니다.\n\n` +
        `Suspend ${uids.size} selected account(s)? They will be blocked from signing in.`,
    );
    if (!ok) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const uid of uids) {
        await updateDoc(doc(db, "users", uid), { accountStatus: "banned" });
      }
      await load();
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "일괄 추방 중 오류가 났습니다. 일부만 반영됐을 수 있습니다.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  const totalCount = users.length;

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
                <span className="ui-ko admin-members-page__meta-text">
                  강의실별 · 일반 회원 · 선택 추방
                </span>
                <span className="admin-members-page__count-badge" aria-live="polite">
                  전체 {totalCount}명 · 강의실 {classrooms.length}개
                </span>
              </div>
            </div>
          </div>
        </header>

        <p className="admin-members-page__lede">
          <span className="ui-en admin-members-page__lede-en">
            Members grouped by classroom (teacher + enrolled students). Users with no classroom link are
            under “General”. Select rows to suspend in batch.
          </span>
          <span className="ui-ko admin-members-page__lede-ko">
            강의실마다 담당 선생님과 수강생을 묶어 보여 주고, 어떤 강의실에도 연결되지 않은 계정은 일반 회원으로
            표시합니다. 좌측에서 선택한 뒤 일괄 추방할 수 있습니다.
          </span>
        </p>

        {error ? <p className="auth-error">{error}</p> : null}

        <div className="admin-members-page__toolbar admin-members-page__toolbar--split">
          <div className="admin-members-page__bulk">
            <button
              type="button"
              className="btn btn--ghost btn--stack"
              disabled={selectedKeys.size === 0 || bulkBusy || loading}
              onClick={() => clearSelection()}
            >
              <span className="ui-en">Clear selection</span>
              <span className="ui-ko">선택 해제</span>
            </button>
            <button
              type="button"
              className="btn btn--danger btn--stack admin-members-page__btn-suspend"
              disabled={selectedKeys.size === 0 || bulkBusy || loading}
              onClick={() => void bulkSuspendSelected()}
            >
              <span className="ui-en">Suspend selected ({selectedUidCount})</span>
              <span className="ui-ko">선택 추방 ({selectedUidCount}명)</span>
            </button>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--stack admin-members-page__refresh"
            onClick={() => load()}
            disabled={loading || bulkBusy}
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
          <div className="admin-members-page__sections">
            {classrooms.map((c) => (
              <section key={c.id} className="admin-members-page__section">
                <div className="admin-members-page__section-head">
                  <h2 className="admin-members-page__section-title">
                    <span className="ui-ko">강의실</span> · {c.title}
                  </h2>
                  <p className="admin-members-page__section-meta">
                    <span className="admin-members-page__mono">{c.id}</span>
                    <span aria-hidden> · </span>
                    <span className="ui-ko">
                      수강생 {(c.memberStudentIds ?? []).length}명 · 담당 UID{" "}
                      <span className="admin-members-page__mono">{c.teacherId.slice(0, 8)}…</span>
                    </span>
                  </p>
                  <button
                    type="button"
                    className="btn btn--ghost btn--stack admin-members-page__section-select"
                    onClick={() => selectSectionClassroom(c)}
                  >
                    <span className="ui-en">Select suspendable in section</span>
                    <span className="ui-ko">이 강의실에서 추방 가능한 사람만 선택</span>
                  </button>
                </div>
                <div className="admin-table-wrap admin-members-page__table-shell">
                  <MemberTable
                    rows={buildClassroomTableRows(c, userById)}
                    firebaseUser={firebaseUser}
                    busyId={busyId}
                    selectedKeys={selectedKeys}
                    toggleKey={toggleKey}
                    approveTeacher={approveTeacher}
                    banUser={banUser}
                  />
                </div>
              </section>
            ))}

            <section className="admin-members-page__section">
              <div className="admin-members-page__section-head">
                <h2 className="admin-members-page__section-title ui-ko">일반 회원 (강의실·수강 연결 없음)</h2>
                <p className="admin-members-page__section-meta ui-ko">
                  어떤 강의실의 개설자도 아니고, 수강생 목록에도 없는 계정입니다. pending_teacher 승인도 여기서 할 수
                  있습니다.
                </p>
                <button
                  type="button"
                  className="btn btn--ghost btn--stack admin-members-page__section-select"
                  onClick={() => selectSectionGeneral()}
                >
                  <span className="ui-en">Select all suspendable</span>
                  <span className="ui-ko">추방 가능한 일반 회원만 전체 선택</span>
                </button>
              </div>
              <div className="admin-table-wrap admin-members-page__table-shell">
                <MemberTable
                  rows={generalMembers.map((r) => ({
                    rowKey: keyGeneral(r.id),
                    uid: r.id,
                    user: r,
                    positionLabel: "일반",
                  }))}
                  firebaseUser={firebaseUser}
                  busyId={busyId}
                  selectedKeys={selectedKeys}
                  toggleKey={toggleKey}
                  approveTeacher={approveTeacher}
                  banUser={banUser}
                  emptyMessage={
                    <>
                      <span className="ui-en">No general members.</span>
                      <span className="ui-ko admin-members-page__empty-ko">
                        모든 사용자가 최소 한 강의실과 연결되어 있습니다.
                      </span>
                    </>
                  }
                />
              </div>
            </section>
          </div>
        )}

        <footer className="admin-members-page__footnote">
          <span className="ui-en admin-members-page__footnote-en">
            “Suspend” sets Firestore <code className="admin-members-page__code">banned</code>. Firebase Auth
            user deletion still needs Admin SDK. Super admins and yourself cannot be selected.
          </span>
          <span className="ui-ko admin-members-page__footnote-ko">
            선택 추방은 Auth 계정 삭제가 아니라 Firestore <code className="admin-members-page__code">banned</code> 로
            접근을 막는 처리입니다. 본인·슈퍼관리자 계정은 선택할 수 없습니다.
          </span>
        </footer>
      </main>
    </div>
  );
}

function keyTeacher(classroomId: string): string {
  return `t:${classroomId}`;
}

function keyStudent(classroomId: string, studentUid: string): string {
  return `s:${classroomId}:${studentUid}`;
}

function keyGeneral(uid: string): string {
  return `g:${uid}`;
}

function keyToUid(key: string, roomById: Map<string, ClassroomMeta>): string | null {
  if (key.startsWith("g:")) return key.slice(2);
  if (key.startsWith("t:")) {
    const cid = key.slice(2);
    return roomById.get(cid)?.teacherId ?? null;
  }
  if (key.startsWith("s:")) {
    const rest = key.slice(2);
    const idx = rest.indexOf(":");
    if (idx === -1) return null;
    return rest.slice(idx + 1);
  }
  return null;
}

function buildClassroomTableRows(
  c: ClassroomMeta,
  userById: Map<string, Row>,
): Array<{
  rowKey: string;
  uid: string;
  user: Row | null;
  positionLabel: string;
}> {
  const out: Array<{
    rowKey: string;
    uid: string;
    user: Row | null;
    positionLabel: string;
  }> = [];
  out.push({
    rowKey: keyTeacher(c.id),
    uid: c.teacherId,
    user: userById.get(c.teacherId) ?? null,
    positionLabel: "담당 선생님",
  });
  const ids = [...(c.memberStudentIds ?? [])].sort();
  for (const sid of ids) {
    out.push({
      rowKey: keyStudent(c.id, sid),
      uid: sid,
      user: userById.get(sid) ?? null,
      positionLabel: "수강생",
    });
  }
  return out;
}

function MemberTable({
  rows,
  firebaseUser,
  busyId,
  selectedKeys,
  toggleKey,
  approveTeacher,
  banUser,
  emptyMessage,
}: {
  rows: Array<{ rowKey: string; uid: string; user: Row | null; positionLabel: string }>;
  firebaseUser: { uid: string } | null;
  busyId: string | null;
  selectedKeys: Set<string>;
  toggleKey: (key: string) => void;
  approveTeacher: (uid: string) => void;
  banUser: (uid: string) => void;
  emptyMessage?: ReactNode;
}) {
  return (
    <table className="admin-table admin-table--contents admin-table--light admin-members-page__table">
      <thead>
        <tr>
          <th className="admin-members-page__th-cb" scope="col" aria-label="선택" />
          <th className="th-bilingual th-bilingual--professional">
            <span className="admin-th__en">Email</span>
            <span className="admin-th__sub">(이메일)</span>
          </th>
          <th className="th-bilingual th-bilingual--professional">
            <span className="admin-th__en">Position</span>
            <span className="admin-th__sub">(구분)</span>
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
            <td colSpan={7} className="admin-members-page__empty">
              {emptyMessage ?? (
                <>
                  <span className="ui-en">No rows.</span>
                  <span className="ui-ko admin-members-page__empty-ko">항목이 없습니다.</span>
                </>
              )}
            </td>
          </tr>
        ) : (
          rows.map((spec) => {
            const r = spec.user;
            const docs = r?.verificationFileUrls ?? [];
            const pending = r && r.role === "pending_teacher" && r.accountStatus === "active";
            const suspendable = canSuspendTarget(r, firebaseUser?.uid);
            const checked = selectedKeys.has(spec.rowKey);
            return (
              <tr
                key={spec.rowKey}
                className={r?.accountStatus === "banned" ? "admin-members-page__row--muted" : undefined}
              >
                <td className="admin-members-page__td-cb">
                  <input
                    type="checkbox"
                    className="admin-members-page__cb"
                    checked={checked}
                    disabled={!suspendable}
                    aria-label={r ? `선택: ${r.email}` : `선택: UID ${spec.uid}`}
                    onChange={() => toggleKey(spec.rowKey)}
                  />
                </td>
                <td className="admin-members-page__cell-email">
                  {r?.email ?? (
                    <span className="admin-members-page__orphan" title="users 문서 없음">
                      (미등록) <span className="admin-members-page__mono">{spec.uid}</span>
                    </span>
                  )}
                </td>
                <td>
                  <span className="admin-members-page__position-pill">{spec.positionLabel}</span>
                </td>
                <td>
                  {r ? <span className={rolePillClass(r.role)}>{r.role}</span> : <span>—</span>}
                </td>
                <td>
                  {r ? (
                    <span className={statusPillClass(r.accountStatus)}>{r.accountStatus}</span>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td>
                  <div className="admin-docs admin-members-page__docs">
                    {!r || docs.length === 0 ? (
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
                    {r && pending && (
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
                    {r && suspendable && (
                      <button
                        type="button"
                        className="btn btn--danger btn--stack admin-members-page__btn-suspend"
                        disabled={busyId === r.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Suspend this account? They will be signed out and blocked.\n\n${r.email} 계정을 추방(비활성)할까요? 로그인이 차단됩니다.`,
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
  );
}
