import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { FirebaseStorage } from "firebase/storage";
import type {
  ClassroomLessonDocument,
  LessonMaterialItem,
  LessonVideoItem,
} from "@/types/classroomLesson";

const LEGACY_VIDEO_ID = "legacy-video";
const LEGACY_MATERIAL_ID = "legacy-material";

export function newLessonMediaId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeLessonUploadBasename(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return base || "file";
}

export function lessonMediaStorageObjectPath(
  classroomId: string,
  segment: string,
  unique: string,
  safeBase: string,
): string {
  return `classroom_lesson_media/${classroomId}/lessons/${segment}/${unique}_${safeBase}`;
}

export async function uploadLessonMediaFile(
  storage: FirebaseStorage,
  classroomId: string,
  segment: string,
  file: File,
): Promise<{ url: string; storagePath: string; label: string }> {
  const safe = sanitizeLessonUploadBasename(file.name);
  const uid = newLessonMediaId();
  const storagePath = lessonMediaStorageObjectPath(classroomId, segment, uid, safe);
  const sref = ref(storage, storagePath);
  await uploadBytes(sref, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(sref);
  return { url, storagePath, label: file.name };
}

export function effectiveLessonVideoItems(data: ClassroomLessonDocument): LessonVideoItem[] {
  const raw = data.videoItems;
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (x): x is LessonVideoItem =>
          !!x &&
          typeof x === "object" &&
          typeof (x as LessonVideoItem).id === "string" &&
          typeof (x as LessonVideoItem).url === "string" &&
          (x as LessonVideoItem).url.trim().length > 0,
      )
      .map((x) => ({
        id: x.id,
        url: x.url.trim(),
        label: typeof x.label === "string" ? x.label : undefined,
        storagePath:
          typeof x.storagePath === "string" && x.storagePath.trim() ? x.storagePath.trim() : undefined,
      }));
  }
  const legacy = typeof data.videoUrl === "string" ? data.videoUrl.trim() : "";
  if (legacy) {
    return [{ id: LEGACY_VIDEO_ID, url: legacy }];
  }
  return [];
}

export function effectiveLessonMaterialItems(data: ClassroomLessonDocument): LessonMaterialItem[] {
  const raw = data.materialItems;
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is LessonMaterialItem => {
        if (!x || typeof x !== "object" || typeof (x as LessonMaterialItem).id !== "string") {
          return false;
        }
        const cid = typeof (x as LessonMaterialItem).contentId === "string" ? (x as LessonMaterialItem).contentId!.trim() : "";
        const u = typeof (x as LessonMaterialItem).url === "string" ? (x as LessonMaterialItem).url!.trim() : "";
        return cid.length > 0 || u.length > 0;
      })
      .map((x) => ({
        id: x.id,
        contentId: typeof x.contentId === "string" ? x.contentId.trim() : x.contentId ?? undefined,
        url: typeof x.url === "string" ? x.url.trim() : x.url ?? undefined,
        label: typeof x.label === "string" ? x.label : undefined,
        storagePath:
          typeof x.storagePath === "string" && x.storagePath.trim() ? x.storagePath.trim() : undefined,
      }));
  }
  const legacy = typeof data.contentId === "string" ? data.contentId.trim() : "";
  if (legacy) {
    return [{ id: LEGACY_MATERIAL_ID, contentId: legacy }];
  }
  return [];
}

export function collectLessonStoragePaths(data: ClassroomLessonDocument): string[] {
  const out = new Set<string>();
  for (const v of effectiveLessonVideoItems(data)) {
    if (v.storagePath?.trim()) out.add(v.storagePath.trim());
  }
  for (const m of effectiveLessonMaterialItems(data)) {
    if (m.storagePath?.trim()) out.add(m.storagePath.trim());
  }
  return [...out];
}

export function serializeVideoItemsForFirestore(items: LessonVideoItem[]): LessonVideoItem[] {
  return items
    .filter((x) => x.url.trim().length > 0)
    .map((x) => ({
      id: x.id,
      url: x.url.trim().slice(0, 2048),
      label: x.label?.trim() ? x.label.trim().slice(0, 200) : undefined,
      storagePath: x.storagePath?.trim() ? x.storagePath.trim().slice(0, 500) : undefined,
    }));
}

export function serializeMaterialItemsForFirestore(items: LessonMaterialItem[]): LessonMaterialItem[] {
  return items
    .filter((x) => {
      const cid = x.contentId?.trim() ?? "";
      const u = x.url?.trim() ?? "";
      return cid.length > 0 || u.length > 0;
    })
    .map((x) => ({
      id: x.id,
      contentId: x.contentId?.trim() ? x.contentId.trim().slice(0, 128) : undefined,
      url: x.url?.trim() ? x.url.trim().slice(0, 2048) : undefined,
      label: x.label?.trim() ? x.label.trim().slice(0, 200) : undefined,
      storagePath: x.storagePath?.trim() ? x.storagePath.trim().slice(0, 500) : undefined,
    }));
}
