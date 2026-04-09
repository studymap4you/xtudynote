import { doc, deleteDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase/config";

export async function recordStudentDownload(args: {
  studentId: string;
  contentId: string;
  title: string;
  storagePaths: string[];
}): Promise<void> {
  const id = `${args.studentId}_${args.contentId}`;
  await setDoc(
    doc(db, "student_downloads", id),
    {
      studentId: args.studentId,
      contentId: args.contentId,
      title: args.title,
      storagePaths: args.storagePaths,
      lastDownloadedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function removeStudentDownload(studentId: string, contentId: string): Promise<void> {
  await deleteDoc(doc(db, "student_downloads", `${studentId}_${contentId}`));
}
