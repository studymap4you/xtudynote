import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AdminPanelPage } from "@/pages/AdminPanelPage";
import { AddPassage } from "@/pages/admin/AddPassage";
import { LandingHeroAdminPage } from "@/pages/admin/LandingHeroAdminPage";
import { ContentsListPage } from "@/pages/admin/ContentsListPage";
import { PendingMaterialReviewsPage } from "@/pages/admin/PendingMaterialReviewsPage";
import { KnowledgeCurationPage } from "@/pages/admin/KnowledgeCurationPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LogicDashboardPage } from "@/pages/LogicDashboardPage";
import { ContentDetailPage } from "@/pages/ContentDetailPage";
import { HomeworkSearchPage } from "@/pages/HomeworkSearchPage";
import { HomeworkStudentPage } from "@/pages/HomeworkStudentPage";
import { TeacherHomeworkPage } from "@/pages/teacher/TeacherHomeworkPage";
import { HomeworkFeedbackPage } from "@/pages/teacher/HomeworkFeedbackPage";
import { TeacherStatsPage } from "@/pages/teacher/TeacherStatsPage";
import { MaterialRegisterPage } from "@/pages/MaterialRegisterPage";
import { VideoLectureRegisterPage } from "@/pages/VideoLectureRegisterPage";
import { VideoCatalogPage } from "@/pages/VideoCatalogPage";
import { ProtectedRoute, SuperAdminRoute } from "@/components/ProtectedRoute";
import { TeacherRoute } from "@/components/TeacherRoute";
import { ClassroomListPage } from "@/pages/classroom/ClassroomListPage";
import { ClassroomCatalogPage } from "@/pages/classroom/ClassroomCatalogPage";
import { ClassroomDetailPage } from "@/pages/classroom/ClassroomDetailPage";
import { ClassroomCreatePage } from "@/pages/classroom/ClassroomCreatePage";
import { ClassroomManagePage } from "@/pages/classroom/ClassroomManagePage";
import { StudentWorksheetPage } from "@/pages/assignments/StudentWorksheetPage";
import { TeacherAssignmentsPage } from "@/pages/assignments/TeacherAssignmentsPage";
import { TeacherAssignmentNewPage } from "@/pages/assignments/TeacherAssignmentNewPage";
import { TeacherAssignmentDetailPage } from "@/pages/assignments/TeacherAssignmentDetailPage";
import { ExternalWorksheetOutreachPage } from "@/pages/assignments/ExternalWorksheetOutreachPage";
import { WorksheetPdfCreatePage } from "@/pages/WorksheetPdfCreatePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/content/:id" element={<ContentDetailPage />} />
      <Route path="/homework" element={<HomeworkSearchPage />} />
      <Route path="/logic-dashboard" element={<LogicDashboardPage />} />
      <Route path="/videos" element={<VideoCatalogPage />} />
      <Route path="/homework/:code" element={<HomeworkStudentPage />} />
      <Route path="/worksheet/outreach" element={<ExternalWorksheetOutreachPage />} />
      <Route path="/worksheet/create" element={<WorksheetPdfCreatePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assignment/:assignmentId"
        element={
          <ProtectedRoute>
            <StudentWorksheetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/assignments/new"
        element={
          <TeacherRoute>
            <TeacherAssignmentNewPage />
          </TeacherRoute>
        }
      />
      <Route
        path="/teacher/assignments/:assignmentId"
        element={
          <TeacherRoute>
            <TeacherAssignmentDetailPage />
          </TeacherRoute>
        }
      />
      <Route
        path="/teacher/assignments"
        element={
          <TeacherRoute>
            <TeacherAssignmentsPage />
          </TeacherRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <SuperAdminRoute>
            <AdminPanelPage />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/admin/contents"
        element={
          <SuperAdminRoute>
            <ContentsListPage />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/admin/pending-materials"
        element={
          <SuperAdminRoute>
            <PendingMaterialReviewsPage />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/admin/knowledge-curation"
        element={
          <SuperAdminRoute>
            <KnowledgeCurationPage />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/admin/landing-hero"
        element={
          <SuperAdminRoute>
            <LandingHeroAdminPage />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/admin/contents/new"
        element={
          <SuperAdminRoute>
            <AddPassage />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/teacher/homework/new"
        element={
          <ProtectedRoute>
            <TeacherHomeworkPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/submissions"
        element={
          <ProtectedRoute>
            <HomeworkFeedbackPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/stats"
        element={
          <ProtectedRoute>
            <TeacherStatsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/material/register"
        element={
          <ProtectedRoute>
            <MaterialRegisterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/video/register"
        element={
          <ProtectedRoute>
            <VideoLectureRegisterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classroom/new"
        element={
          <TeacherRoute>
            <ClassroomCreatePage />
          </TeacherRoute>
        }
      />
      <Route
        path="/classroom/:id/manage"
        element={
          <TeacherRoute>
            <ClassroomManagePage />
          </TeacherRoute>
        }
      />
      <Route
        path="/classroom/:id"
        element={
          <ProtectedRoute>
            <ClassroomDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classroom"
        element={
          <ProtectedRoute>
            <ClassroomListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms"
        element={
          <ProtectedRoute>
            <ClassroomCatalogPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
