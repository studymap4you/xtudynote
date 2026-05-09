import { FieldValue, type DocumentData } from "firebase-admin/firestore";

/**
 * 클라이언트 `syncClassroomPublicListing` 과 동일한 요약 필드 — 비로그인 강의신청 목록용.
 */
export function buildClassroomPublicListingFields(
  classroomId: string,
  room: DocumentData,
): Record<string, unknown> {
  const rawTitle = String(room.title ?? "").trim();
  const title = rawTitle.slice(0, 200) || "강의실";
  const description = String(room.description ?? "").trim().slice(0, 2000);
  const pricing = room.pricingType === "paid" ? "paid" : "free";
  const payload: Record<string, unknown> = {
    classroomId,
    title,
    description,
    pricingType: pricing,
    listedAt: FieldValue.serverTimestamp(),
  };
  if (pricing === "paid") {
    const fee = room.tuitionFeeKrw;
    if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
      payload.tuitionFeeKrw = Math.round(fee);
    }
  }
  return payload;
}
