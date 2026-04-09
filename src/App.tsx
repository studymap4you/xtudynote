import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AdminPanelPage } from "@/pages/AdminPanelPage";
import { AddPassage } from "@/pages/admin/AddPassage";
import { ContentsListPage } from "@/pages/admin/ContentsListPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { ContentDetailPage } from "@/pages/ContentDetailPage";
import { HomeworkSearchPage } from "@/pages/HomeworkSearchPage";
import { HomeworkStudentPage } from "@/pages/HomeworkStudentPage";
import { TeacherHomeworkPage } from "@/pages/teacher/TeacherHomeworkPage";
import { HomeworkFeedbackPage } from "@/pages/teacher/HomeworkFeedbackPage";
import { ProtectedRoute, SuperAdminRoute } from "@/components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/content/:id" element={<ContentDetailPage />} />
      <Route path="/homework" element={<HomeworkSearchPage />} />
      <Route path="/homework/:code" element={<HomeworkStudentPage />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
