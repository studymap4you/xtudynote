import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/firebase/config";
import { allocateUniqueHomeworkCode } from "@/lib/allocateHomeworkCode";
import { copyPendingPathsToAuthorContents, normalizeStorageObjectPath } from "@/lib/copyPendingToContentsFolder";
import type { ContentStatus, ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { MaterialRequestDocument } from "@/types/materialRequest";
import type { VideoMaterialRequestDocument } from "@/types/videoMaterialRequest";
import { collectVideoUrlsFromRequest } from "@/lib/videoMaterialUrls";

const THEME_IDS = new Set<LearningThemeId>(["k_entrance", "global_prep", "professional", "academic"]);

export function sanitizeThemes(raw: unknown): LearningThemeId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is LearningThemeId => typeof t === "string" && THEME_IDS.has(t as LearningThemeId));
}

function buildIdentifierFromTitle(title: string): string {
  const t = title.trim().slice(0, 120);
  return t.length > 0 ? t : "등록-자료";
}

function appendPriceNote(introduction: string, desiredPrice: number | null, type: ContentType): string {
  if (type !== "paid" || desiredPrice == null || !Number.isFinite(desiredPrice)) {
    return introduction;
  }
  const line = `[등록 희망 가격: ${Math.round(desiredPrice).toLocaleString("ko-KR")}원]`;
  const trimmed = introduction.trim();
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return `${trimmed}<p>${line}</p>`;
  }
  return `${trimmed}\n\n${line}`;
}

function resolveSubmitterId(raw: MaterialRequestDocument): string {
  const a = (raw.submitterId ?? "").trim();
  if (a) return a;
  const b = (raw.studentId ?? "").trim();
  if (b) return b;
  return "";
}

export async function approveFileMaterialRequest(db: Firestore, requestId: string): Promise<string> {
  const snap = await getDoc(doc(db, "material_requests", requestId));
  if (!snap.exists()) {
    throw new Error("신청 문서를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
  }
  const raw = snap.data() as MaterialRequestDocument;
  if ((raw.status ?? "pending") !== "pending") {
    throw new Error("이미 처리된 신청입니다.");
  }
  const authorId = resolveSubmitterId(raw);
  if (!authorId) throw new Error("제출자 ID가 없습니다.");

  const materialType = raw.materialType;
  const title = raw.title?.trim() || "제목 없음";
  const subject = raw.subject?.trim() || "—";
  const audience = raw.audienceGrade?.trim() || "—";
  const section = (raw.section?.trim() || "").length > 0 ? raw.section!.trim() : "일반";
  const identifier = buildIdentifierFromTitle(title);
  const learningTopic = title;
  const introduction = appendPriceNote(raw.description?.trim() || "", raw.desiredPrice, materialType);

  const seed = performance.now();
  const learningMaterialFilePaths = await copyPendingPathsToAuthorContents(
    raw.learningMaterialFilePaths ?? [],
    authorId,
    seed,
    "lm"
  );
  const referenceMaterialFilePaths = await copyPendingPathsToAuthorContents(
    raw.referenceMaterialFilePaths ?? [],
    authorId,
    seed + 1,
    "ref"
  );

  const thumbPending = (raw.thumbnailPendingPath ?? "").trim();
  const thumbnailPaths = thumbPending
    ? await copyPendingPathsToAuthorContents([thumbPending], authorId, seed + 2, "thumb")
    : [];
  const thumbnailPath = thumbnailPaths[0] ?? null;

  const previewPending = (raw.previewPendingPath ?? "").trim();
  const previewCopiedPaths = previewPending
    ? await copyPendingPathsToAuthorContents([previewPending], authorId, seed + 4, "preview")
    : [];
  let resolvedPreviewUrl: string | null = null;
  if (previewCopiedPaths[0]) {
    const p = normalizeStorageObjectPath(previewCopiedPaths[0]);
    if (p) resolvedPreviewUrl = await getDownloadURL(ref(storage, p));
  }

  const themes = sanitizeThemes(raw.themes);

  const classroomId =
    raw.classroomId != null && typeof raw.classroomId === "string" && raw.classroomId.trim()
      ? raw.classroomId.trim()
      : null;

  const baseContent = {
    authorId,
    teacherId: authorId,
    subject,
    audience,
    section,
    identifier,
    learningTopic,
    introduction,
    lectureLink: null as string | null,
    learningMaterialFilePaths,
    referenceMaterialFilePaths,
    type: materialType,
    status: "approved" as ContentStatus,
    purchaseLink: null as string | null,
    themes,
    clickCount: 0,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    ...(resolvedPreviewUrl ? { previewUrl: resolvedPreviewUrl } : {}),
    createdAt: serverTimestamp(),
    ...(classroomId ? { classroomId } : {}),
  };

  if (materialType === "homework") {
    const { homeworkCode, shortCode } = await allocateUniqueHomeworkCode();
    const hwInstruction = (raw.homeworkInstruction ?? "").trim();
    if (!hwInstruction) throw new Error("과제 유형인데 과제 안내가 비어 있습니다.");

    const batch = writeBatch(db);
    const contentRef = doc(collection(db, "contents"));
    batch.set(contentRef, {
      ...baseContent,
      homeworkCode,
      shortCode,
      homeworkInstruction: hwInstruction,
    });
    batch.set(doc(db, "homework_codes", homeworkCode), {
      contentId: contentRef.id,
      homeworkCode,
      shortCode,
      teacherId: authorId,
      authorId,
      subject,
      learningTopic,
      introduction,
      homeworkInstruction: hwInstruction,
      lectureLink: null,
      learningMaterialFilePaths,
      referenceMaterialFilePaths,
      status: "approved" as ContentStatus,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "material_requests", requestId), {
      status: "approved",
      resolvedContentId: contentRef.id,
      reviewedAt: serverTimestamp(),
      ...(resolvedPreviewUrl ? { previewUrl: resolvedPreviewUrl } : {}),
    });
    await batch.commit();
    return contentRef.id;
  }

  const batch = writeBatch(db);
  const contentRef = doc(collection(db, "contents"));
  batch.set(contentRef, {
    ...baseContent,
    homeworkCode: null,
    homeworkInstruction: null,
  });
  batch.update(doc(db, "material_requests", requestId), {
    status: "approved",
    resolvedContentId: contentRef.id,
    reviewedAt: serverTimestamp(),
    ...(resolvedPreviewUrl ? { previewUrl: resolvedPreviewUrl } : {}),
  });
  await batch.commit();
  return contentRef.id;
}

export async function approveVideoMaterialRequest(db: Firestore, requestId: string): Promise<string> {
  const snap = await getDoc(doc(db, "video_material_requests", requestId));
  if (!snap.exists()) {
    throw new Error("신청 문서를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
  }
  const raw = snap.data() as VideoMaterialRequestDocument;
  if ((raw.status ?? "pending") !== "pending") {
    throw new Error("이미 처리된 신청입니다.");
  }
  const authorId = (raw.submitterId ?? "").trim();
  if (!authorId) throw new Error("제출자 ID가 없습니다.");
  const videoSeed = performance.now();

  const materialType = raw.materialType;
  const title = raw.title?.trim() || "제목 없음";
  const subject = raw.subject?.trim() || "—";
  const audience = raw.audienceGrade?.trim() || "—";
  const section = "동영상";
  const identifier = buildIdentifierFromTitle(title);
  const learningTopic = title;
  const introduction = appendPriceNote(raw.description?.trim() || "", raw.desiredPrice, materialType);
  const urls = collectVideoUrlsFromRequest(raw);
  if (urls.length === 0) throw new Error("동영상 URL이 없습니다.");
  const lectureLinkValue = urls.join("\n\n");

  const thumbPending = (raw.thumbnailPendingPath ?? "").trim();
  const thumbnailPaths = thumbPending
    ? await copyPendingPathsToAuthorContents([thumbPending], authorId, videoSeed + 2, "thumb")
    : [];
  const thumbnailPath = thumbnailPaths[0] ?? null;

  const themes = sanitizeThemes(raw.themes);

  const classroomId =
    raw.classroomId != null && typeof raw.classroomId === "string" && raw.classroomId.trim()
      ? raw.classroomId.trim()
      : null;

  const teacherIdForContent = (raw.teacherId ?? "").trim() || authorId;

  const baseContent = {
    authorId,
    teacherId: teacherIdForContent,
    subject,
    audience,
    section,
    identifier,
    learningTopic,
    introduction,
    lectureLink: lectureLinkValue,
    learningMaterialFilePaths: [] as string[],
    referenceMaterialFilePaths: [] as string[],
    type: materialType,
    status: "approved" as ContentStatus,
    purchaseLink: null as string | null,
    themes,
    clickCount: 0,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    createdAt: serverTimestamp(),
    ...(classroomId ? { classroomId } : {}),
  };

  if (materialType === "homework") {
    const { homeworkCode, shortCode } = await allocateUniqueHomeworkCode();
    const hwInstruction = (raw.homeworkInstruction ?? "").trim();
    if (!hwInstruction) throw new Error("과제 유형인데 과제 안내가 비어 있습니다.");

    const batch = writeBatch(db);
    const contentRef = doc(collection(db, "contents"));
    batch.set(contentRef, {
      ...baseContent,
      homeworkCode,
      shortCode,
      homeworkInstruction: hwInstruction,
    });
    batch.set(doc(db, "homework_codes", homeworkCode), {
      contentId: contentRef.id,
      homeworkCode,
      shortCode,
      teacherId: teacherIdForContent,
      authorId,
      subject,
      learningTopic,
      introduction,
      homeworkInstruction: hwInstruction,
      lectureLink: lectureLinkValue,
      learningMaterialFilePaths: [],
      referenceMaterialFilePaths: [],
      status: "approved" as ContentStatus,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "video_material_requests", requestId), {
      status: "approved",
      resolvedContentId: contentRef.id,
      reviewedAt: serverTimestamp(),
    });
    await batch.commit();
    return contentRef.id;
  }

  const batch = writeBatch(db);
  const contentRef = doc(collection(db, "contents"));
  batch.set(contentRef, {
    ...baseContent,
    homeworkCode: null,
    homeworkInstruction: null,
  });
  batch.update(doc(db, "video_material_requests", requestId), {
    status: "approved",
    resolvedContentId: contentRef.id,
    reviewedAt: serverTimestamp(),
  });
  await batch.commit();
  return contentRef.id;
}

export async function rejectFileMaterialRequest(db: Firestore, requestId: string): Promise<void> {
  await updateDoc(doc(db, "material_requests", requestId), {
    status: "rejected",
    reviewedAt: serverTimestamp(),
  });
}

export async function rejectVideoMaterialRequest(db: Firestore, requestId: string): Promise<void> {
  await updateDoc(doc(db, "video_material_requests", requestId), {
    status: "rejected",
    reviewedAt: serverTimestamp(),
  });
}

/** 강의실 교육용 자료 — 검수 없이 contents 승인 상태로 즉시 반영 (관리자는 DB에서 조회·삭제 가능) */
export type EducationalClassroomPublishInput = {
  authorId: string;
  classroomId: string;
  classroomTitle: string | null;
  materialType: Extract<ContentType, "share" | "homework">;
  title: string;
  subject: string;
  audienceGrade: string;
  descriptionHtml: string;
  themes: LearningThemeId[];
  homeworkInstruction: string | null;
  learningMaterialFilePaths: string[];
  referenceMaterialFilePaths: string[];
  thumbnailPendingPath: string | null;
  previewPendingPath: string | null;
  previewUrl: string | null;
};

export async function publishEducationalClassroomMaterial(
  db: Firestore,
  input: EducationalClassroomPublishInput,
): Promise<string> {
  if (input.materialType !== "share" && input.materialType !== "homework") {
    throw new Error("교육용 즉시 공개는 공유·과제 유형만 가능합니다.");
  }
  const authorId = input.authorId.trim();
  if (!authorId) throw new Error("작성자 ID가 없습니다.");

  const title = input.title?.trim() || "제목 없음";
  const subject = input.subject?.trim() || "—";
  const audience = input.audienceGrade?.trim() || "—";
  const section = "일반";
  const identifier = buildIdentifierFromTitle(title);
  const learningTopic = title;
  const introduction = input.descriptionHtml?.trim() || "";

  const seed = performance.now();
  const learningMaterialFilePaths = await copyPendingPathsToAuthorContents(
    input.learningMaterialFilePaths ?? [],
    authorId,
    seed,
    "lm",
  );
  const referenceMaterialFilePaths = await copyPendingPathsToAuthorContents(
    input.referenceMaterialFilePaths ?? [],
    authorId,
    seed + 1,
    "ref",
  );

  const thumbPending = (input.thumbnailPendingPath ?? "").trim();
  const thumbnailPaths = thumbPending
    ? await copyPendingPathsToAuthorContents([thumbPending], authorId, seed + 2, "thumb")
    : [];
  const thumbnailPath = thumbnailPaths[0] ?? null;

  const previewPending = (input.previewPendingPath ?? "").trim();
  const previewCopiedPaths = previewPending
    ? await copyPendingPathsToAuthorContents([previewPending], authorId, seed + 4, "preview")
    : [];
  let resolvedPreviewUrl: string | null = input.previewUrl?.trim() || null;
  if (previewCopiedPaths[0]) {
    const p = normalizeStorageObjectPath(previewCopiedPaths[0]);
    if (p) resolvedPreviewUrl = await getDownloadURL(ref(storage, p));
  }

  const themes = sanitizeThemes(input.themes);
  const classroomId = input.classroomId.trim();
  const classroomTitle = input.classroomTitle?.trim() || null;

  const baseContent = {
    authorId,
    teacherId: authorId,
    subject,
    audience,
    section,
    identifier,
    learningTopic,
    introduction,
    lectureLink: null as string | null,
    learningMaterialFilePaths,
    referenceMaterialFilePaths,
    type: input.materialType,
    status: "approved" as ContentStatus,
    educationalInstantPublish: true,
    purchaseLink: null as string | null,
    themes,
    clickCount: 0,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    ...(resolvedPreviewUrl ? { previewUrl: resolvedPreviewUrl } : {}),
    createdAt: serverTimestamp(),
    classroomId,
    ...(classroomTitle ? { classroomTitle } : { classroomTitle: null }),
  };

  if (input.materialType === "homework") {
    const hwInstruction = (input.homeworkInstruction ?? "").trim();
    if (!hwInstruction) throw new Error("과제 유형인데 과제 안내가 비어 있습니다.");

    const { homeworkCode, shortCode } = await allocateUniqueHomeworkCode();
    const batch = writeBatch(db);
    const contentRef = doc(collection(db, "contents"));
    batch.set(contentRef, {
      ...baseContent,
      homeworkCode,
      shortCode,
      homeworkInstruction: hwInstruction,
    });
    batch.set(doc(db, "homework_codes", homeworkCode), {
      contentId: contentRef.id,
      homeworkCode,
      shortCode,
      teacherId: authorId,
      authorId,
      subject,
      learningTopic,
      introduction,
      homeworkInstruction: hwInstruction,
      lectureLink: null,
      learningMaterialFilePaths,
      referenceMaterialFilePaths,
      status: "approved" as ContentStatus,
      classroomId,
      ...(classroomTitle ? { classroomTitle } : { classroomTitle: null }),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return contentRef.id;
  }

  const batch = writeBatch(db);
  const contentRef = doc(collection(db, "contents"));
  batch.set(contentRef, {
    ...baseContent,
    homeworkCode: null,
    homeworkInstruction: null,
  });
  await batch.commit();
  return contentRef.id;
}

/** 강의실 동영상(링크) — 교육용으로 즉시 contents 승인 반영 (video_material_requests 없음) */
export type EducationalClassroomVideoPublishInput = {
  authorId: string;
  /** 강사별 필터용 — 비우면 authorId 사용 */
  teacherId?: string | null;
  classroomId: string;
  classroomTitle: string | null;
  materialType: Extract<ContentType, "share" | "homework">;
  title: string;
  subject: string;
  audienceGrade: string;
  descriptionHtml: string;
  urls: string[];
  homeworkInstruction: string | null;
  thumbnailPendingPath: string | null;
};

export async function publishEducationalClassroomVideoMaterial(
  db: Firestore,
  input: EducationalClassroomVideoPublishInput,
): Promise<string> {
  if (input.materialType !== "share" && input.materialType !== "homework") {
    throw new Error("교육용 동영상 즉시 공개는 공유·과제 유형만 가능합니다.");
  }
  const authorId = input.authorId.trim();
  if (!authorId) throw new Error("작성자 ID가 없습니다.");

  const urls = (input.urls ?? []).map((u) => String(u).trim()).filter(Boolean);
  if (urls.length === 0) throw new Error("동영상 URL이 없습니다.");

  const title = input.title?.trim() || "제목 없음";
  const subject = input.subject?.trim() || "—";
  const audience = input.audienceGrade?.trim() || "—";
  const section = "동영상";
  const identifier = buildIdentifierFromTitle(title);
  const learningTopic = title;
  const introduction = input.descriptionHtml?.trim() || "";
  const lectureLinkValue = urls.join("\n\n");

  const videoSeed = performance.now();
  const thumbPending = (input.thumbnailPendingPath ?? "").trim();
  const thumbnailPaths = thumbPending
    ? await copyPendingPathsToAuthorContents([thumbPending], authorId, videoSeed + 2, "thumb")
    : [];
  const thumbnailPath = thumbnailPaths[0] ?? null;

  const themes = [] as LearningThemeId[];
  const classroomId = input.classroomId.trim();
  const classroomTitle = input.classroomTitle?.trim() || null;
  const teacherIdForContent = (input.teacherId ?? "").trim() || authorId;

  const baseContent = {
    authorId,
    teacherId: teacherIdForContent,
    subject,
    audience,
    section,
    identifier,
    learningTopic,
    introduction,
    lectureLink: lectureLinkValue,
    learningMaterialFilePaths: [] as string[],
    referenceMaterialFilePaths: [] as string[],
    type: input.materialType,
    status: "approved" as ContentStatus,
    educationalInstantPublish: true,
    purchaseLink: null as string | null,
    themes,
    clickCount: 0,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    createdAt: serverTimestamp(),
    classroomId,
    ...(classroomTitle ? { classroomTitle } : { classroomTitle: null }),
  };

  if (input.materialType === "homework") {
    const hwInstruction = (input.homeworkInstruction ?? "").trim();
    if (!hwInstruction) throw new Error("과제 유형인데 과제 안내가 비어 있습니다.");

    const { homeworkCode, shortCode } = await allocateUniqueHomeworkCode();
    const batch = writeBatch(db);
    const contentRef = doc(collection(db, "contents"));
    batch.set(contentRef, {
      ...baseContent,
      homeworkCode,
      shortCode,
      homeworkInstruction: hwInstruction,
    });
    batch.set(doc(db, "homework_codes", homeworkCode), {
      contentId: contentRef.id,
      homeworkCode,
      shortCode,
      teacherId: teacherIdForContent,
      authorId,
      subject,
      learningTopic,
      introduction,
      homeworkInstruction: hwInstruction,
      lectureLink: lectureLinkValue,
      learningMaterialFilePaths: [],
      referenceMaterialFilePaths: [],
      status: "approved" as ContentStatus,
      classroomId,
      ...(classroomTitle ? { classroomTitle } : { classroomTitle: null }),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return contentRef.id;
  }

  const batch = writeBatch(db);
  const contentRef = doc(collection(db, "contents"));
  batch.set(contentRef, {
    ...baseContent,
    homeworkCode: null,
    homeworkInstruction: null,
  });
  await batch.commit();
  return contentRef.id;
}
