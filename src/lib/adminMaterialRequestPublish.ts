import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { allocateUniqueHomeworkCode } from "@/lib/allocateHomeworkCode";
import { copyPendingPathsToAuthorContents } from "@/lib/copyPendingToContentsFolder";
import type { ContentStatus, ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { MaterialRequestDocument } from "@/types/materialRequest";
import type { VideoMaterialRequestDocument } from "@/types/videoMaterialRequest";
import { collectVideoUrlsFromRequest } from "@/lib/videoMaterialUrls";

const THEME_IDS = new Set<LearningThemeId>(["k_entrance", "global_prep", "professional", "academic"]);

function sanitizeThemes(raw: unknown): LearningThemeId[] {
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

  const themes = sanitizeThemes(raw.themes);

  const classroomId =
    raw.classroomId != null && typeof raw.classroomId === "string" && raw.classroomId.trim()
      ? raw.classroomId.trim()
      : null;

  const baseContent = {
    authorId,
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

  const baseContent = {
    authorId,
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
