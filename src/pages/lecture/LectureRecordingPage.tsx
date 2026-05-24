import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { LectureRecordingStudio } from "@/components/lectureRecording/LectureRecordingStudio";
import { TeacherRoute } from "@/components/TeacherRoute";

function Inner() {
  return (
    <DashboardShell light>
      <main className="lecture-rec-page">
        <nav className="lecture-rec-page__nav">
          <Link to="/classroom/new">← 강의실 개설</Link>
          {" · "}
          <Link to="/classroom">내 강의실</Link>
        </nav>
        <LectureRecordingStudio />
      </main>
    </DashboardShell>
  );
}

export function LectureRecordingPage() {
  return (
    <TeacherRoute>
      <Inner />
    </TeacherRoute>
  );
}
