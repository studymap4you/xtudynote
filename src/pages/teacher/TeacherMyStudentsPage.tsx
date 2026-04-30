import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { TeacherRoute } from "@/components/TeacherRoute";
import { db } from "@/firebase/config";
import { removeClassroomMembersForTeacher } from "@/lib/classroom/removeClassroomMembersForTeacher";
import type { ClassroomDocument, ClassroomMemberEnrollmentDocument } from "@/types/classroom";
import "@/pages/pages.css";

type RoomSnap = { id: string; data: ClassroomDocument };

type EnrolledStudentRow = {
  studentUid: string;
  email: string;
  phone: string;
  classroomTitles: string[];
};

async function buildEnrolledRows(rooms: RoomSnap[]): Promise<EnrolledStudentRow[]> {
  const map = new Map<string, EnrolledStudentRow>();

  await Promise.all(
    rooms.map(async (c) => {
      const title = (c.data.title ?? "강의실").trim() || "강의실";
      const members = [...(c.data.memberStudentIds ?? [])].map((u) => String(u).trim());
      const enSnap = await getDocs(collection(db, "classrooms", c.id, "member_enrollments"));
      const byUid = new Map<string, ClassroomMemberEnrollmentDocument>();
      enSnap.forEach((d) => byUid.set(d.id, d.data() as ClassroomMemberEnrollmentDocument));

      for (const uid of members) {
        if (uid.length < 8) continue;
        const en = byUid.get(uid);
        const cur =
          map.get(uid) ??
          ({
            studentUid: uid,
            email: "",
            phone: "",
            classroomTitles: [],
          } satisfies EnrolledStudentRow);

        if (!cur.classroomTitles.includes(title)) {
          cur.classroomTitles.push(title);
        }
        const em = en?.email?.trim() ?? "";
        if (em && em !== "—" && !cur.email) cur.email = em;
        const ph = en?.phone?.trim() ?? "";
        if (ph && !cur.phone) cur.phone = ph;
        map.set(uid, cur);
      }
    }),
  );

  return [...map.values()].sort((a, b) => a.studentUid.localeCompare(b.studentUid));
}

function Inner() {
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<EnrolledStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const q = query(collection(db, "classrooms"), where("teacherId", "==", firebaseUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rooms: RoomSnap[] = [];
        snap.forEach((d) => rooms.push({ id: d.id, data: d.data() as ClassroomDocument }));
        void (async () => {
          try {
            const next = await buildEnrolledRows(rooms);
            setRows(next);
            setSelected((prev) => {
              const n = new Set<string>();
              for (const u of prev) {
                if (next.some((r) => r.studentUid === u)) n.add(u);
              }
              return n;
            });
            setErr(null);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
          } finally {
            setLoading(false);
          }
        })();
      },
      (e) => {
        setErr(e.message || "목록을 불러오지 못했습니다.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [firebaseUser?.uid]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.studentUid)));
  }, [allSelected, rows]);

  const toggleOne = useCallback((uid: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  }, []);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.studentUid)), [rows, selected]);

  const mailtoForSelected = useCallback(() => {
    const emails = [
      ...new Set(
        selectedRows.map((r) => r.email.trim()).filter((e) => e.length > 3 && e.includes("@")),
      ),
    ];
    if (emails.length === 0) {
      window.alert("선택한 학생 중 유효한 이메일이 없습니다. 수강 신청 시 저장된 이메일이 있어야 합니다.");
      return;
    }
    const params = new URLSearchParams();
    params.set("subject", "Xtudy-Universe · 강의 안내");
    params.set("body", "");
    window.location.href = `mailto:${emails.join(",")}?${params.toString()}`;
  }, [selectedRows]);

  async function removeSelected() {
    if (!firebaseUser?.uid || selected.size === 0) return;
    if (
      !window.confirm(
        `선택한 ${selected.size}명을 개설하신 모든 강의실에서 제외할까요?\n해당 학생은 더 이상 강의실 자료·과제에 접근할 수 없습니다.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await removeClassroomMembersForTeacher(firebaseUser.uid, [...selected]);
      setSelected(new Set());
      setMsg("선택한 수강생을 강의실에서 제거했습니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "제거에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light teacher-my-students">
        <nav className="classroom-page__breadcrumb" style={{ marginBottom: "var(--space-3)" }}>
          <Link to="/dashboard">← 대시보드</Link>
        </nav>
        <div className="admin-layout__title-row">
          <h1>나의 수강생</h1>
          <span className="ui-ko">내가 개설한 강의실에 등록된 학생</span>
        </div>
        <p className="classroom-page__lede teacher-my-students__lede">
          카탈로그 수강·멤버 등록된 학생이 표시됩니다. 같은 학생이 여러 강의를 듣는 경우 한 줄로 묶어 강의명을 모두
          보여 줍니다. 선택 후 제거하면<strong> 개설한 모든 강의실</strong>에서 해당 UID가 빠집니다.
        </p>

        {msg ? (
          <p
            className={msg.includes("실패") || msg.includes("오류") ? "auth-error" : "classroom-catalog__feedback classroom-catalog__feedback--ok"}
            role="status"
          >
            {msg}
          </p>
        ) : null}
        {err ? <p className="auth-error">{err}</p> : null}

        <div className="crm-toolbar teacher-my-students__toolbar">
          <div className="crm-toolbar__left">
            <label className="crm-check">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={loading || rows.length === 0} />
              <span>
                <span className="crm-check__en">Select all</span>
                <span className="crm-check__ko">전체 선택</span>
              </span>
            </label>
            <span className="crm-count">
              <span className="crm-count__en">{selected.size} selected</span>
              <span className="crm-count__ko">{selected.size}명 선택</span>
            </span>
          </div>
          <div className="teacher-my-students__actions">
            <button
              type="button"
              className="btn btn--ghost btn--stack"
              disabled={selected.size === 0 || busy}
              onClick={() => mailtoForSelected()}
            >
              <span className="ui-ko">선택한 학생에게 이메일 보내기</span>
              <span className="ui-en">Email selected</span>
            </button>
            <button
              type="button"
              className="btn btn--stack"
              style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
              disabled={selected.size === 0 || busy}
              onClick={() => void removeSelected()}
            >
              <span className="ui-ko">선택 제거</span>
              <span className="ui-en">Remove selected</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="ui-ko">불러오는 중…</p>
          </div>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--light-text-muted, #6b7280)" }}>등록된 수강생이 없습니다.</p>
        ) : (
          <div className="teacher-my-students__table-wrap">
            <table className="teacher-my-students__table">
              <thead>
                <tr>
                  <th scope="col" className="teacher-my-students__th-check" aria-label="선택" />
                  <th scope="col">학생 UID</th>
                  <th scope="col">이메일</th>
                  <th scope="col">전화</th>
                  <th scope="col">수강 강의실</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentUid}>
                    <td>
                      <label className="teacher-my-students__check-wrap">
                        <input
                          type="checkbox"
                          checked={selected.has(r.studentUid)}
                          onChange={() => toggleOne(r.studentUid)}
                        />
                      </label>
                    </td>
                    <td className="teacher-my-students__mono">{r.studentUid}</td>
                    <td>{r.email || "—"}</td>
                    <td>{r.phone || "—"}</td>
                    <td className="teacher-my-students__classes">{r.classroomTitles.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}

export function TeacherMyStudentsPage() {
  return (
    <TeacherRoute>
      <Inner />
    </TeacherRoute>
  );
}
