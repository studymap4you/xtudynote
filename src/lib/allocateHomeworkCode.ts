import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { generateHomeworkCode } from "@/lib/homeworkCode";

export async function allocateUniqueHomeworkCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateHomeworkCode();
    const snap = await getDoc(doc(db, "homework_codes", code));
    if (!snap.exists()) return code;
  }
  throw new Error("과제 번호를 생성하지 못했습니다. 다시 시도해 주세요.");
}
