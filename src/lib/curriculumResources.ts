import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import { inferCurriculumPlacements } from "@/lib/curriculumPlacement";
import { uploadBytesResumableWithProgress } from "@/lib/storageUploadProgress";
import type {
  CurriculumCatalog,
  CurriculumCatalogId,
  CurriculumCategoryId,
  CurriculumResourceFile,
  CurriculumResourceRow,
  TextbookCatalogGroup,
} from "@/types/curriculumResource";

export const HIGH_SCHOOL_TEXTBOOK_GROUPS: TextbookCatalogGroup[] = [
  {
    id: "common1",
    label: "공통영어1",
    labelEn: "Common English 1",
    availableYear: 2025,
    categories: [
      { id: "textbook_common1_ne_minbyeongcheon", label: "NE능률(민병천)", labelEn: "NE Neungyule · Min Byeong-cheon" },
      { id: "textbook_common1_ne_ohseonyeong", label: "NE능률(오선영)", labelEn: "NE Neungyule · Oh Seon-young" },
      { id: "textbook_common1_ybm_kimeunhyeong", label: "YBM(김은형)", labelEn: "YBM · Kim Eun-hyeong" },
      { id: "textbook_common1_ybm_parkjuneon", label: "YBM(박준언)", labelEn: "YBM · Park Jun-eon" },
      { id: "textbook_common1_donga_leebyeongmin", label: "동아(이병민)", labelEn: "Donga · Lee Byeong-min" },
      { id: "textbook_common1_miraen_kimseongyeon", label: "미래엔(김성연)", labelEn: "MiraeN · Kim Seong-yeon" },
      { id: "textbook_common1_visang_hongminpyo", label: "비상(홍민표)", labelEn: "Visang · Hong Min-pyo" },
      { id: "textbook_common1_jihak_shinsanggeun", label: "지학사(신상근)", labelEn: "Jihak · Shin Sang-geun" },
      { id: "textbook_common1_chunjae_kangsanggu", label: "천재(강상구)", labelEn: "Chunjae · Kang Sang-gu" },
      { id: "textbook_common1_chunjae_josugyeong", label: "천재(조수경)", labelEn: "Chunjae · Jo Su-gyeong" },
    ],
  },
  {
    id: "common2",
    label: "공통영어2",
    labelEn: "Common English 2",
    availableYear: 2025,
    categories: [
      { id: "textbook_common2_ne_minbyeongcheon", label: "NE능률(민병천)", labelEn: "NE Neungyule · Min Byeong-cheon" },
      { id: "textbook_common2_ne_ohseonyeong", label: "NE능률(오선영)", labelEn: "NE Neungyule · Oh Seon-young" },
      { id: "textbook_common2_ybm_kimeunhyeong", label: "YBM(김은형)", labelEn: "YBM · Kim Eun-hyeong" },
      { id: "textbook_common2_ybm_parkjuneon", label: "YBM(박준언)", labelEn: "YBM · Park Jun-eon" },
      { id: "textbook_common2_donga_leebyeongmin", label: "동아(이병민)", labelEn: "Donga · Lee Byeong-min" },
      { id: "textbook_common2_miraen_kimseongyeon", label: "미래엔(김성연)", labelEn: "MiraeN · Kim Seong-yeon" },
      { id: "textbook_common2_visang_hongminpyo", label: "비상(홍민표)", labelEn: "Visang · Hong Min-pyo" },
      { id: "textbook_common2_jihak_shinsanggeun", label: "지학사(신상근)", labelEn: "Jihak · Shin Sang-geun" },
      { id: "textbook_common2_chunjae_kangsanggu", label: "천재(강상구)", labelEn: "Chunjae · Kang Sang-gu" },
      { id: "textbook_common2_chunjae_josugyeong", label: "천재(조수경)", labelEn: "Chunjae · Jo Su-gyeong" },
    ],
  },
  {
    id: "english1",
    label: "영어 I",
    labelEn: "English I",
    availableYear: 2026,
    categories: [
      { id: "textbook_english1_ne_ohseonyeong", label: "NE능률(오선영)", labelEn: "NE Neungyule · Oh Seon-young" },
      { id: "textbook_english1_ybm_parkjuneon", label: "YBM(박준언)", labelEn: "YBM · Park Jun-eon" },
      { id: "textbook_english1_donga_parkyongye", label: "동아(박용예)", labelEn: "Donga · Park Yong-ye" },
      { id: "textbook_english1_miraen_kimseongyeon", label: "미래엔(김성연)", labelEn: "MiraeN · Kim Seong-yeon" },
      { id: "textbook_english1_visang_hongminpyo", label: "비상(홍민표)", labelEn: "Visang · Hong Min-pyo" },
      { id: "textbook_english1_jihak_shinsanggeun", label: "지학사(신상근)", labelEn: "Jihak · Shin Sang-geun" },
      { id: "textbook_english1_chunjae_kangsanggu", label: "천재(강상구)", labelEn: "Chunjae · Kang Sang-gu" },
      { id: "textbook_english1_chunjae_josugyeong", label: "천재(조수경)", labelEn: "Chunjae · Jo Su-gyeong" },
    ],
  },
  {
    id: "english2",
    label: "영어 II",
    labelEn: "English II",
    availableYear: 2026,
    categories: [
      { id: "textbook_english2_ne_ohseonyeong", label: "NE능률(오선영)", labelEn: "NE Neungyule · Oh Seon-young" },
      { id: "textbook_english2_ybm_parkjuneon", label: "YBM(박준언)", labelEn: "YBM · Park Jun-eon" },
      { id: "textbook_english2_donga_parkyongye", label: "동아(박용예)", labelEn: "Donga · Park Yong-ye" },
      { id: "textbook_english2_miraen_kimseongyeon", label: "미래엔(김성연)", labelEn: "MiraeN · Kim Seong-yeon" },
      { id: "textbook_english2_visang_hongminpyo", label: "비상(홍민표)", labelEn: "Visang · Hong Min-pyo" },
      { id: "textbook_english2_jihak_shinsanggeun", label: "지학사(신상근)", labelEn: "Jihak · Shin Sang-geun" },
      { id: "textbook_english2_chunjae_kangsanggu", label: "천재(강상구)", labelEn: "Chunjae · Kang Sang-gu" },
      { id: "textbook_english2_chunjae_josugyeong", label: "천재(조수경)", labelEn: "Chunjae · Jo Su-gyeong" },
    ],
  },
  {
    id: "reading_writing",
    label: "영어 독해와 작문",
    labelEn: "English Reading and Writing",
    availableYear: 2027,
    categories: [
      { id: "textbook_reading_writing_ne_minbyeongcheon", label: "NE능률(민병천)", labelEn: "NE Neungyule · Min Byeong-cheon" },
      { id: "textbook_reading_writing_ybm_kimeunhyeong", label: "YBM(김은형)", labelEn: "YBM · Kim Eun-hyeong" },
      { id: "textbook_reading_writing_donga_leebyeongmin", label: "동아(이병민)", labelEn: "Donga · Lee Byeong-min" },
      { id: "textbook_reading_writing_miraen_kimdaejin", label: "미래엔(김대진)", labelEn: "MiraeN · Kim Dae-jin" },
      { id: "textbook_reading_writing_visang_hwangjongbae", label: "비상(황종배)", labelEn: "Visang · Hwang Jong-bae" },
      { id: "textbook_reading_writing_chunjae_yunseongho", label: "천재(윤성호)", labelEn: "Chunjae · Yun Seong-ho" },
    ],
  },
  {
    id: "advanced",
    label: "심화 영어",
    labelEn: "Advanced English",
    availableYear: 2027,
    categories: [
      { id: "textbook_advanced_ne_anbyeonggyu", label: "NE능률(안병규)", labelEn: "NE Neungyule · An Byeong-gyu" },
      { id: "textbook_advanced_ybm_kimmyeonghui", label: "YBM(김명희)", labelEn: "YBM · Kim Myeong-hui" },
      { id: "textbook_advanced_izen_leeseokjae", label: "이젠교육(이석재)", labelEn: "Izen Education · Lee Seok-jae" },
      { id: "textbook_advanced_chunjae_shinjeonga", label: "천재(신정아)", labelEn: "Chunjae · Shin Jeong-a" },
    ],
  },
  {
    id: "general",
    label: "교과서 공통 자료",
    labelEn: "Shared Textbook Resources",
    availableYear: 2025,
    categories: [
      { id: "textbook_general", label: "출판사 공통 자료", labelEn: "Shared Resources" },
    ],
  },
];

const HIGH_SCHOOL_TEXTBOOK_CATEGORIES = HIGH_SCHOOL_TEXTBOOK_GROUPS.flatMap((group) => group.categories);

export const CURRICULUM_CATALOGS: Record<CurriculumCatalogId, CurriculumCatalog> = {
  high_school: {
    id: "high_school",
    title: "내신부교재",
    titleEn: "Supplementary Textbooks",
    basePath: "/high-school-exams",
    categories: [
      { id: "grade1_mock", label: "고1 모의고사", labelEn: "Grade 10 Mock Exams" },
      { id: "grade2_mock", label: "고2 모의고사", labelEn: "Grade 11 Mock Exams" },
      { id: "grade3_mock", label: "고3 모의고사", labelEn: "Grade 12 Mock Exams" },
      { id: "high_school_csat", label: "수능", labelEn: "CSAT" },
      { id: "ebs_special_lecture", label: "수능특강", labelEn: "EBS CSAT Special Lecture" },
      { id: "ebs_complete", label: "수능완성", labelEn: "EBS CSAT Complete" },
      { id: "olympos", label: "올림포스", labelEn: "EBS Olympus" },
      { id: "supplementary_archive", label: "기타 부교재", labelEn: "Other Supplementary Materials" },
    ],
  },
  supplementary: {
    id: "supplementary",
    title: "고등 내신",
    titleEn: "High School English",
    basePath: "/supplementary-materials",
    categories: HIGH_SCHOOL_TEXTBOOK_CATEGORIES,
  },
  csat: {
    id: "csat",
    title: "수능",
    titleEn: "CSAT English",
    basePath: "/csat",
    categories: [
      { id: "csat_2026", label: "2026학년도 수능", labelEn: "2026 CSAT" },
      { id: "csat_2025", label: "2025학년도 수능", labelEn: "2025 CSAT" },
      { id: "csat_2024", label: "2024학년도 수능", labelEn: "2024 CSAT" },
      { id: "csat_2023", label: "2023학년도 수능", labelEn: "2023 CSAT" },
      { id: "csat_2022", label: "2022학년도 수능", labelEn: "2022 CSAT" },
      { id: "csat_archive", label: "기타 수능 자료", labelEn: "Other CSAT Resources" },
    ],
  },
};

function safeFileName(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, "_")
    .slice(-180) || "material";
}

function timestampMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === "function") return Number(toMillis.call(value)) || 0;
  }
  return 0;
}

function fileNameFromPath(path: string): string {
  const tail = path.split("/").pop() || "자료 파일";
  const withoutPrefix = tail.replace(/^curriculum_[^_]+_\d+_\d+_/u, "");
  try {
    return decodeURIComponent(withoutPrefix).replace(/_/gu, " ");
  } catch {
    return withoutPrefix.replace(/_/gu, " ");
  }
}

function normalizeFiles(data: Record<string, unknown>): CurriculumResourceFile[] {
  const metadata = Array.isArray(data.resourceFiles) ? data.resourceFiles : [];
  const normalized = metadata
    .map((item): CurriculumResourceFile | null => {
      if (!item || typeof item !== "object") return null;
      const file = item as Record<string, unknown>;
      const path = String(file.path ?? "").trim();
      if (!path) return null;
      return {
        name: String(file.name ?? "").trim() || fileNameFromPath(path),
        path,
        size: Number(file.size) || 0,
        contentType: String(file.contentType ?? "application/octet-stream"),
      };
    })
    .filter((item): item is CurriculumResourceFile => Boolean(item));
  if (normalized.length) return normalized;

  const paths = [
    ...(Array.isArray(data.learningMaterialFilePaths) ? data.learningMaterialFilePaths : []),
    ...(Array.isArray(data.referenceMaterialFilePaths) ? data.referenceMaterialFilePaths : []),
  ].map(String).filter(Boolean);
  return paths.map((path) => ({
    name: fileNameFromPath(path),
    path,
    size: 0,
    contentType: "application/octet-stream",
  }));
}

export function listenCurriculumResources(
  catalog: CurriculumCatalogId,
  includeInternal: boolean,
  onRows: (rows: CurriculumResourceRow[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  const approved = query(
    collection(db, "contents"),
    where("status", "==", "approved"),
    where("type", "in", ["share", "paid", "homework"]),
    orderBy("createdAt", "desc"),
  );
  const source = includeInternal ? collection(db, "contents") : approved;
  return onSnapshot(source, (snapshot) => {
    const rows = snapshot.docs
      .flatMap((snapshotDoc): CurriculumResourceRow[] => {
        const data = snapshotDoc.data() as Record<string, unknown>;
        const status = String(data.status ?? "");
        const type = String(data.type ?? "");
        if (!(["approved", "internal"].includes(status) && ["share", "paid", "homework"].includes(type))) return [];
        return inferCurriculumPlacements(data)
          .filter((placement) => placement.catalog === catalog)
          .map((placement) => ({
            id: snapshotDoc.id,
            catalog,
            category: placement.category,
            title: String(data.subject ?? data.title ?? "자료").trim() || "자료",
            description: String(data.learningTopic ?? data.introduction ?? "").trim(),
            files: normalizeFiles(data),
            authorId: String(data.authorId ?? ""),
            createdAtMs: timestampMs(data.createdAt),
          }));
      })
      .sort((left, right) => right.createdAtMs - left.createdAtMs || left.title.localeCompare(right.title, "ko"));
    onRows(rows);
  }, onError);
}

export async function uploadCurriculumResource(args: {
  uid: string;
  catalog: CurriculumCatalogId;
  category: CurriculumCategoryId;
  title: string;
  description: string;
  files: File[];
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const title = args.title.trim();
  const description = args.description.trim();
  if (!title) throw new Error("자료 제목을 입력해주세요.");
  if (!args.files.length) throw new Error("등록할 파일을 선택해주세요.");
  if (args.files.length > 10) throw new Error("한 번에 최대 10개 파일까지 등록할 수 있습니다.");
  const tooLarge = args.files.find((file) => file.size >= 50 * 1024 * 1024);
  if (tooLarge) throw new Error(`${tooLarge.name}: 파일당 50MB 미만으로 등록해주세요.`);

  const documentRef = doc(collection(db, "contents"));
  const totalBytes = args.files.reduce((sum, file) => sum + file.size, 0) || 1;
  const uploaded: CurriculumResourceFile[] = [];
  let completedBytes = 0;

  try {
    for (let index = 0; index < args.files.length; index += 1) {
      const file = args.files[index];
      const path = `contents/${args.uid}/curriculum_${documentRef.id}_${index}_${Date.now()}_${safeFileName(file.name)}`;
      const result = await uploadBytesResumableWithProgress(storage, path, file, (fileProgress) => {
        const currentBytes = completedBytes + (file.size * fileProgress) / 100;
        args.onProgress?.(Math.min(99, Math.round((currentBytes / totalBytes) * 100)));
      });
      uploaded.push({
        name: file.name,
        path: result.fullPath,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      });
      completedBytes += file.size;
    }

    await setDoc(documentRef, {
      authorId: args.uid,
      teacherId: args.uid,
      subject: title,
      audience: CURRICULUM_CATALOGS[args.catalog].title,
      section: args.category,
      identifier: documentRef.id,
      learningTopic: description,
      introduction: description,
      lectureLink: null,
      learningMaterialFilePaths: uploaded.map((file) => file.path),
      referenceMaterialFilePaths: [],
      type: "share",
      status: "approved",
      libraryCategory: "problem_bank",
      themes: [],
      purchaseLink: null,
      homeworkCode: null,
      homeworkInstruction: null,
      resourceCatalog: args.catalog,
      resourceCategory: args.category,
      resourceSource: "manual",
      resourceFiles: uploaded,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    args.onProgress?.(100);
    return documentRef.id;
  } catch (error) {
    await Promise.allSettled(uploaded.map((file) => deleteObject(ref(storage, file.path))));
    throw error;
  }
}

export async function deleteCurriculumResource(row: CurriculumResourceRow): Promise<void> {
  await Promise.all(row.files.map(async (file) => {
    try {
      await deleteObject(ref(storage, file.path));
    } catch (error) {
      const code = String((error as { code?: unknown })?.code ?? "");
      if (code !== "storage/object-not-found") throw error;
    }
  }));
  await deleteDoc(doc(db, "contents", row.id));
}
