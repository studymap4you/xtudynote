import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { ContentStatus } from "@/types/content";

export async function syncHomeworkCodeStatus(
  db: Firestore,
  homeworkCode: string | null | undefined,
  status: ContentStatus
): Promise<void> {
  const code = (homeworkCode ?? "").trim();
  if (!code) return;
  await updateDoc(doc(db, "homework_codes", code), {
    status,
    updatedAt: serverTimestamp(),
  });
}
