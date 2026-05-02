import { ref, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase/config";
import { buildTextbookAutoStudentDocxBlob, buildTextbookAutoTeacherDocxBlob } from "@/lib/textbookAuto/downloadTextbookAutoDocx";
import { upsertTextbookExportPackage } from "@/lib/textbookAuto/textbookAutoFirestore";
import type { TextbookAnswerKeyItem, TextbookUnitContent } from "@/types/textbookAuto";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function publishTextbookAutoPackage(params: {
  uid: string;
  sessionId: string;
  bookTitle: string;
  units: { unitIndex: number; unit: TextbookUnitContent }[];
  answerKeyItems: TextbookAnswerKeyItem[];
}): Promise<void> {
  const { uid, sessionId, bookTitle, units, answerKeyItems } = params;
  const studentPath = `textbook_auto/${uid}/${sessionId}/student.docx`;
  const teacherPath = `textbook_auto/${uid}/${sessionId}/teacher.docx`;

  const studentBlob = await buildTextbookAutoStudentDocxBlob({ bookTitle, units });
  await uploadBytes(ref(storage, studentPath), studentBlob, { contentType: DOCX_TYPE });

  let teacherStoragePath = "";
  if (answerKeyItems.length > 0) {
    const teacherBlob = await buildTextbookAutoTeacherDocxBlob({
      bookTitle,
      unitTitles: units.map(({ unitIndex, unit }) => ({ unitIndex, unitTitle: unit.unitTitle })),
      items: answerKeyItems,
    });
    await uploadBytes(ref(storage, teacherPath), teacherBlob, { contentType: DOCX_TYPE });
    teacherStoragePath = teacherPath;
  }

  await upsertTextbookExportPackage(uid, sessionId, {
    studentStoragePath: studentPath,
    teacherStoragePath,
  });
}
