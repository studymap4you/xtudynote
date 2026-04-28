import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import { deleteClassroomCascade } from "@/lib/classroom/deleteClassroomCascade";
import type { ClassroomDocument } from "@/types/classroom";
import "@/pages/pages.css";

type Row = ClassroomDocument & { id: string };

function formatAt(raw: unknown): string {
  if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as Timestamp).toDate === "function") {
    try {
      return (raw as Timestamp).toDate().toLocaleString();
    } catch {
      return "—";
    }
  }
  return "—";
}

function createdMs(r: Row): number {
  const c = r.createdAt as { toMillis?: () => number } | undefined;
  return c?.toMillis?.() ?? 0;
}

export function ClassroomListPage() {
  const { firebaseUser, isTeacherApproved, isSuperAdmin } = useAuth();
  const [rowsOwn, setRowsOwn] = useState<Row[]>([]);
  const [rowsMem, setRowsMem] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const mergedRows = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rowsOwn) m.set(r.id, r);
    for (const r of rowsMem) m.set(r.id, r);
    return Array.from(m.values()).sort((a, b) => createdMs(b) - createdMs(a));
  }, [rowsOwn, rowsMem]);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setRowsOwn([]);
      setRowsMem([]);
      setLoading(false);
      return;
    }
    const uid = firebaseUser.uid;
    setLoading(true);
    setErr(null);

    if (isSuperAdmin) {
      const q = query(collection(db, "classrooms"), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: Row[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as ClassroomDocument) }));
          setRowsOwn(list);
          setRowsMem([]);
          setLoading(false);
        },
        (e) => {
          setErr(e.message || "목록을 불러오지 못했습니다.");
          setLoading(false);
        },
      );
      return () => unsub();
    }

    if (isTeacherApproved) {
      const qOwn = query(collection(db, "classrooms"), where("teacherId", "==", uid));
      const qMem = query(collection(db, "classrooms"), where("memberStudentIds", "array-contains", uid));
      const u1 = onSnapshot(
        qOwn,
        (snap) => {
          const list: Row[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as ClassroomDocument) }));
          setRowsOwn(list);
          setLoading(false);
        },
        (e) => {
          setErr(e.message || "목록을 불러오지 못했습니다.");
          setLoading(false);
        },
      );
      const u2 = onSnapshot(
        qMem,
        (snap) => {
          const list: Row[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as ClassroomDocument) }));
          setRowsMem(list);
          setLoading(false);
        },
        (e) => {
          setErr(e.message || "목록을 불러오지 못했습니다.");
          setLoading(false);
        },
      );
      return () => {
        u1();
        u2();
      };
    }

    const qMem = query(collection(db, "classrooms"), where("memberStudentIds", "array-contains", uid));
    const unsub = onSnapshot(
      qMem,
      (snap) => {
        const list: Row[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as ClassroomDocument) }));
        setRowsOwn([]);
        setRowsMem(list);
        setLoading(false);
      },
      (e) => {
        setErr(e.message || "목록을 불러오지 못했습니다.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [firebaseUser?.uid, isTeacherApproved, isSuperAdmin]);

  async function confirmDeleteClassroom() {
    if (!pendingDeleteRoom) return;
    const cid = pendingDeleteRoom.id;
    const n = pendingDeleteRoom.memberStudentIds?.length ?? 0;
    if (n > 0) return;
    setDeleteBusy(true);
    setDeleteErr(null);
    try {
      await deleteClassroomCascade(db, cid);
      setPendingDeleteRoom(null);
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>내 강의실</h1>
          <span className="ui-ko">
            {isTeacherApproved
              ? "개설한 강의실과 멤버로 참여 중인 강의실"
              : "선생님이 멤버로 등록한 강의실만 표시됩니다"}
          </span>
        </div>
        <p className="classroom-page__lede">
          수강이 승인된 강의실에서만 자료와 과제를 이용할 수 있습니다.{" "}
          <strong>유료</strong> 자료는 상세 페이지의 안내에 따라 결제·구매 절차를 진행해 주세요.{" "}
          <Link to="/classrooms">전체 강의실 보기 (강의 신청)</Link>
        </p>
        {isTeacherApproved && (
          <p className="classroom-page__teacher-hint">
            <Link to="/classroom/new" className="btn btn--primary btn--stack">
              <span className="ui-en">New classroom</span>
              <span className="ui-ko">강의실 개설</span>
            </Link>
          </p>
        )}
        {err && <p className="auth-error">{err}</p>}
        {deleteErr && <p className="auth-error">{deleteErr}</p>}
        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="ui-ko">불러오는 중…</p>
          </div>
        ) : mergedRows.length === 0 ? (
          <p style={{ color: "var(--light-text-muted, #6b7280)" }}>
            {isTeacherApproved
              ? "아직 개설한 강의실이 없고, 멤버로 등록된 강의실도 없습니다."
              : "멤버로 등록된 강의실이 없습니다. 선생님께 UID 등록을 요청해 주세요."}
          </p>
        ) : (
          <ul className="classroom-page__list">
            {mergedRows.map((r) => {
              const isOwnerTeacher = !!(isTeacherApproved && firebaseUser?.uid === r.teacherId);
              const mc = r.memberStudentIds?.length ?? 0;
              return (
              <li key={r.id} className="classroom-page__card">
                <div>
                  <h2 className="classroom-page__card-title">{r.title}</h2>
                  <p className="classroom-page__card-desc">{r.description || "설명 없음"}</p>
                  <p className="classroom-page__card-meta">개설 {formatAt(r.createdAt)}</p>
                  {isOwnerTeacher ? (
                    <p className="classroom-page__card-meta">수강생(등록 UID) {mc}명</p>
                  ) : null}
                </div>
                <div className="classroom-page__card-actions">
                  <Link to={`/classroom/${r.id}`} className="btn btn--primary btn--stack">
                    입장
                  </Link>
                  {isOwnerTeacher ? (
                    <>
                      <Link to={`/classroom/${r.id}/manage`} className="btn btn--ghost btn--stack">
                        관리
                      </Link>
                      <button
                        type="button"
                        className="btn btn--ghost btn--stack"
                        style={{ borderColor: "#fecaca", color: "#b91c1c" }}
                        disabled={mc > 0}
                        title={mc > 0 ? "수강생이 한 명이라도 있으면 삭제할 수 없습니다." : undefined}
                        onClick={() => {
                          setDeleteErr(null);
                          setPendingDeleteRoom(r);
                        }}
                      >
                        삭제
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
            })}
          </ul>
        )}
        {pendingDeleteRoom ? (
          <div className="classroom-page__danger-modal" role="presentation">
            <button
              type="button"
              className="classroom-page__danger-modal-backdrop"
              aria-label="취소"
              onClick={() => {
                if (!deleteBusy) setPendingDeleteRoom(null);
              }}
            />
            <div className="classroom-page__danger-modal-panel" role="dialog" aria-modal="true" aria-labelledby="classroom-del-title">
              <h2 id="classroom-del-title" style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
                강의실을 삭제할까요?
              </h2>
              <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.55, color: "var(--light-text-muted, #4b5563)" }}>
                <strong>{pendingDeleteRoom.title}</strong>와 이 강의실에 연결된 수강 신청·질문·공지 등이 모두 삭제됩니다.
                되돌릴 수 없습니다.
              </p>
              <div className="classroom-page__danger-modal-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--stack"
                  disabled={deleteBusy}
                  onClick={() => setPendingDeleteRoom(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--stack"
                  disabled={deleteBusy}
                  onClick={() => void confirmDeleteClassroom()}
                  style={{ background: "#b91c1c", borderColor: "#b91c1c" }}
                >
                  {deleteBusy ? "삭제 중…" : "삭제 확정"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </DashboardShell>
  );
}
