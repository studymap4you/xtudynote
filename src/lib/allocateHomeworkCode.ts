import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import { generateHomeworkCode } from "@/lib/homeworkCode";

function randomFourDigitPadded(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

async function isShortCodeTaken(shortCode: string): Promise<boolean> {
  const q = query(
    collection(db, "homework_codes"),
    where("shortCode", "==", shortCode),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export type AllocatedHomeworkCodes = {
  /** 내부·문서 ID용 전체 코드 (예: HW-…) */
  homeworkCode: string;
  /** 학생·선생님 안내용 4자리 숫자 */
  shortCode: string;
};

export async function allocateUniqueHomeworkCode(): Promise<AllocatedHomeworkCodes> {
  for (let attempt = 0; attempt < 64; attempt++) {
    const shortCode = randomFourDigitPadded();
    if (await isShortCodeTaken(shortCode)) continue;

    for (let j = 0; j < 16; j++) {
      const homeworkCode = generateHomeworkCode();
      const snap = await getDoc(doc(db, "homework_codes", homeworkCode));
      if (!snap.exists()) {
        return { homeworkCode, shortCode };
      }
    }
  }
  throw new Error("과제 번호를 생성하지 못했습니다. 다시 시도해 주세요.");
}
