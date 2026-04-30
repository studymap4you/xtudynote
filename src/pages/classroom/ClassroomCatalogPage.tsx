import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import {
  ensureTeacherRosterForStudent,
  syncTeacherRosterForClassroomMemberDelta,
} from "@/lib/worksheet/teacherRosterApi";
import { formatTuitionKrwWon } from "@/lib/formatTuitionKrw";
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

function isPaidClassroom(r: Row): boolean {
  return r.pricingType === "paid";
}

function isMember(r: Row, uid: string | undefined): boolean {
  if (!uid) return false;
  return (r.memberStudentIds ?? []).includes(uid);
}

function paidTuitionOk(r: Row): boolean {
  if (!isPaidClassroom(r)) return true;
  const fee = r.tuitionFeeKrw;
  return typeof fee === "number" && Number.isFinite(fee) && fee >= 1;
}

/** Firestore classroomCatalogSelfEnrollRoleOk 와 맞춤: 타인 강의실 수강 UI 노출 */
function canEnrollInOthersClassrooms(
  isStudent: boolean,
  isPendingTeacher: boolean,
  isTeacherApproved: boolean,
): boolean {
  return isStudent || isPendingTeacher || isTeacherApproved;
}

export function ClassroomCatalogPage() {
  const { firebaseUser, canManageMaterials, isStudent, isPendingTeacher, isTeacherApproved } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyClassId, setBusyClassId] = useState<string | null>(null);

  const mayEnrollCatalog = canEnrollInOthersClassrooms(isStudent, isPendingTeacher, isTeacherApproved);

  const uid = firebaseUser?.uid;

  useEffect(() => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const q = query(collection(db, "classrooms"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Row[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as ClassroomDocument) }));
        setRows(list);
        setLoading(false);
      },
      (e) => {
        setErr(e.message || "목록을 불러오지 못했습니다.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const scrollToEnrollSection = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.getElementById("classroom-catalog-enroll")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  async function cancelMembership(r: Row) {
    if (!uid || busyClassId) return;
    if (
      !window.confirm(
        `「${r.title}」에서 멤버에서 제외됩니다. 이 강의실의 자료·영상·질의응답을 더 이상 이용할 수 없습니다. 계속할까요?`,
      )
    ) {
      return;
    }
    setBusyClassId(r.id);
    setActionErr(null);
    setActionMsg(null);
    try {
      await updateDoc(doc(db, "classrooms", r.id), { memberStudentIds: arrayRemove(uid) });
      await syncTeacherRosterForClassroomMemberDelta(r.teacherId, { added: [], removed: [uid] });
      setActionMsg(`「${r.title}」수강을 취소했습니다.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "수강 취소에 실패했습니다.");
    } finally {
      setBusyClassId(null);
    }
  }

  async function enrollInClassroom(r: Row) {
    if (!uid || busyClassId) return;
    if (isPaidClassroom(r) && !paidTuitionOk(r)) {
      setActionErr(
        "이 강의는 수강 안내 가격이 아직 등록되지 않았습니다. 강사에게 문의한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    setBusyClassId(r.id);
    setActionErr(null);
    setActionMsg(null);
    try {
      await updateDoc(doc(db, "classrooms", r.id), {
        memberStudentIds: arrayUnion(uid),
      });
      await ensureTeacherRosterForStudent(r.teacherId, uid);
      setActionMsg(`「${r.title}」에 수강 등록되었습니다. 내 강의실에서 입장할 수 있습니다.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "수강 처리에 실패했습니다.");
    } finally {
      setBusyClassId(null);
    }
  }

  const enrollmentSection = useMemo(
    () => (
      <section id="classroom-catalog-enroll" className="classroom-catalog-enroll" aria-labelledby="catalog-enroll-h">
        <h2 id="catalog-enroll-h" className="classroom-catalog-enroll__title">
          수강 신청
        </h2>
        <p className="classroom-catalog-enroll__lede ui-ko">
          <span className="ui-en" style={{ display: "block", marginBottom: "0.35rem" }}>
            Use Enroll to add yourself as a member of a classroom. Paid rooms show a reference price only until
            checkout is wired up.
          </span>
          <strong>수강신청</strong>을 누르면 이 목록의 강의실에 멤버로 등록됩니다. 유료로 표시된 강의는{" "}
          <strong>안내 가격</strong>만 보여 주며, 실제 결제·환불·수강 조건은 추후 정책에 따라 다시 안내할 예정입니다.
        </p>
      </section>
    ),
    [],
  );

  function renderStudentActions(r: Row) {
    if (!uid || r.teacherId === uid) return null;
    const member = isMember(r, uid);
    const paid = isPaidClassroom(r);
    const enrollDisabled = !!busyClassId || (paid && !paidTuitionOk(r));

    if (member) {
      return (
        <div className="classroom-catalog__enroll-stack">
          <Link to={`/classroom/${r.id}`} className="btn btn--primary btn--stack">
            <span className="ui-ko">수강중</span>
            <span className="ui-en">Enrolled</span>
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--stack"
            disabled={!!busyClassId}
            onClick={() => void cancelMembership(r)}
          >
            <span className="ui-ko">수강 취소</span>
            <span className="ui-en">Leave</span>
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        className="btn btn--primary btn--stack"
        disabled={enrollDisabled}
        onClick={() => {
          scrollToEnrollSection();
          void enrollInClassroom(r);
        }}
      >
        <span className="ui-ko">수강신청</span>
        <span className="ui-en">{paid ? "Enroll (paid listing)" : "Enroll (free)"}</span>
      </button>
    );
  }

  function pricingBadge(r: Row) {
    const paid = r.pricingType === "paid";
    const fee =
      paid && typeof r.tuitionFeeKrw === "number" && Number.isFinite(r.tuitionFeeKrw) && r.tuitionFeeKrw > 0
        ? formatTuitionKrwWon(r.tuitionFeeKrw)
        : null;
    return (
      <span className={`classroom-catalog__price-badge ${paid ? "classroom-catalog__price-badge--paid" : ""}`}>
        {paid ? (fee ? `유료 · ${fee}` : "유료") : "무료"}
      </span>
    );
  }

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light">
        <nav className="classroom-page__breadcrumb" style={{ marginBottom: "var(--space-3)" }}>
          <Link to="/classroom">← 내 강의실</Link>
        </nav>
        <div className="admin-layout__title-row">
          <h1>전체 강의실</h1>
          <span className="ui-ko">강의 신청 · 개설된 강의실 목록</span>
        </div>
        <p className="classroom-page__lede">
          강의 소개는 상세 화면에서 확인할 수 있습니다. 멤버로 등록되면 자료·영상·질의응답을 이용할 수 있습니다.{" "}
          <strong>관리</strong> 버튼은 해당 강의실을 개설한 선생님 계정(강의실 소유자)으로 로그인한 경우에만
          표시됩니다.
        </p>

        {mayEnrollCatalog ? enrollmentSection : null}

        {actionMsg ? (
          <p className="classroom-catalog__feedback classroom-catalog__feedback--ok" role="status">
            {actionMsg}
          </p>
        ) : null}
        {actionErr || err ? <p className="auth-error">{actionErr || err}</p> : null}

        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="ui-ko">불러오는 중…</p>
          </div>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--light-text-muted, #6b7280)" }}>등록된 강의실이 없습니다.</p>
        ) : (
          <ul className="classroom-page__list">
            {rows.map((r) => (
              <li key={r.id} className="classroom-page__card classroom-catalog__card">
                <div>
                  <div className="classroom-catalog__card-title-row">
                    <h2 className="classroom-page__card-title">{r.title}</h2>
                    {pricingBadge(r)}
                  </div>
                  <p className="classroom-page__card-desc">{r.description || "설명 없음"}</p>
                  <p className="classroom-page__card-meta">개설 {formatAt(r.createdAt)}</p>
                </div>
                <div className="classroom-page__card-actions classroom-catalog__card-actions">
                  {mayEnrollCatalog ? renderStudentActions(r) : null}
                  <Link to={`/classroom/${r.id}`} className="btn btn--ghost btn--stack">
                    <span className="ui-ko">상세 보기</span>
                    <span className="ui-en">Details</span>
                  </Link>
                  {canManageMaterials && firebaseUser?.uid === r.teacherId && (
                    <Link to={`/classroom/${r.id}/manage`} className="btn btn--ghost btn--stack">
                      관리
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </DashboardShell>
  );
}
