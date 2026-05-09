import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import {
  ensureTeacherRosterForStudent,
  syncTeacherRosterForClassroomMemberDelta,
} from "@/lib/worksheet/teacherRosterApi";
import { PENDING_ENROLL_STORAGE_KEY } from "@/lib/classroom/classroomPublicListing";
import { formatTuitionKrwWon } from "@/lib/formatTuitionKrw";
import { isHttpUrl, normalizeExternalUrl } from "@/lib/isHttpUrl";
import type {
  ClassroomDocument,
  ClassroomEnrollmentRequestDocument,
  ClassroomMemberEnrollmentDocument,
} from "@/types/classroom";
import "@/pages/pages.css";

type Row = ClassroomDocument & { id: string };

type EnrollModalState =
  | null
  | {
      room: Row;
      step: "contact" | "progress" | "success" | "error";
      phone: string;
      errorMessage?: string;
      /** 유료: 신청만 접수·승인 대기 (즉시 멤버 아님) */
      enrollKind?: "free" | "paid_pending";
    };

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

export function ClassroomCatalogPage() {
  const { firebaseUser, profile, canManageMaterials, isStudent, isPendingTeacher, isTeacherApproved, isSuperAdmin } =
    useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busyClassId, setBusyClassId] = useState<string | null>(null);
  const [enrollModal, setEnrollModal] = useState<EnrollModalState>(null);
  const pendingEnrollHandled = useRef(false);
  const [pendingPaidByClassroomId, setPendingPaidByClassroomId] = useState<Record<string, boolean>>({});

  const showCatalogLearnerNotice =
    !!firebaseUser?.uid && !isStudent && (isTeacherApproved || isPendingTeacher || isSuperAdmin);

  const uid = firebaseUser?.uid;
  const emailPrefill = (firebaseUser?.email ?? profile?.email ?? "").trim();

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

  useEffect(() => {
    if (!uid || !isStudent) {
      setPendingPaidByClassroomId({});
      return;
    }
    const q = query(collectionGroup(db, "enrollment_requests"), where("studentId", "==", uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const m: Record<string, boolean> = {};
        snap.forEach((d) => {
          const data = d.data() as ClassroomEnrollmentRequestDocument;
          if (data.classroomId) m[data.classroomId] = true;
        });
        setPendingPaidByClassroomId(m);
      },
      () => setPendingPaidByClassroomId({}),
    );
    return () => unsub();
  }, [uid, isStudent]);

  useEffect(() => {
    if (pendingEnrollHandled.current || !uid || loading) return;
    try {
      const raw = sessionStorage.getItem(PENDING_ENROLL_STORAGE_KEY)?.trim();
      if (!raw) return;
      sessionStorage.removeItem(PENDING_ENROLL_STORAGE_KEY);
      pendingEnrollHandled.current = true;
      if (rows.length === 0) {
        setActionErr("선택한 강의실을 전체 강의실 목록에서 찾지 못했습니다. 목록이 아직 비어 있거나 동기화 중일 수 있습니다.");
        return;
      }
      const row = rows.find((r) => r.id === raw);
      if (!row) {
        setActionErr("선택한 강의실을 전체 강의실 목록에서 찾지 못했습니다.");
        return;
      }
      if (!isStudent) {
        setActionErr("강의 신청은 학생 계정으로 로그인한 뒤 이용해 주세요.");
        return;
      }
      setActionErr(null);
      setEnrollModal({ room: row, step: "contact", phone: "" });
    } catch {
      pendingEnrollHandled.current = false;
    }
  }, [uid, isStudent, loading, rows]);

  useEffect(() => {
    return () => {
      pendingEnrollHandled.current = false;
    };
  }, []);

  const scrollToEnrollSection = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.getElementById("classroom-catalog-enroll")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  function openEnrollModal(r: Row) {
    setActionErr(null);
    setEnrollModal({ room: r, step: "contact", phone: "" });
  }

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
      const batch = writeBatch(db);
      const cRef = doc(db, "classrooms", r.id);
      batch.update(cRef, { memberStudentIds: arrayRemove(uid) });
      const enRef = doc(db, "classrooms", r.id, "member_enrollments", uid);
      batch.delete(enRef);
      await batch.commit();
      await syncTeacherRosterForClassroomMemberDelta(r.teacherId, { added: [], removed: [uid] });
      setActionMsg(`「${r.title}」수강을 취소했습니다.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "수강 취소에 실패했습니다.");
    } finally {
      setBusyClassId(null);
    }
  }

  async function commitEnroll(room: Row, phoneDigits: string) {
    if (!uid || !isStudent) return;
    setEnrollModal((m) => (m && m.room.id === room.id ? { ...m, step: "progress" } : m));
    try {
      if (isPaidClassroom(room)) {
        const reqRef = doc(db, "classrooms", room.id, "enrollment_requests", uid);
        const payload: ClassroomEnrollmentRequestDocument = {
          studentId: uid,
          email: emailPrefill || "—",
          phone: phoneDigits,
          classroomId: room.id,
          teacherId: room.teacherId,
          classroomTitle: room.title.slice(0, 200),
          requestedAt: serverTimestamp(),
        };
        const b = writeBatch(db);
        b.set(reqRef, payload);
        await b.commit();
        const payRaw = normalizeExternalUrl(room.tuitionPaymentUrl);
        if (payRaw && isHttpUrl(payRaw)) {
          window.open(payRaw.slice(0, 2048), "_blank", "noopener,noreferrer");
        }
        setEnrollModal({ room, step: "success", phone: phoneDigits, enrollKind: "paid_pending" });
        setActionMsg(null);
      } else {
        const enRef = doc(db, "classrooms", room.id, "member_enrollments", uid);
        const cRef = doc(db, "classrooms", room.id);
        const payload: ClassroomMemberEnrollmentDocument = {
          studentId: uid,
          email: emailPrefill || "—",
          phone: phoneDigits,
          classroomId: room.id,
          teacherId: room.teacherId,
          classroomTitle: room.title.slice(0, 200),
          enrolledAt: serverTimestamp(),
        };
        const batch = writeBatch(db);
        batch.set(enRef, payload);
        batch.update(cRef, { memberStudentIds: arrayUnion(uid) });
        await batch.commit();
        try {
          await ensureTeacherRosterForStudent(room.teacherId, uid, { classroomId: room.id });
        } catch {
          /* 강의실 멤버 등록은 완료됨. 주소록(worksheet_roster)만 실패한 경우 — 규칙 미배포 등 */
        }
        setEnrollModal({ room, step: "success", phone: phoneDigits, enrollKind: "free" });
        setActionMsg(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "수강 처리에 실패했습니다.";
      setEnrollModal({ room, step: "error", phone: phoneDigits, errorMessage: msg });
    } finally {
      setBusyClassId(null);
    }
  }

  async function cancelPaidRequest(r: Row) {
    if (!uid || busyClassId) return;
    if (
      !window.confirm(
        `「${r.title}」유료 수강 신청을 취소할까요? (선생님 승인 전이면 대기 목록에서만 제거됩니다.)`,
      )
    ) {
      return;
    }
    setBusyClassId(r.id);
    setActionErr(null);
    try {
      const b = writeBatch(db);
      b.delete(doc(db, "classrooms", r.id, "enrollment_requests", uid));
      await b.commit();
      setActionMsg(`「${r.title}」수강 신청을 취소했습니다.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "신청 취소에 실패했습니다.");
    } finally {
      setBusyClassId(null);
    }
  }

  function openPaymentLink(r: Row) {
    const payRaw = normalizeExternalUrl(r.tuitionPaymentUrl);
    if (!payRaw || !isHttpUrl(payRaw)) return;
    window.open(payRaw.slice(0, 2048), "_blank", "noopener,noreferrer");
  }

  function startEnrollFromModal() {
    if (!enrollModal || enrollModal.step !== "contact") return;
    if (!isStudent) {
      setEnrollModal({
        ...enrollModal,
        step: "error",
        errorMessage: "수강 신청은 학생 계정으로 로그인한 경우에만 가능합니다.",
      });
      return;
    }
    const r = enrollModal.room;
    const p = enrollModal.phone.replace(/\s/g, "");
    if (!emailPrefill || emailPrefill.length < 3 || !emailPrefill.includes("@")) {
      setEnrollModal({ ...enrollModal, step: "error", errorMessage: "계정에 연결된 이메일을 확인할 수 없습니다. 다시 로그인해 주세요." });
      return;
    }
    if (p.length < 5) {
      setEnrollModal({ ...enrollModal, step: "error", errorMessage: "전화번호를 5자 이상 입력해 주세요." });
      return;
    }
    if (busyClassId) return;
    setBusyClassId(r.id);
    void commitEnroll(r, p);
  }

  const enrollmentSection = useMemo(
    () => (
      <section id="classroom-catalog-enroll" className="classroom-catalog-enroll" aria-labelledby="catalog-enroll-h">
        <h2 id="catalog-enroll-h" className="classroom-catalog-enroll__title">
          수강 신청
        </h2>
        <p className="classroom-catalog-enroll__lede ui-ko">
          <span className="ui-en" style={{ display: "block", marginBottom: "0.35rem" }}>
            Free courses add you as a member immediately. Paid courses collect your contact, open the teacher&apos;s payment
            link, then wait for the teacher to approve (approval does not require proof of payment).
          </span>
          <strong>무료</strong> 강의는 신청 즉시 멤버로 등록됩니다. <strong>유료</strong> 강의는 연락처를 남긴 뒤 선생님이
          설정한 <strong>결제 안내 링크</strong>로 이동할 수 있으며, 실제 결제 여부와 관계없이 선생님이 승인하면
          수강이 열립니다.
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

    if (!isStudent) return null;

    const pendingPaid = !!pendingPaidByClassroomId[r.id];

    if (pendingPaid) {
      const payRaw = normalizeExternalUrl(r.tuitionPaymentUrl);
      const canOpenPay = isPaidClassroom(r) && !!payRaw && isHttpUrl(payRaw);
      return (
        <div className="classroom-catalog__enroll-stack">
          <button type="button" className="btn btn--ghost btn--stack" disabled>
            <span className="ui-ko">승인 대기</span>
            <span className="ui-en">Awaiting approval</span>
          </button>
          {canOpenPay ? (
            <button
              type="button"
              className="btn btn--primary btn--stack"
              disabled={!!busyClassId}
              onClick={() => openPaymentLink(r)}
            >
              <span className="ui-ko">결제 안내 링크</span>
              <span className="ui-en">Payment page</span>
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost btn--stack"
            disabled={!!busyClassId}
            onClick={() => void cancelPaidRequest(r)}
          >
            <span className="ui-ko">신청 취소</span>
            <span className="ui-en">Cancel request</span>
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
          if (paid && !paidTuitionOk(r)) {
            setActionErr(
              "이 강의는 수강 안내 가격이 아직 등록되지 않았습니다. 강사에게 문의한 뒤 다시 시도해 주세요.",
            );
            return;
          }
          openEnrollModal(r);
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

        {showCatalogLearnerNotice ? (
          <p className="classroom-page__lede" style={{ background: "var(--light-surface-2, #f3f4f6)", padding: "0.75rem 1rem", borderRadius: 8 }}>
            <strong className="ui-ko">수강 신청</strong>은 학생 회원 계정에서만 할 수 있습니다. 선생님 계정으로 다른 강의를
            듣고 싶다면 로그아웃한 뒤 학생 계정으로 다시 로그인해 주세요. (Firebase 로그인은 이메일당 하나의 계정이므로
            학생용으로는 다른 이메일이 필요합니다.)
          </p>
        ) : null}

        {isStudent ? enrollmentSection : null}

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
                  {renderStudentActions(r)}
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

        {enrollModal ? (
          <div
            className="crm-modal-root classroom-catalog__enroll-modal-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-enroll-modal-title"
          >
            <div
              className="crm-modal-backdrop"
              onClick={() => {
                if (enrollModal.step === "contact") setEnrollModal(null);
              }}
              aria-hidden
            />
            <div className="crm-modal crm-modal--send classroom-catalog__enroll-modal-panel">
              {enrollModal.step === "contact" ? (
                <button
                  type="button"
                  className="crm-modal__close"
                  aria-label="닫기"
                  onClick={() => setEnrollModal(null)}
                />
              ) : null}
              <h3 id="catalog-enroll-modal-title" className="crm-modal__title">
                <span className="crm-modal__title-ko">
                  {enrollModal.step === "contact"
                    ? "수강 신청"
                    : enrollModal.step === "progress"
                      ? "처리 중"
                      : enrollModal.step === "success"
                        ? enrollModal.enrollKind === "paid_pending"
                          ? "신청이 접수되었습니다"
                          : "수강신청 완료"
                        : "안내"}
                </span>
                <span className="crm-modal__title-en">
                  {enrollModal.step === "contact"
                    ? "Enrollment"
                    : enrollModal.step === "progress"
                      ? "Please wait"
                      : enrollModal.step === "success"
                        ? enrollModal.enrollKind === "paid_pending"
                          ? "Submitted"
                          : "Complete"
                        : "Notice"}
                </span>
              </h3>
              {enrollModal.step === "contact" ? (
                <>
                  <p className="classroom-catalog__modal-class">
                    <strong>{enrollModal.room.title}</strong>
                  </p>
                  <p className="crm-modal__hint ui-ko">
                    담당 선생님 연락용입니다. 이메일은 로그인 계정 기준으로 저장됩니다.
                    {isPaidClassroom(enrollModal.room) ? (
                      <>
                        {" "}
                        유료 강의는 신청 후 안내에 따라 <strong>결제 페이지</strong>가 열립니다. 결제를 완료하지 않아도
                        선생님이 승인하면 수강이 가능합니다.
                      </>
                    ) : null}
                  </p>
                  <div className="classroom-catalog__modal-fields">
                    <label className="auth-field">
                      <span>이메일</span>
                      <input className="add-passage__control" type="email" readOnly value={emailPrefill} />
                    </label>
                    <label className="auth-field">
                      <span>전화번호</span>
                      <input
                        className="add-passage__control"
                        type="tel"
                        autoComplete="tel"
                        value={enrollModal.phone}
                        onChange={(e) => setEnrollModal({ ...enrollModal, phone: e.target.value })}
                        placeholder="010-0000-0000"
                      />
                    </label>
                  </div>
                  <div className="crm-modal__actions">
                    <button type="button" className="btn btn--ghost btn--stack" onClick={() => setEnrollModal(null)}>
                      취소
                    </button>
                    <button type="button" className="btn btn--primary btn--stack" onClick={() => startEnrollFromModal()}>
                      수강 신청
                    </button>
                  </div>
                </>
              ) : null}

              {enrollModal.step === "progress" ? (
                <div className="classroom-catalog__enroll-progress">
                  <div className="route-loading route-loading--light classroom-catalog__enroll-progress-loading">
                    <div className="route-loading__spinner" />
                  </div>
                  <p className="ui-ko classroom-catalog__enroll-progress-msg">
                    수강 등록을 진행하고 있습니다. 잠시만 기다려 주세요.
                  </p>
                  <p className="ui-en classroom-catalog__enroll-progress-msg-en">Processing your enrollment…</p>
                </div>
              ) : null}

              {enrollModal.step === "success" ? (
                <>
                  <p className="classroom-catalog__modal-class">
                    <strong>{enrollModal.room.title}</strong>
                  </p>
                  {enrollModal.enrollKind === "paid_pending" ? (
                    <p className="classroom-catalog__enroll-success-msg ui-ko">
                      신청이 접수되었습니다. 결제 안내 페이지를 새 창에서 열었을 수 있습니다 — 창을 닫았어도 괜찮습니다.
                      선생님이 승인하면 아래 목록에서「승인 대기」가「수강중」으로 바뀝니다.
                    </p>
                  ) : (
                    <p className="classroom-catalog__enroll-success-msg ui-ko">
                      수강신청이 완료되었습니다. 아래 목록에서 이 강의실 버튼이「수강중」으로 바뀌었는지 확인해 주세요.
                      내 강의실에서도 입장할 수 있습니다.
                    </p>
                  )}
                  <div className="crm-modal__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--stack"
                      onClick={() => setEnrollModal(null)}
                    >
                      확인
                    </button>
                  </div>
                </>
              ) : null}

              {enrollModal.step === "error" ? (
                <>
                  <p className="auth-error" style={{ marginTop: "0.5rem" }}>
                    {enrollModal.errorMessage ?? "처리할 수 없습니다."}
                  </p>
                  <div className="crm-modal__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--stack"
                      onClick={() => setEnrollModal(null)}
                    >
                      확인
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </DashboardShell>
  );
}
