import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type { ClassroomDocument } from "@/types/classroom";

export type HomeworkListRow = {
  contentId: string;
  homeworkCode: string;
  shortCode: string | null;
  /** 과제 제목(과거 스키마의 subject 필드와 동일) */
  subject: string;
  learningTopic: string;
  classroomId: string | null;
  /** 강의실 이름 — 검색·표시용 */
  classroomTitle: string | null;
  createdAt: unknown;
};

function toRow(id: string, d: Record<string, unknown>): HomeworkListRow | null {
  const homeworkCode = (d.homeworkCode as string | null | undefined) ?? null;
  if (!homeworkCode) return null;
  const shortCode = (d.shortCode as string | null | undefined) ?? null;
  const classroomId = (d.classroomId as string | null | undefined) ?? null;
  const classroomTitleRaw = d.classroomTitle;
  const classroomTitle =
    typeof classroomTitleRaw === "string" && classroomTitleRaw.trim().length > 0
      ? classroomTitleRaw.trim()
      : null;
  return {
    contentId: id,
    homeworkCode,
    shortCode,
    subject: (d.subject as string) ?? "",
    learningTopic: (d.learningTopic as string) ?? "",
    classroomId,
    classroomTitle,
    createdAt: d.createdAt,
  };
}

async function attachClassroomTitles(rows: HomeworkListRow[]): Promise<HomeworkListRow[]> {
  const need = new Set<string>();
  for (const r of rows) {
    if (!r.classroomTitle && r.classroomId) need.add(r.classroomId);
  }
  if (need.size === 0) return rows;

  const titleById = new Map<string, string>();
  await Promise.all(
    [...need].map(async (classroomId) => {
      const snap = await getDoc(doc(db, "classrooms", classroomId));
      if (!snap.exists()) return;
      const t = (snap.data() as ClassroomDocument).title?.trim();
      if (t) titleById.set(classroomId, t);
    })
  );

  return rows.map((r) => ({
    ...r,
    classroomTitle: r.classroomTitle ?? (r.classroomId ? titleById.get(r.classroomId) ?? null : null),
  }));
}

function createdAtMillis(at: unknown): number {
  if (at && typeof at === "object" && at !== null && "toMillis" in at) {
    const ms = (at as { toMillis: () => number }).toMillis();
    return typeof ms === "number" && !Number.isNaN(ms) ? ms : 0;
  }
  return 0;
}

/** 강의실 개설자 또는 `memberStudentIds`에 포함된 강의실 ID */
export async function fetchClassroomIdsForUser(uid: string): Promise<string[]> {
  const ids = new Set<string>();
  const [ownSnap, memSnap] = await Promise.all([
    getDocs(query(collection(db, "classrooms"), where("teacherId", "==", uid))),
    getDocs(query(collection(db, "classrooms"), where("memberStudentIds", "array-contains", uid))),
  ]);
  ownSnap.forEach((d) => ids.add(d.id));
  memSnap.forEach((d) => ids.add(d.id));
  return [...ids];
}

async function fetchHomeworkInClassroom(classroomId: string): Promise<HomeworkListRow[]> {
  const q = query(
    collection(db, "contents"),
    where("classroomId", "==", classroomId),
    where("type", "==", "homework"),
    where("status", "==", "approved")
  );
  const snap = await getDocs(q);
  const out: HomeworkListRow[] = [];
  snap.forEach((docSnap) => {
    const row = toRow(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (row) out.push(row);
  });
  return out;
}

/** 선생님이 등록한 과제(강의실 외 단독 출제·승인본 포함) — authorId + type 인덱스 사용, 승인은 클라이언트 필터 */
async function fetchHomeworkByAuthor(authorId: string): Promise<HomeworkListRow[]> {
  const q = query(
    collection(db, "contents"),
    where("authorId", "==", authorId),
    where("type", "==", "homework"),
    orderBy("createdAt", "desc"),
    limit(100)
  );
  const snap = await getDocs(q);
  const out: HomeworkListRow[] = [];
  snap.forEach((docSnap) => {
    const raw = docSnap.data() as Record<string, unknown> & { status?: string };
    if (raw.status !== "approved") return;
    const row = toRow(docSnap.id, raw as Record<string, unknown>);
    if (row) out.push(row);
  });
  return out;
}

/**
 * 로그인 사용자 기준 — 소속·개설 강의실의 승인된 과제 + (교사·관리자) 본인 출제 과제.
 * `contentId` 기준 중복 제거 후 최신순.
 */
export async function fetchHomeworkListForUser(
  uid: string,
  opts: { includeAuthorHomework: boolean }
): Promise<HomeworkListRow[]> {
  const classroomIds = await fetchClassroomIdsForUser(uid);
  const fromClassrooms =
    classroomIds.length === 0
      ? []
      : (await Promise.all(classroomIds.map((cid) => fetchHomeworkInClassroom(cid)))).flat();

  const fromAuthor = opts.includeAuthorHomework ? await fetchHomeworkByAuthor(uid) : [];

  const map = new Map<string, HomeworkListRow>();
  for (const row of fromClassrooms) {
    map.set(row.contentId, row);
  }
  for (const row of fromAuthor) {
    if (!map.has(row.contentId)) map.set(row.contentId, row);
  }

  const sorted = [...map.values()].sort(
    (a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt)
  );
  return attachClassroomTitles(sorted);
}
