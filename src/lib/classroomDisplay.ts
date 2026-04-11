import type { ClassroomDocument } from "@/types/classroom";

/** 강의실 소개 본문 (introduction 우선, 없으면 description) */
export function getClassroomIntroBody(room: ClassroomDocument): string {
  const intro = room.introduction?.trim();
  if (intro) return intro;
  return room.description?.trim() ?? "";
}
