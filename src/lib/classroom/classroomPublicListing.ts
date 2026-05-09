import { deleteDoc, doc, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import type { ClassroomDocument } from "@/types/classroom";

/** sessionStorage — 랜딩에서 강의실 선택 후 로그인·가입 시 카탈로그에서 수강 신청 단계로 이어짐 */
export const PENDING_ENROLL_STORAGE_KEY = "xtudy_pendingEnrollClassroomId";

export function setPendingEnrollClassroomId(classroomId: string) {
  try {
    sessionStorage.setItem(PENDING_ENROLL_STORAGE_KEY, classroomId);
  } catch {
    /* ignore */
  }
}

export async function syncClassroomPublicListing(
  firestore: Firestore,
  classroomId: string,
  room: Pick<ClassroomDocument, "title" | "description" | "pricingType" | "tuitionFeeKrw">,
): Promise<void> {
  const rawTitle = room.title.trim();
  const title = rawTitle.slice(0, 200) || "강의실";
  const description = (room.description ?? "").trim().slice(0, 2000);
  const pricing = room.pricingType === "paid" ? "paid" : "free";
  const payload: Record<string, unknown> = {
    classroomId,
    title,
    description,
    pricingType: pricing,
    listedAt: serverTimestamp(),
  };
  if (pricing === "paid") {
    const fee = room.tuitionFeeKrw;
    if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
      payload.tuitionFeeKrw = Math.round(fee);
    }
  }
  await setDoc(doc(firestore, "classroom_public_listings", classroomId), payload, { merge: true });
}

export async function deleteClassroomPublicListing(firestore: Firestore, classroomId: string): Promise<void> {
  await deleteDoc(doc(firestore, "classroom_public_listings", classroomId));
}
