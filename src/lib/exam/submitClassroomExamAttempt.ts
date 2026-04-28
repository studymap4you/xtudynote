import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { evaluateShortAnswer } from "@/lib/exam/evaluateShortAnswer";
import type { AiExamDocument, AiExamQuestion } from "@/types/aiExam";
import type { StudentAnswersDocument, StudentAnswerPerQuestion } from "@/types/studentAnswers";

function mcqEval(q: AiExamQuestion, selected: string): StudentAnswerPerQuestion {
  const ok = selected.trim() === String(q.correctAnswer).trim();
  return {
    type: "mcq",
    selectedIndex: selected,
    evaluation: {
      isCorrect: ok,
      score: ok ? 100 : 0,
      comment: ok ? "정답입니다." : "오답입니다.",
    },
  };
}

function aggregateScore(
  questions: AiExamQuestion[],
  perQuestion: Record<string, StudentAnswerPerQuestion>,
): number {
  if (!questions.length) return 0;
  let sum = 0;
  for (const q of questions) {
    const row = perQuestion[q.id];
    if (!row) continue;
    sum += row.evaluation.score;
  }
  return Math.round(sum / questions.length);
}

export async function submitClassroomExamAttempt(input: {
  assignmentId: string;
  classroomId: string;
  exam: AiExamDocument;
  examId: string;
  studentId: string;
  teacherId: string;
  answers: Record<string, string>;
}): Promise<StudentAnswersDocument> {
  const { assignmentId, classroomId, exam, examId, studentId, teacherId, answers } = input;
  const perQuestion: Record<string, StudentAnswerPerQuestion> = {};

  for (const q of exam.questions) {
    if (q.type === "mcq") {
      perQuestion[q.id] = mcqEval(q, answers[q.id] ?? "");
      continue;
    }
    const text = (answers[q.id] ?? "").trim();
    const evaluation = await evaluateShortAnswer({
      studentAnswer: text,
      modelAnswer: q.correctAnswer,
      requiredKeywords: q.requiredKeywords ?? [],
      questionPrompt: q.prompt,
    });
    perQuestion[q.id] = {
      type: "short",
      answerText: text,
      evaluation,
    };
  }

  const payload: StudentAnswersDocument = {
    assignmentId,
    classroomId,
    examId,
    studentId,
    teacherId,
    perQuestion,
    aggregateScore: aggregateScore(exam.questions, perQuestion),
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docId = `${assignmentId}_${studentId}`;
  await setDoc(doc(db, "student_answers", docId), payload, { merge: true });

  return payload;
}
