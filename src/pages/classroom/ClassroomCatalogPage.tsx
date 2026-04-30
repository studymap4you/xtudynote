import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import {
  ensureTeacherRosterForStudent,
  syncTeacherRosterForClassroomMemberDelta,
} from "@/lib/worksheet/teacherRosterApi";
import { formatTuitionKrwWon } from "@/lib/formatTuitionKrw";
import type {
  ClassroomDocument,
  ClassroomEnrollmentRequestDocument,
  ClassroomEnrollmentRequestStatus,
} from "@/types/classroom";
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

/** Firestore 유료 수강신청 규칙(canSubmit)과 동일: 타인 강의실에 신청 UI·상태 동기화 대상 */
function canEnrollInOthersClassrooms(
  isStudent: boolean,
  isPendingTeacher: boolean,
  isTeacherApproved: boolean,
): boolean {
  return isStudent || isPendingTeacher || isTeacherApproved;
}

export function ClassroomCatalogPage() {
  const {
    firebaseUser,
    canManageMaterials,
    isStudent,
    isPendingTeacher,
    isTeacherApproved,
  } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  /** classroomId -> latest enrollment request for current user (any status) */
  const [myEnrollmentByClassroom, setMyEnrollmentByClassroom] = useState<
    Record<string, { status: ClassroomEnrollmentRequestStatus; id: string }>
  >({});
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyClassId, setBusyClassId] = useState<string | null>(null);

  const [modalRoom, setModalRoom] = useState<Row | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  /** 유료 수강신청요청 제출 직후 안내(과목명과 함께 팝업으로만 표시) */
  const [enrollmentResultModal, setEnrollmentResultModal] = useState<
    | null
    | { variant: "success" | "error"; courseTitle: string; message: string }
  >(null);
  const mayEnrollCatalog = canEnrollInOthersClassrooms(isStudent, isPendingTeacher, isTeacherApproved);
  const [myEnrollmentMapReady, setMyEnrollmentMapReady] = useState(!mayEnrollCatalog);

  const uid = firebaseUser?.uid;

  /** 유료·비멤버 강의실 id 목록이 바뀔 때만 enrollment 리스너를 갈아끼움 (rows 참조 변경 무시) */
  const enrollmentWatchKey = useMemo(() => {
    if (!uid || !mayEnrollCatalog) return "";
    return rows
      .filter((r) => r.teacherId !== uid && isPaidClassroom(r) && !isMember(r, uid))
      .map((r) => r.id)
      .sort()
      .join(",");
  }, [rows, uid, mayEnrollCatalog]);

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

  /** collectionGroup 대신 문서 단위 구독 + 초기 getDoc(딥링크·첫 표시 레이스 완화) */
  useEffect(() => {
    if (!uid || !mayEnrollCatalog) {
      setMyEnrollmentByClassroom({});
      setMyEnrollmentMapReady(true);
      return undefined;
    }

    if (!enrollmentWatchKey) {
      setMyEnrollmentByClassroom({});
      setMyEnrollmentMapReady(true);
      return undefined;
    }

    const classroomIds = enrollmentWatchKey.split(",").filter(Boolean);
    setMyEnrollmentMapReady(false);

    let cancelled = false;

    (async () => {
      const bootstrap: Record<string, { status: ClassroomEnrollmentRequestStatus; id: string }> = {};
      await Promise.all(
        classroomIds.map(async (classroomId) => {
          try {
            const ref = doc(db, "classrooms", classroomId, "enrollment_requests", uid);
            const snap = await getDoc(ref);
            if (!snap.exists()) return;
            const data = snap.data() as ClassroomEnrollmentRequestDocument;
            bootstrap[classroomId] = { status: data.status, id: snap.id };
          } catch {
            /* 네트워크·권한 */
          }
        }),
      );
      if (cancelled) return;
      setMyEnrollmentByClassroom((prev) => {
        const next = { ...prev };
        for (const id of classroomIds) delete next[id];
        return { ...next, ...bootstrap };
      });
      setMyEnrollmentMapReady(true);
    })();

    const unsubs = classroomIds.map((classroomId) => {
      const ref = doc(db, "classrooms", classroomId, "enrollment_requests", uid);
      return onSnapshot(
        ref,
        (snap) => {
          setMyEnrollmentByClassroom((prev) => {
            const next = { ...prev };
            if (!snap.exists()) {
              delete next[classroomId];
            } else {
              const data = snap.data() as ClassroomEnrollmentRequestDocument;
              next[classroomId] = { status: data.status, id: snap.id };
            }
            return next;
          });
        },
        () => {
          setMyEnrollmentByClassroom((prev) => {
            const next = { ...prev };
            delete next[classroomId];
            return next;
          });
        },
      );
    });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [uid, mayEnrollCatalog, enrollmentWatchKey]);

  const scrollToEnrollSection = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.getElementById("classroom-catalog-enroll")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const openPaidModal = useCallback(
    (r: Row) => {
      scrollToEnrollSection();
      setEnrollmentResultModal(null);
      setPhone("");
      setEmail(firebaseUser?.email ?? "");
      setModalRoom(r);
      setActionErr(null);
    },
    [firebaseUser?.email, scrollToEnrollSection],
  );

  useEffect(() => {
    const enrollId = searchParams.get("enroll");
    if (!enrollId || !rows.length || !mayEnrollCatalog || !uid || !myEnrollmentMapReady) return;
    const r = rows.find((x) => x.id === enrollId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("enroll");
        return next;
      },
      { replace: true },
    );
    if (!r || r.teacherId === uid) return;
    scrollToEnrollSection();
    if (isPaidClassroom(r) && !isMember(r, uid)) {
      const st = myEnrollmentByClassroom[r.id]?.status;
      if (st !== "pending") {
        setPhone("");
        setEmail(firebaseUser?.email ?? "");
        setModalRoom(r);
      }
    }
  }, [
    searchParams,
    rows,
    mayEnrollCatalog,
    uid,
    firebaseUser?.email,
    scrollToEnrollSection,
    myEnrollmentByClassroom,
    myEnrollmentMapReady,
    setSearchParams,
  ]);

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
      await updateDoc(doc(db, "classrooms", r.id), {
        memberStudentIds: arrayRemove(uid),
      });
      await syncTeacherRosterForClassroomMemberDelta(r.teacherId, { added: [], removed: [uid] });
      try {
        await deleteDoc(doc(db, "classrooms", r.id, "enrollment_requests", uid));
      } catch {
        /* 유료 신청 문서가 없거나 이미 삭제됨 */
      }
      setActionMsg(`「${r.title}」수강을 취소했습니다.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "수강 취소에 실패했습니다.");
    } finally {
      setBusyClassId(null);
    }
  }

  async function cancelPendingEnrollment(r: Row) {
    if (!uid || busyClassId) return;
    if (!window.confirm(`「${r.title}」유료 수강 신청을 취소할까요?`)) return;
    setBusyClassId(r.id);
    setActionErr(null);
    setActionMsg(null);
    try {
      await deleteDoc(doc(db, "classrooms", r.id, "enrollment_requests", uid));
      setActionMsg(`「${r.title}」수강 신청을 취소했습니다.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "취소에 실패했습니다.");
    } finally {
      setBusyClassId(null);
    }
  }

  async function enrollFree(r: Row) {
    if (!uid || busyClassId) return;
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

  async function submitPaidRequest() {
    if (!modalRoom || !uid) return;
    const p = phone.replace(/\s/g, "");
    const em = email.trim();
    if (p.length < 5) {
      setActionErr("전화번호를 5자 이상 입력해 주세요.");
      return;
    }
    if (em.length < 3 || !em.includes("@")) {
      setActionErr("유효한 이메일을 입력해 주세요.");
      return;
    }
    if (isPaidClassroom(modalRoom)) {
      const fee = modalRoom.tuitionFeeKrw;
      if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 1) {
        setActionErr(
          "이 강의는 수강 가격이 아직 등록되지 않았습니다. 강사에게 문의한 뒤 다시 시도해 주세요.",
        );
        return;
      }
    }
    const courseTitle = modalRoom.title;
    const classroomId = modalRoom.id;
    setModalSubmitting(true);
    setActionErr(null);
    try {
      const ref = doc(db, "classrooms", modalRoom.id, "enrollment_requests", uid);
      /** 로컬 캐시만 보면 '없음'으로 잘못 판단해 setDoc이 update로 거절되는 경우 방지 */
      let existing;
      try {
        existing = await getDocFromServer(ref);
      } catch {
        existing = await getDoc(ref);
      }
      if (existing.exists()) {
        const cur = existing.data() as ClassroomEnrollmentRequestDocument;
        if (cur.status === "pending") {
          setMyEnrollmentByClassroom((prev) => ({
            ...prev,
            [classroomId]: { status: "pending", id: uid },
          }));
          setModalRoom(null);
          setEnrollmentResultModal({
            variant: "success",
            courseTitle,
            message:
              "이미 접수된 신청입니다. 강사 승인을 기다려 주세요. 해당 강의실 카드의 버튼이「승인 대기중」으로 바뀌는지 확인해 주세요.",
          });
          return;
        }
        if (cur.status === "approved") {
          if (isMember(modalRoom, uid)) {
            setModalRoom(null);
            setEnrollmentResultModal({
              variant: "success",
              courseTitle,
              message: "이미 승인된 강의입니다. 내 강의실에서 입장해 주세요.",
            });
            return;
          }
          await deleteDoc(ref);
        } else if (cur.status === "rejected") {
          await deleteDoc(ref);
        }
      } else {
        const prev = myEnrollmentByClassroom[modalRoom.id];
        if (prev?.status === "rejected") {
          try {
            await deleteDoc(ref);
          } catch {
            /* 문서가 이미 없을 수 있음 */
          }
        }
      }
      const listedFee =
        isPaidClassroom(modalRoom) &&
        typeof modalRoom.tuitionFeeKrw === "number" &&
        Number.isFinite(modalRoom.tuitionFeeKrw) &&
        modalRoom.tuitionFeeKrw > 0
          ? Math.round(modalRoom.tuitionFeeKrw)
          : undefined;
      const payload: ClassroomEnrollmentRequestDocument = {
        studentId: uid,
        phone: p,
        email: em,
        status: "pending",
        createdAt: serverTimestamp(),
        ...(listedFee != null ? { tuitionFeeKrwAtRequest: listedFee } : {}),
      };
      await setDoc(ref, payload);
      setMyEnrollmentByClassroom((prev) => ({
        ...prev,
        [classroomId]: { status: "pending", id: uid },
      }));
      setModalRoom(null);
      setEnrollmentResultModal({
        variant: "success",
        courseTitle,
        message:
          "수강 신청이 접수되었습니다. 강사 승인 후 이용할 수 있습니다. 아래 목록에서 해당 강의실 버튼이「승인 대기중」으로 표시됩니다.",
      });
    } catch (e) {
      if (e instanceof FirebaseError && e.code === "permission-denied") {
        try {
          const ref = doc(db, "classrooms", classroomId, "enrollment_requests", uid);
          const s = await getDocFromServer(ref);
          if (s.exists()) {
            const cur = s.data() as ClassroomEnrollmentRequestDocument;
            if (cur.status === "pending") {
              setMyEnrollmentByClassroom((prev) => ({
                ...prev,
                [classroomId]: { status: "pending", id: uid },
              }));
              setModalRoom(null);
              setEnrollmentResultModal({
                variant: "success",
                courseTitle,
                message:
                  "이미 이 강의실에 수강 신청이 접수된 상태입니다. (다른 강의실 강의는 각각 따로 신청할 수 있습니다.) 강사 승인을 기다려 주세요.",
              });
              return;
            }
            if (cur.status === "approved") {
              const row = rows.find((x) => x.id === classroomId);
              if (row && isMember(row, uid)) {
                setModalRoom(null);
                setEnrollmentResultModal({
                  variant: "success",
                  courseTitle,
                  message: "이미 승인된 강의입니다. 내 강의실에서 입장해 주세요.",
                });
                return;
              }
            }
          }
        } catch {
          /* fall through to error modal */
        }
      }
      const msg =
        e instanceof FirebaseError && e.code === "permission-denied"
          ? "저장이 거절되었습니다. 같은 강의실은 중복 접수할 수 없습니다. 다른 강의실은 강의마다 따로 신청 가능합니다. 이미 멤버인 경우·본인이 연 강의실인 경우에도 거절될 수 있습니다. 새로고침 후에도 반복되면 관리자에게 문의해 주세요."
          : e instanceof Error
            ? e.message
            : "신청에 실패했습니다.";
      setModalRoom(null);
      setEnrollmentResultModal({ variant: "error", courseTitle, message: msg });
    } finally {
      setModalSubmitting(false);
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
            Free courses enroll instantly. Paid courses collect your contact for the teacher until PG checkout is live.
          </span>
          무료 강의는 <strong>수강신청</strong> 한 번으로 바로 멤버로 등록됩니다. 유료 강의는 온라인 결제(PG) 준비 전까지{" "}
          <strong>수강신청요청</strong> 팝업에서 연락처를 남기면 강사에게 <strong>수강 대기</strong> 명단으로 전달됩니다.
        </p>
      </section>
    ),
    [],
  );

  function renderStudentActions(r: Row) {
    if (!uid || r.teacherId === uid) return null;
    const member = isMember(r, uid);
    const paid = isPaidClassroom(r);
    const en = myEnrollmentByClassroom[r.id];

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

    if (paid && en?.status === "pending") {
      return (
        <div className="classroom-catalog__enroll-stack">
          <button
            type="button"
            className="btn btn--ghost btn--stack classroom-catalog__btn-pending"
            disabled
          >
            <span className="ui-ko">승인 대기중</span>
            <span className="ui-en">Pending approval</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--stack"
            disabled={!!busyClassId}
            onClick={() => void cancelPendingEnrollment(r)}
          >
            <span className="ui-ko">신청 취소</span>
            <span className="ui-en">Cancel request</span>
          </button>
        </div>
      );
    }

    if (paid) {
      return (
        <button
          type="button"
          className="btn btn--primary btn--stack"
          disabled={!!busyClassId}
          onClick={() => {
            scrollToEnrollSection();
            openPaidModal(r);
          }}
        >
          <span className="ui-ko">수강신청</span>
          <span className="ui-en">Enroll (paid)</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        className="btn btn--primary btn--stack"
        disabled={!!busyClassId}
        onClick={() => {
          scrollToEnrollSection();
          void enrollFree(r);
        }}
      >
        <span className="ui-ko">수강신청</span>
        <span className="ui-en">Enroll (free)</span>
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
        {(actionErr || err) ? <p className="auth-error">{actionErr || err}</p> : null}

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

        {enrollmentResultModal ? (
          <div
            className="crm-modal-root classroom-catalog__result-modal-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enroll-result-title"
          >
            <div
              className="crm-modal-backdrop"
              onClick={() => setEnrollmentResultModal(null)}
              aria-hidden
            />
            <div
              className={`crm-modal crm-modal--send classroom-catalog__result-modal ${
                enrollmentResultModal.variant === "error"
                  ? "classroom-catalog__result-modal--error"
                  : ""
              }`}
            >
              <button
                type="button"
                className="crm-modal__close"
                aria-label="닫기"
                onClick={() => setEnrollmentResultModal(null)}
              />
              <h3 id="enroll-result-title" className="crm-modal__title">
                <span className="crm-modal__title-ko">
                  {enrollmentResultModal.variant === "success" ? "신청 안내" : "처리 불가"}
                </span>
                <span className="crm-modal__title-en">
                  {enrollmentResultModal.variant === "success" ? "Request status" : "Request failed"}
                </span>
              </h3>
              <p className="classroom-catalog__result-course">
                <strong>{enrollmentResultModal.courseTitle}</strong>
              </p>
              <p className="classroom-catalog__result-msg">{enrollmentResultModal.message}</p>
              <div className="crm-modal__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--stack"
                  onClick={() => setEnrollmentResultModal(null)}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {modalRoom ? (
          <div className="crm-modal-root" role="dialog" aria-modal="true" aria-labelledby="enroll-paid-title">
            <div
              className="crm-modal-backdrop"
              onClick={() => !modalSubmitting && setModalRoom(null)}
              aria-hidden
            />
            <div className="crm-modal crm-modal--send">
              <button
                type="button"
                className="crm-modal__close"
                aria-label="닫기"
                disabled={modalSubmitting}
                onClick={() => setModalRoom(null)}
              />
              <h3 id="enroll-paid-title" className="crm-modal__title">
                <span className="crm-modal__title-ko">수강신청요청</span>
                <span className="crm-modal__title-en">Enrollment request</span>
              </h3>
              <p className="crm-modal__hint ui-ko">
                PG 결제 연동 후에는 이 단계 대신 결제창으로 안내될 예정입니다. 지금은 연락처를 남기면 강사에게 수강
                대기 명단으로 전달됩니다.
              </p>
              <p className="classroom-catalog__modal-class">
                <strong>{modalRoom.title}</strong>
              </p>
              {isPaidClassroom(modalRoom) ? (
                <p className="classroom-catalog__modal-tuition" role="status">
                  {typeof modalRoom.tuitionFeeKrw === "number" &&
                  Number.isFinite(modalRoom.tuitionFeeKrw) &&
                  modalRoom.tuitionFeeKrw > 0 ? (
                    <>
                      <span className="classroom-catalog__modal-tuition-label">수강 안내가격</span>
                      <span className="classroom-catalog__modal-tuition-amount">
                        {formatTuitionKrwWon(modalRoom.tuitionFeeKrw)}
                      </span>
                      <span className="classroom-catalog__modal-tuition-note ui-ko">
                        (PG 결제 연동 전까지는 참고 금액이며, 실제 결제는 강사 안내에 따릅니다.)
                      </span>
                    </>
                  ) : (
                    <span className="classroom-catalog__modal-tuition-pending ui-ko">
                      수강 가격이 아직 등록되지 않아 신청할 수 없습니다. 강사에게 문의해 주세요.
                    </span>
                  )}
                </p>
              ) : null}
              <div className="classroom-catalog__modal-fields">
                <label className="auth-field">
                  <span>전화번호</span>
                  <input
                    className="add-passage__control"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-0000-0000"
                  />
                </label>
                <label className="auth-field">
                  <span>이메일</span>
                  <input
                    className="add-passage__control"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              </div>
              {actionErr && modalRoom ? <p className="auth-error">{actionErr}</p> : null}
              <div className="crm-modal__actions">
                <button type="button" className="btn btn--ghost btn--stack" disabled={modalSubmitting} onClick={() => setModalRoom(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--stack"
                  disabled={
                    modalSubmitting ||
                    (isPaidClassroom(modalRoom) &&
                      (typeof modalRoom.tuitionFeeKrw !== "number" ||
                        !Number.isFinite(modalRoom.tuitionFeeKrw) ||
                        modalRoom.tuitionFeeKrw < 1))
                  }
                  onClick={() => void submitPaidRequest()}
                >
                  {modalSubmitting ? "제출 중…" : "수강신청요청"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </DashboardShell>
  );
}
