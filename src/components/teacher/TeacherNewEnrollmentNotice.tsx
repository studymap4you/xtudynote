import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { ClassroomMemberEnrollmentDocument } from "@/types/classroom";

const ACK_KEY = "xtudy_teacher_new_enrollment_ack_ms_v1";

export type TeacherEnrollmentNoticeRow = {
  classroomId: string;
  classroomTitle: string;
  data: ClassroomMemberEnrollmentDocument;
  enrolledMs: number;
};

function readAckMs(): number {
  try {
    const v = localStorage.getItem(ACK_KEY);
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeAckMs(ms: number): void {
  localStorage.setItem(ACK_KEY, String(ms));
}

function enrolledAtMs(raw: unknown): number {
  if (raw && typeof raw === "object" && "toMillis" in raw && typeof (raw as { toMillis: () => number }).toMillis === "function") {
    try {
      return (raw as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

/** 승인된 교사 대시보드 — 마지막 확인 이후 새 member_enrollments 알림 */
export function TeacherNewEnrollmentNotice({ teacherUid }: { teacherUid: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TeacherEnrollmentNoticeRow[]>([]);
  const [fetching, setFetching] = useState(false);

  const refresh = useCallback(async () => {
    if (!teacherUid) return;
    setFetching(true);
    try {
      let ack = readAckMs();
      if (ack === 0) {
        ack = Date.now();
        writeAckMs(ack);
      }
      const cq = query(collection(db, "classrooms"), where("teacherId", "==", teacherUid));
      const cs = await getDocs(cq);
      const out: TeacherEnrollmentNoticeRow[] = [];
      await Promise.all(
        cs.docs.map(async (c) => {
          const title = (c.data().title as string) || "제목 없음";
          const es = await getDocs(collection(db, "classrooms", c.id, "member_enrollments"));
          es.forEach((d) => {
            const data = d.data() as ClassroomMemberEnrollmentDocument;
            const ms = enrolledAtMs(data.enrolledAt);
            if (ms > ack) {
              out.push({ classroomId: c.id, classroomTitle: title, data, enrolledMs: ms });
            }
          });
        }),
      );
      out.sort((a, b) => b.enrolledMs - a.enrolledMs);
      setRows(out);
      setOpen(out.length > 0);
    } finally {
      setFetching(false);
    }
  }, [teacherUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function acknowledge() {
    writeAckMs(Date.now());
    setOpen(false);
    setRows([]);
  }

  if (!open || rows.length === 0) return null;

  return (
    <div className="crm-modal-root teacher-enrollment-notice-root" role="dialog" aria-modal="true" aria-labelledby="teacher-new-enroll-title">
      <div className="crm-modal-backdrop" aria-hidden />
      <div className="crm-modal crm-modal--send teacher-enrollment-notice">
        <h3 id="teacher-new-enroll-title" className="crm-modal__title">
          <span className="crm-modal__title-ko">신규 수강생 안내</span>
          <span className="crm-modal__title-en">New enrollments</span>
        </h3>
        <p className="crm-modal__hint ui-ko">
          전체 강의실에서 수강 신청이 들어왔습니다. 확인 후 각 강의실 <strong>관리 → 학습지 멤버</strong>에서 연락처
          명단을 보실 수 있습니다.
        </p>
        <ul className="teacher-enrollment-notice__list">
          {rows.slice(0, 40).map((r) => (
            <li key={`${r.classroomId}-${r.data.studentId}`} className="teacher-enrollment-notice__item">
              <div className="teacher-enrollment-notice__course">
                <strong>{r.classroomTitle}</strong>
              </div>
              <div className="teacher-enrollment-notice__meta">
                <span className="ui-ko">학생 UID {r.data.studentId}</span>
                <span className="teacher-enrollment-notice__dot" aria-hidden>
                  ·
                </span>
                <span>{r.data.email}</span>
                <span className="teacher-enrollment-notice__dot" aria-hidden>
                  ·
                </span>
                <span>{r.data.phone}</span>
              </div>
            </li>
          ))}
        </ul>
        {rows.length > 40 ? (
          <p className="teacher-enrollment-notice__more ui-ko">외 {rows.length - 40}건은 강의실 관리 화면에서 확인할 수 있습니다.</p>
        ) : null}
        <div className="crm-modal__actions">
          <button type="button" className="btn btn--primary btn--stack" disabled={fetching} onClick={acknowledge}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
