import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import { listClassroomsByTeacher, type ClassroomRow } from "@/lib/classroom/listTeacherClassrooms";
import type { RosterCandidate, WorksheetGroupDoc, WorksheetRosterEntryDoc } from "@/types/worksheetRoster";

function rosterCol(teacherUid: string) {
  return collection(db, "users", teacherUid, "worksheet_roster");
}

function groupsCol(teacherUid: string) {
  return collection(db, "users", teacherUid, "worksheet_groups");
}

export async function listWorksheetRoster(teacherUid: string): Promise<{ id: string; data: WorksheetRosterEntryDoc }[]> {
  const snap = await getDocs(rosterCol(teacherUid));
  const out: { id: string; data: WorksheetRosterEntryDoc }[] = [];
  snap.forEach((d) => out.push({ id: d.id, data: d.data() as WorksheetRosterEntryDoc }));
  return out;
}

export async function listWorksheetGroups(teacherUid: string): Promise<{ id: string; data: WorksheetGroupDoc }[]> {
  const snap = await getDocs(groupsCol(teacherUid));
  const out: { id: string; data: WorksheetGroupDoc }[] = [];
  snap.forEach((d) => out.push({ id: d.id, data: d.data() as WorksheetGroupDoc }));
  return out;
}

export async function upsertWorksheetRosterEntry(
  teacherUid: string,
  input: { studentUid: string; displayName?: string; emailLower?: string },
): Promise<void> {
  const uid = input.studentUid.trim();
  if (uid.length < 8) throw new Error("학생 UID가 너무 짧습니다.");
  const ref = doc(db, "users", teacherUid, "worksheet_roster", uid);
  const email = input.emailLower?.trim().toLowerCase() ?? "";
  const displayName = input.displayName?.trim() ?? "";
  await setDoc(
    ref,
    {
      studentUid: uid,
      ...(displayName ? { displayName } : {}),
      ...(email ? { emailLower: email } : {}),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteWorksheetRosterEntry(teacherUid: string, studentUid: string): Promise<void> {
  await deleteDoc(doc(db, "users", teacherUid, "worksheet_roster", studentUid.trim()));
}

/**
 * 강의실 멤버가 바뀐 뒤 호출합니다. 새 UID는 주소록(worksheet_roster)에 합류시키고,
 * 제외된 UID는 다른 강의실에 더 이상 속하지 않을 때만 주소록 문서에서 제거합니다.
 * (먼저 콜러가 Firestore classrooms 문서 반영 후 호출해야 합니다.)
 */
export async function syncTeacherRosterForClassroomMemberDelta(
  teacherUid: string,
  delta: { added: string[]; removed: string[] },
): Promise<void> {
  const added = [...new Set(delta.added.map((s) => s.trim()).filter((u) => u.length >= 8))];
  const removed = [...new Set(delta.removed.map((s) => s.trim()).filter((u) => u.length >= 8))];

  await Promise.all(
    added.map((u) =>
      upsertWorksheetRosterEntry(teacherUid, { studentUid: u }).catch(() => undefined),
    ),
  );

  if (!removed.length) return;

  const rooms = await listClassroomsByTeacher(teacherUid);
  const uidStillInSomeClassroom = new Set<string>();
  for (const row of rooms) {
    for (const raw of row.data.memberStudentIds ?? []) {
      uidStillInSomeClassroom.add(String(raw).trim());
    }
  }
  await Promise.all(
    removed.map((u) =>
      uidStillInSomeClassroom.has(u)
        ? Promise.resolve()
        : deleteWorksheetRosterEntry(teacherUid, u).catch(() => undefined),
    ),
  );
}

/** 학생 한 명 추가 시 — 승인·무료 수강 직후 단순 업서트 */
export async function ensureTeacherRosterForStudent(
  teacherUid: string,
  studentUid: string,
): Promise<void> {
  const u = studentUid.trim();
  if (u.length < 8) return;
  await upsertWorksheetRosterEntry(teacherUid, { studentUid: u });
}

export async function addWorksheetGroup(teacherUid: string, name: string, studentUids: string[]): Promise<string> {
  const uniq = [...new Set(studentUids.map((u) => u.trim()).filter(Boolean))];
  if (!uniq.length) throw new Error("그룹에 넣을 학생이 없습니다.");
  const ref = await addDoc(groupsCol(teacherUid), {
    name: name.trim().slice(0, 80),
    studentUids: uniq,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWorksheetGroup(
  teacherUid: string,
  groupId: string,
  patch: Partial<Pick<WorksheetGroupDoc, "name" | "studentUids">>,
): Promise<void> {
  const ref = doc(db, "users", teacherUid, "worksheet_groups", groupId);
  await updateDoc(ref, {
    ...(patch.name != null ? { name: patch.name.trim().slice(0, 80) } : {}),
    ...(patch.studentUids != null ? { studentUids: [...new Set(patch.studentUids.map((u) => u.trim()).filter(Boolean))] } : {}),
  });
}

export async function deleteWorksheetGroup(teacherUid: string, groupId: string): Promise<void> {
  await deleteDoc(doc(db, "users", teacherUid, "worksheet_groups", groupId));
}

export function buildRosterCandidates(
  classrooms: ClassroomRow[],
  rosterRows: { id: string; data: WorksheetRosterEntryDoc }[],
): RosterCandidate[] {
  type Acc = {
    displayName: string;
    emailLower: string;
    labels: Set<string>;
  };
  const map = new Map<string, Acc>();

  for (const c of classrooms) {
    const title = c.data.title?.trim() || "강의실";
    for (const raw of c.data.memberStudentIds ?? []) {
      const uid = String(raw).trim();
      if (uid.length < 8) continue;
      const cur = map.get(uid) ?? { displayName: "", emailLower: "", labels: new Set<string>() };
      cur.labels.add(`강의실「${title}」`);
      map.set(uid, cur);
    }
  }

  for (const { id, data } of rosterRows) {
    const uid = String(data.studentUid ?? id).trim();
    if (uid.length < 8) continue;
    const cur = map.get(uid) ?? { displayName: "", emailLower: "", labels: new Set<string>() };
    if (data.displayName?.trim()) cur.displayName = data.displayName.trim();
    if (data.emailLower?.trim()) cur.emailLower = data.emailLower.trim().toLowerCase();
    cur.labels.add("주소록");
    map.set(uid, cur);
  }

  return [...map.entries()]
    .map(([studentUid, acc]) => ({
      studentUid,
      displayName: acc.displayName || `UID ${studentUid.slice(0, 10)}…`,
      emailLower: acc.emailLower,
      sourceLabels: [...acc.labels],
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
}

export function matchImportRowsToUids(
  rows: { studentUid?: string; email?: string; name?: string }[],
  candidates: RosterCandidate[],
): { matched: string[]; unmatched: { line: number; hint: string }[] } {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const c of candidates) {
    if (c.emailLower) byEmail.set(c.emailLower, c.studentUid);
    const nk = c.displayName.trim().toLowerCase();
    if (nk) {
      const arr = byName.get(nk) ?? [];
      arr.push(c.studentUid);
      byName.set(nk, arr);
    }
  }

  const matched: string[] = [];
  const unmatched: { line: number; hint: string }[] = [];
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const line = idx + 2;
    let uid = row.studentUid?.trim() ?? "";
    if (uid && candidates.some((c) => c.studentUid === uid)) {
      if (!seen.has(uid)) {
        seen.add(uid);
        matched.push(uid);
      }
      return;
    }
    const em = row.email?.trim().toLowerCase() ?? "";
    if (em && byEmail.has(em)) {
      const u = byEmail.get(em)!;
      if (!seen.has(u)) {
        seen.add(u);
        matched.push(u);
      }
      return;
    }
    const nm = row.name?.trim().toLowerCase() ?? "";
    if (nm) {
      const arr = byName.get(nm) ?? [];
      if (arr.length === 1) {
        const u = arr[0];
        if (!seen.has(u)) {
          seen.add(u);
          matched.push(u);
        }
        return;
      }
      if (arr.length > 1) {
        unmatched.push({ line, hint: `이름「${row.name}」이(가) 여러 UID와 일치합니다. UID 열을 넣어 주세요.` });
        return;
      }
    }
    unmatched.push({
      line,
      hint: `매칭 실패 (UID·이메일·이름): ${[row.studentUid, row.email, row.name].filter(Boolean).join(" · ") || "(빈 줄)"}`,
    });
  });

  return { matched, unmatched };
}
